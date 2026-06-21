import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { and, eq, ne, inArray, desc, sql, gte, lte, isNotNull, isNull, count, gt, or } from "drizzle-orm";
import { parsePagination, paginatedResponse } from "../lib/pagination";
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
  costCentersTable,
  journalEntriesTable,
  journalEntryLinesTable,
  customersTable,
  suppliersTable,
  paymentsTable,
  paymentAllocationsTable,
  invoicesTable,
  exchangeRatesTable,
  type BankAccount,
  type BankMovement,
  type BankReconciliation,
  type BankStatementLine,
} from "@workspace/db";
import {
  CreateBankAccountBody,
  UpdateBankAccountBody,
  CreateBankMovementBody,
  UpdateBankMovementBody,
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
import { ensureFxAccounts } from "../lib/seed-accounts";
import {
  MOVEMENT_DIRECTION,
  buildMovementLines,
  buildTransferLines,
  type BankMovementType,
} from "../lib/bank-posting";
import { exportWorkbook, parseSheet } from "../lib/excel";
import { z } from "zod/v4";
import { safeAudit } from "../lib/audit";
import { isWriteBlocked, WRITE_BLOCK_MSG } from "../lib/fiscal-year";

const router = Router();

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const LINK_MONEY_EPS = 0.005;

function linkInvoiceStatusFor(total: number, amountPaid: number): string {
  if (amountPaid >= total - LINK_MONEY_EPS) return "paid";
  if (amountPaid > LINK_MONEY_EPS) return "partially_paid";
  return "approved";
}

async function nextPaymentNoInTx(
  tx: Tx,
  companyId: string,
  kind: string,
): Promise<number> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${companyId + ":pay:" + kind}))`,
  );
  const [{ maxNo }] = await tx
    .select({ maxNo: sql<number>`coalesce(max(${paymentsTable.paymentNo}), 0)` })
    .from(paymentsTable)
    .where(and(eq(paymentsTable.companyId, companyId), eq(paymentsTable.kind, kind)));
  return Number(maxNo) + 1;
}

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

// Re-validates that a cost center belongs to the company (tenant isolation).
async function isCompanyCostCenter(
  costCenterId: string,
  companyId: string,
): Promise<boolean> {
  const [cc] = await db
    .select({ id: costCentersTable.id })
    .from(costCentersTable)
    .where(
      and(
        eq(costCentersTable.id, costCenterId),
        eq(costCentersTable.companyId, companyId),
      ),
    )
    .limit(1);
  return !!cc;
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
  const conds = [
    eq(bankMovementsTable.companyId, companyId),
    // Imported-but-unclassified rows (no journal entry) are NOT in the ledger
    // yet, so they must never move the bank balance until they are posted.
    isNotNull(bankMovementsTable.journalEntryId),
  ];
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
  const costCenterIds = [
    ...new Set(
      rows.map((r) => r.costCenterId).filter((x): x is string => !!x),
    ),
  ];
  const costCenterMap = new Map<string, string>();
  if (costCenterIds.length) {
    const ccs = await db
      .select({ id: costCentersTable.id, name: costCentersTable.nameAr })
      .from(costCentersTable)
      .where(
        and(
          eq(costCentersTable.companyId, companyId),
          inArray(costCentersTable.id, costCenterIds),
        ),
      );
    for (const c of ccs) costCenterMap.set(c.id, c.name);
  }
  // Look up linked payment IDs (movement → payment)
  const paymentMap = new Map<string, string>();
  {
    const linked = await db
      .select({ id: paymentsTable.id, bankMovementId: paymentsTable.bankMovementId })
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.companyId, companyId),
          isNotNull(paymentsTable.bankMovementId),
          sql`${paymentsTable.bankMovementId} = ANY(ARRAY[${sql.join(
            rows.map((r) => sql`${r.id}::uuid`),
            sql`, `,
          )}])`,
        ),
      );
    for (const p of linked) {
      if (p.bankMovementId) paymentMap.set(p.bankMovementId, p.id);
    }
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
    costCenterId: r.costCenterId,
    costCenterName: r.costCenterId
      ? (costCenterMap.get(r.costCenterId) ?? null)
      : null,
    transferAccountId: r.transferAccountId,
    transferAccountName: r.transferAccountId
      ? (bankMap.get(r.transferAccountId) ?? null)
      : null,
    transferGroupId: r.transferGroupId,
    destinationAmount: r.destinationAmount != null ? Number(r.destinationAmount) : null,
    bankFees: r.bankFees != null ? Number(r.bankFees) : null,
    realizedGainLoss: r.realizedGainLoss != null ? Number(r.realizedGainLoss) : null,
    description: r.description,
    notes: r.notes,
    // A movement with no journal entry is an imported statement line still
    // awaiting classification (تبويب). Everything else is posted to the ledger.
    status: (r.journalEntryId ? "posted" : "pending") as "posted" | "pending",
    reference: r.reference,
    journalEntryId: r.journalEntryId,
    reconciliationId: r.reconciliationId,
    isCleared: r.isCleared,
    isAdjustment: r.isAdjustment,
    paymentId: paymentMap.get(r.id) ?? null,
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
// Movements Excel export / import (per selected bank/cash account)
// ---------------------------------------------------------------------------

// Streams a single account's movements as an .xlsx workbook. Columns round-trip
// the import format so a user can export, edit in Excel, and re-upload. Transfer
// rows are exported for reference only (no counterpart chart code) and are not
// re-importable.
router.get(
  "/bank/movements/export",
  requireAuth,
  requireCapability("bank:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const bankAccountId = req.query["bankAccountId"];
    if (typeof bankAccountId !== "string" || !bankAccountId) {
      res.status(400).json({ error: "يجب تحديد الحساب البنكي" });
      return;
    }
    try {
      const [bank] = await db
        .select()
        .from(bankAccountsTable)
        .where(
          and(
            eq(bankAccountsTable.id, bankAccountId),
            eq(bankAccountsTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!bank) {
        res.status(404).json({ error: "الحساب البنكي غير موجود" });
        return;
      }
      const rows = await db
        .select({
          mv: bankMovementsTable,
          counterpartCode: accountsTable.code,
          counterpartName: accountsTable.nameAr,
          costCenterName: costCentersTable.nameAr,
        })
        .from(bankMovementsTable)
        .leftJoin(
          accountsTable,
          and(
            eq(accountsTable.id, bankMovementsTable.counterpartAccountId),
            eq(accountsTable.companyId, companyId),
          ),
        )
        .leftJoin(
          costCentersTable,
          and(
            eq(costCentersTable.id, bankMovementsTable.costCenterId),
            eq(costCentersTable.companyId, companyId),
          ),
        )
        .where(
          and(
            eq(bankMovementsTable.companyId, companyId),
            eq(bankMovementsTable.bankAccountId, bankAccountId),
          ),
        )
        .orderBy(
          desc(bankMovementsTable.date),
          desc(bankMovementsTable.createdAt),
        );
      await exportWorkbook(res, {
        sheetName: "Movements",
        fileName: "bank-movements-export",
        columns: [
          { header: "التاريخ", value: (r) => r.mv.date },
          {
            header: "مدين",
            value: (r) => (r.mv.direction === "in" ? Number(r.mv.amount) : ""),
          },
          {
            header: "دائن",
            value: (r) => (r.mv.direction === "out" ? Number(r.mv.amount) : ""),
          },
          {
            header: "وصف البنك (من الكشف)",
            value: (r) => r.mv.notes ?? "",
            width: 32,
          },
          {
            header: "الحساب المقابل (كود + اسم)",
            value: (r) =>
              r.counterpartCode && r.counterpartName
                ? `${r.counterpartCode} - ${r.counterpartName}`
                : r.counterpartCode ?? r.counterpartName ?? "",
            width: 32,
          },
          {
            header: "مركز التكلفة",
            value: (r) => r.costCenterName ?? "",
            width: 22,
          },
          {
            header: "شرح القيد",
            value: (r) => r.mv.description ?? "",
            width: 32,
          },
          { header: "نوع الحركة", value: (r) => r.mv.type, width: 20 },
          { header: "العملة", value: (r) => r.mv.currency },
          { header: "سعر الصرف", value: (r) => Number(r.mv.exchangeRate) },
          { header: "المرجع", value: (r) => r.mv.reference ?? "" },
        ],
        rows,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to export bank movements");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// Bulk-imports raw bank-statement lines for ONE bank/cash account from an
// .xlsx. Columns: التاريخ (date), مدين (debit = money IN, raises the balance →
// direction "in"), دائن (credit = money OUT), and ملاحظات / وصف البنك (the
// bank's own statement text → `notes`). Exactly one of debit/credit must carry
// a value per row. NO counterpart account and NO journal entry are created here:
// every imported row lands as a "pending" movement that the user later opens and
// classifies (picks the account + writes their own البيان), which posts it. So
// imported rows do NOT touch the ledger or balance until classified.
// All-or-nothing: any invalid row aborts the whole import.
router.post(
  "/bank/movements/import",
  requireAuth,
  requireCapability("bank:create"),
  handleXlsxUpload,
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const bankAccountId = req.query["bankAccountId"];
    if (typeof bankAccountId !== "string" || !bankAccountId) {
      res.status(400).json({ error: "يجب تحديد الحساب البنكي" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "لم يتم رفع أي ملف" });
      return;
    }
    try {
      const [bank] = await db
        .select()
        .from(bankAccountsTable)
        .where(
          and(
            eq(bankAccountsTable.id, bankAccountId),
            eq(bankAccountsTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!bank) {
        res.status(404).json({ error: "الحساب البنكي غير موجود" });
        return;
      }
      const sheet = await parseSheet(req.file.buffer);
      if (!sheet) {
        res.status(400).json({ error: "الملف لا يحتوي على بيانات" });
        return;
      }
      // Accept Arabic or English headers. مدين = money IN (raises the balance),
      // دائن = money OUT. Direction is derived from which column carries a value.
      const pick = (...aliases: string[]) => aliases.find((h) => sheet.has(h));
      const H = {
        date: pick("date", "التاريخ"),
        debit: pick("debit", "مدين"),
        credit: pick("credit", "دائن"),
        notes: pick("notes", "ملاحظات", "وصف البنك", "البيان", "الوصف"),
      };
      if (!H.date || (!H.debit && !H.credit)) {
        res.status(400).json({
          error:
            "صيغة الملف غير صحيحة. الأعمدة المطلوبة: التاريخ، مدين و/أو دائن",
        });
        return;
      }

      const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
      type PRow = {
        date: string;
        direction: "in" | "out";
        amount: number;
        notes: string | null;
      };
      const S = (row: ExcelJS.Row, h: string | undefined) =>
        h ? sheet.str(row, h) : "";
      const N = (row: ExcelJS.Row, h: string | undefined) =>
        h ? sheet.num(row, h) : 0;
      const parsed: PRow[] = [];
      for (const { rowNo, row } of sheet.rows) {
        const date = S(row, H.date);
        const notes = S(row, H.notes);
        const debit = round2(N(row, H.debit));
        const credit = round2(N(row, H.credit));
        // Skip fully-blank rows.
        if (!date && !notes && debit <= 0 && credit <= 0) continue;

        if (!DATE_RE.test(date)) {
          res.status(400).json({
            error: `السطر ${rowNo}: التاريخ مطلوب بصيغة YYYY-MM-DD`,
          });
          return;
        }
        if (debit < 0 || credit < 0) {
          res.status(400).json({
            error: `السطر ${rowNo}: لا يمكن إدخال قيمة سالبة في «مدين» أو «دائن»`,
          });
          return;
        }
        if (debit > 0 && credit > 0) {
          res.status(400).json({
            error: `السطر ${rowNo}: لا يمكن إدخال قيمة في «مدين» و«دائن» معًا`,
          });
          return;
        }
        if (debit <= 0 && credit <= 0) {
          res.status(400).json({
            error: `السطر ${rowNo}: يجب إدخال قيمة في «مدين» أو «دائن»`,
          });
          return;
        }
        // مدين = in (raises balance), دائن = out.
        const direction: "in" | "out" = debit > 0 ? "in" : "out";
        const amount = debit > 0 ? debit : credit;
        parsed.push({
          date,
          direction,
          amount,
          notes: notes || null,
        });
      }
      if (parsed.length === 0) {
        res.status(400).json({ error: "الملف لا يحتوي على حركات" });
        return;
      }

      await db.transaction(async (tx) => {
        for (const r of parsed) {
          // Pending row: no counterpart, no journal entry. Type defaults to
          // deposit/withdrawal by direction; the user changes it on classify.
          await tx.insert(bankMovementsTable).values({
            companyId,
            bankAccountId: bank.id,
            date: r.date,
            type: r.direction === "in" ? "deposit" : "withdrawal",
            direction: r.direction,
            amount: String(r.amount),
            currency: bank.currency,
            exchangeRate: "1",
            notes: r.notes,
            createdBy: req.auth!.userId,
          });
        }
      });
      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "import",
          entity: "bank_movement",
          entityLabel: `${parsed.length} حركة بنكية`,
          newValue: { imported: parsed.length, bankAccountId: bank.id },
        },
        req.log,
      );
      res.json({ imported: parsed.length });
    } catch (err) {
      req.log.error({ err }, "Failed to import bank movements");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---------------------------------------------------------------------------
// Import Wizard — Step 1: parse file and return raw rows (no DB write)
// ---------------------------------------------------------------------------
router.post(
  "/bank/movements/parse-preview",
  requireAuth,
  requireCapability("bank:create"),
  handleXlsxUpload,
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "لم يتم رفع أي ملف" });
      return;
    }
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(req.file.buffer as unknown as ArrayBuffer);
      const ws = wb.worksheets[0];
      if (!ws) {
        res.status(400).json({ error: "الملف لا يحتوي على بيانات" });
        return;
      }
      const headerRow = ws.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell({ includeEmpty: false }, (cell) => {
        const s = cellStr(cell.value);
        if (s) headers.push(s);
      });
      if (headers.length === 0) {
        res.status(400).json({ error: "لا توجد أعمدة في الملف" });
        return;
      }
      const rows: Array<{ rowNo: number; cells: string[] }> = [];
      for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const cells = headers.map((_, i) => cellStr(row.getCell(i + 1).value));
        if (cells.every((c) => !c)) continue;
        rows.push({ rowNo: r, cells });
      }
      if (rows.length === 0) {
        res.status(400).json({ error: "الملف لا يحتوي على حركات" });
        return;
      }
      res.json({ headers, rows, totalRows: rows.length });
    } catch (err) {
      req.log.error({ err }, "parse-preview failed");
      res.status(500).json({ error: "تعذّر قراءة الملف" });
    }
  },
);

// ---------------------------------------------------------------------------
// Import Wizard — Step 3: save pre-validated rows from wizard
// ---------------------------------------------------------------------------
const ImportBatchRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "صيغة التاريخ يجب أن تكون YYYY-MM-DD"),
  direction: z.enum(["in", "out"]),
  amount: z.number().positive("المبلغ يجب أن يكون أكبر من صفر"),
  notes: z.string().nullish(),
  reference: z.string().nullish(),
  counterpartAccountId: z.string().nullish(),
  costCenterId: z.string().nullish(),
  description: z.string().nullish(),
});
const ImportBatchBodySchema = z.object({
  rows: z
    .array(ImportBatchRowSchema)
    .min(1, "يجب أن يحتوي الملف على حركة واحدة على الأقل"),
});

router.post(
  "/bank/movements/import-batch",
  requireAuth,
  requireCapability("bank:create"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const bankAccountId = req.query["bankAccountId"];
    if (typeof bankAccountId !== "string" || !bankAccountId) {
      res.status(400).json({ error: "يجب تحديد الحساب البنكي" });
      return;
    }
    const parsed = ImportBatchBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "بيانات غير صحيحة", details: parsed.error.flatten() });
      return;
    }
    const [bank] = await db
      .select()
      .from(bankAccountsTable)
      .where(
        and(
          eq(bankAccountsTable.id, bankAccountId),
          eq(bankAccountsTable.companyId, companyId),
        ),
      )
      .limit(1);
    if (!bank) {
      res.status(404).json({ error: "الحساب البنكي غير موجود" });
      return;
    }
    // Validate bank's linked chart account (needed for JE posting).
    if (!(await isLeafAccount(bank.accountId, companyId))) {
      res.status(400).json({ error: "الحساب المحاسبي المرتبط بالحساب البنكي غير صحيح" });
      return;
    }
    // Pre-validate all unique counterpart accounts referenced in this batch.
    const uniqueCounterpartIds = [
      ...new Set(
        parsed.data.rows
          .map((r) => r.counterpartAccountId ?? null)
          .filter((x): x is string => !!x),
      ),
    ];
    for (const id of uniqueCounterpartIds) {
      if (!(await isLeafAccount(id, companyId))) {
        res
          .status(400)
          .json({ error: `الحساب المقابل غير صحيح أو حساب رئيسي: ${id}` });
        return;
      }
    }
    const uniqueCostCenterIds = [
      ...new Set(
        parsed.data.rows
          .map((r) => r.costCenterId ?? null)
          .filter((x): x is string => !!x),
      ),
    ];
    for (const id of uniqueCostCenterIds) {
      if (!(await isCompanyCostCenter(id, companyId))) {
        res.status(400).json({ error: `مركز التكلفة غير صحيح: ${id}` });
        return;
      }
    }
    const baseCurrency = await loadBaseCurrency(companyId);
    let postedCount = 0;
    let pendingCount = 0;
    await db.transaction(async (tx) => {
      for (const r of parsed.data.rows) {
        const counterpartAccountId = r.counterpartAccountId ?? null;
        if (counterpartAccountId) {
          // ---- Classified row: post a journal entry immediately ----
          const entry = await createDraftJournalEntry(tx, {
            companyId,
            baseCurrency,
            date: r.date,
            reference: r.reference ?? "حركة بنكية",
            notes: r.description ?? null,
            createdBy: req.auth!.userId,
            status: "posted",
            lines: buildMovementLines({
              direction: r.direction,
              bankChartAccountId: bank.accountId,
              counterpartAccountId,
              amountBase: r.amount,
              description: r.description ?? null,
              costCenterId: r.costCenterId ?? null,
            }),
          });
          await tx.insert(bankMovementsTable).values({
            companyId,
            bankAccountId: bank.id,
            date: r.date,
            type: r.direction === "in" ? "deposit" : "withdrawal",
            direction: r.direction,
            amount: String(r.amount),
            currency: bank.currency,
            exchangeRate: "1",
            counterpartAccountId,
            costCenterId: r.costCenterId ?? null,
            description: r.description ?? null,
            notes: r.notes ?? null,
            reference: r.reference ?? null,
            journalEntryId: entry.id,
            createdBy: req.auth!.userId,
          });
          postedCount++;
        } else {
          // ---- Unclassified row: save as pending ----
          await tx.insert(bankMovementsTable).values({
            companyId,
            bankAccountId: bank.id,
            date: r.date,
            type: r.direction === "in" ? "deposit" : "withdrawal",
            direction: r.direction,
            amount: String(r.amount),
            currency: bank.currency,
            exchangeRate: "1",
            notes: r.notes ?? null,
            reference: r.reference ?? null,
            createdBy: req.auth!.userId,
          });
          pendingCount++;
        }
      }
    });
    const total = parsed.data.rows.length;
    await safeAudit(
      db,
      {
        companyId,
        userId: req.auth!.userId,
        action: "import",
        entity: "bank_movement",
        entityLabel: `${total} حركة بنكية (wizard)`,
        newValue: {
          imported: total,
          posted: postedCount,
          pending: pendingCount,
          bankAccountId: bank.id,
        },
      },
      req.log,
    );
    res.json({ imported: total, posted: postedCount, pending: pendingCount });
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
      const pg = parsePagination(req.query as Record<string, unknown>);

      if (pg) {
        const [{ total }] = await db
          .select({ total: count() })
          .from(bankMovementsTable)
          .where(and(...conds));
        const rows = await db
          .select()
          .from(bankMovementsTable)
          .where(and(...conds))
          .orderBy(desc(bankMovementsTable.date), desc(bankMovementsTable.createdAt))
          .limit(pg.limit)
          .offset(pg.offset);
        res.json(paginatedResponse(await serializeMovements(rows, companyId), Number(total), pg.page, pg.limit));
        return;
      }

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
      const wbBankCreate = await isWriteBlocked(db, companyId, d.date);
      if (wbBankCreate) {
        res.status(wbBankCreate === "period_locked" ? 423 : 400).json({ error: WRITE_BLOCK_MSG[wbBankCreate] });
        return;
      }
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
        // ── Multi-currency transfer support ────────────────────────────────
        const srcCurrency = currency.toUpperCase();
        const destCurrency = (dest.currency ?? baseCurrency).toUpperCase();
        const isFxTransfer = srcCurrency !== destCurrency;

        // destinationAmount: what actually arrives in the dest account.
        // Defaults to sourceAmount * rate when not provided (same-currency or
        // when the user doesn't specify it).
        const destRate = isFxTransfer ? 1 : rate; // dest is usually base (EGP)
        const destAmount = round2(
          d.destinationAmount != null
            ? d.destinationAmount
            : isFxTransfer
              ? amount * rate        // best estimate from rate
              : amount,             // same currency, same amount
        );
        const destAmountBase = round2(destAmount * destRate);
        const srcAmountBase = amountBase; // amount * rate

        const fees = round2(d.bankFees ?? 0);
        const feesBase = round2(fees * rate);
        const realizedGainLoss = round2(destAmountBase - srcAmountBase);

        const created = await db.transaction(async (tx) => {
          const transferGroupId = randomUUID();

          let gainAccountId: string | null = null;
          let lossAccountId: string | null = null;
          if (Math.abs(realizedGainLoss) > 0.005 || feesBase > 0.005) {
            const fxAccts = await ensureFxAccounts(tx, companyId);
            gainAccountId = fxAccts.gainAccountId;
            lossAccountId = fxAccts.lossAccountId;
          }

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
              srcAmountBase,
              destAmountBase,
              feesBase,
              feesAccountId: feesBase > 0.005 ? lossAccountId : null, // re-use loss acct for fees
              gainAccountId,
              lossAccountId,
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
                currency: srcCurrency,
                exchangeRate: String(rate),
                destinationAmount: isFxTransfer || d.destinationAmount != null
                  ? String(destAmount) : null,
                bankFees: fees > 0 ? String(fees) : null,
                realizedGainLoss: Math.abs(realizedGainLoss) > 0.005
                  ? String(realizedGainLoss) : null,
                transferAccountId: dest.id,
                transferGroupId,
                description: d.description ?? null,
                notes: d.notes ?? null,
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
                amount: String(destAmount),
                currency: destCurrency,
                exchangeRate: String(destRate),
                transferAccountId: bank.id,
                transferGroupId,
                description: d.description ?? null,
                notes: d.notes ?? null,
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
      const costCenterId = d.costCenterId ?? null;
      if (costCenterId && !(await isCompanyCostCenter(costCenterId, companyId))) {
        res.status(400).json({ error: "مركز التكلفة غير صحيح" });
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
            costCenterId,
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
            costCenterId,
            description: d.description ?? null,
            notes: d.notes ?? null,
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

// Classify / edit a single (non-transfer) movement. The main use is finishing an
// imported "pending" row: the user picks the counterpart account (تبويب) and
// writes their own البيان. When the resulting movement has a counterpart, we
// (re)post its balanced journal entry and it becomes "posted"; without one it
// stays pending. Editing a posted, non-reconciled movement re-posts its entry.
// Transfers and reconciled/cleared movements cannot be edited here.
router.patch(
  "/bank/movements/:id",
  requireAuth,
  requireCapability("bank:update"),
  async (req, res) => {
    const parsed = UpdateBankMovementBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const id = req.params["id"] as string;
    const d = parsed.data;
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
      if (movement.transferGroupId || movement.type === "transfer") {
        res.status(400).json({
          error: "لا يمكن تعديل حركة تحويل من هنا، استخدم نموذج التحويل",
        });
        return;
      }
      if (movement.isCleared || movement.reconciliationId) {
        res.status(400).json({ error: "لا يمكن تعديل حركة تمت تسويتها بنكياً" });
        return;
      }
      // Block classify/edit for movements created by the payment module.
      // Detected via: the movement's JE is owned by a payment voucher.
      if (movement.journalEntryId) {
        const [paymentOwner] = await db
          .select({ id: paymentsTable.id })
          .from(paymentsTable)
          .where(
            and(
              eq(paymentsTable.companyId, companyId),
              eq(paymentsTable.journalEntryId, movement.journalEntryId),
            ),
          )
          .limit(1);
        if (paymentOwner) {
          res.status(400).json({
            error: "هذه الحركة مرتبطة بسند قبض/صرف ولا يمكن تعديلها هنا. استخدم قسم المدفوعات.",
          });
          return;
        }
      }

      // Merge incoming fields over the existing row.
      const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
      const date = d.date ?? movement.date;
      if (!DATE_RE.test(date)) {
        res.status(400).json({ error: "التاريخ مطلوب بصيغة YYYY-MM-DD" });
        return;
      }
      const wbBankUpdate =
        (await isWriteBlocked(db, companyId, movement.date)) ||
        (await isWriteBlocked(db, companyId, date));
      if (wbBankUpdate) {
        res.status(wbBankUpdate === "period_locked" ? 423 : 400).json({ error: WRITE_BLOCK_MSG[wbBankUpdate] });
        return;
      }
      const amount = round2(d.amount ?? Number(movement.amount));
      if (amount <= 0) {
        res.status(400).json({ error: "المبلغ يجب أن يكون أكبر من صفر" });
        return;
      }
      const rate = Number(d.exchangeRate ?? Number(movement.exchangeRate));
      const effRate = rate > 0 ? rate : 1;
      const currency = (
        d.currency ??
        movement.currency
      ).toUpperCase();

      // Type → direction. Default to the existing type; "transfer" is rejected.
      const type = (d.type ?? movement.type) as BankMovementType;
      if (type === "transfer") {
        res.status(400).json({ error: "نوع الحركة غير صحيح" });
        return;
      }
      const direction = MOVEMENT_DIRECTION[type];
      if (!direction) {
        res.status(400).json({ error: "نوع الحركة غير صحيح" });
        return;
      }

      // counterpartAccountId: undefined = keep, null = clear, string = set.
      const counterpartAccountId =
        d.counterpartAccountId === undefined
          ? movement.counterpartAccountId
          : d.counterpartAccountId;
      if (
        counterpartAccountId &&
        !(await isLeafAccount(counterpartAccountId, companyId))
      ) {
        res
          .status(400)
          .json({ error: "الحساب المقابل غير صحيح أو حساب رئيسي" });
        return;
      }

      // costCenterId: undefined = keep, null = clear, string = set.
      const costCenterId =
        d.costCenterId === undefined
          ? movement.costCenterId
          : d.costCenterId;
      if (
        costCenterId &&
        !(await isCompanyCostCenter(costCenterId, companyId))
      ) {
        res.status(400).json({ error: "مركز التكلفة غير صحيح" });
        return;
      }

      const description =
        d.description === undefined ? movement.description : d.description;
      const notes = d.notes === undefined ? movement.notes : d.notes;
      const reference =
        d.reference === undefined ? movement.reference : d.reference;

      const [bank] = await db
        .select()
        .from(bankAccountsTable)
        .where(
          and(
            eq(bankAccountsTable.id, movement.bankAccountId),
            eq(bankAccountsTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!bank || !(await isLeafAccount(bank.accountId, companyId))) {
        res.status(400).json({ error: "الحساب المحاسبي المرتبط غير صحيح" });
        return;
      }

      const baseCurrency = await loadBaseCurrency(companyId);
      const updated = await db.transaction(async (tx) => {
        // A counterpart is required to post. Reposting replaces the old entry.
        let journalEntryId: string | null = movement.journalEntryId;
        if (counterpartAccountId) {
          const amountBase = round2(amount * effRate);
          const entry = await createDraftJournalEntry(tx, {
            companyId,
            baseCurrency,
            date,
            reference: reference ?? `حركة بنكية`,
            notes: description ?? notes ?? null,
            createdBy: req.auth!.userId,
            status: "posted",
            lines: buildMovementLines({
              direction,
              bankChartAccountId: bank.accountId,
              counterpartAccountId,
              amountBase,
              description: description ?? null,
              costCenterId,
            }),
          });
          if (movement.journalEntryId) {
            await tx
              .delete(journalEntriesTable)
              .where(eq(journalEntriesTable.id, movement.journalEntryId));
          }
          journalEntryId = entry.id;
        } else if (movement.journalEntryId) {
          // Counterpart cleared on a previously posted movement: drop its
          // journal entry so the row goes back to pending (journalEntryId NULL).
          await tx
            .delete(journalEntriesTable)
            .where(eq(journalEntriesTable.id, movement.journalEntryId));
          journalEntryId = null;
        }
        const [row] = await tx
          .update(bankMovementsTable)
          .set({
            date,
            type,
            direction,
            amount: String(amount),
            currency,
            exchangeRate: String(effRate),
            counterpartAccountId,
            costCenterId,
            description,
            notes,
            reference,
            journalEntryId,
          })
          .where(
            and(
              eq(bankMovementsTable.id, id),
              eq(bankMovementsTable.companyId, companyId),
            ),
          )
          .returning();
        return row!;
      });
      const [serialized] = await serializeMovements([updated], companyId);
      res.json(serialized);
    } catch (err) {
      req.log.error({ err }, "Failed to update bank movement");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---------------------------------------------------------------------------
// Bulk delete movements
// ---------------------------------------------------------------------------
router.delete(
  "/bank/movements",
  requireAuth,
  requireCapability("bank:delete"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const parsed = z.object({ ids: z.array(z.string()).min(1) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "يجب تحديد حركة واحدة على الأقل" });
      return;
    }
    const { ids } = parsed.data;
    let deleted = 0;
    let skipped = 0;
    const processedGroups = new Set<string>();
    await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(bankMovementsTable)
        .where(
          and(
            eq(bankMovementsTable.companyId, companyId),
            inArray(bankMovementsTable.id, ids),
          ),
        );
      const jeIds = new Set<string>();
      for (const m of rows) {
        if (m.isCleared || m.reconciliationId) {
          skipped++;
          continue;
        }
        if (m.transferGroupId) {
          if (processedGroups.has(m.transferGroupId)) continue;
          processedGroups.add(m.transferGroupId);
          const groupRows = await tx
            .select()
            .from(bankMovementsTable)
            .where(
              and(
                eq(bankMovementsTable.companyId, companyId),
                eq(bankMovementsTable.transferGroupId, m.transferGroupId),
              ),
            );
          if (groupRows.some((r) => r.isCleared || r.reconciliationId)) {
            skipped += groupRows.filter((r) => ids.includes(r.id)).length;
            continue;
          }
          for (const r of groupRows) if (r.journalEntryId) jeIds.add(r.journalEntryId);
          await tx
            .delete(bankMovementsTable)
            .where(
              and(
                eq(bankMovementsTable.companyId, companyId),
                eq(bankMovementsTable.transferGroupId, m.transferGroupId),
              ),
            );
          deleted += groupRows.filter((r) => ids.includes(r.id)).length;
        } else {
          if (m.journalEntryId) jeIds.add(m.journalEntryId);
          await tx
            .delete(bankMovementsTable)
            .where(
              and(
                eq(bankMovementsTable.id, m.id),
                eq(bankMovementsTable.companyId, companyId),
              ),
            );
          deleted++;
        }
      }
      if (jeIds.size > 0) {
        await tx
          .delete(journalEntriesTable)
          .where(inArray(journalEntriesTable.id, [...jeIds]));
      }
    });
    await safeAudit(
      db,
      {
        companyId,
        userId: req.auth!.userId,
        action: "bulk_delete",
        entity: "bank_movement",
        entityLabel: `${deleted} حركة`,
        newValue: { deleted, skipped },
      },
      req.log,
    );
    res.json({ deleted, skipped });
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

// ---------------------------------------------------------------------------
// GET /bank/movements/:id/link-options
// Returns movement details + partyType + open invoices (if partyId provided).
// Used by the LinkPaymentModal to populate customer/supplier invoice lists.
// ---------------------------------------------------------------------------
router.get(
  "/bank/movements/:id/link-options",
  requireAuth,
  requireCapability("payments:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const movementId = req.params.id as string;

    const [movement] = await db
      .select()
      .from(bankMovementsTable)
      .where(
        and(
          eq(bankMovementsTable.id, movementId),
          eq(bankMovementsTable.companyId, companyId),
        ),
      )
      .limit(1);

    if (!movement) {
      res.status(404).json({ error: "الحركة غير موجودة" });
      return;
    }
    if (
      movement.type !== "customer_collection" &&
      movement.type !== "supplier_payment"
    ) {
      res.status(400).json({ error: "هذه الحركة لا يمكن ربطها بفاتورة" });
      return;
    }

    const partyType =
      movement.type === "customer_collection" ? "customer" : "supplier";

    // Check if already linked
    const [existingPayment] = await db
      .select({ id: paymentsTable.id, paymentNo: paymentsTable.paymentNo })
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.companyId, companyId),
          eq(paymentsTable.bankMovementId, movementId),
        ),
      )
      .limit(1);

    // Fetch open invoices when a party is selected
    const customerId = req.query["customerId"] as string | undefined;
    const supplierId = req.query["supplierId"] as string | undefined;
    let openInvoices: {
      id: string;
      invoiceNo: number;
      code: string | null;
      date: string;
      dueDate: string | null;
      total: number;
      amountPaid: number;
      balance: number;
      currency: string | null;
      status: string;
    }[] = [];

    if (partyType === "customer" && customerId) {
      const [cust] = await db
        .select({ id: customersTable.id })
        .from(customersTable)
        .where(
          and(
            eq(customersTable.id, customerId),
            eq(customersTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (cust) {
        const rows = await db
          .select({
            id: invoicesTable.id,
            invoiceNo: invoicesTable.invoiceNo,
            code: invoicesTable.code,
            date: invoicesTable.date,
            dueDate: invoicesTable.dueDate,
            total: invoicesTable.total,
            amountPaid: invoicesTable.amountPaid,
            currency: invoicesTable.currency,
            status: invoicesTable.status,
          })
          .from(invoicesTable)
          .where(
            and(
              eq(invoicesTable.companyId, companyId),
              eq(invoicesTable.customerId, customerId),
              eq(invoicesTable.kind, "sales"),
              sql`${invoicesTable.status} IN ('approved', 'partially_paid')`,
            ),
          )
          .orderBy(invoicesTable.date);
        openInvoices = rows.map((r) => ({
          id: r.id,
          invoiceNo: r.invoiceNo,
          code: r.code ?? null,
          date: r.date,
          dueDate: r.dueDate ?? null,
          total: Number(r.total),
          amountPaid: Number(r.amountPaid),
          balance: round2(Number(r.total) - Number(r.amountPaid)),
          currency: r.currency ?? null,
          status: r.status,
        }));
      }
    } else if (partyType === "supplier" && supplierId) {
      const [supp] = await db
        .select({ id: suppliersTable.id })
        .from(suppliersTable)
        .where(
          and(
            eq(suppliersTable.id, supplierId),
            eq(suppliersTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (supp) {
        const rows = await db
          .select({
            id: invoicesTable.id,
            invoiceNo: invoicesTable.invoiceNo,
            code: invoicesTable.code,
            date: invoicesTable.date,
            dueDate: invoicesTable.dueDate,
            total: invoicesTable.total,
            amountPaid: invoicesTable.amountPaid,
            currency: invoicesTable.currency,
            status: invoicesTable.status,
          })
          .from(invoicesTable)
          .where(
            and(
              eq(invoicesTable.companyId, companyId),
              eq(invoicesTable.supplierId, supplierId),
              eq(invoicesTable.kind, "purchase"),
              sql`${invoicesTable.status} IN ('approved', 'partially_paid')`,
            ),
          )
          .orderBy(invoicesTable.date);
        openInvoices = rows.map((r) => ({
          id: r.id,
          invoiceNo: r.invoiceNo,
          code: r.code ?? null,
          date: r.date,
          dueDate: r.dueDate ?? null,
          total: Number(r.total),
          amountPaid: Number(r.amountPaid),
          balance: round2(Number(r.total) - Number(r.amountPaid)),
          currency: r.currency ?? null,
          status: r.status,
        }));
      }
    }

    res.json({
      movement: {
        id: movement.id,
        type: movement.type,
        direction: movement.direction,
        date: movement.date,
        amount: Number(movement.amount),
        currency: movement.currency,
        exchangeRate: Number(movement.exchangeRate),
        description: movement.description,
        notes: movement.notes,
        status: movement.journalEntryId ? "posted" : "pending",
      },
      partyType,
      linkedPaymentId: existingPayment?.id ?? null,
      linkedPaymentNo: existingPayment?.paymentNo ?? null,
      openInvoices,
    });
  },
);

// ---------------------------------------------------------------------------
// POST /bank/movements/:id/link-payment
// Creates a receipt/payment voucher linked to an existing bank movement.
// The movement's JE is replaced by the new payment JE.
// Lock order: invoice rows (sorted) → lockCompanyEntryNo.
// ---------------------------------------------------------------------------
const LinkPaymentBody = z.object({
  customerId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
  allocations: z
    .array(
      z.object({
        invoiceId: z.string().uuid(),
        allocatedAmount: z.number().positive(),
        allocatedCurrency: z.string().optional(),
        baseCurrencyAmount: z.number().min(0).optional(),
        exchangeRate: z.number().positive().optional(),
      }),
    )
    .default([]),
});

router.post(
  "/bank/movements/:id/link-payment",
  requireAuth,
  requireCapability("payments:create"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const movementId = req.params.id as string;

    const parsed = LinkPaymentBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" });
      return;
    }
    const d = parsed.data;

    try {
      // Pre-load movement (outside tx for early rejection)
      const [movement] = await db
        .select()
        .from(bankMovementsTable)
        .where(
          and(
            eq(bankMovementsTable.id, movementId),
            eq(bankMovementsTable.companyId, companyId),
          ),
        )
        .limit(1);

      if (!movement) {
        res.status(404).json({ error: "الحركة غير موجودة" });
        return;
      }
      if (
        movement.type !== "customer_collection" &&
        movement.type !== "supplier_payment"
      ) {
        res.status(400).json({ error: "نوع الحركة لا يدعم ربط سند قبض/صرف" });
        return;
      }
      if (await isWriteBlocked(db, companyId, movement.date)) {
        res.status(400).json({ error: WRITE_BLOCK_MSG });
        return;
      }
      if (movement.reconciliationId) {
        res
          .status(400)
          .json({ error: "الحركة ضمن تسوية مكتملة ولا يمكن تعديلها" });
        return;
      }

      // Reject if already linked
      const [existing] = await db
        .select({ id: paymentsTable.id })
        .from(paymentsTable)
        .where(
          and(
            eq(paymentsTable.companyId, companyId),
            eq(paymentsTable.bankMovementId, movementId),
          ),
        )
        .limit(1);
      if (existing) {
        res
          .status(409)
          .json({ error: "هذه الحركة مرتبطة بسند قبض/صرف بالفعل" });
        return;
      }
      // Also guard for legacy movements created by the payment module before
      // bankMovementId tracking: the movement's JE is already owned by a payment.
      if (movement.journalEntryId) {
        const [jeOwner] = await db
          .select({ id: paymentsTable.id })
          .from(paymentsTable)
          .where(
            and(
              eq(paymentsTable.companyId, companyId),
              eq(paymentsTable.journalEntryId, movement.journalEntryId),
            ),
          )
          .limit(1);
        if (jeOwner) {
          res.status(409).json({ error: "هذه الحركة مرتبطة بسند قبض/صرف بالفعل" });
          return;
        }
      }

      const kind: "collection" | "payment" =
        movement.type === "customer_collection" ? "collection" : "payment";

      // Validate party
      let partyId: string;
      let partyName: string;
      let partyAccountId: string;

      if (kind === "collection") {
        if (!d.customerId) {
          res.status(400).json({ error: "يجب تحديد العميل" });
          return;
        }
        const [cust] = await db
          .select({
            id: customersTable.id,
            nameAr: customersTable.nameAr,
            accountId: customersTable.accountId,
          })
          .from(customersTable)
          .where(
            and(
              eq(customersTable.id, d.customerId),
              eq(customersTable.companyId, companyId),
            ),
          )
          .limit(1);
        if (!cust) {
          res.status(404).json({ error: "العميل غير موجود" });
          return;
        }
        partyId = cust.id;
        partyName = cust.nameAr;
        partyAccountId = cust.accountId;
      } else {
        if (!d.supplierId) {
          res.status(400).json({ error: "يجب تحديد المورد" });
          return;
        }
        const [supp] = await db
          .select({
            id: suppliersTable.id,
            nameAr: suppliersTable.nameAr,
            accountId: suppliersTable.accountId,
          })
          .from(suppliersTable)
          .where(
            and(
              eq(suppliersTable.id, d.supplierId),
              eq(suppliersTable.companyId, companyId),
            ),
          )
          .limit(1);
        if (!supp) {
          res.status(404).json({ error: "المورد غير موجود" });
          return;
        }
        partyId = supp.id;
        partyName = supp.nameAr;
        partyAccountId = supp.accountId;
      }

      // Get the bank account's chart of accounts entry
      const [bankAcct] = await db
        .select({ accountId: bankAccountsTable.accountId })
        .from(bankAccountsTable)
        .where(
          and(
            eq(bankAccountsTable.id, movement.bankAccountId),
            eq(bankAccountsTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!bankAcct) {
        res.status(404).json({ error: "لم يُعثر على الحساب البنكي" });
        return;
      }
      const cashAccountId = bankAcct.accountId;

      const [company] = await db
        .select({ baseCurrency: companiesTable.baseCurrency })
        .from(companiesTable)
        .where(eq(companiesTable.id, companyId))
        .limit(1);
      const baseCurrency = (company?.baseCurrency ?? "EGP").toUpperCase();

      const movementAmount = Number(movement.amount);
      const rate = Number(movement.exchangeRate) || 1;
      const amountBase = round2(movementAmount * rate);
      const allocs = d.allocations;

      const created = await db.transaction(async (tx) => {
        // Lock movement row (prevents concurrent link attempts)
        const [locked] = await tx
          .select({
            journalEntryId: bankMovementsTable.journalEntryId,
            isCleared: bankMovementsTable.isCleared,
          })
          .from(bankMovementsTable)
          .where(
            and(
              eq(bankMovementsTable.id, movementId),
              eq(bankMovementsTable.companyId, companyId),
            ),
          )
          .for("update")
          .limit(1);
        if (!locked) throw new Error("MOVEMENT_NOT_FOUND");
        if (locked.isCleared) throw new Error("MOVEMENT_CLEARED");

        // If movement was already classified (has a JE), delete it so the
        // payment JE becomes the single authoritative entry for this transaction.
        if (locked.journalEntryId) {
          await tx
            .update(bankMovementsTable)
            .set({ journalEntryId: null })
            .where(eq(bankMovementsTable.id, movementId));
          await tx
            .delete(journalEntriesTable)
            .where(
              and(
                eq(journalEntriesTable.id, locked.journalEntryId),
                eq(journalEntriesTable.companyId, companyId),
              ),
            );
        }

        // Lock invoice rows in sorted order before entryNo lock (lock-order contract)
        let allocatedBaseAtInvoiceRate = 0;
        let allocatedForeign = 0;
        const sortedAllocs = [...allocs].sort((a, b) =>
          a.invoiceId.localeCompare(b.invoiceId),
        );

        for (const alloc of sortedAllocs) {
          const [inv] = await tx
            .select({
              total: invoicesTable.total,
              amountPaid: invoicesTable.amountPaid,
              status: invoicesTable.status,
              exchangeRate: invoicesTable.exchangeRate,
            })
            .from(invoicesTable)
            .where(
              and(
                eq(invoicesTable.id, alloc.invoiceId),
                eq(invoicesTable.companyId, companyId),
              ),
            )
            .for("update")
            .limit(1);
          if (!inv) throw new Error("INVOICE_NOT_FOUND");
          if (inv.status === "draft" || inv.status === "cancelled")
            throw new Error("INVOICE_NOT_APPROVED");
          const total = Number(inv.total);
          const balance = round2(total - Number(inv.amountPaid));
          if (alloc.allocatedAmount > balance + LINK_MONEY_EPS)
            throw new Error("OVER_ALLOCATION");
          const newPaid = round2(Number(inv.amountPaid) + alloc.allocatedAmount);
          await tx
            .update(invoicesTable)
            .set({
              amountPaid: String(newPaid),
              status: linkInvoiceStatusFor(total, newPaid),
            })
            .where(
              and(
                eq(invoicesTable.id, alloc.invoiceId),
                eq(invoicesTable.companyId, companyId),
              ),
            );
          allocatedBaseAtInvoiceRate = round2(
            allocatedBaseAtInvoiceRate +
              alloc.allocatedAmount * Number(inv.exchangeRate),
          );
          allocatedForeign = round2(allocatedForeign + alloc.allocatedAmount);
        }

        // Allocate entryNo AFTER invoice locks (lock-order contract)
        await lockCompanyEntryNo(tx, companyId);
        const paymentNo = await nextPaymentNoInTx(tx, companyId, kind);

        // FX gain/loss
        const unallocatedForeign = round2(movementAmount - allocatedForeign);
        const partyBase = round2(
          allocatedBaseAtInvoiceRate + unallocatedForeign * rate,
        );
        const fxGain =
          kind === "collection"
            ? round2(amountBase - partyBase)
            : round2(partyBase - amountBase);

        const cashLine = {
          accountId: cashAccountId,
          description:
            kind === "collection"
              ? `تحصيل من ${partyName}`
              : `دفعة إلى ${partyName}`,
          debit: kind === "collection" ? amountBase : 0,
          credit: kind === "collection" ? 0 : amountBase,
        };
        const partyLine = {
          accountId: partyAccountId,
          description:
            kind === "collection"
              ? `تحصيل من ${partyName}`
              : `دفعة إلى ${partyName}`,
          debit: kind === "collection" ? 0 : partyBase,
          credit: kind === "collection" ? partyBase : 0,
        };
        const lines = [cashLine, partyLine];

        if (Math.abs(fxGain) > LINK_MONEY_EPS) {
          const { gainAccountId, lossAccountId } = await ensureFxAccounts(
            tx,
            companyId,
          );
          if (fxGain > 0) {
            lines.push({
              accountId: gainAccountId,
              description: "أرباح فروق العملة",
              debit: 0,
              credit: fxGain,
            });
          } else {
            lines.push({
              accountId: lossAccountId,
              description: "خسائر فروق العملة",
              debit: -fxGain,
              credit: 0,
            });
          }
        }

        const entry = await createDraftJournalEntry(tx, {
          companyId,
          baseCurrency,
          date: movement.date,
          reference: `${kind === "collection" ? "سند قبض" : "سند صرف"} #${paymentNo}`,
          notes: d.notes ?? null,
          createdBy: req.auth!.userId,
          status: "posted",
          lines,
        });

        const [payment] = await tx
          .insert(paymentsTable)
          .values({
            companyId,
            kind,
            paymentNo,
            date: movement.date,
            customerId: kind === "collection" ? partyId : null,
            supplierId: kind === "payment" ? partyId : null,
            method: "bank",
            cashAccountId,
            amount: String(movementAmount),
            currency: movement.currency,
            exchangeRate: String(rate),
            notes: d.notes ?? null,
            bankMovementId: movementId,
            journalEntryId: entry.id,
            createdBy: req.auth!.userId,
          })
          .returning();

        if (sortedAllocs.length) {
          await tx.insert(paymentAllocationsTable).values(
            sortedAllocs.map((a) => ({
              paymentId: payment!.id,
              companyId,
              invoiceId: a.invoiceId,
              amount: String(round2(a.allocatedAmount)),
              allocatedCurrency:
                a.allocatedCurrency ?? movement.currency ?? null,
              baseCurrencyAmount: String(
                round2(a.baseCurrencyAmount ?? a.allocatedAmount * rate),
              ),
              exchangeRate: String(a.exchangeRate ?? rate),
            })),
          );
        }

        // Update bank movement: attach the payment JE + set party as counterpart
        await tx
          .update(bankMovementsTable)
          .set({
            journalEntryId: entry.id,
            counterpartAccountId: partyAccountId,
          })
          .where(eq(bankMovementsTable.id, movementId));

        return payment!;
      });

      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "create",
          entity: kind === "collection" ? "receipt_voucher" : "payment_voucher",
          entityId: created.id,
          entityLabel: `${kind === "collection" ? "سند قبض" : "سند صرف"} #${created.paymentNo} (مرتبط بحركة بنكية)`,
          newValue: {
            paymentNo: created.paymentNo,
            date: created.date,
            amount: created.amount,
            bankMovementId: movementId,
          },
        },
        req.log,
      );

      res.status(201).json({
        id: created.id,
        paymentNo: created.paymentNo,
        kind: created.kind,
        amount: Number(created.amount),
        currency: created.currency,
        date: created.date,
        bankMovementId: created.bankMovementId,
      });
    } catch (err: any) {
      if (err?.message === "INVOICE_NOT_FOUND")
        return void res.status(400).json({ error: "فاتورة غير موجودة" });
      if (err?.message === "INVOICE_NOT_APPROVED")
        return void res.status(400).json({ error: "الفاتورة غير معتمدة" });
      if (err?.message === "OVER_ALLOCATION")
        return void res
          .status(400)
          .json({ error: "المبلغ المخصص يتجاوز رصيد الفاتورة" });
      if (err?.message === "MOVEMENT_CLEARED")
        return void res
          .status(400)
          .json({ error: "الحركة تم تسويتها ولا يمكن تعديلها" });
      req.log.error({ err }, "link-payment failed");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ── Transfer Match Suggestions ───────────────────────────────────────────────
// Suggests pairing a pending 'out' movement from one account with a pending
// 'in' movement from another account as an internal transfer.
// Scoring: exact-amount match + date proximity + reference/notes similarity.
router.get(
  "/bank/transfer-match-suggestions",
  requireAuth,
  requireCapability("bank:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    try {
      // Fetch all bank accounts for this company (needed for both modes)
      const allBankAccounts = await db
        .select({
          id: bankAccountsTable.id,
          name: bankAccountsTable.nameAr,
          currency: bankAccountsTable.currency,
          accountId: bankAccountsTable.accountId,
        })
        .from(bankAccountsTable)
        .where(eq(bankAccountsTable.companyId, companyId));

      const bankById = new Map(allBankAccounts.map((b) => [b.id, b]));
      // chart-account ID → bank account (for hybrid detection)
      const chartToBankMap = new Map(allBankAccounts.map((b) => [b.accountId, b]));

      // Pending = no journalEntryId, no transferGroupId, not cleared
      const pending = await db
        .select({
          id: bankMovementsTable.id,
          bankAccountId: bankMovementsTable.bankAccountId,
          date: bankMovementsTable.date,
          direction: bankMovementsTable.direction,
          amount: bankMovementsTable.amount,
          currency: bankMovementsTable.currency,
          exchangeRate: bankMovementsTable.exchangeRate,
          reference: bankMovementsTable.reference,
          notes: bankMovementsTable.notes,
          description: bankMovementsTable.description,
        })
        .from(bankMovementsTable)
        .where(
          and(
            eq(bankMovementsTable.companyId, companyId),
            isNull(bankMovementsTable.journalEntryId),
            isNull(bankMovementsTable.transferGroupId),
            sql`${bankMovementsTable.isCleared} = false`,
          ),
        )
        .orderBy(bankMovementsTable.date);

      const outs = pending.filter((m) => m.direction === "out");
      const ins = pending.filter((m) => m.direction === "in");

      type MovementSide = {
        id: string;
        bankAccountId: string;
        bankAccountName: string | null;
        date: string;
        amount: number;
        currency: string;
        reference: string | null;
        notes: string | null;
      };

      type Suggestion = {
        outMovement: MovementSide;
        inMovement: MovementSide;
        score: number;
        amountMatch: boolean;
        dateDiffDays: number;
        referenceMatch: boolean;
        hybridMatch: boolean;
      };

      const suggestions: Suggestion[] = [];
      const seen = new Set<string>();

      // ── Mode A: both pending ───────────────────────────────────────────────
      for (const out of outs) {
        for (const inn of ins) {
          if (out.bankAccountId === inn.bankAccountId) continue;
          const key = [out.id, inn.id].sort().join(":");
          if (seen.has(key)) continue;

          const outAmt = Number(out.amount);
          const inAmt = Number(inn.amount);
          const outBase = round2(outAmt * Number(out.exchangeRate));
          const inBase = round2(inAmt * Number(inn.exchangeRate));

          const amountDiff = Math.abs(outBase - inBase);
          const amountMatch = amountDiff <= Math.max(outBase, inBase) * 0.01 + 0.5;
          if (!amountMatch && amountDiff > 500) continue;

          const outDate = new Date(out.date);
          const inDate = new Date(inn.date);
          const dateDiffDays = Math.abs((outDate.getTime() - inDate.getTime()) / 86400000);
          if (dateDiffDays > 7) continue;

          const refMatch =
            !!(out.reference && inn.reference && out.reference.trim() === inn.reference.trim()) ||
            !!(out.notes && inn.notes && out.notes.trim().slice(0, 20) === inn.notes.trim().slice(0, 20));

          let score = 0;
          if (amountMatch) score += 50;
          score += Math.max(0, 30 - dateDiffDays * 5);
          if (refMatch) score += 20;
          if (out.currency === inn.currency) score += 10;

          seen.add(key);
          suggestions.push({
            outMovement: {
              id: out.id,
              bankAccountId: out.bankAccountId,
              bankAccountName: bankById.get(out.bankAccountId)?.name ?? null,
              date: out.date,
              amount: outAmt,
              currency: out.currency,
              reference: out.reference,
              notes: out.notes,
            },
            inMovement: {
              id: inn.id,
              bankAccountId: inn.bankAccountId,
              bankAccountName: bankById.get(inn.bankAccountId)?.name ?? null,
              date: inn.date,
              amount: inAmt,
              currency: inn.currency,
              reference: inn.reference,
              notes: inn.notes,
            },
            score,
            amountMatch,
            dateDiffDays: Math.round(dateDiffDays),
            referenceMatch: refMatch,
            hybridMatch: false,
          });
        }
      }

      // ── Mode B: hybrid — one classified (JE exists, counterpart = bank chart acct)
      //            + one pending from that counterpart bank ────────────────────
      const classifiedRows = await db
        .select({
          id: bankMovementsTable.id,
          bankAccountId: bankMovementsTable.bankAccountId,
          date: bankMovementsTable.date,
          direction: bankMovementsTable.direction,
          amount: bankMovementsTable.amount,
          currency: bankMovementsTable.currency,
          exchangeRate: bankMovementsTable.exchangeRate,
          reference: bankMovementsTable.reference,
          notes: bankMovementsTable.notes,
          counterpartAccountId: bankMovementsTable.counterpartAccountId,
          journalEntryId: bankMovementsTable.journalEntryId,
        })
        .from(bankMovementsTable)
        .where(
          and(
            eq(bankMovementsTable.companyId, companyId),
            isNotNull(bankMovementsTable.journalEntryId),
            isNull(bankMovementsTable.transferGroupId),
            sql`${bankMovementsTable.isCleared} = false`,
            isNotNull(bankMovementsTable.counterpartAccountId),
          ),
        );

      for (const classified of classifiedRows) {
        if (!classified.counterpartAccountId) continue;
        const counterpartBank = chartToBankMap.get(classified.counterpartAccountId);
        if (!counterpartBank) continue; // counterpart is not a bank account

        const neededDirection = classified.direction === "out" ? "in" : "out";
        const counterpartPending = pending.filter(
          (p) => p.bankAccountId === counterpartBank.id && p.direction === neededDirection,
        );

        for (const pend of counterpartPending) {
          const key = [classified.id, pend.id].sort().join(":");
          if (seen.has(key)) continue;

          const classAmt = Number(classified.amount);
          const pendAmt = Number(pend.amount);
          const classBase = round2(classAmt * Number(classified.exchangeRate));
          const pendBase = round2(pendAmt * Number(pend.exchangeRate));

          const amountDiff = Math.abs(classBase - pendBase);
          const amountMatch = amountDiff <= Math.max(classBase, pendBase) * 0.05 + 1; // 5% tolerance for FX
          if (!amountMatch && amountDiff > 500) continue;

          const classDate = new Date(classified.date);
          const pendDate = new Date(pend.date);
          const dateDiffDays = Math.abs((classDate.getTime() - pendDate.getTime()) / 86400000);
          if (dateDiffDays > 14) continue; // allow 14 days for hybrid

          const refMatch =
            !!(classified.reference && pend.reference && classified.reference.trim() === pend.reference.trim()) ||
            !!(classified.notes && pend.notes && classified.notes.trim().slice(0, 20) === pend.notes.trim().slice(0, 20));

          let score = 0;
          if (amountMatch) score += 50;
          score += Math.max(0, 30 - dateDiffDays * 4);
          if (refMatch) score += 20;
          score += 8; // bonus: classified side has higher certainty

          const outMov = classified.direction === "out" ? classified : pend;
          const inMov = classified.direction === "out" ? pend : classified;
          const outBankName = bankById.get(outMov.bankAccountId)?.name ?? null;
          const inBankName = bankById.get(inMov.bankAccountId)?.name ?? null;

          seen.add(key);
          suggestions.push({
            outMovement: {
              id: outMov.id,
              bankAccountId: outMov.bankAccountId,
              bankAccountName: outBankName,
              date: outMov.date,
              amount: Number(outMov.amount),
              currency: outMov.currency,
              reference: outMov.reference,
              notes: outMov.notes,
            },
            inMovement: {
              id: inMov.id,
              bankAccountId: inMov.bankAccountId,
              bankAccountName: inBankName,
              date: inMov.date,
              amount: Number(inMov.amount),
              currency: inMov.currency,
              reference: inMov.reference,
              notes: inMov.notes,
            },
            score,
            amountMatch,
            dateDiffDays: Math.round(dateDiffDays),
            referenceMatch: refMatch,
            hybridMatch: true,
          });
        }
      }

      suggestions.sort((a, b) => b.score - a.score);
      res.json(suggestions.slice(0, 50));
    } catch (err) {
      req.log.error({ err }, "transfer-match-suggestions failed");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ── Confirm a transfer match
// Supports two modes:
//   A) Both pending (no JE) → new transfer JE with FX if needed
//   B) Hybrid: one classified (has JE, counterpartAccountId = other bank) +
//      one pending → delete old JE, create proper transfer JE at same base
//      value (no FX differences per user requirement)
const ConfirmTransferMatchBody = z.object({
  outMovementId: z.string(),
  inMovementId: z.string(),
});

router.post(
  "/bank/transfer-match-confirm",
  requireAuth,
  requireCapability("bank:create"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const parsed = ConfirmTransferMatchBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const { outMovementId, inMovementId } = parsed.data;
    if (outMovementId === inMovementId) {
      res.status(400).json({ error: "لا يمكن ربط حركة بنفسها" });
      return;
    }

    try {
      const [outMov, inMov] = await Promise.all([
        db.select().from(bankMovementsTable)
          .where(and(eq(bankMovementsTable.id, outMovementId), eq(bankMovementsTable.companyId, companyId)))
          .limit(1).then((r) => r[0]),
        db.select().from(bankMovementsTable)
          .where(and(eq(bankMovementsTable.id, inMovementId), eq(bankMovementsTable.companyId, companyId)))
          .limit(1).then((r) => r[0]),
      ]);

      if (!outMov || !inMov) {
        res.status(404).json({ error: "الحركة غير موجودة" });
        return;
      }
      if (outMov.direction !== "out" || inMov.direction !== "in") {
        res.status(400).json({ error: "يجب أن تكون إحدى الحركتين خارجة والأخرى داخلة" });
        return;
      }
      if (outMov.bankAccountId === inMov.bankAccountId) {
        res.status(400).json({ error: "الحركتان في نفس الحساب" });
        return;
      }
      if (outMov.transferGroupId || inMov.transferGroupId) {
        res.status(409).json({ error: "إحدى الحركتين مرتبطة بتحويل بالفعل" });
        return;
      }

      // Detect hybrid mode: exactly one movement has a JE
      if (outMov.journalEntryId && inMov.journalEntryId) {
        res.status(400).json({ error: "لا يمكن ربط حركتين مُرحَّلتين — يجب أن تكون إحداهما معلقة" });
        return;
      }
      const isHybrid = !!(outMov.journalEntryId || inMov.journalEntryId);
      const classifiedMov = outMov.journalEntryId ? outMov : inMov;
      const pendingMov   = outMov.journalEntryId ? inMov  : outMov;

      if (isHybrid) {
        // Verify the classified movement's counterpartAccountId points to the pending movement's bank
        const [pendingBank] = await db
          .select({ accountId: bankAccountsTable.accountId })
          .from(bankAccountsTable)
          .where(and(eq(bankAccountsTable.id, pendingMov.bankAccountId), eq(bankAccountsTable.companyId, companyId)))
          .limit(1);
        if (!pendingBank) {
          res.status(400).json({ error: "الحساب البنكي للحركة المعلقة غير موجود" });
          return;
        }
        if (classifiedMov.counterpartAccountId !== pendingBank.accountId) {
          res.status(400).json({ error: "الحركة المُرحَّلة لا تشير إلى الحساب البنكي للحركة المعلقة — تحقق من الحساب المقابل" });
          return;
        }
      }

      const wb = await isWriteBlocked(db, companyId, outMov.date);
      if (wb) {
        res.status(wb === "period_locked" ? 423 : 400).json({ error: WRITE_BLOCK_MSG[wb] });
        return;
      }

      const [outBank, inBank] = await Promise.all([
        db.select().from(bankAccountsTable)
          .where(and(eq(bankAccountsTable.id, outMov.bankAccountId), eq(bankAccountsTable.companyId, companyId)))
          .limit(1).then((r) => r[0]),
        db.select().from(bankAccountsTable)
          .where(and(eq(bankAccountsTable.id, inMov.bankAccountId), eq(bankAccountsTable.companyId, companyId)))
          .limit(1).then((r) => r[0]),
      ]);
      if (!outBank || !inBank) {
        res.status(400).json({ error: "الحساب البنكي غير موجود" });
        return;
      }

      const baseCurrency = await loadBaseCurrency(companyId);
      // For hybrid: force same base amount on both sides → no FX gain/loss line
      const srcAmountBase  = round2(Number(outMov.amount) * Number(outMov.exchangeRate));
      const destAmountBase = isHybrid
        ? srcAmountBase // "same value, no FX differences"
        : round2(Number(inMov.amount) * Number(inMov.exchangeRate));
      const realizedGainLoss = isHybrid ? 0 : round2(destAmountBase - srcAmountBase);

      await db.transaction(async (tx) => {
        const transferGroupId = randomUUID();

        // Hybrid: delete the old single-sided JE before creating the transfer JE
        if (isHybrid && classifiedMov.journalEntryId) {
          // Safety check: only this one movement references the old JE
          const jeSharers = await tx
            .select({ id: bankMovementsTable.id })
            .from(bankMovementsTable)
            .where(
              and(
                eq(bankMovementsTable.companyId, companyId),
                eq(bankMovementsTable.journalEntryId, classifiedMov.journalEntryId),
              ),
            );
          if (jeSharers.length === 1) {
            // Safe to delete
            await tx.delete(journalEntryLinesTable).where(
              eq(journalEntryLinesTable.entryId, classifiedMov.journalEntryId),
            );
            await tx.delete(journalEntriesTable).where(
              and(
                eq(journalEntriesTable.id, classifiedMov.journalEntryId),
                eq(journalEntriesTable.companyId, companyId),
              ),
            );
          }
          // Clear the old JE reference from the classified movement so the update below works
          await tx
            .update(bankMovementsTable)
            .set({ journalEntryId: null, counterpartAccountId: null })
            .where(eq(bankMovementsTable.id, classifiedMov.id));
        }

        let gainAccountId: string | null = null;
        let lossAccountId: string | null = null;
        if (!isHybrid && Math.abs(realizedGainLoss) > 0.005) {
          const fxAccts = await ensureFxAccounts(tx, companyId);
          gainAccountId = fxAccts.gainAccountId;
          lossAccountId = fxAccts.lossAccountId;
        }

        const entry = await createDraftJournalEntry(tx, {
          companyId,
          baseCurrency,
          date: outMov.date,
          reference: isHybrid ? "تحويل بين الحسابات (ميرج)" : "تحويل بين الحسابات (مطابقة)",
          notes: outMov.notes ?? inMov.notes ?? null,
          createdBy: req.auth!.userId,
          status: "posted",
          lines: buildTransferLines({
            srcBankChartAccountId: outBank.accountId,
            destBankChartAccountId: inBank.accountId,
            srcAmountBase,
            destAmountBase,
            gainAccountId,
            lossAccountId,
            description: outMov.description ?? inMov.description ?? null,
          }),
        });

        await tx
          .update(bankMovementsTable)
          .set({
            type: "transfer",
            transferAccountId: inMov.bankAccountId,
            transferGroupId,
            journalEntryId: entry.id,
            counterpartAccountId: null,
            destinationAmount: outMov.currency !== inMov.currency ? String(Number(inMov.amount)) : null,
            realizedGainLoss: null,
          })
          .where(eq(bankMovementsTable.id, outMovementId));

        await tx
          .update(bankMovementsTable)
          .set({
            type: "transfer",
            transferAccountId: outMov.bankAccountId,
            transferGroupId,
            journalEntryId: entry.id,
            counterpartAccountId: null,
          })
          .where(eq(bankMovementsTable.id, inMovementId));
      });

      res.json({ success: true, hybrid: isHybrid });
    } catch (err) {
      req.log.error({ err }, "transfer-match-confirm failed");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /bank/movements/bulk-unpost
// Removes the journal entry from a set of classified movements so they return
// to "pending" state and can be re-classified. Skips movements that are
// cleared, transfers, or linked to a payment (must unlink/delete payment first).
// ---------------------------------------------------------------------------
router.post(
  "/bank/movements/bulk-unpost",
  requireAuth,
  requireCapability("bank:update"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const { movementIds } = req.body as { movementIds?: unknown };
    if (
      !Array.isArray(movementIds) ||
      movementIds.length === 0 ||
      movementIds.some((id) => typeof id !== "string")
    ) {
      res.status(400).json({ error: "movementIds مطلوب" });
      return;
    }
    const ids = movementIds as string[];
    try {
      let unposted = 0;
      let skipped = 0;

      for (const movId of ids) {
        const [mov] = await db
          .select({
            id: bankMovementsTable.id,
            journalEntryId: bankMovementsTable.journalEntryId,
            isCleared: bankMovementsTable.isCleared,
            type: bankMovementsTable.type,
            reconciliationId: bankMovementsTable.reconciliationId,
          })
          .from(bankMovementsTable)
          .where(
            and(
              eq(bankMovementsTable.id, movId),
              eq(bankMovementsTable.companyId, companyId),
            ),
          )
          .limit(1);

        if (!mov || !mov.journalEntryId || mov.isCleared || mov.type === "transfer" || mov.reconciliationId) {
          skipped++;
          continue;
        }

        // Check if this movement is linked to a payment
        const [linked] = await db
          .select({ id: paymentsTable.id })
          .from(paymentsTable)
          .where(
            and(
              eq(paymentsTable.companyId, companyId),
              eq(paymentsTable.bankMovementId, movId),
            ),
          )
          .limit(1);
        if (linked) {
          skipped++;
          continue;
        }

        // Check if any other movement shares this JE
        const sharers = await db
          .select({ id: bankMovementsTable.id })
          .from(bankMovementsTable)
          .where(
            and(
              eq(bankMovementsTable.companyId, companyId),
              eq(bankMovementsTable.journalEntryId, mov.journalEntryId),
            ),
          );

        await db.transaction(async (tx) => {
          // Null out movement's JE reference first
          await tx
            .update(bankMovementsTable)
            .set({ journalEntryId: null, counterpartAccountId: null })
            .where(
              and(
                eq(bankMovementsTable.id, movId),
                eq(bankMovementsTable.companyId, companyId),
              ),
            );

          // Delete the JE only if no other movement still references it
          const otherSharers = sharers.filter((s) => s.id !== movId);
          if (otherSharers.length === 0) {
            await tx
              .delete(journalEntryLinesTable)
              .where(eq(journalEntryLinesTable.entryId, mov.journalEntryId!));
            await tx
              .delete(journalEntriesTable)
              .where(
                and(
                  eq(journalEntriesTable.id, mov.journalEntryId!),
                  eq(journalEntriesTable.companyId, companyId),
                ),
              );
          }
        });

        unposted++;
      }

      res.json({ unposted, skipped });
    } catch (err) {
      req.log.error({ err }, "bulk-unpost failed");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /bank/fx-audit
// Lists all classified bank movements where currency ≠ baseCurrency AND
// exchangeRate = "1" — these have wrong debitBase/creditBase in their JEs.
// ---------------------------------------------------------------------------
router.get(
  "/bank/fx-audit",
  requireAuth,
  requireCapability("bank:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    try {
      const baseCurrency = await loadBaseCurrency(companyId);
      const affected = await db
        .select({
          id: bankMovementsTable.id,
          date: bankMovementsTable.date,
          amount: bankMovementsTable.amount,
          currency: bankMovementsTable.currency,
          exchangeRate: bankMovementsTable.exchangeRate,
          journalEntryId: bankMovementsTable.journalEntryId,
        })
        .from(bankMovementsTable)
        .where(
          and(
            eq(bankMovementsTable.companyId, companyId),
            isNotNull(bankMovementsTable.journalEntryId),
            ne(bankMovementsTable.currency, baseCurrency),
            eq(bankMovementsTable.exchangeRate, "1"),
          ),
        )
        .orderBy(desc(bankMovementsTable.date));
      res.json({ baseCurrency, count: affected.length, movements: affected });
    } catch (err) {
      req.log.error({ err }, "fx-audit failed");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /bank/fix-base-amounts
// Bulk-fixes debit/debitBase/credit/creditBase in journal_entry_lines for
// movements where currency ≠ baseCurrency AND exchangeRate = "1".
//
// Strategy per movement:
//   1. Look up exchange_rates table for exact date match (same currency).
//   2. Fall back to nearest date within ±30 days.
//   3. Fall back to forceRate body param.
//   4. If none found → skip.
//
// Correction: newDebit = round2(oldDebit * newRate)
// (debit stored = old amountBase = amount × 1 = FCY amount in wrong base)
// ---------------------------------------------------------------------------
router.post(
  "/bank/fix-base-amounts",
  requireAuth,
  requireCapability("bank:update"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const parsed = z
      .object({ forceRate: z.number().positive().optional() })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "بيانات غير صحيحة" });
      return;
    }
    const { forceRate } = parsed.data;

    try {
      const baseCurrency = await loadBaseCurrency(companyId);

      // Find all affected movements
      const affected = await db
        .select({
          id: bankMovementsTable.id,
          date: bankMovementsTable.date,
          amount: bankMovementsTable.amount,
          currency: bankMovementsTable.currency,
          journalEntryId: bankMovementsTable.journalEntryId,
        })
        .from(bankMovementsTable)
        .where(
          and(
            eq(bankMovementsTable.companyId, companyId),
            isNotNull(bankMovementsTable.journalEntryId),
            ne(bankMovementsTable.currency, baseCurrency),
            eq(bankMovementsTable.exchangeRate, "1"),
          ),
        );

      if (affected.length === 0) {
        res.json({ fixed: 0, skipped: 0, details: [] });
        return;
      }

      // Gather distinct (currency, date) pairs to bulk-lookup rates
      const uniqueCurrencies = [...new Set(affected.map((m) => m.currency))];
      const allRates = await db
        .select({
          currencyCode: exchangeRatesTable.currencyCode,
          rateDate: exchangeRatesTable.rateDate,
          rate: exchangeRatesTable.rate,
        })
        .from(exchangeRatesTable)
        .where(
          and(
            eq(exchangeRatesTable.companyId, companyId),
            inArray(exchangeRatesTable.currencyCode, uniqueCurrencies),
          ),
        )
        .orderBy(exchangeRatesTable.currencyCode, exchangeRatesTable.rateDate);

      // Build lookup: currencyCode → sorted list of { rateDate, rate }
      const ratesByCurrency = new Map<
        string,
        Array<{ rateDate: string; rate: string }>
      >();
      for (const r of allRates) {
        const list = ratesByCurrency.get(r.currencyCode) ?? [];
        list.push({ rateDate: r.rateDate, rate: r.rate });
        ratesByCurrency.set(r.currencyCode, list);
      }

      const findRate = (currency: string, date: string): number | null => {
        if (forceRate) return forceRate;
        const list = ratesByCurrency.get(currency);
        if (!list || list.length === 0) return null;
        // Find exact match first
        const exact = list.find((r) => r.rateDate === date);
        if (exact) return Number(exact.rate);
        // Nearest within ±30 days
        const target = new Date(date).getTime();
        let best: { rateDate: string; rate: string } | null = null;
        let bestDiff = Infinity;
        for (const r of list) {
          const diff = Math.abs(new Date(r.rateDate).getTime() - target);
          if (diff < bestDiff && diff <= 30 * 86400 * 1000) {
            bestDiff = diff;
            best = r;
          }
        }
        return best ? Number(best.rate) : null;
      };

      const details: Array<{
        movementId: string;
        date: string;
        currency: string;
        amount: string;
        newRate: number | null;
        status: "fixed" | "skipped";
      }> = [];

      let fixed = 0;
      let skipped = 0;

      for (const m of affected) {
        const newRate = findRate(m.currency, m.date);
        if (!newRate || newRate <= 0) {
          details.push({
            movementId: m.id,
            date: m.date,
            currency: m.currency,
            amount: m.amount,
            newRate: null,
            status: "skipped",
          });
          skipped++;
          continue;
        }

        await db.transaction(async (tx) => {
          // Update JE lines: multiply existing debit/credit by newRate
          await tx.execute(
            sql`UPDATE journal_entry_lines
                SET debit       = ROUND(debit::numeric       * ${newRate}, 2),
                    debit_base  = ROUND(debit_base::numeric  * ${newRate}, 2),
                    credit      = ROUND(credit::numeric      * ${newRate}, 2),
                    credit_base = ROUND(credit_base::numeric * ${newRate}, 2)
                WHERE entry_id = ${m.journalEntryId}
                  AND company_id = ${companyId}`,
          );
          // Update movement exchangeRate
          await tx
            .update(bankMovementsTable)
            .set({ exchangeRate: String(newRate) })
            .where(
              and(
                eq(bankMovementsTable.id, m.id),
                eq(bankMovementsTable.companyId, companyId),
              ),
            );
        });

        details.push({
          movementId: m.id,
          date: m.date,
          currency: m.currency,
          amount: m.amount,
          newRate,
          status: "fixed",
        });
        fixed++;
      }

      res.json({ fixed, skipped, details });
    } catch (err) {
      req.log.error({ err }, "fix-base-amounts failed");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
