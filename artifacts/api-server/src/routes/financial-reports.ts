import { Router } from "express";
import { and, eq, gte, gt, lt, lte, sql, inArray } from "drizzle-orm";
import {
  db,
  accountsTable,
  companiesTable,
  journalEntriesTable,
  journalEntryLinesTable,
  costCentersTable,
  projectsTable,
  branchesTable,
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
  extraRows: string[] = [],
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
  rows.push(...extraRows.filter(Boolean));

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
};

export function readReportDimensionFilters(
  query: Record<string, unknown>,
): ReportDimensionFilters {
  const read = (key: "costCenterId" | "projectId" | "branchId") => {
    const value = query[key];
    return typeof value === "string" && value ? value : null;
  };
  return {
    costCenterId: read("costCenterId"),
    projectId: read("projectId"),
    branchId: read("branchId"),
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

// ---- Breakdown-by helpers ---------------------------------------------------
// "Breakdown By" groups all posted lines by a chosen accounting dimension
// (Cost Center, Project, or Branch). Untagged lines are collected under
// dimensionId=null ("Unassigned"). The sum of all groups always equals the
// standard report total — no allocations or guesses.

export type BreakdownByDimension = "costCenter" | "project" | "branch";

function readBreakdownBy(
  query: Record<string, unknown>,
): BreakdownByDimension | null {
  const value = query["breakdownBy"];
  return value === "costCenter" || value === "project" || value === "branch"
    ? value
    : null;
}

function breakdownLabelAr(breakdownBy: BreakdownByDimension): string {
  if (breakdownBy === "costCenter") return "تجميع حسب مركز التكلفة";
  if (breakdownBy === "project") return "تجميع حسب المشروع";
  return "تجميع حسب الفرع";
}

function exportContextRows(
  selectedFilters: Array<{ label: string; value: string }>,
  currencyInfo?: CurrencyInfo,
  breakdownBy?: BreakdownByDimension | null,
): string[] {
  const rows: string[] = [];
  if (breakdownBy) rows.push(`التجميع: ${breakdownLabelAr(breakdownBy)}`);
  rows.push(...selectedFilters.map((filter) => `${filter.label}: ${filter.value}`));
  if (currencyInfo) {
    rows.push(
      `عملة التقرير: ${currencyInfo.reportCurrency} · العملة الأساسية: ${currencyInfo.baseCurrency}`,
    );
  }
  return rows;
}

async function loadSelectedDimensionLabels(
  companyId: string,
  dimensions: ReportDimensionFilters,
): Promise<Array<{ label: string; value: string }>> {
  const [costCenters, projects, branches] = await Promise.all([
    dimensions.costCenterId
      ? db
          .select({ nameAr: costCentersTable.nameAr })
          .from(costCentersTable)
          .where(
            and(
              eq(costCentersTable.companyId, companyId),
              eq(costCentersTable.id, dimensions.costCenterId),
            ),
          )
          .limit(1)
      : Promise.resolve([] as { nameAr: string }[]),
    dimensions.projectId
      ? db
          .select({ nameAr: projectsTable.nameAr })
          .from(projectsTable)
          .where(
            and(
              eq(projectsTable.companyId, companyId),
              eq(projectsTable.id, dimensions.projectId),
            ),
          )
          .limit(1)
      : Promise.resolve([] as { nameAr: string }[]),
    dimensions.branchId
      ? db
          .select({ nameAr: branchesTable.nameAr })
          .from(branchesTable)
          .where(
            and(
              eq(branchesTable.companyId, companyId),
              eq(branchesTable.id, dimensions.branchId),
            ),
          )
          .limit(1)
      : Promise.resolve([] as { nameAr: string }[]),
  ]);
  const rows: Array<{ label: string; value: string }> = [];
  if (dimensions.costCenterId) {
    rows.push({
      label: "مركز التكلفة",
      value: costCenters[0]?.nameAr ?? dimensions.costCenterId,
    });
  }
  if (dimensions.projectId) {
    rows.push({
      label: "المشروع",
      value: projects[0]?.nameAr ?? dimensions.projectId,
    });
  }
  if (dimensions.branchId) {
    rows.push({
      label: "الفرع",
      value: branches[0]?.nameAr ?? dimensions.branchId,
    });
  }
  return rows;
}

type DimensionItem = { id: string; nameAr: string; nameEn: string | null };

// Returns the ORM column for the chosen dimension on journal_entry_lines.
function dimColFor(
  breakdownBy: BreakdownByDimension,
): typeof journalEntryLinesTable.costCenterId {
  if (breakdownBy === "costCenter") return journalEntryLinesTable.costCenterId;
  if (breakdownBy === "project") return journalEntryLinesTable.projectId;
  return journalEntryLinesTable.branchId;
}

// Single query: debit/credit per (accountId × dimensionId) for the period.
// dimensionId=null in the result means the line had no tag for that dimension.
async function postedTotalsGrouped(
  companyId: string,
  from: string | null,
  to: string | null,
  breakdownBy: BreakdownByDimension,
  baseFilters?: ReportDimensionFilters,
): Promise<Map<string | null, Map<string, { debit: number; credit: number }>>> {
  const conds = [
    eq(journalEntriesTable.companyId, companyId),
    eq(journalEntriesTable.status, "posted"),
  ];
  if (from) conds.push(gte(journalEntriesTable.date, from));
  if (to) conds.push(lte(journalEntriesTable.date, to));
  // Apply any baseline dimension filters (e.g., user already filtered by cost
  // center and wants breakdown by project within that cost center).
  if (baseFilters?.costCenterId)
    conds.push(eq(journalEntryLinesTable.costCenterId, baseFilters.costCenterId));
  if (baseFilters?.projectId)
    conds.push(eq(journalEntryLinesTable.projectId, baseFilters.projectId));
  if (baseFilters?.branchId)
    conds.push(eq(journalEntryLinesTable.branchId, baseFilters.branchId));

  const dimCol = dimColFor(breakdownBy);

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

  const result = new Map<
    string | null,
    Map<string, { debit: number; credit: number }>
  >();
  for (const r of rows) {
    const dimId = r.dimensionId ?? null;
    if (!result.has(dimId)) result.set(dimId, new Map());
    result.get(dimId)!.set(r.accountId, {
      debit: Number(r.debit) || 0,
      credit: Number(r.credit) || 0,
    });
  }
  return result;
}

// Single query: debit/credit per (accountId × dimensionId) STRICTLY BEFORE a
// date — used for opening balance in breakdown trial balance.
async function postedTotalsBeforeGrouped(
  companyId: string,
  before: string,
  breakdownBy: BreakdownByDimension,
  baseFilters?: ReportDimensionFilters,
): Promise<Map<string | null, Map<string, { debit: number; credit: number }>>> {
  const dimCol = dimColFor(breakdownBy);

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
    .where(
      and(
        eq(journalEntriesTable.companyId, companyId),
        eq(journalEntriesTable.status, "posted"),
        lt(journalEntriesTable.date, before),
        baseFilters?.costCenterId
          ? eq(journalEntryLinesTable.costCenterId, baseFilters.costCenterId)
          : undefined,
        baseFilters?.projectId
          ? eq(journalEntryLinesTable.projectId, baseFilters.projectId)
          : undefined,
        baseFilters?.branchId
          ? eq(journalEntryLinesTable.branchId, baseFilters.branchId)
          : undefined,
      ),
    )
    .groupBy(journalEntryLinesTable.accountId, dimCol);

  const result = new Map<
    string | null,
    Map<string, { debit: number; credit: number }>
  >();
  for (const r of rows) {
    const dimId = r.dimensionId ?? null;
    if (!result.has(dimId)) result.set(dimId, new Map());
    result.get(dimId)!.set(r.accountId, {
      debit: Number(r.debit) || 0,
      credit: Number(r.credit) || 0,
    });
  }
  return result;
}

// Load all dimension items (master) for a company; returns id → {nameAr,nameEn}.
async function loadDimensionItems(
  companyId: string,
  breakdownBy: BreakdownByDimension,
): Promise<Map<string, DimensionItem>> {
  let rows: DimensionItem[];
  if (breakdownBy === "costCenter") {
    rows = await db
      .select({
        id: costCentersTable.id,
        nameAr: costCentersTable.nameAr,
        nameEn: costCentersTable.nameEn,
      })
      .from(costCentersTable)
      .where(eq(costCentersTable.companyId, companyId));
  } else if (breakdownBy === "project") {
    rows = await db
      .select({
        id: projectsTable.id,
        nameAr: projectsTable.nameAr,
        nameEn: projectsTable.nameEn,
      })
      .from(projectsTable)
      .where(eq(projectsTable.companyId, companyId));
  } else {
    rows = await db
      .select({
        id: branchesTable.id,
        nameAr: branchesTable.nameAr,
        nameEn: branchesTable.nameEn,
      })
      .from(branchesTable)
      .where(eq(branchesTable.companyId, companyId));
  }
  return new Map(rows.map((r) => [r.id, r]));
}

// Aggregate the grouped totals map back to a flat per-account map — this gives
// the same result as a standard (non-breakdown) query without an extra DB round-
// trip. Used so the top-level report totals always reconcile to the breakdown sum.
function aggregateGroupedTotals(
  grouped: Map<string | null, Map<string, { debit: number; credit: number }>>,
): Map<string, { debit: number; credit: number }> {
  const result = new Map<string, { debit: number; credit: number }>();
  for (const dimMap of grouped.values()) {
    for (const [accId, t] of dimMap) {
      const existing = result.get(accId) ?? { debit: 0, credit: 0 };
      result.set(accId, {
        debit: round2(existing.debit + t.debit),
        credit: round2(existing.credit + t.credit),
      });
    }
  }
  return result;
}

// Sort dimension IDs: named dimensions first (alphabetically by Arabic name),
// then null (Unassigned) last.
function sortDimIds(
  ids: Array<string | null>,
  items: Map<string, DimensionItem>,
): Array<string | null> {
  return [...ids].sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return (items.get(a)?.nameAr ?? "").localeCompare(
      items.get(b)?.nameAr ?? "",
    );
  });
}

// ---- Income-statement breakdown types --------------------------------------
export type IncomeStatementBreakdownGroup = {
  dimensionId: string | null;
  dimensionNameAr: string;
  dimensionNameEn: string | null;
  revenue: PnlLine[];
  expenses: PnlLine[];
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
};

// ---- Trial-balance breakdown types -----------------------------------------
export type TrialBalanceBreakdownGroup = {
  dimensionId: string | null;
  dimensionNameAr: string;
  dimensionNameEn: string | null;
  rows: TrialBalanceRow[];
  totalOpeningDebit: number;
  totalOpeningCredit: number;
  totalPeriodDebit: number;
  totalPeriodCredit: number;
  totalClosingDebit: number;
  totalClosingCredit: number;
};

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
  return buildTrialBalanceFromTotals(accounts, opening, period, from, to);
}

type TrialBalanceResult = Awaited<ReturnType<typeof computeTrialBalance>>;

// Build per-dimension trial-balance groups from a single pair of grouped-total
// maps (period and, when from is set, opening-before). Groups with zero
// activity are omitted. Accounts not found in the chart are skipped.
function buildTrialBalanceGroups(
  accounts: AccountRow[],
  groupedPeriod: Map<string | null, Map<string, { debit: number; credit: number }>>,
  groupedOpening: Map<string | null, Map<string, { debit: number; credit: number }>>,
  dimensionItems: Map<string, DimensionItem>,
): TrialBalanceBreakdownGroup[] {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const allDimIds = new Set<string | null>([
    ...groupedPeriod.keys(),
    ...groupedOpening.keys(),
  ]);
  const sortedDimIds = sortDimIds([...allDimIds], dimensionItems);

  const groups: TrialBalanceBreakdownGroup[] = [];

  for (const dimId of sortedDimIds) {
    const period = groupedPeriod.get(dimId) ?? new Map<string, { debit: number; credit: number }>();
    const opening = groupedOpening.get(dimId) ?? new Map<string, { debit: number; credit: number }>();
    const accIds = new Set<string>([...opening.keys(), ...period.keys()]);

    let tod = 0, toc = 0, tpd = 0, tpc = 0, tcd = 0, tcc = 0;
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

      if (!openingDebit && !openingCredit && !periodDebit && !periodCredit && !closingDebit && !closingCredit) continue;

      tod = round2(tod + openingDebit);
      toc = round2(toc + openingCredit);
      tpd = round2(tpd + periodDebit);
      tpc = round2(tpc + periodCredit);
      tcd = round2(tcd + closingDebit);
      tcc = round2(tcc + closingCredit);

      rows.push({ accountId: acc.id, code: acc.code, nameAr: acc.nameAr, nameEn: acc.nameEn, type: acc.type, openingDebit, openingCredit, periodDebit, periodCredit, closingDebit, closingCredit });
    }

    if (rows.length === 0) continue;
    rows.sort((a, b) => a.code.localeCompare(b.code));

    const dim = dimId ? dimensionItems.get(dimId) : null;
    groups.push({
      dimensionId: dimId,
      dimensionNameAr: dim?.nameAr ?? "غير محدد",
      dimensionNameEn: dim ? (dim.nameEn ?? null) : "Unassigned",
      rows,
      totalOpeningDebit: tod,
      totalOpeningCredit: toc,
      totalPeriodDebit: tpd,
      totalPeriodCredit: tpc,
      totalClosingDebit: tcd,
      totalClosingCredit: tcc,
    });
  }
  return groups;
}

async function computeTrialBalanceBreakdown(
  companyId: string,
  from: string | null,
  to: string | null,
  breakdownBy: BreakdownByDimension,
  baseFilters?: ReportDimensionFilters,
): Promise<TrialBalanceResult & { breakdownGroups: TrialBalanceBreakdownGroup[] }> {
  const [accounts, groupedPeriod, groupedOpening, dimensionItems] =
    await Promise.all([
      loadAccounts(companyId),
      postedTotalsGrouped(companyId, from, to, breakdownBy, baseFilters),
      from
        ? postedTotalsBeforeGrouped(companyId, from, breakdownBy, baseFilters)
        : Promise.resolve(
            new Map<string | null, Map<string, { debit: number; credit: number }>>(),
          ),
      loadDimensionItems(companyId, breakdownBy),
    ]);

  // Build per-group data
  const breakdownGroups = buildTrialBalanceGroups(
    accounts,
    groupedPeriod,
    groupedOpening,
    dimensionItems,
  );

  // Reconstruct standard totals by aggregating groups
  const standardPeriod = aggregateGroupedTotals(groupedPeriod);
  const standardOpening = aggregateGroupedTotals(groupedOpening);
  const std = await buildTrialBalanceFromTotals(accounts, standardOpening, standardPeriod, from, to);

  return { ...std, breakdownGroups };
}

// Shared core: build trial-balance result from pre-computed total maps.
function buildTrialBalanceFromTotals(
  accounts: AccountRow[],
  opening: Map<string, { debit: number; credit: number }>,
  period: Map<string, { debit: number; credit: number }>,
  from: string | null,
  to: string | null,
): TrialBalanceResult {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const accIds = new Set<string>([...opening.keys(), ...period.keys()]);

  let totalOpeningDebit = 0,
    totalOpeningCredit = 0,
    totalPeriodDebit = 0,
    totalPeriodCredit = 0,
    totalClosingDebit = 0,
    totalClosingCredit = 0;
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

    if (!openingDebit && !openingCredit && !periodDebit && !periodCredit && !closingDebit && !closingCredit) continue;

    totalOpeningDebit = round2(totalOpeningDebit + openingDebit);
    totalOpeningCredit = round2(totalOpeningCredit + openingCredit);
    totalPeriodDebit = round2(totalPeriodDebit + periodDebit);
    totalPeriodCredit = round2(totalPeriodCredit + periodCredit);
    totalClosingDebit = round2(totalClosingDebit + closingDebit);
    totalClosingCredit = round2(totalClosingCredit + closingCredit);

    rows.push({ accountId: acc.id, code: acc.code, nameAr: acc.nameAr, nameEn: acc.nameEn, type: acc.type, openingDebit, openingCredit, periodDebit, periodCredit, closingDebit, closingCredit });
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
    const breakdownBy = readBreakdownBy(req.query);
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
      if (breakdownBy) {
        const raw = await computeTrialBalanceBreakdown(
          companyId,
          from,
          to,
          breakdownBy,
          dimensions,
        );
        // currency conversion for breakdown
        let report = raw;
        if (ccy.info.rate !== 1) {
          const c = (n: number) => round2(n / ccy.info.rate);
          report = {
            ...convertTrialBalance(raw, ccy.info.rate),
            breakdownGroups: raw.breakdownGroups.map((g) => ({
              ...g,
              rows: g.rows.map((row) => ({
                ...row,
                openingDebit: c(row.openingDebit),
                openingCredit: c(row.openingCredit),
                periodDebit: c(row.periodDebit),
                periodCredit: c(row.periodCredit),
                closingDebit: c(row.closingDebit),
                closingCredit: c(row.closingCredit),
              })),
              totalOpeningDebit: c(g.totalOpeningDebit),
              totalOpeningCredit: c(g.totalOpeningCredit),
              totalPeriodDebit: c(g.totalPeriodDebit),
              totalPeriodCredit: c(g.totalPeriodCredit),
              totalClosingDebit: c(g.totalClosingDebit),
              totalClosingCredit: c(g.totalClosingCredit),
            })),
          };
        }
        res.json({ ...report, currencyInfo: ccy.info });
        return;
      }
      let report = await computeTrialBalance(companyId, from, to, dimensions);
      if (ccy.info.rate !== 1) report = convertTrialBalance(report, ccy.info.rate);
      res.json({ ...report, currencyInfo: ccy.info });
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
    const breakdownBy = readBreakdownBy(req.query);
    const dateErr = validateDateRange(from, to);
    if (dateErr) {
      res.status(400).json({ error: dateErr });
      return;
    }
    try {
      const dimensions = readReportDimensionFilters(req.query);
      const companyId = req.auth!.companyId;
      const reportCurrency =
        (req.query["reportCurrency"] as string | undefined) || null;
      const ccy = await resolveReportCurrency(companyId, reportCurrency, to);
      if (!ccy.ok) {
        res.status(400).json({ error: NO_RATE_ERROR });
        return;
      }
      const reportBase = breakdownBy
        ? await computeTrialBalanceBreakdown(
            companyId,
            from,
            to,
            breakdownBy,
            dimensions,
          )
        : await computeTrialBalance(companyId, from, to, dimensions);
      let report = reportBase;
      if (ccy.info.rate !== 1) {
        const c = (n: number) => round2(n / ccy.info.rate);
        report = breakdownBy
          ? {
              ...convertTrialBalance(reportBase, ccy.info.rate),
              breakdownGroups: reportBase.breakdownGroups.map((g) => ({
                ...g,
                rows: g.rows.map((row) => ({
                  ...row,
                  openingDebit: c(row.openingDebit),
                  openingCredit: c(row.openingCredit),
                  periodDebit: c(row.periodDebit),
                  periodCredit: c(row.periodCredit),
                  closingDebit: c(row.closingDebit),
                  closingCredit: c(row.closingCredit),
                })),
                totalOpeningDebit: c(g.totalOpeningDebit),
                totalOpeningCredit: c(g.totalOpeningCredit),
                totalPeriodDebit: c(g.totalPeriodDebit),
                totalPeriodCredit: c(g.totalPeriodCredit),
                totalClosingDebit: c(g.totalClosingDebit),
                totalClosingCredit: c(g.totalClosingCredit),
              })),
            }
          : convertTrialBalance(reportBase, ccy.info.rate);
      }
      const selectedFilters = await loadSelectedDimensionLabels(companyId, dimensions);
      const titleRows = await buildExcelTitleRows(
        companyId,
        "ميزان المراجعة",
        `${from ?? "البداية"} → ${to ?? todayStr()}`,
        exportContextRows(selectedFilters, ccy.info, breakdownBy),
      );

      // When breakdown is active, flatten groups with a leading "Dimension" column.
      type TbExportRow = TrialBalanceRow & { dimension?: string };
      let exportRows: TbExportRow[];
      const hasBreakdown = breakdownBy && "breakdownGroups" in report;
      if (hasBreakdown) {
        const bd = (report as typeof report & { breakdownGroups: TrialBalanceBreakdownGroup[] }).breakdownGroups;
        exportRows = bd.flatMap((g) => [
          ...g.rows.map((r) => ({ ...r, dimension: g.dimensionNameAr })),
        ]);
      } else {
        exportRows = report.rows.map((r) => ({ ...r, dimension: undefined }));
      }

      const cols = [
        ...(hasBreakdown ? [{ header: "التجميع", value: (r: TbExportRow) => r.dimension ?? "", width: 24 }] : []),
        { header: "الكود", value: (r: TbExportRow) => r.code },
        { header: "الحساب", value: (r: TbExportRow) => r.nameAr, width: 32 },
        { header: "افتتاحي مدين", value: (r: TbExportRow) => r.openingDebit, width: 16 },
        { header: "افتتاحي دائن", value: (r: TbExportRow) => r.openingCredit, width: 16 },
        { header: "حركة مدين", value: (r: TbExportRow) => r.periodDebit, width: 16 },
        { header: "حركة دائن", value: (r: TbExportRow) => r.periodCredit, width: 16 },
        { header: "ختامي مدين", value: (r: TbExportRow) => r.closingDebit, width: 16 },
        { header: "ختامي دائن", value: (r: TbExportRow) => r.closingCredit, width: 16 },
      ];

      await exportWorkbook(res, {
        sheetName: "TrialBalance",
        fileName: "trial-balance",
        titleRows,
        columns: cols,
        rows: exportRows,
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

// Build income-statement lines from a pre-computed totals map (accounts already loaded).
function buildIncomeStatementLines(
  accounts: AccountRow[],
  totals: Map<string, { debit: number; credit: number }>,
): { revenue: PnlLine[]; expenses: PnlLine[]; totalRevenue: number; totalExpenses: number } {
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
  return { revenue, expenses, totalRevenue, totalExpenses };
}

async function computeIncomeStatementBreakdown(
  companyId: string,
  from: string | null,
  to: string | null,
  breakdownBy: BreakdownByDimension,
  baseFilters?: ReportDimensionFilters,
): Promise<IncomeStatementResult & { breakdownGroups: IncomeStatementBreakdownGroup[] }> {
  const [accounts, groupedTotals, dimensionItems] = await Promise.all([
    loadAccounts(companyId),
    postedTotalsGrouped(companyId, from, to, breakdownBy, baseFilters),
    loadDimensionItems(companyId, breakdownBy),
  ]);

  const sortedDimIds = sortDimIds([...groupedTotals.keys()], dimensionItems);
  const groups: IncomeStatementBreakdownGroup[] = [];

  for (const dimId of sortedDimIds) {
    const totals = groupedTotals.get(dimId) ?? new Map<string, { debit: number; credit: number }>();
    const { revenue, expenses, totalRevenue, totalExpenses } = buildIncomeStatementLines(accounts, totals);
    if (revenue.length === 0 && expenses.length === 0) continue;
    const dim = dimId ? dimensionItems.get(dimId) : null;
    groups.push({
      dimensionId: dimId,
      dimensionNameAr: dim?.nameAr ?? "غير محدد",
      dimensionNameEn: dim ? (dim.nameEn ?? null) : "Unassigned",
      revenue,
      expenses,
      totalRevenue,
      totalExpenses,
      netProfit: round2(totalRevenue - totalExpenses),
    });
  }

  // Standard totals = aggregate of all groups (reconciles by construction)
  const standardTotals = aggregateGroupedTotals(groupedTotals);
  const { revenue, expenses, totalRevenue, totalExpenses } = buildIncomeStatementLines(accounts, standardTotals);

  return {
    from: from ?? null,
    to: to ?? null,
    revenue,
    expenses,
    totalRevenue,
    totalExpenses,
    netProfit: round2(totalRevenue - totalExpenses),
    breakdownGroups: groups,
  };
}

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
    const breakdownBy = readBreakdownBy(req.query);
    try {
      const companyId = req.auth!.companyId;
      const ccy = await resolveReportCurrency(companyId, reportCurrency, to);
      if (!ccy.ok) {
        res.status(400).json({ error: NO_RATE_ERROR });
        return;
      }
      if (breakdownBy) {
        const raw = await computeIncomeStatementBreakdown(
          companyId,
          from,
          to,
          breakdownBy,
          dimensions,
        );
        if (ccy.info.rate !== 1) {
          const c = (n: number) => round2(n / ccy.info.rate);
          const convertedGroups = raw.breakdownGroups.map((g) => ({
            ...g,
            revenue: g.revenue.map((l) => ({ ...l, amount: c(l.amount) })),
            expenses: g.expenses.map((l) => ({ ...l, amount: c(l.amount) })),
            totalRevenue: c(g.totalRevenue),
            totalExpenses: c(g.totalExpenses),
            netProfit: c(g.netProfit),
          }));
          const std = convertIncomeStatement(raw, ccy.info.rate);
          res.json({ ...std, breakdownGroups: convertedGroups, currencyInfo: ccy.info });
          return;
        }
        res.json({ ...raw, currencyInfo: ccy.info });
        return;
      }
      let report = await computeIncomeStatement(companyId, from, to, dimensions);
      if (ccy.info.rate !== 1)
        report = convertIncomeStatement(report, ccy.info.rate);
      res.json({ ...report, currencyInfo: ccy.info });
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
    const breakdownBy = readBreakdownBy(req.query);
    try {
      const dimensions = readReportDimensionFilters(req.query);
      const companyId = req.auth!.companyId;
      const reportCurrency =
        (req.query["reportCurrency"] as string | undefined) || null;
      const ccy = await resolveReportCurrency(companyId, reportCurrency, to);
      if (!ccy.ok) {
        res.status(400).json({ error: NO_RATE_ERROR });
        return;
      }
      const reportBase = breakdownBy
        ? await computeIncomeStatementBreakdown(
            companyId,
            from,
            to,
            breakdownBy,
            dimensions,
          )
        : await computeIncomeStatement(companyId, from, to, dimensions);
      const r =
        ccy.info.rate !== 1
          ? breakdownBy
            ? {
                ...convertIncomeStatement(reportBase, ccy.info.rate),
                breakdownGroups: reportBase.breakdownGroups.map((g) => ({
                  ...g,
                  revenue: g.revenue.map((l) => ({
                    ...l,
                    amount: round2(l.amount / ccy.info.rate),
                  })),
                  expenses: g.expenses.map((l) => ({
                    ...l,
                    amount: round2(l.amount / ccy.info.rate),
                  })),
                  totalRevenue: round2(g.totalRevenue / ccy.info.rate),
                  totalExpenses: round2(g.totalExpenses / ccy.info.rate),
                  netProfit: round2(g.netProfit / ccy.info.rate),
                })),
              }
            : convertIncomeStatement(reportBase, ccy.info.rate)
          : reportBase;
      const selectedFilters = await loadSelectedDimensionLabels(companyId, dimensions);
      const titleRows = await buildExcelTitleRows(
        companyId,
        "قائمة الأرباح والخسائر",
        `${from ?? "البداية"} → ${to ?? todayStr()}`,
        exportContextRows(selectedFilters, ccy.info, breakdownBy),
      );

      const hasBreakdown = breakdownBy && "breakdownGroups" in r;
      type ExpRow = { dimension?: string; section: string; code: string; name: string; amount: number };
      let rows: ExpRow[];
      if (hasBreakdown) {
        const bd = (r as typeof r & { breakdownGroups: IncomeStatementBreakdownGroup[] }).breakdownGroups;
        rows = bd.flatMap((g) => [
          ...g.revenue.map((l) => ({ dimension: g.dimensionNameAr, section: "إيراد", code: l.code, name: l.nameAr, amount: l.amount })),
          ...g.expenses.map((l) => ({ dimension: g.dimensionNameAr, section: "مصروف", code: l.code, name: l.nameAr, amount: l.amount })),
        ]);
      } else {
        rows = [
          ...r.revenue.map((l) => ({ section: "إيراد", code: l.code, name: l.nameAr, amount: l.amount })),
          ...r.expenses.map((l) => ({ section: "مصروف", code: l.code, name: l.nameAr, amount: l.amount })),
        ];
      }

      await exportWorkbook(res, {
        sheetName: "IncomeStatement",
        fileName: "income-statement",
        titleRows,
        columns: [
          ...(hasBreakdown ? [{ header: "التجميع", value: (x: ExpRow) => x.dimension ?? "", width: 24 }] : []),
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
      const companyId = req.auth!.companyId;
      const reportCurrency =
        (req.query["reportCurrency"] as string | undefined) || null;
      const ccy = await resolveReportCurrency(companyId, reportCurrency, asOf);
      if (!ccy.ok) {
        res.status(400).json({ error: NO_RATE_ERROR });
        return;
      }
      let r = await computeBalanceSheet(companyId, asOf, dimensions);
      if (ccy.info.rate !== 1) r = convertBalanceSheet(r, ccy.info.rate);
      const selectedFilters = await loadSelectedDimensionLabels(companyId, dimensions);
      const titleRows = await buildExcelTitleRows(
        companyId,
        "الميزانية العمومية",
        `حتى ${asOf ?? todayStr()}`,
        exportContextRows(selectedFilters, ccy.info),
      );
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
  // Dimension labels (always present; null when the line has no tag)
  costCenterId: string | null;
  costCenterName: string | null;
  projectId: string | null;
  projectName: string | null;
  branchId: string | null;
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
      costCenterId: journalEntryLinesTable.costCenterId,
      projectId: journalEntryLinesTable.projectId,
      branchId: journalEntryLinesTable.branchId,
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

  // Bulk-load dimension names for all IDs referenced in these entries.
  const ccIds = [...new Set(lines.map((l) => l.costCenterId).filter(Boolean))] as string[];
  const projIds = [...new Set(lines.map((l) => l.projectId).filter(Boolean))] as string[];
  const branchIds = [...new Set(lines.map((l) => l.branchId).filter(Boolean))] as string[];

  const [ccRows, projRows, branchRows] = await Promise.all([
    ccIds.length
      ? db.select({ id: costCentersTable.id, nameAr: costCentersTable.nameAr }).from(costCentersTable).where(inArray(costCentersTable.id, ccIds))
      : Promise.resolve([] as { id: string; nameAr: string }[]),
    projIds.length
      ? db.select({ id: projectsTable.id, nameAr: projectsTable.nameAr }).from(projectsTable).where(inArray(projectsTable.id, projIds))
      : Promise.resolve([] as { id: string; nameAr: string }[]),
    branchIds.length
      ? db.select({ id: branchesTable.id, nameAr: branchesTable.nameAr }).from(branchesTable).where(inArray(branchesTable.id, branchIds))
      : Promise.resolve([] as { id: string; nameAr: string }[]),
  ]);

  const ccNames = new Map(ccRows.map((r) => [r.id, r.nameAr]));
  const projNames = new Map(projRows.map((r) => [r.id, r.nameAr]));
  const branchNames = new Map(branchRows.map((r) => [r.id, r.nameAr]));

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
      costCenterId: l.costCenterId ?? null,
      costCenterName: l.costCenterId ? (ccNames.get(l.costCenterId) ?? null) : null,
      projectId: l.projectId ?? null,
      projectName: l.projectId ? (projNames.get(l.projectId) ?? null) : null,
      branchId: l.branchId ?? null,
      branchName: l.branchId ? (branchNames.get(l.branchId) ?? null) : null,
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
      const breakdownBy = readBreakdownBy(req.query);
      const companyId = req.auth!.companyId;
      const reportCurrency =
        (req.query["reportCurrency"] as string | undefined) || null;
      const reportBase = await computeGeneralLedger(
        companyId,
        accountId,
        from,
        to,
        dimensions,
      );
      if (!reportBase) {
        res.status(404).json({ error: "الحساب غير موجود" });
        return;
      }
      const ccy = await resolveReportCurrency(companyId, reportCurrency, to);
      if (!ccy.ok) {
        res.status(400).json({ error: NO_RATE_ERROR });
        return;
      }
      const report =
        ccy.info.rate !== 1
          ? convertGeneralLedger(reportBase, ccy.info.rate)
          : reportBase;
      type GlExportRow =
        | (LedgerEntry & {
            grouping: string;
            rowType: "entry";
          })
        | {
            grouping: string;
            rowType: "subtotal";
            date: string;
            entryNo: string;
            ref: string;
            description: string;
            costCenterName: string;
            projectName: string;
            branchName: string;
            debit: number;
            credit: number;
            balance: number;
          };
      const rows: GlExportRow[] =
        breakdownBy
          ? (() => {
              const groups = new Map<string, LedgerEntry[]>();
              for (const entry of report.entries) {
                const grouping =
                  breakdownBy === "costCenter"
                    ? entry.costCenterName ?? "غير محدد"
                    : breakdownBy === "project"
                      ? entry.projectName ?? "غير محدد"
                      : entry.branchName ?? "غير محدد";
                groups.set(grouping, [...(groups.get(grouping) ?? []), entry]);
              }
              return [...groups.entries()].flatMap(([grouping, groupEntries]) => [
                ...groupEntries.map((entry) => ({
                  ...entry,
                  grouping,
                  rowType: "entry" as const,
                })),
                {
                  grouping,
                  rowType: "subtotal" as const,
                  date: "",
                  entryNo: "",
                  ref: "",
                  description: "الإجمالي الفرعي",
                  costCenterName: "",
                  projectName: "",
                  branchName: "",
                  debit: round2(
                    groupEntries.reduce((sum, row) => sum + row.debit, 0),
                  ),
                  credit: round2(
                    groupEntries.reduce((sum, row) => sum + row.credit, 0),
                  ),
                  balance: groupEntries[groupEntries.length - 1]?.balance ?? 0,
                },
              ]);
            })()
          : report.entries.map((entry) => ({
              ...entry,
              grouping: "",
              rowType: "entry" as const,
            }));
      const selectedFilters = await loadSelectedDimensionLabels(companyId, dimensions);
      const titleRows = await buildExcelTitleRows(
        companyId,
        "دفتر الأستاذ",
        `${from ?? "البداية"} → ${to ?? todayStr()}`,
        exportContextRows(selectedFilters, ccy.info, breakdownBy),
      );
      await exportWorkbook(res, {
        sheetName: "GeneralLedger",
        fileName: `general-ledger-${report.accountCode}`,
        titleRows,
        columns: [
          ...(breakdownBy
            ? [{ header: "التجميع", value: (e: GlExportRow) => e.grouping, width: 24 }]
            : []),
          { header: "التاريخ", value: (e: GlExportRow) => e.date },
          { header: "رقم القيد", value: (e: GlExportRow) => e.entryNo },
          { header: "المرجع", value: (e: GlExportRow) => e.ref ?? "" },
          { header: "البيان", value: (e: GlExportRow) => e.description, width: 32 },
          { header: "مركز التكلفة", value: (e: GlExportRow) => e.costCenterName ?? "", width: 20 },
          { header: "المشروع", value: (e: GlExportRow) => e.projectName ?? "", width: 20 },
          { header: "الفرع", value: (e: GlExportRow) => e.branchName ?? "", width: 20 },
          { header: "مدين", value: (e: GlExportRow) => e.debit, width: 16 },
          { header: "دائن", value: (e: GlExportRow) => e.credit, width: 16 },
          { header: "الرصيد", value: (e: GlExportRow) => e.balance, width: 16 },
        ],
        rows,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to export general ledger");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
