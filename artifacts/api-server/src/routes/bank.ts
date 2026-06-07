import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { and, eq, inArray, desc, sql, gte, lte } from "drizzle-orm";
import multer from "multer";
import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import {
  db,
  bankAccountsTable,
  bankMovementsTable,
  bankReconciliationsTable,
  bankStatementLinesTable,
  accountsTable,
  companiesTable,
  journalEntriesTable,
  type BankAccount,
  type BankMovement,
  type BankReconciliation,
  type BankStatementLine,
} from "@workspace/db";
import {
  CreateBankAccountBody,
  UpdateBankAccountBody,
  CreateBankMovementBody,
  CreateBankReconciliationBody,
  MatchBankReconciliationBody,
  AdjustBankReconciliationBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import {
  createDraftJournalEntry,
  lockCompanyEntryNo,
} from "../lib/journal-posting";
import { round2 } from "../lib/inventory-posting";
import {
  MOVEMENT_DIRECTION,
  buildMovementLines,
  buildTransferLines,
  type BankMovementType,
} from "../lib/bank-posting";

const router = Router();

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const MONEY_EPS = 0.005;

async function loadBaseCurrency(companyId: string): Promise<string> {
  const [company] = await db
    .select({ baseCurrency: companiesTable.baseCurrency })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);
  return (company?.baseCurrency || "EGP").toUpperCase();
}

// Re-validates that an account belongs to the company AND is a leaf (non-group).
async function isLeafAccount(
  accountId: string,
  companyId: string,
): Promise<boolean> {
  const [acc] = await db
    .select({ isGroup: accountsTable.isGroup })
    .from(accountsTable)
    .where(
      and(
        eq(accountsTable.id, accountId),
        eq(accountsTable.companyId, companyId),
      ),
    )
    .limit(1);
  return !!acc && !acc.isGroup;
}

// xlsx statement uploads come through memory storage (parsed, never persisted).
const xlsxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function handleXlsxUpload(req: Request, res: Response, next: NextFunction) {
  xlsxUpload.single("file")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      res.status(400).json({ error: "تعذّر رفع الملف" });
      return;
    }
    if (err) {
      next(err);
      return;
    }
    next();
  });
}

const cellStr = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "text" in v)
    return String((v as { text: unknown }).text);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
};
const cellNum = (v: ExcelJS.CellValue): number => {
  const n = Number(cellStr(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// ---------------------------------------------------------------------------
// Balance helpers
// ---------------------------------------------------------------------------

// Net movement effect (in the account's own currency) per bank account, optional
// upper date bound and cleared-only filter. Returns a Map keyed by bankAccountId.
async function movementSums(
  companyId: string,
  opts: { upToDate?: string; clearedOnly?: boolean; bankAccountId?: string } = {},
): Promise<Map<string, number>> {
  const conds = [eq(bankMovementsTable.companyId, companyId)];
  if (opts.bankAccountId)
    conds.push(eq(bankMovementsTable.bankAccountId, opts.bankAccountId));
  if (opts.upToDate) conds.push(lte(bankMovementsTable.date, opts.upToDate));
  if (opts.clearedOnly) conds.push(eq(bankMovementsTable.isCleared, true));
  const rows = await db
    .select({
      bankAccountId: bankMovementsTable.bankAccountId,
      net: sql<string>`coalesce(sum(case when ${bankMovementsTable.direction} = 'in' then ${bankMovementsTable.amount} else -${bankMovementsTable.amount} end), 0)`,
    })
    .from(bankMovementsTable)
    .where(and(...conds))
    .groupBy(bankMovementsTable.bankAccountId);
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.bankAccountId, Number(r.net));
  return map;
}

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

async function serializeAccounts(rows: BankAccount[], companyId: string) {
  if (rows.length === 0) return [];
  const sums = await movementSums(companyId);
  const chartIds = [...new Set(rows.map((r) => r.accountId))];
  const chartMap = new Map<string, { code: string; name: string }>();
  if (chartIds.length) {
    const accs = await db
      .select({
        id: accountsTable.id,
        code: accountsTable.code,
        name: accountsTable.nameAr,
      })
      .from(accountsTable)
      .where(
        and(
          eq(accountsTable.companyId, companyId),
          inArray(accountsTable.id, chartIds),
        ),
      );
    for (const a of accs) chartMap.set(a.id, { code: a.code, name: a.name });
  }
  return rows.map((r) => ({
    id: r.id,
    nameAr: r.nameAr,
    nameEn: r.nameEn,
    type: r.type as "bank" | "cash" | "credit_card" | "loan",
    bankName: r.bankName,
    accountNumber: r.accountNumber,
    currency: r.currency,
    openingBalance: Number(r.openingBalance),
    openingBalanceDate: r.openingBalanceDate,
    accountId: r.accountId,
    accountCode: chartMap.get(r.accountId)?.code ?? null,
    accountName: chartMap.get(r.accountId)?.name ?? null,
    isActive: r.isActive,
    currentBalance: round2(Number(r.openingBalance) + (sums.get(r.id) ?? 0)),
    createdAt: r.createdAt.toISOString(),
  }));
}

async function serializeMovements(rows: BankMovement[], companyId: string) {
  if (rows.length === 0) return [];
  const bankIds = [
    ...new Set(
      rows.flatMap((r) =>
        [r.bankAccountId, r.transferAccountId].filter(
          (x): x is string => !!x,
        ),
      ),
    ),
  ];
  const bankMap = new Map<string, string>();
  if (bankIds.length) {
    const bs = await db
      .select({ id: bankAccountsTable.id, name: bankAccountsTable.nameAr })
      .from(bankAccountsTable)
      .where(
        and(
          eq(bankAccountsTable.companyId, companyId),
          inArray(bankAccountsTable.id, bankIds),
        ),
      );
    for (const b of bs) bankMap.set(b.id, b.name);
  }
  const counterIds = [
    ...new Set(
      rows.map((r) => r.counterpartAccountId).filter((x): x is string => !!x),
    ),
  ];
  const counterMap = new Map<string, string>();
  if (counterIds.length) {
    const cs = await db
      .select({ id: accountsTable.id, name: accountsTable.nameAr })
      .from(accountsTable)
      .where(
        and(
          eq(accountsTable.companyId, companyId),
          inArray(accountsTable.id, counterIds),
        ),
      );
    for (const c of cs) counterMap.set(c.id, c.name);
  }
  return rows.map((r) => ({
    id: r.id,
    bankAccountId: r.bankAccountId,
    bankAccountName: bankMap.get(r.bankAccountId) ?? null,
    date: r.date,
    type: r.type as BankMovementType,
    direction: r.direction as "in" | "out",
    amount: Number(r.amount),
    currency: r.currency,
    exchangeRate: Number(r.exchangeRate),
    counterpartAccountId: r.counterpartAccountId,
    counterpartAccountName: r.counterpartAccountId
      ? (counterMap.get(r.counterpartAccountId) ?? null)
      : null,
    transferAccountId: r.transferAccountId,
    transferAccountName: r.transferAccountId
      ? (bankMap.get(r.transferAccountId) ?? null)
      : null,
    transferGroupId: r.transferGroupId,
    description: r.description,
    reference: r.reference,
    journalEntryId: r.journalEntryId,
    reconciliationId: r.reconciliationId,
    isCleared: r.isCleared,
    isAdjustment: r.isAdjustment,
    createdAt: r.createdAt.toISOString(),
  }));
}

async function serializeReconciliations(
  rows: BankReconciliation[],
  companyId: string,
) {
  if (rows.length === 0) return [];
  const bankIds = [...new Set(rows.map((r) => r.bankAccountId))];
  const bankMap = new Map<string, string>();
  if (bankIds.length) {
    const bs = await db
      .select({ id: bankAccountsTable.id, name: bankAccountsTable.nameAr })
      .from(bankAccountsTable)
      .where(
        and(
          eq(bankAccountsTable.companyId, companyId),
          inArray(bankAccountsTable.id, bankIds),
        ),
      );
    for (const b of bs) bankMap.set(b.id, b.name);
  }
  return rows.map((r) => serializeReconciliation(r, bankMap.get(r.bankAccountId) ?? null));
}

function serializeReconciliation(
  r: BankReconciliation,
  bankAccountName: string | null,
) {
  return {
    id: r.id,
    bankAccountId: r.bankAccountId,
    bankAccountName,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    statementBalance: Number(r.statementBalance),
    bookBalance: Number(r.bookBalance),
    difference: Number(r.difference),
    status: r.status as "draft" | "completed",
    notes: r.notes,
    adjustingEntryId: r.adjustingEntryId,
    createdAt: r.createdAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  };
}

function serializeStatementLine(r: BankStatementLine) {
  return {
    id: r.id,
    date: r.date,
    description: r.description,
    amount: Number(r.amount),
    direction: r.direction as "in" | "out",
    matchedMovementId: r.matchedMovementId,
  };
}

// Builds the full reconciliation detail payload (reconciliation + statement lines
// + in-period movements + outstanding + cleared balances).
async function buildReconciliationDetail(
  reconciliationId: string,
  companyId: string,
) {
  const [rec] = await db
    .select()
    .from(bankReconciliationsTable)
    .where(
      and(
        eq(bankReconciliationsTable.id, reconciliationId),
        eq(bankReconciliationsTable.companyId, companyId),
      ),
    )
    .limit(1);
  if (!rec) return null;
  const [bank] = await db
    .select({
      name: bankAccountsTable.nameAr,
      openingBalance: bankAccountsTable.openingBalance,
    })
    .from(bankAccountsTable)
    .where(
      and(
        eq(bankAccountsTable.id, rec.bankAccountId),
        eq(bankAccountsTable.companyId, companyId),
      ),
    )
    .limit(1);

  const statementRows = await db
    .select()
    .from(bankStatementLinesTable)
    .where(
      and(
        eq(bankStatementLinesTable.reconciliationId, reconciliationId),
        eq(bankStatementLinesTable.companyId, companyId),
      ),
    )
    .orderBy(bankStatementLinesTable.date);

  const movementRows = await db
    .select()
    .from(bankMovementsTable)
    .where(
      and(
        eq(bankMovementsTable.companyId, companyId),
        eq(bankMovementsTable.bankAccountId, rec.bankAccountId),
        gte(bankMovementsTable.date, rec.periodStart),
        lte(bankMovementsTable.date, rec.periodEnd),
      ),
    )
    .orderBy(bankMovementsTable.date);

  const outstanding = movementRows.filter((m) => !m.isCleared);
  const opening = Number(bank?.openingBalance ?? 0);
  // Cleared book balance: opening + cleared movements up to period end.
  const clearedSums = await movementSums(companyId, {
    bankAccountId: rec.bankAccountId,
    upToDate: rec.periodEnd,
    clearedOnly: true,
  });
  const clearedBookBalance = round2(
    opening + (clearedSums.get(rec.bankAccountId) ?? 0),
  );
  const reconciledDifference = round2(
    Number(rec.statementBalance) - clearedBookBalance,
  );

  return {
    reconciliation: serializeReconciliation(rec, bank?.name ?? null),
    statementLines: statementRows.map(serializeStatementLine),
    movements: await serializeMovements(movementRows, companyId),
    outstanding: await serializeMovements(outstanding, companyId),
    clearedBookBalance,
    reconciledDifference,
  };
}

// Computes the book balance (opening + posted movements up to a date) for an
// account, in the account's own currency.
async function bookBalanceUpTo(
  companyId: string,
  bankAccountId: string,
  opening: number,
  upToDate: string,
): Promise<number> {
  const sums = await movementSums(companyId, { bankAccountId, upToDate });
  return round2(opening + (sums.get(bankAccountId) ?? 0));
}

// ---------------------------------------------------------------------------
// Bank accounts CRUD
// ---------------------------------------------------------------------------

router.get(
  "/bank/accounts",
  requireAuth,
  requireCapability("bank:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    try {
      const rows = await db
        .select()
        .from(bankAccountsTable)
        .where(eq(bankAccountsTable.companyId, companyId))
        .orderBy(desc(bankAccountsTable.createdAt));
      res.json(await serializeAccounts(rows, companyId));
    } catch (err) {
      req.log.error({ err }, "Failed to list bank accounts");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.post(
  "/bank/accounts",
  requireAuth,
  requireCapability("bank:create"),
  async (req, res) => {
    const parsed = CreateBankAccountBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const d = parsed.data;
    try {
      if (!(await isLeafAccount(d.accountId, companyId))) {
        res
          .status(400)
          .json({ error: "الحساب المحاسبي المرتبط غير صحيح أو حساب رئيسي" });
        return;
      }
      const [created] = await db
        .insert(bankAccountsTable)
        .values({
          companyId,
          nameAr: d.nameAr,
          nameEn: d.nameEn ?? null,
          type: d.type,
          bankName: d.bankName ?? null,
          accountNumber: d.accountNumber ?? null,
          currency: d.currency.toUpperCase(),
          openingBalance: String(round2(d.openingBalance ?? 0)),
          openingBalanceDate: d.openingBalanceDate ?? null,
          accountId: d.accountId,
          isActive: d.isActive ?? true,
        })
        .returning();
      const [serialized] = await serializeAccounts([created!], companyId);
      res.status(201).json(serialized);
    } catch (err) {
      req.log.error({ err }, "Failed to create bank account");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.patch(
  "/bank/accounts/:id",
  requireAuth,
  requireCapability("bank:update"),
  async (req, res) => {
    const parsed = UpdateBankAccountBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const id = req.params["id"] as string;
    const d = parsed.data;
    try {
      const [existing] = await db
        .select()
        .from(bankAccountsTable)
        .where(
          and(
            eq(bankAccountsTable.id, id),
            eq(bankAccountsTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "الحساب غير موجود" });
        return;
      }
      if (d.accountId && !(await isLeafAccount(d.accountId, companyId))) {
        res
          .status(400)
          .json({ error: "الحساب المحاسبي المرتبط غير صحيح أو حساب رئيسي" });
        return;
      }
      const [updated] = await db
        .update(bankAccountsTable)
        .set({
          ...(d.nameAr !== undefined ? { nameAr: d.nameAr } : {}),
          ...(d.nameEn !== undefined ? { nameEn: d.nameEn } : {}),
          ...(d.type !== undefined ? { type: d.type } : {}),
          ...(d.bankName !== undefined ? { bankName: d.bankName } : {}),
          ...(d.accountNumber !== undefined
            ? { accountNumber: d.accountNumber }
            : {}),
          ...(d.currency !== undefined
            ? { currency: d.currency.toUpperCase() }
            : {}),
          ...(d.openingBalance !== undefined
            ? { openingBalance: String(round2(d.openingBalance)) }
            : {}),
          ...(d.openingBalanceDate !== undefined
            ? { openingBalanceDate: d.openingBalanceDate }
            : {}),
          ...(d.accountId !== undefined ? { accountId: d.accountId } : {}),
          ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
        })
        .where(
          and(
            eq(bankAccountsTable.id, id),
            eq(bankAccountsTable.companyId, companyId),
          ),
        )
        .returning();
      const [serialized] = await serializeAccounts([updated!], companyId);
      res.json(serialized);
    } catch (err) {
      req.log.error({ err }, "Failed to update bank account");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.delete(
  "/bank/accounts/:id",
  requireAuth,
  requireCapability("bank:delete"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const id = req.params["id"] as string;
    try {
      const [existing] = await db
        .select({ id: bankAccountsTable.id })
        .from(bankAccountsTable)
        .where(
          and(
            eq(bankAccountsTable.id, id),
            eq(bankAccountsTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "الحساب غير موجود" });
        return;
      }
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(bankMovementsTable)
        .where(
          and(
            eq(bankMovementsTable.companyId, companyId),
            eq(bankMovementsTable.bankAccountId, id),
          ),
        );
      if (Number(count) > 0) {
        res
          .status(400)
          .json({ error: "لا يمكن حذف حساب عليه حركات. قم بتعطيله بدلاً من ذلك" });
        return;
      }
      await db
        .delete(bankAccountsTable)
        .where(
          and(
            eq(bankAccountsTable.id, id),
            eq(bankAccountsTable.companyId, companyId),
          ),
        );
      res.json({ status: "ok" });
    } catch (err) {
      req.log.error({ err }, "Failed to delete bank account");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---------------------------------------------------------------------------
// Movements
// ---------------------------------------------------------------------------

router.get(
  "/bank/movements",
  requireAuth,
  requireCapability("bank:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const bankAccountId = req.query["bankAccountId"];
    if (typeof bankAccountId !== "string" || !bankAccountId) {
      res.status(400).json({ error: "يجب تحديد الحساب البنكي" });
      return;
    }
    const from = req.query["from"];
    const to = req.query["to"];
    try {
      const conds = [
        eq(bankMovementsTable.companyId, companyId),
        eq(bankMovementsTable.bankAccountId, bankAccountId),
      ];
      if (typeof from === "string" && from)
        conds.push(gte(bankMovementsTable.date, from));
      if (typeof to === "string" && to)
        conds.push(lte(bankMovementsTable.date, to));
      const rows = await db
        .select()
        .from(bankMovementsTable)
        .where(and(...conds))
        .orderBy(desc(bankMovementsTable.date), desc(bankMovementsTable.createdAt));
      res.json(await serializeMovements(rows, companyId));
    } catch (err) {
      req.log.error({ err }, "Failed to list bank movements");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.post(
  "/bank/movements",
  requireAuth,
  requireCapability("bank:create"),
  async (req, res) => {
    const parsed = CreateBankMovementBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const d = parsed.data;
    if (d.amount <= 0) {
      res.status(400).json({ error: "المبلغ يجب أن يكون أكبر من صفر" });
      return;
    }
    const baseCurrency = await loadBaseCurrency(companyId);
    try {
      const [bank] = await db
        .select()
        .from(bankAccountsTable)
        .where(
          and(
            eq(bankAccountsTable.id, d.bankAccountId),
            eq(bankAccountsTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!bank) {
        res.status(400).json({ error: "الحساب البنكي غير موجود" });
        return;
      }
      const rate = Number(d.exchangeRate ?? 1);
      const amount = round2(d.amount);
      const amountBase = round2(amount * rate);
      const currency = (d.currency ?? bank.currency).toUpperCase();

      if (d.type === "transfer") {
        if (!d.transferAccountId) {
          res.status(400).json({ error: "يجب تحديد الحساب المحوَّل إليه" });
          return;
        }
        if (d.transferAccountId === d.bankAccountId) {
          res
            .status(400)
            .json({ error: "لا يمكن التحويل إلى نفس الحساب" });
          return;
        }
        const [dest] = await db
          .select()
          .from(bankAccountsTable)
          .where(
            and(
              eq(bankAccountsTable.id, d.transferAccountId),
              eq(bankAccountsTable.companyId, companyId),
            ),
          )
          .limit(1);
        if (!dest) {
          res.status(400).json({ error: "الحساب المحوَّل إليه غير موجود" });
          return;
        }
        // Re-validate both linked chart accounts are leaf + company.
        if (
          !(await isLeafAccount(bank.accountId, companyId)) ||
          !(await isLeafAccount(dest.accountId, companyId))
        ) {
          res
            .status(400)
            .json({ error: "الحساب المحاسبي المرتبط غير صحيح" });
          return;
        }
        const created = await db.transaction(async (tx) => {
          const transferGroupId = randomUUID();
          const entry = await createDraftJournalEntry(tx, {
            companyId,
            baseCurrency,
            date: d.date,
            reference: `تحويل بين الحسابات`,
            notes: d.description ?? null,
            createdBy: req.auth!.userId,
            status: "posted",
            lines: buildTransferLines({
              srcBankChartAccountId: bank.accountId,
              destBankChartAccountId: dest.accountId,
              amountBase,
              description: d.description ?? null,
            }),
          });
          const rows = await tx
            .insert(bankMovementsTable)
            .values([
              {
                companyId,
                bankAccountId: bank.id,
                date: d.date,
                type: "transfer",
                direction: "out",
                amount: String(amount),
                currency,
                exchangeRate: String(rate),
                transferAccountId: dest.id,
                transferGroupId,
                description: d.description ?? null,
                reference: d.reference ?? null,
                journalEntryId: entry.id,
                createdBy: req.auth!.userId,
              },
              {
                companyId,
                bankAccountId: dest.id,
                date: d.date,
                type: "transfer",
                direction: "in",
                amount: String(amount),
                currency,
                exchangeRate: String(rate),
                transferAccountId: bank.id,
                transferGroupId,
                description: d.description ?? null,
                reference: d.reference ?? null,
                journalEntryId: entry.id,
                createdBy: req.auth!.userId,
              },
            ])
            .returning();
          return rows;
        });
        res.status(201).json(await serializeMovements(created, companyId));
        return;
      }

      // Non-transfer movement: counterpart account required.
      if (!d.counterpartAccountId) {
        res.status(400).json({ error: "يجب تحديد الحساب المقابل" });
        return;
      }
      if (!(await isLeafAccount(d.counterpartAccountId, companyId))) {
        res
          .status(400)
          .json({ error: "الحساب المقابل غير صحيح أو حساب رئيسي" });
        return;
      }
      if (!(await isLeafAccount(bank.accountId, companyId))) {
        res.status(400).json({ error: "الحساب المحاسبي المرتبط غير صحيح" });
        return;
      }
      const direction = MOVEMENT_DIRECTION[d.type as Exclude<BankMovementType, "transfer">];
      if (!direction) {
        res.status(400).json({ error: "نوع الحركة غير صحيح" });
        return;
      }
      const created = await db.transaction(async (tx) => {
        const entry = await createDraftJournalEntry(tx, {
          companyId,
          baseCurrency,
          date: d.date,
          reference: d.reference ?? `حركة بنكية`,
          notes: d.description ?? null,
          createdBy: req.auth!.userId,
          status: "posted",
          lines: buildMovementLines({
            direction,
            bankChartAccountId: bank.accountId,
            counterpartAccountId: d.counterpartAccountId!,
            amountBase,
            description: d.description ?? null,
          }),
        });
        const [row] = await tx
          .insert(bankMovementsTable)
          .values({
            companyId,
            bankAccountId: bank.id,
            date: d.date,
            type: d.type,
            direction,
            amount: String(amount),
            currency,
            exchangeRate: String(rate),
            counterpartAccountId: d.counterpartAccountId,
            description: d.description ?? null,
            reference: d.reference ?? null,
            journalEntryId: entry.id,
            createdBy: req.auth!.userId,
          })
          .returning();
        return row!;
      });
      res.status(201).json(await serializeMovements([created], companyId));
    } catch (err) {
      req.log.error({ err }, "Failed to create bank movement");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.delete(
  "/bank/movements/:id",
  requireAuth,
  requireCapability("bank:delete"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const id = req.params["id"] as string;
    try {
      const [movement] = await db
        .select()
        .from(bankMovementsTable)
        .where(
          and(
            eq(bankMovementsTable.id, id),
            eq(bankMovementsTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!movement) {
        res.status(404).json({ error: "الحركة غير موجودة" });
        return;
      }
      if (movement.isCleared || movement.reconciliationId) {
        res
          .status(400)
          .json({ error: "لا يمكن حذف حركة تمت تسويتها بنكياً" });
        return;
      }
      let blockedByGroup = false;
      await db.transaction(async (tx) => {
        const jeIds = new Set<string>();
        if (movement.transferGroupId) {
          const groupRows = await tx
            .select()
            .from(bankMovementsTable)
            .where(
              and(
                eq(bankMovementsTable.companyId, companyId),
                eq(
                  bankMovementsTable.transferGroupId,
                  movement.transferGroupId,
                ),
              ),
            );
          // Block if EITHER side of the transfer is cleared/reconciled — not
          // just the row the caller selected.
          if (
            groupRows.some((m) => m.isCleared || m.reconciliationId)
          ) {
            blockedByGroup = true;
            return;
          }
          for (const m of groupRows) if (m.journalEntryId) jeIds.add(m.journalEntryId);
          await tx
            .delete(bankMovementsTable)
            .where(
              and(
                eq(bankMovementsTable.companyId, companyId),
                eq(
                  bankMovementsTable.transferGroupId,
                  movement.transferGroupId,
                ),
              ),
            );
        } else {
          if (movement.journalEntryId) jeIds.add(movement.journalEntryId);
          await tx
            .delete(bankMovementsTable)
            .where(
              and(
                eq(bankMovementsTable.id, id),
                eq(bankMovementsTable.companyId, companyId),
              ),
            );
        }
        if (jeIds.size > 0) {
          await tx
            .delete(journalEntriesTable)
            .where(inArray(journalEntriesTable.id, [...jeIds]));
        }
      });
      if (blockedByGroup) {
        res
          .status(400)
          .json({ error: "لا يمكن حذف حركة تمت تسويتها بنكياً" });
        return;
      }
      res.json({ status: "ok" });
    } catch (err) {
      req.log.error({ err }, "Failed to delete bank movement");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---------------------------------------------------------------------------
// Reconciliations
// ---------------------------------------------------------------------------

router.get(
  "/bank/reconciliations",
  requireAuth,
  requireCapability("bank:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const bankAccountId = req.query["bankAccountId"];
    try {
      const conds = [eq(bankReconciliationsTable.companyId, companyId)];
      if (typeof bankAccountId === "string" && bankAccountId)
        conds.push(eq(bankReconciliationsTable.bankAccountId, bankAccountId));
      const rows = await db
        .select()
        .from(bankReconciliationsTable)
        .where(and(...conds))
        .orderBy(desc(bankReconciliationsTable.periodEnd));
      res.json(await serializeReconciliations(rows, companyId));
    } catch (err) {
      req.log.error({ err }, "Failed to list reconciliations");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.post(
  "/bank/reconciliations",
  requireAuth,
  requireCapability("bank:create"),
  async (req, res) => {
    const parsed = CreateBankReconciliationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const d = parsed.data;
    try {
      const [bank] = await db
        .select()
        .from(bankAccountsTable)
        .where(
          and(
            eq(bankAccountsTable.id, d.bankAccountId),
            eq(bankAccountsTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!bank) {
        res.status(400).json({ error: "الحساب البنكي غير موجود" });
        return;
      }
      if (d.periodEnd < d.periodStart) {
        res.status(400).json({ error: "تاريخ نهاية الفترة قبل بدايتها" });
        return;
      }
      const bookBalance = await bookBalanceUpTo(
        companyId,
        bank.id,
        Number(bank.openingBalance),
        d.periodEnd,
      );
      const difference = round2(d.statementBalance - bookBalance);
      const [created] = await db
        .insert(bankReconciliationsTable)
        .values({
          companyId,
          bankAccountId: bank.id,
          periodStart: d.periodStart,
          periodEnd: d.periodEnd,
          statementBalance: String(round2(d.statementBalance)),
          bookBalance: String(bookBalance),
          difference: String(difference),
          status: "draft",
          notes: d.notes ?? null,
          createdBy: req.auth!.userId,
        })
        .returning();
      const detail = await buildReconciliationDetail(created!.id, companyId);
      res.status(201).json(detail);
    } catch (err) {
      req.log.error({ err }, "Failed to create reconciliation");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.get(
  "/bank/reconciliations/:id",
  requireAuth,
  requireCapability("bank:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const id = req.params["id"] as string;
    try {
      const detail = await buildReconciliationDetail(id, companyId);
      if (!detail) {
        res.status(404).json({ error: "التسوية غير موجودة" });
        return;
      }
      res.json(detail);
    } catch (err) {
      req.log.error({ err }, "Failed to get reconciliation");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.delete(
  "/bank/reconciliations/:id",
  requireAuth,
  requireCapability("bank:delete"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const id = req.params["id"] as string;
    try {
      const [rec] = await db
        .select()
        .from(bankReconciliationsTable)
        .where(
          and(
            eq(bankReconciliationsTable.id, id),
            eq(bankReconciliationsTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!rec) {
        res.status(404).json({ error: "التسوية غير موجودة" });
        return;
      }
      if (rec.status === "completed") {
        res
          .status(400)
          .json({ error: "لا يمكن حذف تسوية مكتملة" });
        return;
      }
      await db.transaction(async (tx) => {
        // Un-clear movements linked to this reconciliation.
        await tx
          .update(bankMovementsTable)
          .set({ isCleared: false, reconciliationId: null })
          .where(
            and(
              eq(bankMovementsTable.companyId, companyId),
              eq(bankMovementsTable.reconciliationId, id),
            ),
          );
        // Statement lines cascade on reconciliation delete.
        await tx
          .delete(bankReconciliationsTable)
          .where(
            and(
              eq(bankReconciliationsTable.id, id),
              eq(bankReconciliationsTable.companyId, companyId),
            ),
          );
      });
      res.json({ status: "ok" });
    } catch (err) {
      req.log.error({ err }, "Failed to delete reconciliation");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Statement upload (xlsx) ----
router.post(
  "/bank/reconciliations/:id/statement",
  requireAuth,
  requireCapability("bank:update"),
  handleXlsxUpload,
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const id = req.params["id"] as string;
    if (!req.file) {
      res.status(400).json({ error: "لم يتم رفع أي ملف" });
      return;
    }
    try {
      const [rec] = await db
        .select()
        .from(bankReconciliationsTable)
        .where(
          and(
            eq(bankReconciliationsTable.id, id),
            eq(bankReconciliationsTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!rec) {
        res.status(404).json({ error: "التسوية غير موجودة" });
        return;
      }
      if (rec.status === "completed") {
        res.status(400).json({ error: "التسوية مكتملة" });
        return;
      }
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(req.file.buffer as unknown as ArrayBuffer);
      const ws = wb.worksheets[0];
      if (!ws) {
        res.status(400).json({ error: "الملف لا يحتوي على بيانات" });
        return;
      }
      const headerRow = ws.getRow(1);
      const colIndex: Record<string, number> = {};
      headerRow.eachCell((cell, col) => {
        colIndex[cellStr(cell.value).trim().toLowerCase()] = col;
      });
      const col = (...keys: string[]) => {
        for (const k of keys) if (colIndex[k]) return colIndex[k];
        return 0;
      };
      const dateCol = col("date", "التاريخ");
      const descCol = col("description", "desc", "البيان", "الوصف");
      const amountCol = col("amount", "المبلغ");
      const debitCol = col("debit", "withdrawal", "مدين", "سحب");
      const creditCol = col("credit", "deposit", "دائن", "إيداع");
      const dirCol = col("direction", "type", "النوع", "الاتجاه");
      if (!amountCol && !debitCol && !creditCol) {
        res.status(400).json({
          error:
            "صيغة الملف غير صحيحة. الأعمدة المطلوبة: date, description, amount (أو debit/credit)",
        });
        return;
      }

      type ParsedLine = {
        date: string | null;
        description: string | null;
        amount: number;
        direction: "in" | "out";
      };
      const lines: ParsedLine[] = [];
      for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const dateVal = dateCol ? cellStr(row.getCell(dateCol).value) : "";
        const descVal = descCol ? cellStr(row.getCell(descCol).value) : "";
        let amount = 0;
        let direction: "in" | "out" = "in";
        if (debitCol || creditCol) {
          const debit = debitCol ? cellNum(row.getCell(debitCol).value) : 0;
          const credit = creditCol ? cellNum(row.getCell(creditCol).value) : 0;
          if (credit > 0) {
            amount = credit;
            direction = "in";
          } else if (debit > 0) {
            amount = debit;
            direction = "out";
          }
        } else {
          const raw = cellNum(row.getCell(amountCol).value);
          if (dirCol) {
            const dv = cellStr(row.getCell(dirCol).value).toLowerCase();
            direction =
              dv === "out" ||
              dv === "withdrawal" ||
              dv === "debit" ||
              dv === "سحب" ||
              dv === "مدين"
                ? "out"
                : "in";
            amount = Math.abs(raw);
          } else {
            direction = raw < 0 ? "out" : "in";
            amount = Math.abs(raw);
          }
        }
        if (amount <= 0 && !descVal && !dateVal) continue;
        if (amount <= 0) continue;
        lines.push({
          date: dateVal || null,
          description: descVal || null,
          amount: round2(amount),
          direction,
        });
      }

      await db.transaction(async (tx) => {
        // Replace any previously-uploaded statement lines for this reconciliation.
        await tx
          .delete(bankStatementLinesTable)
          .where(
            and(
              eq(bankStatementLinesTable.companyId, companyId),
              eq(bankStatementLinesTable.reconciliationId, id),
            ),
          );
        if (lines.length) {
          await tx.insert(bankStatementLinesTable).values(
            lines.map((l) => ({
              companyId,
              reconciliationId: id,
              date: l.date,
              description: l.description,
              amount: String(l.amount),
              direction: l.direction,
            })),
          );
        }
      });
      const detail = await buildReconciliationDetail(id, companyId);
      res.json(detail);
    } catch (err) {
      req.log.error({ err }, "Failed to upload statement");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Match (set cleared/uncleared) ----
router.post(
  "/bank/reconciliations/:id/match",
  requireAuth,
  requireCapability("bank:update"),
  async (req, res) => {
    const parsed = MatchBankReconciliationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const id = req.params["id"] as string;
    const d = parsed.data;
    try {
      const [rec] = await db
        .select()
        .from(bankReconciliationsTable)
        .where(
          and(
            eq(bankReconciliationsTable.id, id),
            eq(bankReconciliationsTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!rec) {
        res.status(404).json({ error: "التسوية غير موجودة" });
        return;
      }
      if (rec.status === "completed") {
        res.status(400).json({ error: "التسوية مكتملة" });
        return;
      }
      const clearedIds = new Set(d.movementIds);
      let invalidMatch = false;
      await db.transaction(async (tx) => {
        // Load this account's in-period movements; set cleared state per the
        // provided set, but never touch movements claimed by ANOTHER reconciliation.
        const periodMovements = await tx
          .select()
          .from(bankMovementsTable)
          .where(
            and(
              eq(bankMovementsTable.companyId, companyId),
              eq(bankMovementsTable.bankAccountId, rec.bankAccountId),
              gte(bankMovementsTable.date, rec.periodStart),
              lte(bankMovementsTable.date, rec.periodEnd),
            ),
          );
        // A statement line may only be matched to a movement that belongs to
        // THIS reconciliation's account+period (tenant-isolation: never link an
        // arbitrary movement id from another company/account).
        const validMovementIds = new Set(periodMovements.map((m) => m.id));
        for (const sm of d.statementLineMatches ?? []) {
          if (sm.movementId && !validMovementIds.has(sm.movementId)) {
            invalidMatch = true;
            return;
          }
        }
        for (const m of periodMovements) {
          if (m.reconciliationId && m.reconciliationId !== id) continue;
          // Adjusting entries created for THIS reconciliation are always part of
          // it and must never be un-cleared by a match payload that happens to
          // omit them (defense-in-depth against stale client state).
          const shouldClear =
            clearedIds.has(m.id) || (m.isAdjustment && m.reconciliationId === id);
          await tx
            .update(bankMovementsTable)
            .set({
              isCleared: shouldClear,
              reconciliationId: shouldClear ? id : null,
            })
            .where(
              and(
                eq(bankMovementsTable.id, m.id),
                eq(bankMovementsTable.companyId, companyId),
              ),
            );
        }
        // Apply explicit statement-line ↔ movement matches if provided.
        for (const sm of d.statementLineMatches ?? []) {
          await tx
            .update(bankStatementLinesTable)
            .set({ matchedMovementId: sm.movementId ?? null })
            .where(
              and(
                eq(bankStatementLinesTable.id, sm.statementLineId),
                eq(bankStatementLinesTable.companyId, companyId),
                eq(bankStatementLinesTable.reconciliationId, id),
              ),
            );
        }
      });
      if (invalidMatch) {
        res.status(400).json({ error: "حركة غير صالحة للمطابقة" });
        return;
      }
      const detail = await buildReconciliationDetail(id, companyId);
      res.json(detail);
    } catch (err) {
      req.log.error({ err }, "Failed to match reconciliation");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Adjust (create adjusting movements) ----
router.post(
  "/bank/reconciliations/:id/adjust",
  requireAuth,
  requireCapability("bank:create"),
  async (req, res) => {
    const parsed = AdjustBankReconciliationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const id = req.params["id"] as string;
    const d = parsed.data;
    if (d.lines.length === 0) {
      res.status(400).json({ error: "لا توجد بنود تسوية" });
      return;
    }
    const baseCurrency = await loadBaseCurrency(companyId);
    try {
      const [rec] = await db
        .select()
        .from(bankReconciliationsTable)
        .where(
          and(
            eq(bankReconciliationsTable.id, id),
            eq(bankReconciliationsTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!rec) {
        res.status(404).json({ error: "التسوية غير موجودة" });
        return;
      }
      if (rec.status === "completed") {
        res.status(400).json({ error: "التسوية مكتملة" });
        return;
      }
      const [bank] = await db
        .select()
        .from(bankAccountsTable)
        .where(
          and(
            eq(bankAccountsTable.id, rec.bankAccountId),
            eq(bankAccountsTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!bank) {
        res.status(400).json({ error: "الحساب البنكي غير موجود" });
        return;
      }
      if (!(await isLeafAccount(bank.accountId, companyId))) {
        res.status(400).json({ error: "الحساب المحاسبي المرتبط غير صحيح" });
        return;
      }
      // Validate every line up front.
      for (const line of d.lines) {
        if (line.amount <= 0) {
          res.status(400).json({ error: "مبلغ التسوية يجب أن يكون أكبر من صفر" });
          return;
        }
        if (!(await isLeafAccount(line.counterpartAccountId, companyId))) {
          res
            .status(400)
            .json({ error: "الحساب المقابل غير صحيح أو حساب رئيسي" });
          return;
        }
      }
      await db.transaction(async (tx) => {
        for (const line of d.lines) {
          const direction =
            MOVEMENT_DIRECTION[line.type as Exclude<BankMovementType, "transfer">];
          const amount = round2(line.amount);
          const date = line.date || rec.periodEnd;
          const entry = await createDraftJournalEntry(tx, {
            companyId,
            baseCurrency,
            date,
            reference: `تسوية بنكية`,
            notes: line.description ?? null,
            createdBy: req.auth!.userId,
            status: "posted",
            lines: buildMovementLines({
              direction,
              bankChartAccountId: bank.accountId,
              counterpartAccountId: line.counterpartAccountId,
              amountBase: amount,
              description: line.description ?? null,
            }),
          });
          await tx.insert(bankMovementsTable).values({
            companyId,
            bankAccountId: bank.id,
            date,
            type: line.type,
            direction,
            amount: String(amount),
            currency: bank.currency,
            exchangeRate: "1",
            counterpartAccountId: line.counterpartAccountId,
            description: line.description ?? null,
            journalEntryId: entry.id,
            // Adjusting entries are cleared + tied to this reconciliation.
            reconciliationId: id,
            isCleared: true,
            isAdjustment: true,
            createdBy: req.auth!.userId,
          });
        }
      });
      const detail = await buildReconciliationDetail(id, companyId);
      res.status(201).json(detail);
    } catch (err) {
      req.log.error({ err }, "Failed to adjust reconciliation");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Complete ----
router.post(
  "/bank/reconciliations/:id/complete",
  requireAuth,
  requireCapability("bank:update"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const id = req.params["id"] as string;
    try {
      const [rec] = await db
        .select()
        .from(bankReconciliationsTable)
        .where(
          and(
            eq(bankReconciliationsTable.id, id),
            eq(bankReconciliationsTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!rec) {
        res.status(404).json({ error: "التسوية غير موجودة" });
        return;
      }
      if (rec.status === "completed") {
        res.status(400).json({ error: "التسوية مكتملة بالفعل" });
        return;
      }
      const [bank] = await db
        .select({ openingBalance: bankAccountsTable.openingBalance })
        .from(bankAccountsTable)
        .where(
          and(
            eq(bankAccountsTable.id, rec.bankAccountId),
            eq(bankAccountsTable.companyId, companyId),
          ),
        )
        .limit(1);
      const bookBalance = await bookBalanceUpTo(
        companyId,
        rec.bankAccountId,
        Number(bank?.openingBalance ?? 0),
        rec.periodEnd,
      );
      const difference = round2(Number(rec.statementBalance) - bookBalance);
      await db
        .update(bankReconciliationsTable)
        .set({
          status: "completed",
          bookBalance: String(bookBalance),
          difference: String(difference),
          completedAt: new Date(),
        })
        .where(
          and(
            eq(bankReconciliationsTable.id, id),
            eq(bankReconciliationsTable.companyId, companyId),
          ),
        );
      const detail = await buildReconciliationDetail(id, companyId);
      res.json(detail);
    } catch (err) {
      req.log.error({ err }, "Failed to complete reconciliation");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
