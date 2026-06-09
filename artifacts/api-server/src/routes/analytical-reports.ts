import { Router } from "express";
import { and, eq, gte, inArray, lte, lt, notInArray, sql } from "drizzle-orm";
import {
  db,
  accountsTable,
  journalEntriesTable,
  journalEntryLinesTable,
  bankAccountsTable,
  invoicesTable,
  invoiceLinesTable,
  inventoryItemsTable,
  inventoryMovementsTable,
} from "@workspace/db";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import { round2 } from "../lib/inventory-posting";
import { exportWorkbook } from "../lib/excel";

const router = Router();

// Validate optional from/to query dates: each must be YYYY-MM-DD (a real date)
// and from must not be after to. Returns an error string, or null when valid.
function validateDateRange(
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

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function qStr(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

// ============================================================================
// Cash-equivalents: the chart accounts linked to the company's bank/cash boxes.
// The cash-flow statement and the forecast both treat these as "cash".
// ============================================================================
async function cashAccountIds(companyId: string): Promise<string[]> {
  const rows = await db
    .select({ accountId: bankAccountsTable.accountId })
    .from(bankAccountsTable)
    .where(eq(bankAccountsTable.companyId, companyId));
  return [...new Set(rows.map((r) => r.accountId))];
}

// Net posted base-currency movement (debit - credit) on the given accounts,
// optionally bounded by date. `to` is inclusive; `before` is exclusive.
async function cashNet(
  companyId: string,
  accountIds: string[],
  opts: { before?: string; from?: string; to?: string },
): Promise<number> {
  if (accountIds.length === 0) return 0;
  const conds = [
    eq(journalEntriesTable.companyId, companyId),
    eq(journalEntriesTable.status, "posted"),
    inArray(journalEntryLinesTable.accountId, accountIds),
  ];
  if (opts.before) conds.push(lt(journalEntriesTable.date, opts.before));
  if (opts.from) conds.push(gte(journalEntriesTable.date, opts.from));
  if (opts.to) conds.push(lte(journalEntriesTable.date, opts.to));
  const [row] = await db
    .select({
      net: sql<string>`coalesce(sum(${journalEntryLinesTable.debitBase} - ${journalEntryLinesTable.creditBase}), 0)`,
    })
    .from(journalEntryLinesTable)
    .innerJoin(
      journalEntriesTable,
      eq(journalEntriesTable.id, journalEntryLinesTable.entryId),
    )
    .where(and(...conds));
  return Number(row?.net) || 0;
}

// ============================================================================
// 1) Cash-flow statement (direct method).
// Opening / closing cash from the cash-account ledger, plus the period's
// inflows & outflows grouped by the counterpart account of every posted entry
// that touches cash.
// ============================================================================
type CashFlowLine = {
  accountId: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  amount: number;
};

async function computeCashFlow(
  companyId: string,
  from: string | null,
  to: string | null,
) {
  const cashIds = await cashAccountIds(companyId);
  const openingCash = from
    ? await cashNet(companyId, cashIds, { before: from })
    : 0;
  const closingCash = await cashNet(companyId, cashIds, {
    to: to ?? undefined,
  });

  const inflows: CashFlowLine[] = [];
  const outflows: CashFlowLine[] = [];
  let totalInflow = 0;
  let totalOutflow = 0;

  if (cashIds.length > 0) {
    // Posted entries (in the period) that have at least one cash line.
    const entryConds = [
      eq(journalEntriesTable.companyId, companyId),
      eq(journalEntriesTable.status, "posted"),
      inArray(journalEntryLinesTable.accountId, cashIds),
    ];
    if (from) entryConds.push(gte(journalEntriesTable.date, from));
    if (to) entryConds.push(lte(journalEntriesTable.date, to));
    const entryRows = await db
      .selectDistinct({ entryId: journalEntryLinesTable.entryId })
      .from(journalEntryLinesTable)
      .innerJoin(
        journalEntriesTable,
        eq(journalEntriesTable.id, journalEntryLinesTable.entryId),
      )
      .where(and(...entryConds));
    const entryIds = entryRows.map((r) => r.entryId);

    if (entryIds.length > 0) {
      // Sum the NON-cash side of those entries grouped by counterpart account.
      const grouped = await db
        .select({
          accountId: journalEntryLinesTable.accountId,
          code: accountsTable.code,
          nameAr: accountsTable.nameAr,
          nameEn: accountsTable.nameEn,
          net: sql<string>`sum(${journalEntryLinesTable.debitBase} - ${journalEntryLinesTable.creditBase})`,
        })
        .from(journalEntryLinesTable)
        .innerJoin(
          accountsTable,
          eq(accountsTable.id, journalEntryLinesTable.accountId),
        )
        .where(
          and(
            inArray(journalEntryLinesTable.entryId, entryIds),
            notInArray(journalEntryLinesTable.accountId, cashIds),
          ),
        )
        .groupBy(
          journalEntryLinesTable.accountId,
          accountsTable.code,
          accountsTable.nameAr,
          accountsTable.nameEn,
        );

      for (const g of grouped) {
        const net = round2(Number(g.net) || 0);
        if (Math.abs(net) < 0.005) continue;
        // netDebit > 0 → cash was used (outflow); < 0 → cash source (inflow).
        const line: CashFlowLine = {
          accountId: g.accountId,
          code: g.code,
          nameAr: g.nameAr,
          nameEn: g.nameEn,
          amount: Math.abs(net),
        };
        if (net < 0) {
          inflows.push(line);
          totalInflow = round2(totalInflow + line.amount);
        } else {
          outflows.push(line);
          totalOutflow = round2(totalOutflow + line.amount);
        }
      }
      inflows.sort((a, b) => b.amount - a.amount);
      outflows.sort((a, b) => b.amount - a.amount);
    }
  }

  const netCashFlow = round2(totalInflow - totalOutflow);
  return {
    from: from ?? null,
    to: to ?? null,
    openingCash: round2(openingCash),
    closingCash: round2(closingCash),
    inflows,
    outflows,
    totalInflow,
    totalOutflow,
    netCashFlow,
  };
}

router.get(
  "/reports/cash-flow",
  requireAuth,
  requireCapability("journal:read"),
  async (req, res) => {
    const from = qStr(req.query["from"]);
    const to = qStr(req.query["to"]);
    const dateErr = validateDateRange(from, to);
    if (dateErr) {
      res.status(400).json({ error: dateErr });
      return;
    }
    try {
      const report = await computeCashFlow(req.auth!.companyId, from, to);
      res.json(report);
    } catch (err) {
      req.log.error({ err }, "Failed to build cash-flow statement");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.get(
  "/reports/cash-flow/export",
  requireAuth,
  requireCapability("journal:read"),
  async (req, res) => {
    const from = qStr(req.query["from"]);
    const to = qStr(req.query["to"]);
    const dateErr = validateDateRange(from, to);
    if (dateErr) {
      res.status(400).json({ error: dateErr });
      return;
    }
    try {
      const r = await computeCashFlow(req.auth!.companyId, from, to);
      type Row = { section: string; code: string; name: string; amount: number };
      const rows: Row[] = [
        { section: "نقدية أول المدة", code: "", name: "", amount: r.openingCash },
        ...r.inflows.map((l) => ({
          section: "تدفقات داخلة",
          code: l.code,
          name: l.nameAr,
          amount: l.amount,
        })),
        ...r.outflows.map((l) => ({
          section: "تدفقات خارجة",
          code: l.code,
          name: l.nameAr,
          amount: -l.amount,
        })),
        { section: "صافي التدفق النقدي", code: "", name: "", amount: r.netCashFlow },
        { section: "نقدية آخر المدة", code: "", name: "", amount: r.closingCash },
      ];
      await exportWorkbook(res, {
        sheetName: "CashFlow",
        fileName: "cash-flow",
        columns: [
          { header: "البند", value: (x: Row) => x.section, width: 22 },
          { header: "الكود", value: (x: Row) => x.code },
          { header: "الحساب", value: (x: Row) => x.name, width: 32 },
          { header: "المبلغ", value: (x: Row) => x.amount, width: 16 },
        ],
        rows,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to export cash-flow statement");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ============================================================================
// 2) Cash forecast: current cash + expected AR inflows / AP outflows bucketed
// by how far each open invoice's due date is from today.
// ============================================================================
type ForecastBucket = {
  key: string;
  inflow: number;
  outflow: number;
  net: number;
  projectedCash: number;
};

const BUCKET_KEYS = ["overdue", "d0_30", "d31_60", "d61_90", "beyond"] as const;
type BucketKey = (typeof BUCKET_KEYS)[number];

function bucketFor(dueDate: string | null, today: string): BucketKey {
  if (!dueDate) return "beyond";
  if (dueDate < today) return "overdue";
  const days = Math.floor(
    (Date.parse(dueDate) - Date.parse(today)) / 86_400_000,
  );
  if (days <= 30) return "d0_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "beyond";
}

async function computeCashForecast(companyId: string, asOf?: string | null) {
  const today = asOf || todayStr();
  const cashIds = await cashAccountIds(companyId);
  const currentCash = round2(await cashNet(companyId, cashIds, { to: today }));

  // Open invoices: approved or partially paid, with a remaining balance.
  const open = await db
    .select({
      kind: invoicesTable.kind,
      dueDate: invoicesTable.dueDate,
      total: invoicesTable.total,
      amountPaid: invoicesTable.amountPaid,
      exchangeRate: invoicesTable.exchangeRate,
    })
    .from(invoicesTable)
    .where(
      and(
        eq(invoicesTable.companyId, companyId),
        inArray(invoicesTable.kind, ["sales", "purchase"]),
        inArray(invoicesTable.status, ["approved", "partially_paid"]),
      ),
    );

  const buckets: Record<BucketKey, { inflow: number; outflow: number }> = {
    overdue: { inflow: 0, outflow: 0 },
    d0_30: { inflow: 0, outflow: 0 },
    d31_60: { inflow: 0, outflow: 0 },
    d61_90: { inflow: 0, outflow: 0 },
    beyond: { inflow: 0, outflow: 0 },
  };

  for (const inv of open) {
    const outstanding = round2(
      (Number(inv.total) - Number(inv.amountPaid)) *
        (Number(inv.exchangeRate) || 1),
    );
    if (outstanding <= 0.005) continue;
    const b = bucketFor(inv.dueDate, today);
    if (inv.kind === "sales") buckets[b].inflow = round2(buckets[b].inflow + outstanding);
    else buckets[b].outflow = round2(buckets[b].outflow + outstanding);
  }

  let running = currentCash;
  let totalInflow = 0;
  let totalOutflow = 0;
  const rows: ForecastBucket[] = BUCKET_KEYS.map((key) => {
    const inflow = buckets[key].inflow;
    const outflow = buckets[key].outflow;
    const net = round2(inflow - outflow);
    running = round2(running + net);
    totalInflow = round2(totalInflow + inflow);
    totalOutflow = round2(totalOutflow + outflow);
    return { key, inflow, outflow, net, projectedCash: running };
  });

  return {
    asOf: today,
    currentCash,
    buckets: rows,
    totalInflow,
    totalOutflow,
    netExpected: round2(totalInflow - totalOutflow),
    projectedCash: running,
  };
}

router.get(
  "/reports/cash-forecast",
  requireAuth,
  requireCapability("journal:read"),
  async (req, res) => {
    const asOf = qStr(req.query["asOf"]);
    const dateErr = validateDateRange(asOf, null);
    if (dateErr) {
      res.status(400).json({ error: dateErr });
      return;
    }
    try {
      const report = await computeCashForecast(req.auth!.companyId, asOf);
      res.json(report);
    } catch (err) {
      req.log.error({ err }, "Failed to build cash forecast");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.get(
  "/reports/cash-forecast/export",
  requireAuth,
  requireCapability("journal:read"),
  async (req, res) => {
    const asOf = qStr(req.query["asOf"]);
    const dateErr = validateDateRange(asOf, null);
    if (dateErr) {
      res.status(400).json({ error: dateErr });
      return;
    }
    try {
      const r = await computeCashForecast(req.auth!.companyId, asOf);
      const labels: Record<string, string> = {
        overdue: "متأخرة",
        d0_30: "خلال 30 يوم",
        d31_60: "31 - 60 يوم",
        d61_90: "61 - 90 يوم",
        beyond: "أكثر من 90 يوم",
      };
      await exportWorkbook(res, {
        sheetName: "CashForecast",
        fileName: "cash-forecast",
        columns: [
          { header: "الفترة", value: (x: ForecastBucket) => labels[x.key] ?? x.key, width: 18 },
          { header: "متحصلات متوقعة", value: (x: ForecastBucket) => x.inflow, width: 18 },
          { header: "مدفوعات متوقعة", value: (x: ForecastBucket) => x.outflow, width: 18 },
          { header: "الصافي", value: (x: ForecastBucket) => x.net, width: 16 },
          { header: "الرصيد المتوقع", value: (x: ForecastBucket) => x.projectedCash, width: 18 },
        ],
        rows: r.buckets,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to export cash forecast");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ============================================================================
// 3 & 4) Sales / Purchases by product/service.
// Aggregates invoice lines of posted (approved/paid) invoices: inventory lines
// roll up per item, service/asset lines roll up per revenue/expense account.
// Amounts are converted to base currency via each invoice's exchange rate.
// ============================================================================
type ItemSalesRow = {
  groupType: "item" | "service";
  code: string;
  nameAr: string;
  nameEn: string | null;
  quantity: number;
  amount: number;
};

async function computeByItem(
  companyId: string,
  kind: "sales" | "purchase",
  from: string | null,
  to: string | null,
) {
  const conds = [
    eq(invoicesTable.companyId, companyId),
    eq(invoicesTable.kind, kind),
    inArray(invoicesTable.status, ["approved", "partially_paid", "paid"]),
  ];
  if (from) conds.push(gte(invoicesTable.date, from));
  if (to) conds.push(lte(invoicesTable.date, to));

  const lines = await db
    .select({
      lineType: invoiceLinesTable.lineType,
      itemId: invoiceLinesTable.itemId,
      accountId: invoiceLinesTable.accountId,
      quantity: invoiceLinesTable.quantity,
      lineTotal: invoiceLinesTable.lineTotal,
      exchangeRate: invoicesTable.exchangeRate,
      itemCode: inventoryItemsTable.code,
      itemNameAr: inventoryItemsTable.nameAr,
      itemNameEn: inventoryItemsTable.nameEn,
      acctCode: accountsTable.code,
      acctNameAr: accountsTable.nameAr,
      acctNameEn: accountsTable.nameEn,
    })
    .from(invoiceLinesTable)
    .innerJoin(invoicesTable, eq(invoicesTable.id, invoiceLinesTable.invoiceId))
    .leftJoin(
      inventoryItemsTable,
      eq(inventoryItemsTable.id, invoiceLinesTable.itemId),
    )
    .innerJoin(
      accountsTable,
      eq(accountsTable.id, invoiceLinesTable.accountId),
    )
    .where(and(...conds));

  const map = new Map<string, ItemSalesRow>();
  let totalQuantity = 0;
  let totalAmount = 0;
  for (const l of lines) {
    const rate = Number(l.exchangeRate) || 1;
    const qty = Number(l.quantity) || 0;
    const amount = round2((Number(l.lineTotal) || 0) * rate);
    const isItem = !!l.itemId;
    const key = isItem ? `item:${l.itemId}` : `acct:${l.accountId}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity = round2(existing.quantity + qty);
      existing.amount = round2(existing.amount + amount);
    } else {
      map.set(key, {
        groupType: isItem ? "item" : "service",
        code: isItem ? (l.itemCode ?? "") : l.acctCode,
        nameAr: isItem ? (l.itemNameAr ?? "") : l.acctNameAr,
        nameEn: isItem ? (l.itemNameEn ?? null) : l.acctNameEn,
        quantity: round2(qty),
        amount,
      });
    }
    totalQuantity = round2(totalQuantity + qty);
    totalAmount = round2(totalAmount + amount);
  }

  const rows = [...map.values()].sort((a, b) => b.amount - a.amount);
  return {
    from: from ?? null,
    to: to ?? null,
    kind,
    rows,
    totalQuantity,
    totalAmount,
  };
}

function registerByItem(slug: string, kind: "sales" | "purchase") {
  router.get(
    `/reports/${slug}`,
    requireAuth,
    requireCapability("invoices:read"),
    async (req, res) => {
      const from = qStr(req.query["from"]);
      const to = qStr(req.query["to"]);
      const dateErr = validateDateRange(from, to);
      if (dateErr) {
        res.status(400).json({ error: dateErr });
        return;
      }
      try {
        const report = await computeByItem(req.auth!.companyId, kind, from, to);
        res.json(report);
      } catch (err) {
        req.log.error({ err }, `Failed to build ${slug}`);
        res.status(500).json({ error: "حدث خطأ في الخادم" });
      }
    },
  );

  router.get(
    `/reports/${slug}/export`,
    requireAuth,
    requireCapability("invoices:read"),
    async (req, res) => {
      const from = qStr(req.query["from"]);
      const to = qStr(req.query["to"]);
      const dateErr = validateDateRange(from, to);
      if (dateErr) {
        res.status(400).json({ error: dateErr });
        return;
      }
      try {
        const r = await computeByItem(req.auth!.companyId, kind, from, to);
        await exportWorkbook(res, {
          sheetName: kind === "sales" ? "SalesByItem" : "PurchasesByItem",
          fileName: slug,
          columns: [
            {
              header: "النوع",
              value: (x: ItemSalesRow) =>
                x.groupType === "item" ? "صنف" : "خدمة",
              width: 10,
            },
            { header: "الكود", value: (x: ItemSalesRow) => x.code },
            { header: "البيان", value: (x: ItemSalesRow) => x.nameAr, width: 32 },
            { header: "الكمية", value: (x: ItemSalesRow) => x.quantity, width: 14 },
            { header: "القيمة", value: (x: ItemSalesRow) => x.amount, width: 16 },
          ],
          rows: r.rows,
        });
      } catch (err) {
        req.log.error({ err }, `Failed to export ${slug}`);
        res.status(500).json({ error: "حدث خطأ في الخادم" });
      }
    },
  );
}

registerByItem("sales-by-item", "sales");
registerByItem("purchases-by-item", "purchase");

// ============================================================================
// 5) Inventory monthly summary: per item, opening / receipts / issues /
// adjustments / closing in both quantity and value, from inventory_movements.
// ============================================================================
type InvSummaryRow = {
  itemId: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  unit: string;
  month: string;
  openingQty: number;
  openingValue: number;
  inQty: number;
  inValue: number;
  outQty: number;
  outValue: number;
  adjQty: number;
  adjValue: number;
  closingQty: number;
  closingValue: number;
};

// Apply the movement's direction to a raw (always-positive for receipt/issue,
// signed for adjustment) quantity/value.
function signedQty(type: string, quantity: number): number {
  if (type === "issue") return -Math.abs(quantity);
  if (type === "adjustment") return quantity;
  return Math.abs(quantity);
}
function signedValue(type: string, value: number): number {
  if (type === "issue") return -Math.abs(value);
  if (type === "adjustment") return value;
  return Math.abs(value);
}

// "YYYY-MM-DD" -> "YYYY-MM"
function monthKeyOf(date: string): string {
  return date.slice(0, 7);
}

// Inclusive list of "YYYY-MM" buckets between two month keys.
function listMonths(fromYM: string, toYM: string): string[] {
  const out: string[] = [];
  let [y, m] = fromYM.split("-").map(Number);
  const [ty, tm] = toYM.split("-").map(Number);
  let guard = 0;
  while ((y < ty || (y === ty && m <= tm)) && guard < 600) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
    guard++;
  }
  return out;
}

async function computeInventorySummary(
  companyId: string,
  from: string | null,
  to: string | null,
) {
  const items = await db
    .select({
      id: inventoryItemsTable.id,
      code: inventoryItemsTable.code,
      nameAr: inventoryItemsTable.nameAr,
      nameEn: inventoryItemsTable.nameEn,
      unit: inventoryItemsTable.unit,
    })
    .from(inventoryItemsTable)
    .where(eq(inventoryItemsTable.companyId, companyId))
    .orderBy(inventoryItemsTable.code);

  const moveConds = [eq(inventoryMovementsTable.companyId, companyId)];
  if (to) moveConds.push(lte(inventoryMovementsTable.date, to));
  const movements = await db
    .select({
      itemId: inventoryMovementsTable.itemId,
      date: inventoryMovementsTable.date,
      type: inventoryMovementsTable.type,
      quantity: inventoryMovementsTable.quantity,
      totalValue: inventoryMovementsTable.totalValue,
    })
    .from(inventoryMovementsTable)
    .where(and(...moveConds));

  // Group movements per item and track the overall date span so we can derive
  // a sensible month range when the caller omits from/to.
  const movByItem = new Map<string, typeof movements>();
  let minDate: string | null = null;
  let maxDate: string | null = null;
  for (const m of movements) {
    let arr = movByItem.get(m.itemId);
    if (!arr) {
      arr = [];
      movByItem.set(m.itemId, arr);
    }
    arr.push(m);
    if (!minDate || m.date < minDate) minDate = m.date;
    if (!maxDate || m.date > maxDate) maxDate = m.date;
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const effFrom = from ?? minDate ?? to ?? todayStr;
  const effToRaw = to ?? maxDate ?? from ?? todayStr;
  const effTo = effToRaw >= effFrom ? effToRaw : effFrom;
  const fromYM = monthKeyOf(effFrom);
  const toYM = monthKeyOf(effTo);
  const months = listMonths(fromYM, toYM);
  const firstMonthStart = `${fromYM}-01`;

  const rows: InvSummaryRow[] = [];
  let totalOpeningValue = 0;
  let totalInValue = 0;
  let totalOutValue = 0;
  let totalAdjValue = 0;
  let totalClosingValue = 0;

  for (const it of items) {
    const ms = movByItem.get(it.id) ?? [];

    // Opening balance carried into the first month = everything before it.
    let openingQty = 0;
    let openingValue = 0;
    for (const m of ms) {
      if (m.date < firstMonthStart) {
        openingQty += signedQty(m.type, Number(m.quantity) || 0);
        openingValue += signedValue(m.type, Number(m.totalValue) || 0);
      }
    }
    openingQty = round2(openingQty);
    openingValue = round2(openingValue);

    const itemOpeningValue = openingValue;
    let runningQty = openingQty;
    let runningValue = openingValue;
    let itemHasRows = false;

    for (const ym of months) {
      let inQty = 0;
      let inValue = 0;
      let outQty = 0;
      let outValue = 0;
      let adjQty = 0;
      let adjValue = 0;
      for (const m of ms) {
        if (monthKeyOf(m.date) !== ym) continue;
        const q = Number(m.quantity) || 0;
        const v = Number(m.totalValue) || 0;
        if (m.type === "receipt") {
          inQty += Math.abs(q);
          inValue += Math.abs(v);
        } else if (m.type === "issue") {
          outQty += Math.abs(q);
          outValue += Math.abs(v);
        } else {
          adjQty += q;
          adjValue += v;
        }
      }
      inQty = round2(inQty);
      inValue = round2(inValue);
      outQty = round2(outQty);
      outValue = round2(outValue);
      adjQty = round2(adjQty);
      adjValue = round2(adjValue);

      const monthOpeningQty = runningQty;
      const monthOpeningValue = runningValue;
      const closingQty = round2(monthOpeningQty + inQty - outQty + adjQty);
      const closingValue = round2(
        monthOpeningValue + inValue - outValue + adjValue,
      );
      runningQty = closingQty;
      runningValue = closingValue;

      const hasActivity =
        inQty !== 0 ||
        inValue !== 0 ||
        outQty !== 0 ||
        outValue !== 0 ||
        adjQty !== 0 ||
        adjValue !== 0;
      if (!hasActivity) continue;

      rows.push({
        itemId: it.id,
        code: it.code,
        nameAr: it.nameAr,
        nameEn: it.nameEn,
        unit: it.unit,
        month: ym,
        openingQty: monthOpeningQty,
        openingValue: monthOpeningValue,
        inQty,
        inValue,
        outQty,
        outValue,
        adjQty,
        adjValue,
        closingQty,
        closingValue,
      });
      itemHasRows = true;
      totalInValue = round2(totalInValue + inValue);
      totalOutValue = round2(totalOutValue + outValue);
      totalAdjValue = round2(totalAdjValue + adjValue);
    }

    const itemClosingValue = runningValue;
    if (itemHasRows || itemOpeningValue !== 0 || itemClosingValue !== 0) {
      totalOpeningValue = round2(totalOpeningValue + itemOpeningValue);
      totalClosingValue = round2(totalClosingValue + itemClosingValue);
    }
  }

  rows.sort(
    (a, b) => a.code.localeCompare(b.code) || a.month.localeCompare(b.month),
  );

  return {
    from: from ?? null,
    to: to ?? null,
    rows,
    totalOpeningValue,
    totalInValue,
    totalOutValue,
    totalAdjValue,
    totalClosingValue,
  };
}

router.get(
  "/reports/inventory-summary",
  requireAuth,
  requireCapability("inventory:read"),
  async (req, res) => {
    const from = qStr(req.query["from"]);
    const to = qStr(req.query["to"]);
    const dateErr = validateDateRange(from, to);
    if (dateErr) {
      res.status(400).json({ error: dateErr });
      return;
    }
    try {
      const report = await computeInventorySummary(
        req.auth!.companyId,
        from,
        to,
      );
      res.json(report);
    } catch (err) {
      req.log.error({ err }, "Failed to build inventory summary");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.get(
  "/reports/inventory-summary/export",
  requireAuth,
  requireCapability("inventory:read"),
  async (req, res) => {
    const from = qStr(req.query["from"]);
    const to = qStr(req.query["to"]);
    const dateErr = validateDateRange(from, to);
    if (dateErr) {
      res.status(400).json({ error: dateErr });
      return;
    }
    try {
      const r = await computeInventorySummary(req.auth!.companyId, from, to);
      await exportWorkbook(res, {
        sheetName: "InventorySummary",
        fileName: "inventory-summary",
        columns: [
          { header: "الشهر", value: (x: InvSummaryRow) => x.month, width: 10 },
          { header: "الكود", value: (x: InvSummaryRow) => x.code },
          { header: "الصنف", value: (x: InvSummaryRow) => x.nameAr, width: 28 },
          { header: "الوحدة", value: (x: InvSummaryRow) => x.unit, width: 10 },
          { header: "كمية أول", value: (x: InvSummaryRow) => x.openingQty, width: 12 },
          { header: "قيمة أول", value: (x: InvSummaryRow) => x.openingValue, width: 14 },
          { header: "كمية وارد", value: (x: InvSummaryRow) => x.inQty, width: 12 },
          { header: "قيمة وارد", value: (x: InvSummaryRow) => x.inValue, width: 14 },
          { header: "كمية صادر", value: (x: InvSummaryRow) => x.outQty, width: 12 },
          { header: "قيمة صادر", value: (x: InvSummaryRow) => x.outValue, width: 14 },
          { header: "تسوية كمية", value: (x: InvSummaryRow) => x.adjQty, width: 12 },
          { header: "تسوية قيمة", value: (x: InvSummaryRow) => x.adjValue, width: 14 },
          { header: "كمية آخر", value: (x: InvSummaryRow) => x.closingQty, width: 12 },
          { header: "قيمة آخر", value: (x: InvSummaryRow) => x.closingValue, width: 14 },
        ],
        rows: r.rows,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to export inventory summary");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
