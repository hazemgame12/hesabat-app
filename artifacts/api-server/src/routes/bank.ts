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
import { exportWorkbook, parseSheet } from "../lib/excel";
import { safeAudit } from "../lib/audit";

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
  // Latest reconciliation per bank account → drives the per-account book vs
  // statement summary in the accounts list.
  const bankAcctIds = rows.map((r) => r.id);
  const recRows = await db
    .select({
      bankAccountId: bankReconciliationsTable.bankAccountId,
      statementBalance: bankReconciliationsTable.statementBalance,
      difference: bankReconciliationsTable.difference,
      periodEnd: bankReconciliationsTable.periodEnd,
      status: bankReconciliationsTable.status,
      createdAt: bankReconciliationsTable.createdAt,
    })
    .from(bankReconciliationsTable)
    .where(
      and(
        eq(bankReconciliationsTable.companyId, companyId),
        inArray(bankReconciliationsTable.bankAccountId, bankAcctIds),
      ),
    )
    .orderBy(
      desc(bankReconciliationsTable.periodEnd),
      desc(bankReconciliationsTable.createdAt),
    );
  const latestRec = new Map<
    string,
    { statementBalance: number; difference: number; periodEnd: string; status: string }
  >();
  for (const rc of recRows) {
    if (latestRec.has(rc.bankAccountId)) continue;
    latestRec.set(rc.bankAccountId, {
      statementBalance: Number(rc.statementBalance),
      difference: Number(rc.difference),
      periodEnd: rc.periodEnd,
      status: rc.status,
    });
  }
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
    latestStatementBalance: latestRec.get(r.id)?.statementBalance ?? null,
    latestDifference: latestRec.get(r.id)?.difference ?? null,
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

  // Outstanding items must cover ALL uncleared movements up to periodEnd (not
  // just in-period), including ones brought forward from before periodStart that
  // still haven't cleared. This keeps the report identity exact:
  // adjustedStatementBalance − fullBookBalance == statement − clearedBookBalance,
  // because the net of these outstanding items == fullBookBalance −
  // clearedBookBalance (both computed up to periodEnd).
  const outstanding = await db
    .select()
    .from(bankMovementsTable)
    .where(
      and(
        eq(bankMovementsTable.companyId, companyId),
        eq(bankMovementsTable.bankAccountId, rec.bankAccountId),
        lte(bankMovementsTable.date, rec.periodEnd),
        eq(bankMovementsTable.isCleared, false),
      ),
    )
    .orderBy(bankMovementsTable.date);
  const opening = Number(bank?.openingBalance ?? 0);
  // Cleared book balance: opening + cleared movements up to period end.
  const clearedBookBalance = await clearedBookBalanceUpTo(
    companyId,
    rec.bankAccountId,
    opening,
    rec.periodEnd,
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

// Builds a formatted reconciliation report: starts from the bank statement
// balance, adds outstanding (uncleared) deposits, subtracts outstanding
// withdrawals/checks to reach an adjusted statement balance, and compares it to
// the cleared book balance. A reconciliation "balances" when the difference is 0.
async function buildReconciliationReport(
  reconciliationId: string,
  companyId: string,
) {
  const detail = await buildReconciliationDetail(reconciliationId, companyId);
  if (!detail) return null;
  const rec = detail.reconciliation;
  const outstandingDeposits = detail.outstanding.filter(
    (m) => m.direction === "in",
  );
  const outstandingWithdrawals = detail.outstanding.filter(
    (m) => m.direction === "out",
  );
  const depositsTotal = round2(
    outstandingDeposits.reduce((s, m) => s + m.amount, 0),
  );
  const withdrawalsTotal = round2(
    outstandingWithdrawals.reduce((s, m) => s + m.amount, 0),
  );
  const adjustedStatementBalance = round2(
    rec.statementBalance + depositsTotal - withdrawalsTotal,
  );
  const reconciledLines = detail.statementLines.filter(
    (l) => l.matchedMovementId,
  );
  const unreconciledStatementLines = detail.statementLines.filter(
    (l) => !l.matchedMovementId,
  );
  return {
    reconciliation: rec,
    statementBalance: rec.statementBalance,
    bookBalance: rec.bookBalance,
    clearedBookBalance: detail.clearedBookBalance,
    outstandingDeposits,
    depositsTotal,
    outstandingWithdrawals,
    withdrawalsTotal,
    adjustedStatementBalance,
    difference: detail.reconciledDifference,
    isBalanced: Math.abs(detail.reconciledDifference) < 0.005,
    reconciledCount: reconciledLines.length,
    unreconciledCount: unreconciledStatementLines.length,
    unreconciledStatementLines,
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

// Cleared book balance = opening + cleared (reconciled) movements up to a date.
// This is the canonical basis for a reconciliation's `difference`
// (statementBalance − clearedBookBalance) so that the persisted value matches
// what buildReconciliationDetail/report compute live, and goes to zero as the
// user clears items. Keep create/complete/match in sync via this helper.
async function clearedBookBalanceUpTo(
  companyId: string,
  bankAccountId: string,
  opening: number,
  upToDate: string,
): Promise<number> {
  const sums = await movementSums(companyId, {
    bankAccountId,
    upToDate,
    clearedOnly: true,
  });
  return round2(opening + (sums.get(bankAccountId) ?? 0));
}

// ---------------------------------------------------------------------------
// Auto-match engine
// ---------------------------------------------------------------------------

type AutoMatchConfidence = "exact" | "high" | "medium";

interface AutoMatchLine {
  id: string;
  date: string | null;
  description: string | null;
  amount: number;
  direction: "in" | "out";
}

interface AutoMatchMovement {
  id: string;
  date: string | null;
  description: string | null;
  reference: string | null;
  amount: number;
  direction: "in" | "out";
}

interface AutoMatchSuggestion {
  statementLineId: string;
  movementId: string;
  confidence: AutoMatchConfidence;
}

// Whole-day difference between two YYYY-MM-DD dates; null when either is missing
// or unparseable.
function dayDiff(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return null;
  return Math.abs(Math.round((da - db) / 86_400_000));
}

// Tokenize a free-text reference/description into normalized words (>=3 chars),
// keeping latin + arabic letters and digits.
function refTokens(s: string | null): Set<string> {
  if (!s) return new Set();
  return new Set(
    s
      .toLowerCase()
      .split(/[^0-9a-z\u0600-\u06ff]+/)
      .filter((t) => t.length >= 3),
  );
}

function refOverlap(line: string | null, movementRef: string | null): boolean {
  const a = refTokens(line);
  if (a.size === 0) return false;
  const b = refTokens(movementRef);
  if (b.size === 0) return false;
  for (const t of a) if (b.has(t)) return true;
  return false;
}

// Pure auto-match: pairs statement lines to bank movements by direction + amount,
// then ranks by date proximity and reference overlap. Greedy unique assignment
// (each line and each movement used at most once). Returns suggestions plus the
// statement lines / movements left unmatched.
function computeAutoMatch(
  lines: AutoMatchLine[],
  movements: AutoMatchMovement[],
): {
  suggestions: AutoMatchSuggestion[];
  unmatchedStatementLineIds: string[];
  unmatchedMovementIds: string[];
} {
  type Candidate = {
    lineId: string;
    movementId: string;
    score: number;
    confidence: AutoMatchConfidence;
  };
  const candidates: Candidate[] = [];
  for (const line of lines) {
    for (const mv of movements) {
      if (line.direction !== mv.direction) continue;
      if (Math.abs(line.amount - mv.amount) > MONEY_EPS) continue;
      const diff = dayDiff(line.date, mv.date);
      const ref = refOverlap(line.description, mv.reference ?? mv.description);
      // Amount + direction always match here; rank the rest.
      let score = 100;
      let confidence: AutoMatchConfidence;
      if (diff === 0) {
        score += 60;
        confidence = "exact";
      } else if (ref && (diff === null || diff <= 3)) {
        score += 50;
        confidence = "exact";
      } else if (diff !== null && diff <= 3) {
        score += 30;
        confidence = "high";
      } else if (diff === null || diff <= 14) {
        score += 10;
        confidence = "medium";
      } else {
        // Amount matches but dates are far apart and references don't overlap:
        // too weak to suggest.
        continue;
      }
      if (ref) score += 25;
      candidates.push({ lineId: line.id, movementId: mv.id, score, confidence });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const usedLines = new Set<string>();
  const usedMovements = new Set<string>();
  const suggestions: AutoMatchSuggestion[] = [];
  for (const c of candidates) {
    if (usedLines.has(c.lineId) || usedMovements.has(c.movementId)) continue;
    usedLines.add(c.lineId);
    usedMovements.add(c.movementId);
    suggestions.push({
      statementLineId: c.lineId,
      movementId: c.movementId,
      confidence: c.confidence,
    });
  }
  return {
    suggestions,
    unmatchedStatementLineIds: lines
      .filter((l) => !usedLines.has(l.id))
      .map((l) => l.id),
    unmatchedMovementIds: movements
      .filter((m) => !usedMovements.has(m.id))
      .map((m) => m.id),
  };
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
// Accounts Excel export / import
// ---------------------------------------------------------------------------

// Streams the company's bank/cash accounts as an .xlsx workbook (round-trips the
// import format; balance is an informational extra column).
router.get(
  "/bank/accounts/export",
  requireAuth,
  requireCapability("bank:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    try {
      const rows = await db
        .select({
          account: bankAccountsTable,
          chartCode: accountsTable.code,
        })
        .from(bankAccountsTable)
        .innerJoin(
          accountsTable,
          and(
            eq(accountsTable.id, bankAccountsTable.accountId),
            eq(accountsTable.companyId, companyId),
          ),
        )
        .where(eq(bankAccountsTable.companyId, companyId))
        .orderBy(desc(bankAccountsTable.createdAt));
      const sums = await movementSums(companyId);
      await exportWorkbook(res, {
        sheetName: "BankAccounts",
        fileName: "bank-accounts-export",
        columns: [
          { header: "nameAr", value: (r) => r.account.nameAr },
          { header: "nameEn", value: (r) => r.account.nameEn ?? "" },
          { header: "type", value: (r) => r.account.type },
          { header: "bankName", value: (r) => r.account.bankName ?? "" },
          { header: "accountNumber", value: (r) => r.account.accountNumber ?? "" },
          { header: "currency", value: (r) => r.account.currency },
          {
            header: "openingBalance",
            value: (r) => Number(r.account.openingBalance ?? 0),
          },
          {
            header: "openingBalanceDate",
            value: (r) => r.account.openingBalanceDate ?? "",
          },
          { header: "accountCode", value: (r) => r.chartCode },
          {
            header: "balance",
            value: (r) =>
              round2(
                Number(r.account.openingBalance ?? 0) +
                  (sums.get(r.account.id) ?? 0),
              ),
          },
        ],
        rows,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to export bank accounts");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// Bulk-creates bank/cash accounts from an .xlsx (round-trips the export format).
// Each row links to an existing leaf chart-of-accounts account by `accountCode`.
// All-or-nothing: any invalid row aborts the whole import.
router.post(
  "/bank/accounts/import",
  requireAuth,
  requireCapability("bank:create"),
  handleXlsxUpload,
  async (req, res) => {
    const companyId = req.auth!.companyId;
    if (!req.file) {
      res.status(400).json({ error: "لم يتم رفع أي ملف" });
      return;
    }
    try {
      const sheet = await parseSheet(req.file.buffer);
      if (!sheet) {
        res.status(400).json({ error: "الملف لا يحتوي على بيانات" });
        return;
      }
      if (!sheet.has("nameAr") || !sheet.has("accountCode")) {
        res.status(400).json({
          error:
            "صيغة الملف غير صحيحة. الأعمدة المطلوبة: nameAr, type, currency, accountCode",
        });
        return;
      }

      // Resolve linked chart accounts by code (must be leaf accounts).
      const chartAccounts = await db
        .select({
          id: accountsTable.id,
          code: accountsTable.code,
          isGroup: accountsTable.isGroup,
        })
        .from(accountsTable)
        .where(eq(accountsTable.companyId, companyId));
      const accByCode = new Map(chartAccounts.map((a) => [a.code, a]));
      const existing = await db
        .select({ nameAr: bankAccountsTable.nameAr })
        .from(bankAccountsTable)
        .where(eq(bankAccountsTable.companyId, companyId));
      const existingNames = new Set(existing.map((e) => e.nameAr));

      const ACCOUNT_TYPES = new Set(["bank", "cash", "credit_card", "loan"]);
      type Row = {
        nameAr: string;
        nameEn: string | null;
        type: string;
        bankName: string | null;
        accountNumber: string | null;
        currency: string;
        openingBalance: number;
        openingBalanceDate: string | null;
        accountId: string;
      };
      const parsed: Row[] = [];
      const seen = new Set<string>();
      for (const { rowNo, row } of sheet.rows) {
        const nameAr = sheet.str(row, "nameAr");
        const accountCode = sheet.str(row, "accountCode");
        if (!nameAr && !accountCode) continue; // skip blank rows
        if (!nameAr) {
          res.status(400).json({ error: `السطر ${rowNo}: nameAr مطلوب` });
          return;
        }
        if (seen.has(nameAr) || existingNames.has(nameAr)) {
          res
            .status(400)
            .json({ error: `السطر ${rowNo}: اسم الحساب ${nameAr} مكرر` });
          return;
        }
        const typeRaw = sheet.str(row, "type") || "bank";
        if (!ACCOUNT_TYPES.has(typeRaw)) {
          res.status(400).json({
            error: `السطر ${rowNo}: نوع الحساب ${typeRaw} غير صحيح (bank, cash, credit_card, loan)`,
          });
          return;
        }
        const currency = sheet.str(row, "currency");
        if (!currency) {
          res.status(400).json({ error: `السطر ${rowNo}: العملة مطلوبة` });
          return;
        }
        if (!accountCode) {
          res.status(400).json({ error: `السطر ${rowNo}: accountCode مطلوب` });
          return;
        }
        const chart = accByCode.get(accountCode);
        if (!chart) {
          res.status(400).json({
            error: `السطر ${rowNo}: الحساب المحاسبي ${accountCode} غير موجود`,
          });
          return;
        }
        if (chart.isGroup) {
          res.status(400).json({
            error: `السطر ${rowNo}: ${accountCode} حساب رئيسي ولا يصلح للربط`,
          });
          return;
        }
        const obDate = sheet.str(row, "openingBalanceDate");
        seen.add(nameAr);
        parsed.push({
          nameAr,
          nameEn: sheet.str(row, "nameEn") || null,
          type: typeRaw,
          bankName: sheet.str(row, "bankName") || null,
          accountNumber: sheet.str(row, "accountNumber") || null,
          currency: currency.toUpperCase(),
          openingBalance: round2(sheet.num(row, "openingBalance")),
          openingBalanceDate: obDate || null,
          accountId: chart.id,
        });
      }
      if (parsed.length === 0) {
        res.status(400).json({ error: "الملف لا يحتوي على حسابات" });
        return;
      }

      await db.transaction(async (tx) => {
        for (const r of parsed) {
          await tx.insert(bankAccountsTable).values({
            companyId,
            nameAr: r.nameAr,
            nameEn: r.nameEn,
            type: r.type,
            bankName: r.bankName,
            accountNumber: r.accountNumber,
            currency: r.currency,
            openingBalance: String(r.openingBalance),
            openingBalanceDate: r.openingBalanceDate,
            accountId: r.accountId,
            isActive: true,
          });
        }
      });
      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "import",
          entity: "bank_account",
          entityLabel: `${parsed.length} حساب بنكي`,
          newValue: { imported: parsed.length },
        },
        req.log,
      );
      res.json({ imported: parsed.length });
    } catch (err) {
      req.log.error({ err }, "Failed to import bank accounts");
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
      // Difference is measured against the CLEARED book balance (canonical),
      // so it matches buildReconciliationDetail and trends to zero as the user
      // clears items. At create nothing is cleared yet, so this is statement −
      // opening (full draft gap).
      const clearedBookBalance = await clearedBookBalanceUpTo(
        companyId,
        bank.id,
        Number(bank.openingBalance),
        d.periodEnd,
      );
      const difference = round2(d.statementBalance - clearedBookBalance);
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

// Formatted reconciliation report (statement → adjusted → book difference).
router.get(
  "/bank/reconciliations/:id/report",
  requireAuth,
  requireCapability("bank:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const id = req.params["id"] as string;
    try {
      const report = await buildReconciliationReport(id, companyId);
      if (!report) {
        res.status(404).json({ error: "التسوية غير موجودة" });
        return;
      }
      res.json(report);
    } catch (err) {
      req.log.error({ err }, "Failed to build reconciliation report");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// Reconciliation report as a formatted .xlsx (raw, no codegen).
router.get(
  "/bank/reconciliations/:id/report/export",
  requireAuth,
  requireCapability("bank:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const id = req.params["id"] as string;
    try {
      const report = await buildReconciliationReport(id, companyId);
      if (!report) {
        res.status(404).json({ error: "التسوية غير موجودة" });
        return;
      }
      const rec = report.reconciliation;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Reconciliation");
      ws.views = [{ rightToLeft: true }];
      const titleRow = ws.addRow(["تقرير التسوية البنكية"]);
      titleRow.font = { bold: true, size: 14 };
      ws.addRow([
        "الحساب البنكي",
        rec.bankAccountName ?? "",
      ]);
      ws.addRow(["الفترة", `${rec.periodStart} — ${rec.periodEnd}`]);
      ws.addRow([
        "الحالة",
        rec.status === "completed" ? "مكتملة" : "مسودة",
      ]);
      ws.addRow([]);
      const money = (n: number) => round2(n);
      ws.addRow(["الرصيد حسب كشف البنك", money(report.statementBalance)]);
      ws.addRow([
        `يضاف: إيداعات معلقة (${report.outstandingDeposits.length})`,
        money(report.depositsTotal),
      ]);
      for (const m of report.outstandingDeposits) {
        ws.addRow([`   ${m.date ?? ""} ${m.description ?? ""}`, money(m.amount)]);
      }
      ws.addRow([
        `يخصم: سحوبات/شيكات معلقة (${report.outstandingWithdrawals.length})`,
        money(report.withdrawalsTotal),
      ]);
      for (const m of report.outstandingWithdrawals) {
        ws.addRow([`   ${m.date ?? ""} ${m.description ?? ""}`, money(m.amount)]);
      }
      const adjRow = ws.addRow([
        "الرصيد المعدّل حسب الكشف",
        money(report.adjustedStatementBalance),
      ]);
      adjRow.font = { bold: true };
      ws.addRow([]);
      const bookRow = ws.addRow([
        "الرصيد حسب الدفاتر",
        money(report.bookBalance),
      ]);
      bookRow.font = { bold: true };
      const diffRow = ws.addRow(["الفرق", money(report.difference)]);
      diffRow.font = { bold: true };
      ws.addRow([
        "الحالة",
        report.isBalanced ? "متطابقة ✓" : "غير متطابقة",
      ]);
      ws.getColumn(1).width = 48;
      ws.getColumn(2).width = 20;

      const fileName = `reconciliation-report-${rec.periodEnd}`;
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}.xlsx"`,
      );
      await wb.xlsx.write(res);
      res.end();
    } catch (err) {
      req.log.error({ err }, "Failed to export reconciliation report");
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
        const movementById = new Map(periodMovements.map((m) => [m.id, m]));
        // A movement may be linked to at most ONE statement line, and only if it
        // is unclaimed or already claimed by THIS reconciliation. This guards the
        // one movement ↔ one statement-line invariant (auto-match suggestions can
        // be merged with stale local selections client-side, so re-validate here).
        const claimedHere = new Set<string>();
        for (const sm of d.statementLineMatches ?? []) {
          if (!sm.movementId) continue;
          const mv = movementById.get(sm.movementId);
          if (!mv) {
            invalidMatch = true;
            return;
          }
          if (mv.reconciliationId && mv.reconciliationId !== id) {
            invalidMatch = true;
            return;
          }
          if (claimedHere.has(sm.movementId)) {
            invalidMatch = true;
            return;
          }
          claimedHere.add(sm.movementId);
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
      // Clearing/un-clearing movements changes the cleared book balance, so the
      // persisted difference must be refreshed to stay consistent with the
      // detail/report and the account-list `latestDifference` column.
      const [bankAcct] = await db
        .select({ openingBalance: bankAccountsTable.openingBalance })
        .from(bankAccountsTable)
        .where(
          and(
            eq(bankAccountsTable.id, rec.bankAccountId),
            eq(bankAccountsTable.companyId, companyId),
          ),
        )
        .limit(1);
      const opening = Number(bankAcct?.openingBalance ?? 0);
      const bookBalance = await bookBalanceUpTo(
        companyId,
        rec.bankAccountId,
        opening,
        rec.periodEnd,
      );
      const clearedBookBalance = await clearedBookBalanceUpTo(
        companyId,
        rec.bankAccountId,
        opening,
        rec.periodEnd,
      );
      await db
        .update(bankReconciliationsTable)
        .set({
          bookBalance: String(bookBalance),
          difference: String(
            round2(Number(rec.statementBalance) - clearedBookBalance),
          ),
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
      req.log.error({ err }, "Failed to match reconciliation");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Auto-match (suggest statement line ↔ movement pairs) ----
router.get(
  "/bank/reconciliations/:id/auto-match",
  requireAuth,
  requireCapability("bank:read"),
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
      // Only unmatched statement lines are candidates.
      const statementRows = await db
        .select()
        .from(bankStatementLinesTable)
        .where(
          and(
            eq(bankStatementLinesTable.companyId, companyId),
            eq(bankStatementLinesTable.reconciliationId, id),
          ),
        );
      // Candidate movements: this account's in-period movements that are not yet
      // cleared and not claimed by another reconciliation (tenant + scope safe).
      const movementRows = await db
        .select()
        .from(bankMovementsTable)
        .where(
          and(
            eq(bankMovementsTable.companyId, companyId),
            eq(bankMovementsTable.bankAccountId, rec.bankAccountId),
            gte(bankMovementsTable.date, rec.periodStart),
            lte(bankMovementsTable.date, rec.periodEnd),
            eq(bankMovementsTable.isCleared, false),
          ),
        );
      const lines: AutoMatchLine[] = statementRows
        .filter((s) => !s.matchedMovementId)
        .map((s) => ({
          id: s.id,
          date: s.date,
          description: s.description,
          amount: Number(s.amount),
          direction: s.direction as "in" | "out",
        }));
      const movements: AutoMatchMovement[] = movementRows
        .filter((m) => !m.reconciliationId || m.reconciliationId === id)
        .map((m) => ({
          id: m.id,
          date: m.date,
          description: m.description,
          reference: m.reference,
          amount: Number(m.amount),
          direction: m.direction as "in" | "out",
        }));
      const result = computeAutoMatch(lines, movements);
      const matchedCount = result.suggestions.filter(
        (s) => s.confidence === "exact" || s.confidence === "high",
      ).length;
      const suggestedCount = result.suggestions.length - matchedCount;
      res.json({ ...result, matchedCount, suggestedCount });
    } catch (err) {
      req.log.error({ err }, "Failed to auto-match reconciliation");
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
      // Adjusting entries are cleared, so they shift the cleared book balance;
      // refresh the persisted bookBalance/difference to stay canonical.
      const opening = Number(bank.openingBalance);
      const bookBalance = await bookBalanceUpTo(
        companyId,
        bank.id,
        opening,
        rec.periodEnd,
      );
      const clearedBookBalance = await clearedBookBalanceUpTo(
        companyId,
        bank.id,
        opening,
        rec.periodEnd,
      );
      await db
        .update(bankReconciliationsTable)
        .set({
          bookBalance: String(bookBalance),
          difference: String(
            round2(Number(rec.statementBalance) - clearedBookBalance),
          ),
        })
        .where(
          and(
            eq(bankReconciliationsTable.id, id),
            eq(bankReconciliationsTable.companyId, companyId),
          ),
        );
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
      const clearedBookBalance = await clearedBookBalanceUpTo(
        companyId,
        rec.bankAccountId,
        Number(bank?.openingBalance ?? 0),
        rec.periodEnd,
      );
      const difference = round2(
        Number(rec.statementBalance) - clearedBookBalance,
      );
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
