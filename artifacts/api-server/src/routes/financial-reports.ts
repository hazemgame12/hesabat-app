import { Router } from "express";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import {
  db,
  accountsTable,
  journalEntriesTable,
  journalEntryLinesTable,
} from "@workspace/db";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import { round2 } from "../lib/inventory-posting";
import { exportWorkbook } from "../lib/excel";

const router = Router();

// Account types whose natural balance is a debit (asset/expense) vs credit
// (liability/equity/revenue). Used to sign each account's net movement.
const DEBIT_NATURE = new Set(["asset", "expense"]);

type AccountRow = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  type: string;
  isGroup: boolean;
};

// Sum posted debit/credit (base currency) per account for a company, with an
// optional date range on the entry date. Returns a Map accountId -> {debit,credit}.
async function postedTotals(
  companyId: string,
  from: string | null,
  to: string | null,
) {
  const conds = [
    eq(journalEntriesTable.companyId, companyId),
    eq(journalEntriesTable.status, "posted"),
  ];
  if (from) conds.push(gte(journalEntriesTable.date, from));
  if (to) conds.push(lte(journalEntriesTable.date, to));

  const rows = await db
    .select({
      accountId: journalEntryLinesTable.accountId,
      debit: sql<string>`sum(${journalEntryLinesTable.debitBase})`,
      credit: sql<string>`sum(${journalEntryLinesTable.creditBase})`,
    })
    .from(journalEntryLinesTable)
    .innerJoin(
      journalEntriesTable,
      eq(journalEntriesTable.id, journalEntryLinesTable.entryId),
    )
    .where(and(...conds))
    .groupBy(journalEntryLinesTable.accountId);

  const map = new Map<string, { debit: number; credit: number }>();
  for (const r of rows) {
    map.set(r.accountId, {
      debit: Number(r.debit) || 0,
      credit: Number(r.credit) || 0,
    });
  }
  return map;
}

async function loadAccounts(companyId: string): Promise<AccountRow[]> {
  return db
    .select({
      id: accountsTable.id,
      code: accountsTable.code,
      nameAr: accountsTable.nameAr,
      nameEn: accountsTable.nameEn,
      type: accountsTable.type,
      isGroup: accountsTable.isGroup,
    })
    .from(accountsTable)
    .where(eq(accountsTable.companyId, companyId))
    .orderBy(accountsTable.code);
}

// ---- Trial balance ----------------------------------------------------------
type TrialBalanceRow = {
  accountId: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  type: string;
  debit: number;
  credit: number;
};

async function computeTrialBalance(
  companyId: string,
  from: string | null,
  to: string | null,
) {
  const [accounts, totals] = await Promise.all([
    loadAccounts(companyId),
    postedTotals(companyId, from, to),
  ]);
  const byId = new Map(accounts.map((a) => [a.id, a]));

  let totalDebit = 0;
  let totalCredit = 0;
  const rows: TrialBalanceRow[] = [];
  for (const [accId, t] of totals) {
    const acc = byId.get(accId);
    if (!acc) continue;
    const net = round2(t.debit - t.credit);
    const debit = net > 0 ? net : 0;
    const credit = net < 0 ? -net : 0;
    if (debit === 0 && credit === 0) continue;
    totalDebit = round2(totalDebit + debit);
    totalCredit = round2(totalCredit + credit);
    rows.push({
      accountId: acc.id,
      code: acc.code,
      nameAr: acc.nameAr,
      nameEn: acc.nameEn,
      type: acc.type,
      debit,
      credit,
    });
  }
  rows.sort((a, b) => a.code.localeCompare(b.code));

  return {
    from: from ?? null,
    to: to ?? null,
    rows,
    totalDebit,
    totalCredit,
    balanced: Math.abs(totalDebit - totalCredit) < 0.005,
  };
}

router.get(
  "/reports/trial-balance",
  requireAuth,
  requireCapability("journal:read"),
  async (req, res) => {
    const from = (req.query["from"] as string | undefined) || null;
    const to = (req.query["to"] as string | undefined) || null;
    try {
      res.json(await computeTrialBalance(req.auth!.companyId, from, to));
    } catch (err) {
      req.log.error({ err }, "Failed to build trial balance");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.get(
  "/reports/trial-balance/export",
  requireAuth,
  requireCapability("journal:read"),
  async (req, res) => {
    const from = (req.query["from"] as string | undefined) || null;
    const to = (req.query["to"] as string | undefined) || null;
    try {
      const report = await computeTrialBalance(req.auth!.companyId, from, to);
      await exportWorkbook(res, {
        sheetName: "TrialBalance",
        fileName: "trial-balance",
        columns: [
          { header: "الكود", value: (r: TrialBalanceRow) => r.code },
          { header: "الحساب", value: (r: TrialBalanceRow) => r.nameAr, width: 32 },
          { header: "مدين", value: (r: TrialBalanceRow) => r.debit, width: 16 },
          { header: "دائن", value: (r: TrialBalanceRow) => r.credit, width: 16 },
        ],
        rows: report.rows,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to export trial balance");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Income statement (P&L) -------------------------------------------------
type PnlLine = {
  accountId: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  amount: number;
};

async function computeIncomeStatement(
  companyId: string,
  from: string | null,
  to: string | null,
) {
  const [accounts, totals] = await Promise.all([
    loadAccounts(companyId),
    postedTotals(companyId, from, to),
  ]);

  const revenue: PnlLine[] = [];
  const expenses: PnlLine[] = [];
  let totalRevenue = 0;
  let totalExpenses = 0;
  for (const acc of accounts) {
    if (acc.isGroup) continue;
    const t = totals.get(acc.id);
    if (!t) continue;
    if (acc.type === "revenue") {
      const amount = round2(t.credit - t.debit);
      if (Math.abs(amount) < 0.005) continue;
      totalRevenue = round2(totalRevenue + amount);
      revenue.push({
        accountId: acc.id,
        code: acc.code,
        nameAr: acc.nameAr,
        nameEn: acc.nameEn,
        amount,
      });
    } else if (acc.type === "expense") {
      const amount = round2(t.debit - t.credit);
      if (Math.abs(amount) < 0.005) continue;
      totalExpenses = round2(totalExpenses + amount);
      expenses.push({
        accountId: acc.id,
        code: acc.code,
        nameAr: acc.nameAr,
        nameEn: acc.nameEn,
        amount,
      });
    }
  }

  return {
    from: from ?? null,
    to: to ?? null,
    revenue,
    expenses,
    totalRevenue,
    totalExpenses,
    netProfit: round2(totalRevenue - totalExpenses),
  };
}

router.get(
  "/reports/income-statement",
  requireAuth,
  requireCapability("journal:read"),
  async (req, res) => {
    const from = (req.query["from"] as string | undefined) || null;
    const to = (req.query["to"] as string | undefined) || null;
    try {
      res.json(await computeIncomeStatement(req.auth!.companyId, from, to));
    } catch (err) {
      req.log.error({ err }, "Failed to build income statement");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.get(
  "/reports/income-statement/export",
  requireAuth,
  requireCapability("journal:read"),
  async (req, res) => {
    const from = (req.query["from"] as string | undefined) || null;
    const to = (req.query["to"] as string | undefined) || null;
    try {
      const r = await computeIncomeStatement(req.auth!.companyId, from, to);
      type ExpRow = { section: string; code: string; name: string; amount: number };
      const rows: ExpRow[] = [
        ...r.revenue.map((l) => ({
          section: "إيراد",
          code: l.code,
          name: l.nameAr,
          amount: l.amount,
        })),
        ...r.expenses.map((l) => ({
          section: "مصروف",
          code: l.code,
          name: l.nameAr,
          amount: l.amount,
        })),
      ];
      await exportWorkbook(res, {
        sheetName: "IncomeStatement",
        fileName: "income-statement",
        columns: [
          { header: "البند", value: (x: ExpRow) => x.section },
          { header: "الكود", value: (x: ExpRow) => x.code },
          { header: "الحساب", value: (x: ExpRow) => x.name, width: 32 },
          { header: "المبلغ", value: (x: ExpRow) => x.amount, width: 16 },
        ],
        rows,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to export income statement");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Balance sheet ----------------------------------------------------------
// Assets vs Liabilities + Equity. The net result of revenue/expense up to the
// as-of date is folded into equity as "current period result".
async function computeBalanceSheet(companyId: string, asOf: string | null) {
  const [accounts, totals] = await Promise.all([
    loadAccounts(companyId),
    postedTotals(companyId, null, asOf),
  ]);

  const assets: PnlLine[] = [];
  const liabilities: PnlLine[] = [];
  const equity: PnlLine[] = [];
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;
  let totalRevenue = 0;
  let totalExpenses = 0;

  for (const acc of accounts) {
    if (acc.isGroup) continue;
    const t = totals.get(acc.id);
    if (!t) continue;
    if (acc.type === "revenue") {
      totalRevenue = round2(totalRevenue + (t.credit - t.debit));
      continue;
    }
    if (acc.type === "expense") {
      totalExpenses = round2(totalExpenses + (t.debit - t.credit));
      continue;
    }
    const natural = DEBIT_NATURE.has(acc.type)
      ? t.debit - t.credit
      : t.credit - t.debit;
    const amount = round2(natural);
    if (Math.abs(amount) < 0.005) continue;
    const line: PnlLine = {
      accountId: acc.id,
      code: acc.code,
      nameAr: acc.nameAr,
      nameEn: acc.nameEn,
      amount,
    };
    if (acc.type === "asset") {
      assets.push(line);
      totalAssets = round2(totalAssets + amount);
    } else if (acc.type === "liability") {
      liabilities.push(line);
      totalLiabilities = round2(totalLiabilities + amount);
    } else if (acc.type === "equity") {
      equity.push(line);
      totalEquity = round2(totalEquity + amount);
    }
  }

  const netResult = round2(totalRevenue - totalExpenses);
  const totalEquityWithResult = round2(totalEquity + netResult);

  return {
    asOf: asOf ?? null,
    assets,
    liabilities,
    equity,
    netResult,
    totalAssets,
    totalLiabilities,
    totalEquity: totalEquityWithResult,
    totalLiabilitiesAndEquity: round2(totalLiabilities + totalEquityWithResult),
    balanced:
      Math.abs(totalAssets - (totalLiabilities + totalEquityWithResult)) <
      0.005,
  };
}

router.get(
  "/reports/balance-sheet",
  requireAuth,
  requireCapability("journal:read"),
  async (req, res) => {
    const asOf = (req.query["asOf"] as string | undefined) || null;
    try {
      res.json(await computeBalanceSheet(req.auth!.companyId, asOf));
    } catch (err) {
      req.log.error({ err }, "Failed to build balance sheet");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.get(
  "/reports/balance-sheet/export",
  requireAuth,
  requireCapability("journal:read"),
  async (req, res) => {
    const asOf = (req.query["asOf"] as string | undefined) || null;
    try {
      const r = await computeBalanceSheet(req.auth!.companyId, asOf);
      type ExpRow = { section: string; code: string; name: string; amount: number };
      const rows: ExpRow[] = [
        ...r.assets.map((l) => ({
          section: "أصل",
          code: l.code,
          name: l.nameAr,
          amount: l.amount,
        })),
        ...r.liabilities.map((l) => ({
          section: "خصم",
          code: l.code,
          name: l.nameAr,
          amount: l.amount,
        })),
        ...r.equity.map((l) => ({
          section: "حقوق ملكية",
          code: l.code,
          name: l.nameAr,
          amount: l.amount,
        })),
        {
          section: "حقوق ملكية",
          code: "",
          name: "نتيجة الفترة (ربح/خسارة)",
          amount: r.netResult,
        },
      ];
      await exportWorkbook(res, {
        sheetName: "BalanceSheet",
        fileName: "balance-sheet",
        columns: [
          { header: "البند", value: (x: ExpRow) => x.section, width: 16 },
          { header: "الكود", value: (x: ExpRow) => x.code },
          { header: "الحساب", value: (x: ExpRow) => x.name, width: 32 },
          { header: "المبلغ", value: (x: ExpRow) => x.amount, width: 16 },
        ],
        rows,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to export balance sheet");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- General ledger (one account, running balance) --------------------------
type LedgerEntry = {
  date: string;
  entryNo: number;
  ref: string | null;
  description: string;
  debit: number;
  credit: number;
  balance: number;
};

async function computeGeneralLedger(
  companyId: string,
  accountId: string,
  from: string | null,
  to: string | null,
) {
  const [acc] = await db
    .select({
      id: accountsTable.id,
      code: accountsTable.code,
      nameAr: accountsTable.nameAr,
      nameEn: accountsTable.nameEn,
      type: accountsTable.type,
    })
    .from(accountsTable)
    .where(
      and(
        eq(accountsTable.id, accountId),
        eq(accountsTable.companyId, companyId),
      ),
    )
    .limit(1);
  if (!acc) return null;

  const lines = await db
    .select({
      date: journalEntriesTable.date,
      entryNo: journalEntriesTable.entryNo,
      ref: journalEntriesTable.reference,
      description: journalEntryLinesTable.description,
      debit: journalEntryLinesTable.debitBase,
      credit: journalEntryLinesTable.creditBase,
    })
    .from(journalEntryLinesTable)
    .innerJoin(
      journalEntriesTable,
      eq(journalEntriesTable.id, journalEntryLinesTable.entryId),
    )
    .where(
      and(
        eq(journalEntriesTable.companyId, companyId),
        eq(journalEntriesTable.status, "posted"),
        eq(journalEntryLinesTable.accountId, accountId),
      ),
    )
    .orderBy(journalEntriesTable.date, journalEntriesTable.entryNo);

  const debitNature = DEBIT_NATURE.has(acc.type);
  const movement = (debit: number, credit: number) =>
    debitNature ? debit - credit : credit - debit;

  let opening = 0;
  let running = 0;
  const entries: LedgerEntry[] = [];
  for (const l of lines) {
    const debit = Number(l.debit);
    const credit = Number(l.credit);
    if (from && l.date < from) {
      opening = round2(opening + movement(debit, credit));
      continue;
    }
    if (to && l.date > to) continue;
    running =
      (entries.length === 0 ? opening : running) + movement(debit, credit);
    running = round2(running);
    entries.push({
      date: l.date,
      entryNo: l.entryNo,
      ref: l.ref ?? null,
      description: l.description ?? "",
      debit,
      credit,
      balance: running,
    });
  }
  const closing =
    entries.length === 0 ? opening : entries[entries.length - 1]!.balance;

  return {
    accountId: acc.id,
    accountCode: acc.code,
    accountName: acc.nameAr,
    accountType: acc.type,
    from: from ?? null,
    to: to ?? null,
    openingBalance: round2(opening),
    closingBalance: round2(closing),
    entries,
  };
}

router.get(
  "/reports/general-ledger",
  requireAuth,
  requireCapability("journal:read"),
  async (req, res) => {
    const accountId = req.query["accountId"];
    const from = (req.query["from"] as string | undefined) || null;
    const to = (req.query["to"] as string | undefined) || null;
    if (typeof accountId !== "string" || !accountId) {
      res.status(400).json({ error: "الحساب مطلوب" });
      return;
    }
    try {
      const report = await computeGeneralLedger(
        req.auth!.companyId,
        accountId,
        from,
        to,
      );
      if (!report) {
        res.status(404).json({ error: "الحساب غير موجود" });
        return;
      }
      res.json(report);
    } catch (err) {
      req.log.error({ err }, "Failed to build general ledger");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.get(
  "/reports/general-ledger/export",
  requireAuth,
  requireCapability("journal:read"),
  async (req, res) => {
    const accountId = req.query["accountId"];
    const from = (req.query["from"] as string | undefined) || null;
    const to = (req.query["to"] as string | undefined) || null;
    if (typeof accountId !== "string" || !accountId) {
      res.status(400).json({ error: "الحساب مطلوب" });
      return;
    }
    try {
      const report = await computeGeneralLedger(
        req.auth!.companyId,
        accountId,
        from,
        to,
      );
      if (!report) {
        res.status(404).json({ error: "الحساب غير موجود" });
        return;
      }
      await exportWorkbook(res, {
        sheetName: "GeneralLedger",
        fileName: `general-ledger-${report.accountCode}`,
        columns: [
          { header: "التاريخ", value: (e: LedgerEntry) => e.date },
          { header: "رقم القيد", value: (e: LedgerEntry) => e.entryNo },
          { header: "المرجع", value: (e: LedgerEntry) => e.ref ?? "" },
          { header: "البيان", value: (e: LedgerEntry) => e.description, width: 32 },
          { header: "مدين", value: (e: LedgerEntry) => e.debit, width: 16 },
          { header: "دائن", value: (e: LedgerEntry) => e.credit, width: 16 },
          { header: "الرصيد", value: (e: LedgerEntry) => e.balance, width: 16 },
        ],
        rows: report.entries,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to export general ledger");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
