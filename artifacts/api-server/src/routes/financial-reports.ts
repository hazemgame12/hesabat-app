import { Router } from "express";
import { and, eq, gte, lt, lte, sql } from "drizzle-orm";
import {
  db,
  accountsTable,
  companiesTable,
  costCentersTable,
  projectsTable,
  branchesTable,
  journalEntriesTable,
  journalEntryLinesTable,
} from "@workspace/db";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import { round2 } from "../lib/inventory-posting";
import { exportWorkbook } from "../lib/excel";
import { getRateForDate } from "../lib/currency";

const router = Router();

// ---- Report-currency conversion (display only) ------------------------------
// Financial reports are computed in the company base currency. When a caller
// asks for a different "report currency", we divide each base-currency figure by
// that currency's exchange rate (value of 1 unit in base) as of the report's end
// date. This is a pure presentation conversion — nothing is re-posted.
type CurrencyInfo = {
  baseCurrency: string;
  reportCurrency: string;
  rate: number;
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// Reads the company base currency (defaults to EGP), scoped to the tenant.
async function loadBaseCurrency(companyId: string): Promise<string> {
  const [company] = await db
    .select({ baseCurrency: companiesTable.baseCurrency })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);
  return (company?.baseCurrency || "EGP").toUpperCase();
}

// Builds the merged title rows prepended to every Excel export.
// Format:  [company name, sub-info line (if any), report+period line]
async function buildExcelTitleRows(
  companyId: string,
  reportLabel: string,
  periodLabel: string,
): Promise<string[]> {
  const [co] = await db
    .select({
      name: companiesTable.name,
      tradeName: companiesTable.tradeName,
      taxRegistrationNumber: companiesTable.taxRegistrationNumber,
    })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);

  const rows: string[] = [];

  rows.push(co?.name ?? "");

  const sub: string[] = [];
  if (co?.tradeName) sub.push(co.tradeName);
  if (co?.taxRegistrationNumber) sub.push(`س.ت/ض: ${co.taxRegistrationNumber}`);
  if (sub.length) rows.push(sub.join("  ·  "));

  rows.push(`${reportLabel}  —  ${periodLabel}`);

  return rows;
}

type ResolveCurrencyResult =
  | { ok: true; info: CurrencyInfo }
  | { ok: false };

// Resolves the conversion context for a report. When no currency is requested or
// it equals the base currency, returns rate=1 (no conversion). Otherwise looks up
// the rate as of `asOfDate` (falling back to today) and fails when none exists.
async function resolveReportCurrency(
  companyId: string,
  requested: string | null,
  asOfDate: string | null,
): Promise<ResolveCurrencyResult> {
  const baseCurrency = await loadBaseCurrency(companyId);
  if (!requested || requested.toUpperCase() === baseCurrency) {
    return {
      ok: true,
      info: { baseCurrency, reportCurrency: baseCurrency, rate: 1 },
    };
  }
  const rate = await getRateForDate(
    db,
    companyId,
    requested,
    asOfDate || todayStr(),
    baseCurrency,
  );
  if (rate === null || !(rate > 0)) return { ok: false };
  return { ok: true, info: { baseCurrency, reportCurrency: requested, rate } };
}

const NO_RATE_ERROR = "لا يوجد سعر صرف لهذه العملة في هذا التاريخ";

export type ReportDimensionFilters = {
  costCenterId?: string | null;
  projectId?: string | null;
  branchId?: string | null;
  breakdownBy?: "costCenter" | "project" | "branch" | null;
};

export function readReportDimensionFilters(
  query: Record<string, unknown>,
): ReportDimensionFilters {
  const read = (key: "costCenterId" | "projectId" | "branchId") => {
    const value = query[key];
    return typeof value === "string" && value ? value : null;
  };
  const rawBreakdown = query["breakdownBy"];
  const breakdownBy =
    rawBreakdown === "costCenter" ||
    rawBreakdown === "project" ||
    rawBreakdown === "branch"
      ? rawBreakdown
      : null;
  return {
    costCenterId: read("costCenterId"),
    projectId: read("projectId"),
    branchId: read("branchId"),
    breakdownBy,
  };
}

// Validate optional from/to query dates: each must be YYYY-MM-DD (a real date)
// and from must not be after to. Returns an error string, or null when valid.
export function validateDateRange(
  from: string | null,
  to: string | null,
): string | null {
  const isValid = (d: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
  if (from && !isValid(from)) return "تاريخ البداية غير صحيح";
  if (to && !isValid(to)) return "تاريخ النهاية غير صحيح";
  if (from && to && from > to)
    return "تاريخ البداية يجب أن يكون قبل تاريخ النهاية";
  return null;
}

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
  dimensions?: ReportDimensionFilters,
) {
  const conds = [
    eq(journalEntriesTable.companyId, companyId),
    eq(journalEntriesTable.status, "posted"),
  ];
  if (from) conds.push(gte(journalEntriesTable.date, from));
  if (to) conds.push(lte(journalEntriesTable.date, to));
  if (dimensions?.costCenterId)
    conds.push(eq(journalEntryLinesTable.costCenterId, dimensions.costCenterId));
  if (dimensions?.projectId)
    conds.push(eq(journalEntryLinesTable.projectId, dimensions.projectId));
  if (dimensions?.branchId)
    conds.push(eq(journalEntryLinesTable.branchId, dimensions.branchId));

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

// Sum posted debit/credit (base currency) per account STRICTLY BEFORE a date.
// Used for the opening balance column of the trial balance.
async function postedTotalsBefore(
  companyId: string,
  before: string,
  dimensions?: ReportDimensionFilters,
) {
  const conds = [
    eq(journalEntriesTable.companyId, companyId),
    eq(journalEntriesTable.status, "posted"),
    lt(journalEntriesTable.date, before),
  ];
  if (dimensions?.costCenterId)
    conds.push(eq(journalEntryLinesTable.costCenterId, dimensions.costCenterId));
  if (dimensions?.projectId)
    conds.push(eq(journalEntryLinesTable.projectId, dimensions.projectId));
  if (dimensions?.branchId)
    conds.push(eq(journalEntryLinesTable.branchId, dimensions.branchId));

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

// ---- Dimension lookup helpers ----------------------------------------------

type DimensionOption = { id: string; nameAr: string; nameEn: string | null };

async function loadDimensionOptions(
  companyId: string,
  breakdownBy: "costCenter" | "project" | "branch",
): Promise<DimensionOption[]> {
  if (breakdownBy === "costCenter") {
    return db
      .select({ id: costCentersTable.id, nameAr: costCentersTable.nameAr, nameEn: costCentersTable.nameEn })
      .from(costCentersTable)
      .where(eq(costCentersTable.companyId, companyId));
  }
  if (breakdownBy === "project") {
    return db
      .select({ id: projectsTable.id, nameAr: projectsTable.nameAr, nameEn: projectsTable.nameEn })
      .from(projectsTable)
      .where(eq(projectsTable.companyId, companyId));
  }
  return db
    .select({ id: branchesTable.id, nameAr: branchesTable.nameAr, nameEn: branchesTable.nameEn })
    .from(branchesTable)
    .where(eq(branchesTable.companyId, companyId));
}

// Returns Map<dimensionId|null, Map<accountId, {debit,credit}>>
// One query grouping by (accountId, dimensionCol) for a date range.
async function postedTotalsGrouped(
  companyId: string,
  from: string | null,
  to: string | null,
  breakdownBy: "costCenter" | "project" | "branch",
) {
  const dimCol =
    breakdownBy === "costCenter"
      ? journalEntryLinesTable.costCenterId
      : breakdownBy === "project"
        ? journalEntryLinesTable.projectId
        : journalEntryLinesTable.branchId;

  const conds = [
    eq(journalEntriesTable.companyId, companyId),
    eq(journalEntriesTable.status, "posted"),
  ];
  if (from) conds.push(gte(journalEntriesTable.date, from));
  if (to) conds.push(lte(journalEntriesTable.date, to));

  const rows = await db
    .select({
      accountId: journalEntryLinesTable.accountId,
      dimensionId: dimCol,
      debit: sql<string>`sum(${journalEntryLinesTable.debitBase})`,
      credit: sql<string>`sum(${journalEntryLinesTable.creditBase})`,
    })
    .from(journalEntryLinesTable)
    .innerJoin(
      journalEntriesTable,
      eq(journalEntriesTable.id, journalEntryLinesTable.entryId),
    )
    .where(and(...conds))
    .groupBy(journalEntryLinesTable.accountId, dimCol);

  const result = new Map<string | null, Map<string, { debit: number; credit: number }>>();
  for (const r of rows) {
    const key = r.dimensionId ?? null;
    if (!result.has(key)) result.set(key, new Map());
    result.get(key)!.set(r.accountId, {
      debit: Number(r.debit) || 0,
      credit: Number(r.credit) || 0,
    });
  }
  return result;
}

// Same but strictly before a date (for opening balances in breakdown).
async function postedTotalsBeforeGrouped(
  companyId: string,
  before: string,
  breakdownBy: "costCenter" | "project" | "branch",
) {
  const dimCol =
    breakdownBy === "costCenter"
      ? journalEntryLinesTable.costCenterId
      : breakdownBy === "project"
        ? journalEntryLinesTable.projectId
        : journalEntryLinesTable.branchId;

  const conds = [
    eq(journalEntriesTable.companyId, companyId),
    eq(journalEntriesTable.status, "posted"),
    lt(journalEntriesTable.date, before),
  ];

  const rows = await db
    .select({
      accountId: journalEntryLinesTable.accountId,
      dimensionId: dimCol,
      debit: sql<string>`sum(${journalEntryLinesTable.debitBase})`,
      credit: sql<string>`sum(${journalEntryLinesTable.creditBase})`,
    })
    .from(journalEntryLinesTable)
    .innerJoin(
      journalEntriesTable,
      eq(journalEntriesTable.id, journalEntryLinesTable.entryId),
    )
    .where(and(...conds))
    .groupBy(journalEntryLinesTable.accountId, dimCol);

  const result = new Map<string | null, Map<string, { debit: number; credit: number }>>();
  for (const r of rows) {
    const key = r.dimensionId ?? null;
    if (!result.has(key)) result.set(key, new Map());
    result.get(key)!.set(r.accountId, {
      debit: Number(r.debit) || 0,
      credit: Number(r.credit) || 0,
    });
  }
  return result;
}

// ---- Trial balance (6 columns) ---------------------------------------------
// Opening (افتتاحي) and Closing (ختامي) are net balances placed on their natural
// side; Period (الحركة) shows the gross debit/credit movement within [from, to].
// Closing = Opening + Period movement.
type TrialBalanceRow = {
  accountId: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  type: string;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
};

async function computeTrialBalance(
  companyId: string,
  from: string | null,
  to: string | null,
  dimensions?: ReportDimensionFilters,
) {
  const [accounts, opening, period] = await Promise.all([
    loadAccounts(companyId),
    from
      ? postedTotalsBefore(companyId, from, dimensions)
      : Promise.resolve(new Map<string, { debit: number; credit: number }>()),
    postedTotals(companyId, from, to, dimensions),
  ]);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const accIds = new Set<string>([...opening.keys(), ...period.keys()]);

  let totalOpeningDebit = 0;
  let totalOpeningCredit = 0;
  let totalPeriodDebit = 0;
  let totalPeriodCredit = 0;
  let totalClosingDebit = 0;
  let totalClosingCredit = 0;
  const rows: TrialBalanceRow[] = [];
  for (const accId of accIds) {
    const acc = byId.get(accId);
    if (!acc) continue;
    const op = opening.get(accId) ?? { debit: 0, credit: 0 };
    const pe = period.get(accId) ?? { debit: 0, credit: 0 };

    const openingNet = round2(op.debit - op.credit);
    const openingDebit = openingNet > 0 ? openingNet : 0;
    const openingCredit = openingNet < 0 ? -openingNet : 0;

    const periodDebit = round2(pe.debit);
    const periodCredit = round2(pe.credit);

    const closingNet = round2(openingNet + (pe.debit - pe.credit));
    const closingDebit = closingNet > 0 ? closingNet : 0;
    const closingCredit = closingNet < 0 ? -closingNet : 0;

    if (
      openingDebit === 0 &&
      openingCredit === 0 &&
      periodDebit === 0 &&
      periodCredit === 0 &&
      closingDebit === 0 &&
      closingCredit === 0
    )
      continue;

    totalOpeningDebit = round2(totalOpeningDebit + openingDebit);
    totalOpeningCredit = round2(totalOpeningCredit + openingCredit);
    totalPeriodDebit = round2(totalPeriodDebit + periodDebit);
    totalPeriodCredit = round2(totalPeriodCredit + periodCredit);
    totalClosingDebit = round2(totalClosingDebit + closingDebit);
    totalClosingCredit = round2(totalClosingCredit + closingCredit);

    rows.push({
      accountId: acc.id,
      code: acc.code,
      nameAr: acc.nameAr,
      nameEn: acc.nameEn,
      type: acc.type,
      openingDebit,
      openingCredit,
      periodDebit,
      periodCredit,
      closingDebit,
      closingCredit,
    });
  }
  rows.sort((a, b) => a.code.localeCompare(b.code));

  return {
    from: from ?? null,
    to: to ?? null,
    rows,
    totalOpeningDebit,
    totalOpeningCredit,
    totalPeriodDebit,
    totalPeriodCredit,
    totalClosingDebit,
    totalClosingCredit,
    balanced:
      Math.abs(totalOpeningDebit - totalOpeningCredit) < 0.005 &&
      Math.abs(totalPeriodDebit - totalPeriodCredit) < 0.005 &&
      Math.abs(totalClosingDebit - totalClosingCredit) < 0.005,
  };
}

type TrialBalanceResult = Awaited<ReturnType<typeof computeTrialBalance>>;

// Converts every base-currency figure of the trial balance into the report
// currency: per-row opening/period/closing debit & credit and their six totals.
// Codes, names, types, dates and the `balanced` flag are left untouched.
function convertTrialBalance(
  report: TrialBalanceResult,
  rate: number,
): TrialBalanceResult {
  const c = (n: number) => round2(n / rate);
  return {
    ...report,
    rows: report.rows.map((row) => ({
      ...row,
      openingDebit: c(row.openingDebit),
      openingCredit: c(row.openingCredit),
      periodDebit: c(row.periodDebit),
      periodCredit: c(row.periodCredit),
      closingDebit: c(row.closingDebit),
      closingCredit: c(row.closingCredit),
    })),
    totalOpeningDebit: c(report.totalOpeningDebit),
    totalOpeningCredit: c(report.totalOpeningCredit),
    totalPeriodDebit: c(report.totalPeriodDebit),
    totalPeriodCredit: c(report.totalPeriodCredit),
    totalClosingDebit: c(report.totalClosingDebit),
    totalClosingCredit: c(report.totalClosingCredit),
  };
}

// Builds trial balance group totals from pre-queried opening and period maps.
function buildTrialBalanceGroupRows(
  accounts: AccountRow[],
  opening: Map<string, { debit: number; credit: number }>,
  period: Map<string, { debit: number; credit: number }>,
) {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const accIds = new Set<string>([...opening.keys(), ...period.keys()]);
  let totalOpeningDebit = 0;
  let totalOpeningCredit = 0;
  let totalPeriodDebit = 0;
  let totalPeriodCredit = 0;
  let totalClosingDebit = 0;
  let totalClosingCredit = 0;
  const rows: TrialBalanceRow[] = [];
  for (const accId of accIds) {
    const acc = byId.get(accId);
    if (!acc) continue;
    const op = opening.get(accId) ?? { debit: 0, credit: 0 };
    const pe = period.get(accId) ?? { debit: 0, credit: 0 };
    const openingNet = round2(op.debit - op.credit);
    const openingDebit = openingNet > 0 ? openingNet : 0;
    const openingCredit = openingNet < 0 ? -openingNet : 0;
    const periodDebit = round2(pe.debit);
    const periodCredit = round2(pe.credit);
    const closingNet = round2(openingNet + (pe.debit - pe.credit));
    const closingDebit = closingNet > 0 ? closingNet : 0;
    const closingCredit = closingNet < 0 ? -closingNet : 0;
    if (
      openingDebit === 0 &&
      openingCredit === 0 &&
      periodDebit === 0 &&
      periodCredit === 0 &&
      closingDebit === 0 &&
      closingCredit === 0
    )
      continue;
    totalOpeningDebit = round2(totalOpeningDebit + openingDebit);
    totalOpeningCredit = round2(totalOpeningCredit + openingCredit);
    totalPeriodDebit = round2(totalPeriodDebit + periodDebit);
    totalPeriodCredit = round2(totalPeriodCredit + periodCredit);
    totalClosingDebit = round2(totalClosingDebit + closingDebit);
    totalClosingCredit = round2(totalClosingCredit + closingCredit);
    rows.push({
      accountId: acc.id,
      code: acc.code,
      nameAr: acc.nameAr,
      nameEn: acc.nameEn,
      type: acc.type,
      openingDebit,
      openingCredit,
      periodDebit,
      periodCredit,
      closingDebit,
      closingCredit,
    });
  }
  rows.sort((a, b) => a.code.localeCompare(b.code));
  return {
    rows,
    totalOpeningDebit,
    totalOpeningCredit,
    totalPeriodDebit,
    totalPeriodCredit,
    totalClosingDebit,
    totalClosingCredit,
  };
}

type TrialBalanceBreakdownGroup = {
  dimensionId: string | null;
  dimensionName: string;
  rows: TrialBalanceRow[];
  totalOpeningDebit: number;
  totalOpeningCredit: number;
  totalPeriodDebit: number;
  totalPeriodCredit: number;
  totalClosingDebit: number;
  totalClosingCredit: number;
};

async function computeTrialBalanceBreakdown(
  companyId: string,
  from: string | null,
  to: string | null,
  breakdownBy: "costCenter" | "project" | "branch",
): Promise<TrialBalanceBreakdownGroup[]> {
  const [accounts, dimensionOptions, openingGrouped, periodGrouped] =
    await Promise.all([
      loadAccounts(companyId),
      loadDimensionOptions(companyId, breakdownBy),
      from
        ? postedTotalsBeforeGrouped(companyId, from, breakdownBy)
        : Promise.resolve(
            new Map<string | null, Map<string, { debit: number; credit: number }>>(),
          ),
      postedTotalsGrouped(companyId, from, to, breakdownBy),
    ]);

  const dimById = new Map(dimensionOptions.map((d) => [d.id, d]));

  // Collect all dimension keys that have data (including null = unassigned).
  const allKeys = new Set<string | null>([
    ...openingGrouped.keys(),
    ...periodGrouped.keys(),
  ]);

  const groups: TrialBalanceBreakdownGroup[] = [];
  for (const key of allKeys) {
    const opening = openingGrouped.get(key) ?? new Map();
    const period = periodGrouped.get(key) ?? new Map();
    const groupData = buildTrialBalanceGroupRows(accounts, opening, period);
    if (
      groupData.rows.length === 0 &&
      groupData.totalOpeningDebit === 0 &&
      groupData.totalPeriodDebit === 0
    )
      continue;
    const dim = key ? dimById.get(key) : null;
    groups.push({
      dimensionId: key,
      dimensionName: dim ? dim.nameAr : "غير محدد",
      ...groupData,
    });
  }

  // Sort: named groups first (by nameAr), then unassigned last.
  groups.sort((a, b) => {
    if (a.dimensionId === null) return 1;
    if (b.dimensionId === null) return -1;
    return a.dimensionName.localeCompare(b.dimensionName);
  });

  return groups;
}

function convertTrialBalanceBreakdownGroup(
  group: TrialBalanceBreakdownGroup,
  rate: number,
): TrialBalanceBreakdownGroup {
  const c = (n: number) => round2(n / rate);
  return {
    ...group,
    rows: group.rows.map((row) => ({
      ...row,
      openingDebit: c(row.openingDebit),
      openingCredit: c(row.openingCredit),
      periodDebit: c(row.periodDebit),
      periodCredit: c(row.periodCredit),
      closingDebit: c(row.closingDebit),
      closingCredit: c(row.closingCredit),
    })),
    totalOpeningDebit: c(group.totalOpeningDebit),
    totalOpeningCredit: c(group.totalOpeningCredit),
    totalPeriodDebit: c(group.totalPeriodDebit),
    totalPeriodCredit: c(group.totalPeriodCredit),
    totalClosingDebit: c(group.totalClosingDebit),
    totalClosingCredit: c(group.totalClosingCredit),
  };
}

router.get(
  "/reports/trial-balance",
  requireAuth,
  requireCapability("journal:read"),
  async (req, res) => {
    const from = (req.query["from"] as string | undefined) || null;
    const to = (req.query["to"] as string | undefined) || null;
    const reportCurrency =
      (req.query["reportCurrency"] as string | undefined) || null;
    const dimensions = readReportDimensionFilters(req.query);
    const dateErr = validateDateRange(from, to);
    if (dateErr) {
      res.status(400).json({ error: dateErr });
      return;
    }
    try {
      const companyId = req.auth!.companyId;
      // End of the report's period drives the rate lookup.
      const ccy = await resolveReportCurrency(companyId, reportCurrency, to);
      if (!ccy.ok) {
        res.status(400).json({ error: NO_RATE_ERROR });
        return;
      }
      let report = await computeTrialBalance(companyId, from, to, dimensions);
      if (ccy.info.rate !== 1) report = convertTrialBalance(report, ccy.info.rate);

      let breakdownGroups: TrialBalanceBreakdownGroup[] | undefined;
      if (dimensions.breakdownBy) {
        let groups = await computeTrialBalanceBreakdown(
          companyId,
          from,
          to,
          dimensions.breakdownBy,
        );
        if (ccy.info.rate !== 1) {
          groups = groups.map((g) =>
            convertTrialBalanceBreakdownGroup(g, ccy.info.rate),
          );
        }
        breakdownGroups = groups;
      }

      res.json({ ...report, breakdownGroups, currencyInfo: ccy.info });
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
    const dateErr = validateDateRange(from, to);
    if (dateErr) {
      res.status(400).json({ error: dateErr });
      return;
    }
    try {
      const dimensions = readReportDimensionFilters(req.query);
      const [report, titleRows] = await Promise.all([
        computeTrialBalance(req.auth!.companyId, from, to, dimensions),
        buildExcelTitleRows(
          req.auth!.companyId,
          "ميزان المراجعة",
          `${from ?? "البداية"} → ${to ?? todayStr()}`,
        ),
      ]);
      await exportWorkbook(res, {
        sheetName: "TrialBalance",
        fileName: "trial-balance",
        titleRows,
        columns: [
          { header: "الكود", value: (r: TrialBalanceRow) => r.code },
          { header: "الحساب", value: (r: TrialBalanceRow) => r.nameAr, width: 32 },
          {
            header: "افتتاحي مدين",
            value: (r: TrialBalanceRow) => r.openingDebit,
            width: 16,
          },
          {
            header: "افتتاحي دائن",
            value: (r: TrialBalanceRow) => r.openingCredit,
            width: 16,
          },
          {
            header: "حركة مدين",
            value: (r: TrialBalanceRow) => r.periodDebit,
            width: 16,
          },
          {
            header: "حركة دائن",
            value: (r: TrialBalanceRow) => r.periodCredit,
            width: 16,
          },
          {
            header: "ختامي مدين",
            value: (r: TrialBalanceRow) => r.closingDebit,
            width: 16,
          },
          {
            header: "ختامي دائن",
            value: (r: TrialBalanceRow) => r.closingCredit,
            width: 16,
          },
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
  dimensions?: ReportDimensionFilters,
) {
  const [accounts, totals] = await Promise.all([
    loadAccounts(companyId),
    postedTotals(companyId, from, to, dimensions),
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

type IncomeStatementResult = Awaited<ReturnType<typeof computeIncomeStatement>>;

// Converts the income statement's base-currency figures: each revenue/expense
// line amount and the totalRevenue / totalExpenses / netProfit totals.
function convertIncomeStatement(
  report: IncomeStatementResult,
  rate: number,
): IncomeStatementResult {
  const c = (n: number) => round2(n / rate);
  return {
    ...report,
    revenue: report.revenue.map((l) => ({ ...l, amount: c(l.amount) })),
    expenses: report.expenses.map((l) => ({ ...l, amount: c(l.amount) })),
    totalRevenue: c(report.totalRevenue),
    totalExpenses: c(report.totalExpenses),
    netProfit: c(report.netProfit),
  };
}

// Builds income-statement lines from a pre-queried totals map.
function buildIncomeStatementGroupLines(
  accounts: AccountRow[],
  totals: Map<string, { debit: number; credit: number }>,
) {
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
      revenue.push({ accountId: acc.id, code: acc.code, nameAr: acc.nameAr, nameEn: acc.nameEn, amount });
    } else if (acc.type === "expense") {
      const amount = round2(t.debit - t.credit);
      if (Math.abs(amount) < 0.005) continue;
      totalExpenses = round2(totalExpenses + amount);
      expenses.push({ accountId: acc.id, code: acc.code, nameAr: acc.nameAr, nameEn: acc.nameEn, amount });
    }
  }
  return { revenue, expenses, totalRevenue, totalExpenses, netProfit: round2(totalRevenue - totalExpenses) };
}

type IncomeStatementBreakdownGroup = {
  dimensionId: string | null;
  dimensionName: string;
  revenue: PnlLine[];
  expenses: PnlLine[];
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
};

async function computeIncomeStatementBreakdown(
  companyId: string,
  from: string | null,
  to: string | null,
  breakdownBy: "costCenter" | "project" | "branch",
): Promise<IncomeStatementBreakdownGroup[]> {
  const [accounts, dimensionOptions, periodGrouped] = await Promise.all([
    loadAccounts(companyId),
    loadDimensionOptions(companyId, breakdownBy),
    postedTotalsGrouped(companyId, from, to, breakdownBy),
  ]);

  const dimById = new Map(dimensionOptions.map((d) => [d.id, d]));
  const groups: IncomeStatementBreakdownGroup[] = [];

  for (const [key, totals] of periodGrouped) {
    const groupData = buildIncomeStatementGroupLines(accounts, totals);
    if (groupData.revenue.length === 0 && groupData.expenses.length === 0) continue;
    const dim = key ? dimById.get(key) : null;
    groups.push({
      dimensionId: key,
      dimensionName: dim ? dim.nameAr : "غير محدد",
      ...groupData,
    });
  }

  groups.sort((a, b) => {
    if (a.dimensionId === null) return 1;
    if (b.dimensionId === null) return -1;
    return a.dimensionName.localeCompare(b.dimensionName);
  });

  return groups;
}

function convertIncomeStatementBreakdownGroup(
  group: IncomeStatementBreakdownGroup,
  rate: number,
): IncomeStatementBreakdownGroup {
  const c = (n: number) => round2(n / rate);
  return {
    ...group,
    revenue: group.revenue.map((l) => ({ ...l, amount: c(l.amount) })),
    expenses: group.expenses.map((l) => ({ ...l, amount: c(l.amount) })),
    totalRevenue: c(group.totalRevenue),
    totalExpenses: c(group.totalExpenses),
    netProfit: c(group.netProfit),
  };
}

router.get(
  "/reports/income-statement",
  requireAuth,
  requireCapability("journal:read"),
  async (req, res) => {
    const from = (req.query["from"] as string | undefined) || null;
    const to = (req.query["to"] as string | undefined) || null;
    const reportCurrency =
      (req.query["reportCurrency"] as string | undefined) || null;
    const dimensions = readReportDimensionFilters(req.query);
    try {
      const companyId = req.auth!.companyId;
      const ccy = await resolveReportCurrency(companyId, reportCurrency, to);
      if (!ccy.ok) {
        res.status(400).json({ error: NO_RATE_ERROR });
        return;
      }
      let report = await computeIncomeStatement(companyId, from, to, dimensions);
      if (ccy.info.rate !== 1)
        report = convertIncomeStatement(report, ccy.info.rate);

      let breakdownGroups: IncomeStatementBreakdownGroup[] | undefined;
      if (dimensions.breakdownBy) {
        let groups = await computeIncomeStatementBreakdown(
          companyId,
          from,
          to,
          dimensions.breakdownBy,
        );
        if (ccy.info.rate !== 1) {
          groups = groups.map((g) =>
            convertIncomeStatementBreakdownGroup(g, ccy.info.rate),
          );
        }
        breakdownGroups = groups;
      }

      res.json({ ...report, breakdownGroups, currencyInfo: ccy.info });
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
      const dimensions = readReportDimensionFilters(req.query);
      const [r, titleRows] = await Promise.all([
        computeIncomeStatement(req.auth!.companyId, from, to, dimensions),
        buildExcelTitleRows(
          req.auth!.companyId,
          "قائمة الأرباح والخسائر",
          `${from ?? "البداية"} → ${to ?? todayStr()}`,
        ),
      ]);
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
        titleRows,
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
async function computeBalanceSheet(
  companyId: string,
  asOf: string | null,
  dimensions?: ReportDimensionFilters,
) {
  const [accounts, totals] = await Promise.all([
    loadAccounts(companyId),
    postedTotals(companyId, null, asOf, dimensions),
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

type BalanceSheetResult = Awaited<ReturnType<typeof computeBalanceSheet>>;

// Converts the balance sheet's base-currency figures: each asset/liability/equity
// line amount, the netResult, and the four section/grand totals. The `balanced`
// flag and the asOf date stay unchanged.
function convertBalanceSheet(
  report: BalanceSheetResult,
  rate: number,
): BalanceSheetResult {
  const c = (n: number) => round2(n / rate);
  return {
    ...report,
    assets: report.assets.map((l) => ({ ...l, amount: c(l.amount) })),
    liabilities: report.liabilities.map((l) => ({ ...l, amount: c(l.amount) })),
    equity: report.equity.map((l) => ({ ...l, amount: c(l.amount) })),
    netResult: c(report.netResult),
    totalAssets: c(report.totalAssets),
    totalLiabilities: c(report.totalLiabilities),
    totalEquity: c(report.totalEquity),
    totalLiabilitiesAndEquity: c(report.totalLiabilitiesAndEquity),
  };
}

router.get(
  "/reports/balance-sheet",
  requireAuth,
  requireCapability("journal:read"),
  async (req, res) => {
    const asOf = (req.query["asOf"] as string | undefined) || null;
    const reportCurrency =
      (req.query["reportCurrency"] as string | undefined) || null;
    const dimensions = readReportDimensionFilters(req.query);
    try {
      const companyId = req.auth!.companyId;
      // The balance sheet's as-of date drives the rate lookup.
      const ccy = await resolveReportCurrency(companyId, reportCurrency, asOf);
      if (!ccy.ok) {
        res.status(400).json({ error: NO_RATE_ERROR });
        return;
      }
      let report = await computeBalanceSheet(companyId, asOf, dimensions);
      if (ccy.info.rate !== 1)
        report = convertBalanceSheet(report, ccy.info.rate);
      res.json({ ...report, currencyInfo: ccy.info });
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
      const dimensions = readReportDimensionFilters(req.query);
      const [r, titleRows] = await Promise.all([
        computeBalanceSheet(req.auth!.companyId, asOf, dimensions),
        buildExcelTitleRows(
          req.auth!.companyId,
          "الميزانية العمومية",
          `حتى ${asOf ?? todayStr()}`,
        ),
      ]);
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
        titleRows,
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
  entryId: string;
  date: string;
  entryNo: number;
  ref: string | null;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  costCenterName: string | null;
  projectName: string | null;
  branchName: string | null;
};

async function computeGeneralLedger(
  companyId: string,
  accountId: string,
  from: string | null,
  to: string | null,
  dimensions?: ReportDimensionFilters,
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
      entryId: journalEntriesTable.id,
      date: journalEntriesTable.date,
      entryNo: journalEntriesTable.entryNo,
      ref: journalEntriesTable.reference,
      description: journalEntryLinesTable.description,
      debit: journalEntryLinesTable.debitBase,
      credit: journalEntryLinesTable.creditBase,
      costCenterName: costCentersTable.nameAr,
      projectName: projectsTable.nameAr,
      branchName: branchesTable.nameAr,
    })
    .from(journalEntryLinesTable)
    .innerJoin(
      journalEntriesTable,
      eq(journalEntriesTable.id, journalEntryLinesTable.entryId),
    )
    .leftJoin(
      costCentersTable,
      eq(costCentersTable.id, journalEntryLinesTable.costCenterId),
    )
    .leftJoin(
      projectsTable,
      eq(projectsTable.id, journalEntryLinesTable.projectId),
    )
    .leftJoin(
      branchesTable,
      eq(branchesTable.id, journalEntryLinesTable.branchId),
    )
    .where(
      and(
        eq(journalEntriesTable.companyId, companyId),
        eq(journalEntriesTable.status, "posted"),
        eq(journalEntryLinesTable.accountId, accountId),
        dimensions?.costCenterId
          ? eq(journalEntryLinesTable.costCenterId, dimensions.costCenterId)
          : undefined,
        dimensions?.projectId
          ? eq(journalEntryLinesTable.projectId, dimensions.projectId)
          : undefined,
        dimensions?.branchId
          ? eq(journalEntryLinesTable.branchId, dimensions.branchId)
          : undefined,
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
      entryId: l.entryId,
      date: l.date,
      entryNo: l.entryNo,
      ref: l.ref ?? null,
      description: l.description ?? "",
      debit,
      credit,
      balance: running,
      costCenterName: l.costCenterName ?? null,
      projectName: l.projectName ?? null,
      branchName: l.branchName ?? null,
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

type GeneralLedgerResult = NonNullable<
  Awaited<ReturnType<typeof computeGeneralLedger>>
>;

// Converts the general ledger's base-currency figures: opening/closing balance
// and every entry's debit, credit and running balance. Dates, entry numbers,
// references, descriptions, codes and names are left untouched.
function convertGeneralLedger(
  report: GeneralLedgerResult,
  rate: number,
): GeneralLedgerResult {
  const c = (n: number) => round2(n / rate);
  return {
    ...report,
    openingBalance: c(report.openingBalance),
    closingBalance: c(report.closingBalance),
    entries: report.entries.map((e) => ({
      ...e,
      debit: c(e.debit),
      credit: c(e.credit),
      balance: c(e.balance),
    })),
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
    const reportCurrency =
      (req.query["reportCurrency"] as string | undefined) || null;
    const dimensions = readReportDimensionFilters(req.query);
    if (typeof accountId !== "string" || !accountId) {
      res.status(400).json({ error: "الحساب مطلوب" });
      return;
    }
    try {
      const companyId = req.auth!.companyId;
      const report = await computeGeneralLedger(
        companyId,
        accountId,
        from,
        to,
        dimensions,
      );
      if (!report) {
        res.status(404).json({ error: "الحساب غير موجود" });
        return;
      }
      // Use the "to" date of the ledger window as the rate as-of date.
      const ccy = await resolveReportCurrency(companyId, reportCurrency, to);
      if (!ccy.ok) {
        res.status(400).json({ error: NO_RATE_ERROR });
        return;
      }
      const out =
        ccy.info.rate !== 1
          ? convertGeneralLedger(report, ccy.info.rate)
          : report;
      res.json({ ...out, currencyInfo: ccy.info });
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
      const dimensions = readReportDimensionFilters(req.query);
      const report = await computeGeneralLedger(
        req.auth!.companyId,
        accountId,
        from,
        to,
        dimensions,
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
