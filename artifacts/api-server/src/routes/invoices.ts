import { Router } from "express";
import { and, eq, inArray, gte, lte, asc, desc, sql } from "drizzle-orm";
import {
  db,
  invoicesTable,
  invoiceLinesTable,
  customersTable,
  suppliersTable,
  accountsTable,
  taxesTable,
  inventoryItemsTable,
  inventoryMovementsTable,
  fixedAssetsTable,
  companiesTable,
  costCentersTable,
  journalEntriesTable,
  paymentAllocationsTable,
  paymentsTable,
  type Invoice,
  type InvoiceLine,
} from "@workspace/db";
import { CreateInvoiceBody, UpdateInvoiceBody } from "@workspace/api-zod";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import { safeAudit } from "../lib/audit";
import { generateEntityCode } from "../lib/codes";
import {
  createDraftJournalEntry,
  lockCompanyEntryNo,
} from "../lib/journal-posting";
import { computeMovement, round2, round4 } from "../lib/inventory-posting";
import { exportWorkbook } from "../lib/excel";
import { handleXlsxUpload, parseSheet, cellStr, cellNum } from "../lib/excel";
import ExcelJS from "exceljs";

const router = Router();

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = typeof db | Tx;

// Carries an HTTP status + Arabic message out of the approve transaction so
// validation failures inside the locked tx map back to the right response.
class ApproveError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function loadBaseCurrency(companyId: string): Promise<string> {
  const [company] = await db
    .select({ baseCurrency: companiesTable.baseCurrency })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);
  return (company?.baseCurrency || "EGP").toUpperCase();
}

const MONEY_EPS = 0.005;
const todayISO = () => new Date().toISOString().slice(0, 10);

type InvoiceKind = "sales" | "purchase" | "sales_return" | "purchase_return";

// The two "return" documents are credit/debit notes. They reuse the invoice
// machinery but post a REVERSED journal entry against the same control account.
function isReturnKind(kind: string): boolean {
  return kind === "sales_return" || kind === "purchase_return";
}

// Maps any invoice/return kind to its underlying side: a sales_return is a
// customer document (sales side), a purchase_return is a supplier document.
function baseSide(kind: string): "sales" | "purchase" {
  return kind === "sales" || kind === "sales_return" ? "sales" : "purchase";
}

// The CodeEntity used to allocate the human-facing code (SI/PI/CN/DN).
function codeEntityFor(
  kind: string,
): "sales_invoice" | "purchase_invoice" | "sales_return" | "purchase_return" {
  if (kind === "sales") return "sales_invoice";
  if (kind === "purchase") return "purchase_invoice";
  return kind as "sales_return" | "purchase_return";
}

function docLabelAr(kind: string): string {
  switch (kind) {
    case "sales":
      return "فاتورة مبيعات";
    case "purchase":
      return "فاتورة مشتريات";
    case "sales_return":
      return "إشعار خصم";
    case "purchase_return":
      return "إشعار إضافة";
    default:
      return "مستند";
  }
}

// Looks up the human code of an invoice's related (original) invoice, if any.
async function relatedCodeOf(
  inv: Invoice,
  companyId: string,
  client: DbOrTx = db,
): Promise<string | null> {
  if (!inv.relatedInvoiceId) return null;
  const [r] = await client
    .select({ code: invoicesTable.code })
    .from(invoicesTable)
    .where(
      and(
        eq(invoicesTable.id, inv.relatedInvoiceId),
        eq(invoicesTable.companyId, companyId),
      ),
    )
    .limit(1);
  return r?.code ?? null;
}

// Validates that a credit/debit note's source invoice is a legitimate, posted
// document of the matching side, party, and currency, and that the note does
// not exceed the original total. Returns the related id or an Arabic error.
async function validateReturnSource(
  kind: string,
  relatedInvoiceId: string | null | undefined,
  partyId: string,
  currency: string | null,
  total: number,
  companyId: string,
  client: DbOrTx = db,
): Promise<{ relatedInvoiceId: string } | { error: string }> {
  if (!relatedInvoiceId)
    return { error: "يجب اختيار الفاتورة الأصلية المرتبطة بالإشعار" };
  const [related] = await client
    .select()
    .from(invoicesTable)
    .where(
      and(
        eq(invoicesTable.id, relatedInvoiceId),
        eq(invoicesTable.companyId, companyId),
      ),
    )
    .limit(1);
  if (!related) return { error: "الفاتورة الأصلية غير موجودة" };
  if (related.kind !== baseSide(kind))
    return { error: "نوع الفاتورة الأصلية غير مطابق لنوع الإشعار" };
  if (
    related.status !== "approved" &&
    related.status !== "partially_paid" &&
    related.status !== "paid"
  )
    return { error: "لا يمكن إنشاء إشعار إلا من فاتورة معتمدة" };
  const relatedPartyId = related.customerId ?? related.supplierId;
  if (relatedPartyId !== partyId)
    return { error: "طرف الإشعار يجب أن يطابق طرف الفاتورة الأصلية" };
  if ((related.currency ?? null) !== (currency ?? null))
    return { error: "عملة الإشعار يجب أن تطابق عملة الفاتورة الأصلية" };
  if (total > Number(related.total) + MONEY_EPS)
    return { error: "قيمة الإشعار لا يمكن أن تتجاوز قيمة الفاتورة الأصلية" };
  return { relatedInvoiceId };
}

// Computes a single line's net total (qty*price - discount) and tax amount from
// the supplied tax rate (percent). All in the transaction currency.
function lineMoney(
  quantity: number,
  unitPrice: number,
  discount: number,
  taxRate: number,
) {
  const lineTotal = round2(quantity * unitPrice - discount);
  const taxAmount = round2((lineTotal * taxRate) / 100);
  return { lineTotal, taxAmount };
}

// Verifies every account id exists, belongs to the company, and is a leaf
// (non-group) account. Returns an Arabic error message when invalid.
async function validateLeafAccounts(
  accountIds: string[],
  companyId: string,
  client: DbOrTx = db,
): Promise<string | null> {
  const ids = [...new Set(accountIds.filter(Boolean))];
  if (ids.length === 0) return null;
  const rows = await client
    .select({ id: accountsTable.id, isGroup: accountsTable.isGroup })
    .from(accountsTable)
    .where(
      and(eq(accountsTable.companyId, companyId), inArray(accountsTable.id, ids)),
    );
  const map = new Map(rows.map((r) => [r.id, r]));
  for (const id of ids) {
    const acc = map.get(id);
    if (!acc) return "أحد الحسابات المحددة غير موجود";
    if (acc.isGroup) return "لا يمكن الترحيل إلى حساب رئيسي";
  }
  return null;
}

// Verifies every cost-center id belongs to the company. Returns an Arabic error
// message when any id is missing or cross-tenant.
async function validateCostCenters(
  costCenterIds: (string | null | undefined)[],
  companyId: string,
): Promise<string | null> {
  const ids = [...new Set(costCenterIds.filter((x): x is string => !!x))];
  if (ids.length === 0) return null;
  const rows = await db
    .select({ id: costCentersTable.id })
    .from(costCentersTable)
    .where(
      and(
        eq(costCentersTable.companyId, companyId),
        inArray(costCentersTable.id, ids),
      ),
    );
  if (rows.length !== ids.length) return "مركز التكلفة المحدد غير موجود";
  return null;
}

function isOverdue(inv: Invoice): boolean {
  if (inv.status !== "approved" && inv.status !== "partially_paid") return false;
  if (!inv.dueDate) return false;
  return inv.dueDate < todayISO();
}

function toListItem(
  inv: Invoice,
  partyName: string | null,
  relatedCode: string | null = null,
) {
  const total = Number(inv.total);
  const amountPaid = Number(inv.amountPaid);
  return {
    id: inv.id,
    kind: inv.kind as InvoiceKind,
    invoiceNo: inv.invoiceNo,
    code: inv.code,
    relatedInvoiceId: inv.relatedInvoiceId,
    relatedCode,
    date: inv.date,
    dueDate: inv.dueDate,
    partyId: inv.customerId ?? inv.supplierId,
    partyName,
    status: inv.status as
      | "draft"
      | "approved"
      | "partially_paid"
      | "paid"
      | "cancelled",
    overdue: isOverdue(inv),
    currency: inv.currency,
    exchangeRate: Number(inv.exchangeRate),
    subtotal: Number(inv.subtotal),
    discountTotal: Number(inv.discountTotal),
    taxTotal: Number(inv.taxTotal),
    total,
    amountPaid,
    balance: round2(total - amountPaid),
    journalEntryId: inv.journalEntryId,
    eInvoiceRequired: inv.eInvoiceRequired,
    eInvoiceStatus: inv.eInvoiceStatus,
    eInvoiceUuid: inv.eInvoiceUuid,
    eInvoiceSubmissionDate: inv.eInvoiceSubmissionDate
      ? inv.eInvoiceSubmissionDate.toISOString()
      : null,
    eInvoiceError: inv.eInvoiceError,
    createdAt: inv.createdAt.toISOString(),
  };
}

function toLine(l: InvoiceLine) {
  return {
    id: l.id,
    lineNo: l.lineNo,
    lineType: l.lineType as "service" | "inventory" | "fixed_asset",
    description: l.description,
    accountId: l.accountId,
    itemId: l.itemId,
    warehouse: l.warehouse,
    cogsAccountId: l.cogsAccountId,
    quantity: Number(l.quantity),
    unitPrice: Number(l.unitPrice),
    discount: Number(l.discount),
    taxId: l.taxId,
    taxAmount: Number(l.taxAmount),
    lineTotal: Number(l.lineTotal),
    costCenterId: l.costCenterId,
    assetNameAr: l.assetNameAr,
    assetNameEn: l.assetNameEn,
    assetUsefulLifeMonths: l.assetUsefulLifeMonths,
    assetSalvageValue:
      l.assetSalvageValue === null ? null : Number(l.assetSalvageValue),
    assetAccumulatedAccountId: l.assetAccumulatedAccountId,
    assetExpenseAccountId: l.assetExpenseAccountId,
    fixedAssetId: l.fixedAssetId,
  };
}

function toDetail(
  inv: Invoice,
  partyName: string | null,
  lines: InvoiceLine[],
  relatedCode: string | null = null,
) {
  return {
    ...toListItem(inv, partyName, relatedCode),
    notes: inv.notes,
    costCenterId: inv.costCenterId,
    lines: lines.map(toLine),
  };
}

// Resolves the party (customer or supplier) for an invoice kind and returns its
// id, display name, and subsidiary account id — or an Arabic error message.
async function resolveParty(
  kind: "sales" | "purchase",
  customerId: string | null | undefined,
  supplierId: string | null | undefined,
  companyId: string,
  client: DbOrTx = db,
): Promise<
  { id: string; name: string; accountId: string } | { error: string }
> {
  if (kind === "sales") {
    if (!customerId) return { error: "يجب اختيار العميل" };
    const [c] = await client
      .select()
      .from(customersTable)
      .where(
        and(
          eq(customersTable.id, customerId),
          eq(customersTable.companyId, companyId),
        ),
      )
      .limit(1);
    if (!c) return { error: "العميل غير موجود" };
    return { id: c.id, name: c.nameAr, accountId: c.accountId };
  }
  if (!supplierId) return { error: "يجب اختيار المورد" };
  const [s] = await client
    .select()
    .from(suppliersTable)
    .where(
      and(
        eq(suppliersTable.id, supplierId),
        eq(suppliersTable.companyId, companyId),
      ),
    )
    .limit(1);
  if (!s) return { error: "المورد غير موجود" };
  return { id: s.id, name: s.nameAr, accountId: s.accountId };
}

// Allocates the next per-(company, kind) invoice number under an advisory lock so
// concurrent creates of the same kind can't mint duplicate numbers.
async function nextInvoiceNo(
  tx: Tx,
  companyId: string,
  kind: string,
): Promise<number> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${companyId + ":inv:" + kind}))`,
  );
  const [{ maxNo }] = await tx
    .select({ maxNo: sql<number>`coalesce(max(${invoicesTable.invoiceNo}), 0)` })
    .from(invoicesTable)
    .where(
      and(eq(invoicesTable.companyId, companyId), eq(invoicesTable.kind, kind)),
    );
  return Number(maxNo) + 1;
}

// ---- List ----
router.get(
  "/invoices",
  requireAuth,
  requireCapability("invoices:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const kind = req.query["kind"];
    if (
      kind !== "sales" &&
      kind !== "purchase" &&
      kind !== "sales_return" &&
      kind !== "purchase_return"
    ) {
      res.status(400).json({ error: "نوع الفاتورة غير صحيح" });
      return;
    }
    try {
      const conditions = [
        eq(invoicesTable.companyId, companyId),
        eq(invoicesTable.kind, kind),
      ];
      const status = req.query["status"];
      if (typeof status === "string" && status) {
        conditions.push(eq(invoicesTable.status, status));
      }
      const dateFrom = req.query["dateFrom"];
      if (typeof dateFrom === "string" && dateFrom) {
        conditions.push(gte(invoicesTable.date, dateFrom));
      }
      const dateTo = req.query["dateTo"];
      if (typeof dateTo === "string" && dateTo) {
        conditions.push(lte(invoicesTable.date, dateTo));
      }
      const currency = req.query["currency"];
      if (typeof currency === "string" && currency) {
        conditions.push(eq(invoicesTable.currency, currency));
      }
      const customerId = req.query["customerId"];
      if (typeof customerId === "string" && customerId) {
        conditions.push(eq(invoicesTable.customerId, customerId));
      }
      const supplierId = req.query["supplierId"];
      if (typeof supplierId === "string" && supplierId) {
        conditions.push(eq(invoicesTable.supplierId, supplierId));
      }
      const rows = await db
        .select()
        .from(invoicesTable)
        .where(and(...conditions))
        .orderBy(desc(invoicesTable.invoiceNo));
      const names = await partyNames(rows, companyId);
      const relatedCodes = await relatedCodeMap(rows, companyId);
      const search = String(req.query["search"] ?? "").trim().toLowerCase();
      let filtered = rows;
      if (search) {
        filtered = rows.filter((r) => {
          const name = names.get(r.customerId ?? r.supplierId ?? "") ?? "";
          return (
            name.toLowerCase().includes(search) ||
            String(r.invoiceNo).includes(search) ||
            (r.code ?? "").toLowerCase().includes(search)
          );
        });
      }
      res.json(
        filtered.map((r) =>
          toListItem(
            r,
            names.get(r.customerId ?? r.supplierId ?? "") ?? null,
            r.relatedInvoiceId
              ? (relatedCodes.get(r.relatedInvoiceId) ?? null)
              : null,
          ),
        ),
      );
    } catch (err) {
      req.log.error({ err }, "Failed to list invoices");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// Builds a partyId→name map for a set of invoices (customers + suppliers).
async function partyNames(
  rows: Invoice[],
  companyId: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const custIds = [
    ...new Set(rows.map((r) => r.customerId).filter((x): x is string => !!x)),
  ];
  const suppIds = [
    ...new Set(rows.map((r) => r.supplierId).filter((x): x is string => !!x)),
  ];
  if (custIds.length) {
    const cs = await db
      .select({ id: customersTable.id, name: customersTable.nameAr })
      .from(customersTable)
      .where(
        and(
          eq(customersTable.companyId, companyId),
          inArray(customersTable.id, custIds),
        ),
      );
    for (const c of cs) map.set(c.id, c.name);
  }
  if (suppIds.length) {
    const ss = await db
      .select({ id: suppliersTable.id, name: suppliersTable.nameAr })
      .from(suppliersTable)
      .where(
        and(
          eq(suppliersTable.companyId, companyId),
          inArray(suppliersTable.id, suppIds),
        ),
      );
    for (const s of ss) map.set(s.id, s.name);
  }
  return map;
}

// Builds a relatedInvoiceId→code map for the credit/debit notes in a set of rows.
async function relatedCodeMap(
  rows: Invoice[],
  companyId: string,
): Promise<Map<string, string | null>> {
  const ids = [
    ...new Set(
      rows.map((r) => r.relatedInvoiceId).filter((x): x is string => !!x),
    ),
  ];
  if (ids.length === 0) return new Map();
  const found = await db
    .select({ id: invoicesTable.id, code: invoicesTable.code })
    .from(invoicesTable)
    .where(
      and(
        eq(invoicesTable.companyId, companyId),
        inArray(invoicesTable.id, ids),
      ),
    );
  return new Map(found.map((r) => [r.id, r.code]));
}

// ---- Excel export -------------------------------------------------------
// Streams the company's invoices (of one kind) as an .xlsx workbook. Export
// only: invoices post to the ledger, so there is no import counterpart.
// Registered BEFORE the GET /invoices/:id param route so Express matches it.
router.get(
  "/invoices/export",
  requireAuth,
  requireCapability("invoices:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const kind = req.query["kind"];
    if (kind !== "sales" && kind !== "purchase") {
      res.status(400).json({ error: "نوع الفاتورة غير صحيح" });
      return;
    }
    try {
      const rows = await db
        .select()
        .from(invoicesTable)
        .where(
          and(
            eq(invoicesTable.companyId, companyId),
            eq(invoicesTable.kind, kind),
          ),
        )
        .orderBy(desc(invoicesTable.invoiceNo));
      const names = await partyNames(rows, companyId);
      await exportWorkbook(res, {
        sheetName: kind === "sales" ? "SalesInvoices" : "PurchaseInvoices",
        fileName: kind === "sales" ? "sales-invoices-export" : "purchase-invoices-export",
        columns: [
          { header: "invoiceNo", value: (r) => r.invoiceNo },
          { header: "date", value: (r) => r.date },
          { header: "dueDate", value: (r) => r.dueDate ?? "" },
          {
            header: "party",
            value: (r) => names.get(r.customerId ?? r.supplierId ?? "") ?? "",
          },
          { header: "status", value: (r) => r.status },
          { header: "currency", value: (r) => r.currency ?? "" },
          { header: "exchangeRate", value: (r) => Number(r.exchangeRate) },
          { header: "subtotal", value: (r) => Number(r.subtotal) },
          { header: "discountTotal", value: (r) => Number(r.discountTotal) },
          { header: "taxTotal", value: (r) => Number(r.taxTotal) },
          { header: "total", value: (r) => Number(r.total) },
          { header: "amountPaid", value: (r) => Number(r.amountPaid) },
          {
            header: "balance",
            value: (r) => round2(Number(r.total) - Number(r.amountPaid)),
          },
        ],
        rows,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to export invoices");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Get one with lines ----
router.get(
  "/invoices/:id",
  requireAuth,
  requireCapability("invoices:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const id = req.params["id"] as string;
    try {
      const inv = await loadInvoice(id, companyId);
      if (!inv) {
        res.status(404).json({ error: "الفاتورة غير موجودة" });
        return;
      }
      const lines = await db
        .select()
        .from(invoiceLinesTable)
        .where(eq(invoiceLinesTable.invoiceId, id))
        .orderBy(asc(invoiceLinesTable.lineNo));
      const names = await partyNames([inv], companyId);
      const relatedCode = await relatedCodeOf(inv, companyId);
      res.json(
        toDetail(
          inv,
          names.get(inv.customerId ?? inv.supplierId ?? "") ?? null,
          lines,
          relatedCode,
        ),
      );
    } catch (err) {
      req.log.error({ err }, "Failed to get invoice");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

async function loadInvoice(
  id: string,
  companyId: string,
): Promise<Invoice | null> {
  const [row] = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.companyId, companyId)))
    .limit(1);
  return row ?? null;
}

// Validates the line shape per lineType and returns either prepared line values
// (with computed totals) or an Arabic error message. Requires a tax-rate lookup.
type PreparedLine = {
  lineNo: number;
  lineType: "service" | "inventory" | "fixed_asset";
  description: string | null;
  accountId: string;
  itemId: string | null;
  warehouse: string | null;
  cogsAccountId: string | null;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxId: string | null;
  taxAmount: number;
  lineTotal: number;
  costCenterId: string | null;
  assetNameAr: string | null;
  assetNameEn: string | null;
  assetUsefulLifeMonths: number | null;
  assetSalvageValue: number | null;
  assetAccumulatedAccountId: string | null;
  assetExpenseAccountId: string | null;
};

type IncomingLine = {
  lineType: "service" | "inventory" | "fixed_asset";
  description?: string | null;
  accountId: string;
  itemId?: string | null;
  warehouse?: string | null;
  cogsAccountId?: string | null;
  quantity: number;
  unitPrice: number;
  discount?: number | null;
  taxId?: string | null;
  costCenterId?: string | null;
  assetNameAr?: string | null;
  assetNameEn?: string | null;
  assetUsefulLifeMonths?: number | null;
  assetSalvageValue?: number | null;
  assetAccumulatedAccountId?: string | null;
  assetExpenseAccountId?: string | null;
};

function prepareLines(
  kind: "sales" | "purchase",
  lines: IncomingLine[],
  taxRates: Map<string, number>,
):
  | { lines: PreparedLine[]; totals: ReturnType<typeof emptyTotals> }
  | { error: string } {
  const out: PreparedLine[] = [];
  const totals = emptyTotals();
  let lineNo = 0;
  for (const l of lines) {
    lineNo += 1;
    if (l.quantity <= 0) return { error: "الكمية يجب أن تكون أكبر من صفر" };
    const discount = l.discount ?? 0;
    const taxRate = l.taxId ? (taxRates.get(l.taxId) ?? null) : 0;
    if (taxRate === null) return { error: "الضريبة المحددة غير موجودة" };
    const { lineTotal, taxAmount } = lineMoney(
      l.quantity,
      l.unitPrice,
      discount,
      taxRate,
    );
    if (lineTotal < 0) return { error: "إجمالي السطر لا يمكن أن يكون سالبًا" };

    if (l.lineType === "inventory") {
      if (!l.itemId) return { error: "يجب اختيار صنف للسطر المخزني" };
      if (kind === "sales" && !l.cogsAccountId)
        return { error: "يجب تحديد حساب تكلفة المبيعات للسطر المخزني" };
    }
    if (l.lineType === "fixed_asset") {
      if (kind !== "purchase")
        return { error: "سطر الأصل الثابت متاح في فواتير المشتريات فقط" };
      if (!l.assetAccumulatedAccountId || !l.assetExpenseAccountId)
        return { error: "يجب تحديد حسابات مجمع الإهلاك ومصروف الإهلاك" };
      if (!l.assetUsefulLifeMonths || l.assetUsefulLifeMonths < 1)
        return { error: "يجب تحديد العمر الإنتاجي للأصل بالأشهر" };
    }

    out.push({
      lineNo,
      lineType: l.lineType,
      description: l.description ?? null,
      accountId: l.accountId,
      itemId: l.itemId ?? null,
      warehouse: l.warehouse ?? null,
      cogsAccountId: l.cogsAccountId ?? null,
      quantity: round4(l.quantity),
      unitPrice: round2(l.unitPrice),
      discount: round2(discount),
      taxId: l.taxId ?? null,
      taxAmount,
      lineTotal,
      costCenterId: l.costCenterId ?? null,
      assetNameAr: l.assetNameAr ?? null,
      assetNameEn: l.assetNameEn ?? null,
      assetUsefulLifeMonths: l.assetUsefulLifeMonths ?? null,
      assetSalvageValue: l.assetSalvageValue ?? null,
      assetAccumulatedAccountId: l.assetAccumulatedAccountId ?? null,
      assetExpenseAccountId: l.assetExpenseAccountId ?? null,
    });
    totals.subtotal = round2(totals.subtotal + l.quantity * l.unitPrice);
    totals.discountTotal = round2(totals.discountTotal + discount);
    totals.taxTotal = round2(totals.taxTotal + taxAmount);
    totals.total = round2(totals.total + lineTotal + taxAmount);
  }
  return { lines: out, totals };
}

function emptyTotals() {
  return { subtotal: 0, discountTotal: 0, taxTotal: 0, total: 0 };
}

// Loads the tax rates for a company so line tax amounts can be computed.
async function loadTaxRates(companyId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ id: taxesTable.id, rate: taxesTable.rate })
    .from(taxesTable)
    .where(eq(taxesTable.companyId, companyId));
  return new Map(rows.map((r) => [r.id, Number(r.rate)]));
}

// ---- Create draft ----
router.post(
  "/invoices",
  requireAuth,
  requireCapability("invoices:create"),
  async (req, res) => {
    const parsed = CreateInvoiceBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const d = parsed.data;
    if (d.lines.length === 0) {
      res.status(400).json({ error: "يجب إضافة سطر واحد على الأقل" });
      return;
    }
    try {
      const side = baseSide(d.kind);
      const isReturn = isReturnKind(d.kind);
      if (isReturn && d.lines.some((l) => l.lineType !== "service")) {
        res.status(400).json({
          error: "إشعارات الخصم/الإضافة تدعم بنود الخدمات فقط حاليًا",
        });
        return;
      }
      const party = await resolveParty(
        side,
        d.customerId,
        d.supplierId,
        companyId,
      );
      if ("error" in party) {
        res.status(400).json({ error: party.error });
        return;
      }
      const taxRates = await loadTaxRates(companyId);
      const prep = prepareLines(side, d.lines as IncomingLine[], taxRates);
      if ("error" in prep) {
        res.status(400).json({ error: prep.error });
        return;
      }
      let relatedInvoiceId: string | null = null;
      if (isReturn) {
        const rel = await validateReturnSource(
          d.kind,
          d.relatedInvoiceId,
          party.id,
          d.currency ?? null,
          prep.totals.total,
          companyId,
        );
        if ("error" in rel) {
          res.status(400).json({ error: rel.error });
          return;
        }
        relatedInvoiceId = rel.relatedInvoiceId;
      }
      const ccErr = await validateCostCenters(
        [d.costCenterId, ...prep.lines.map((l) => l.costCenterId)],
        companyId,
      );
      if (ccErr) {
        res.status(400).json({ error: ccErr });
        return;
      }
      const created = await db.transaction(async (tx) => {
        const invoiceNo = await nextInvoiceNo(tx, companyId, d.kind);
        const code = await generateEntityCode(
          tx,
          companyId,
          codeEntityFor(d.kind),
          d.date,
        );
        const [inv] = await tx
          .insert(invoicesTable)
          .values({
            companyId,
            kind: d.kind,
            invoiceNo,
            code,
            relatedInvoiceId,
            date: d.date,
            dueDate: d.dueDate ?? null,
            customerId: side === "sales" ? party.id : null,
            supplierId: side === "purchase" ? party.id : null,
            costCenterId: d.costCenterId ?? null,
            currency: d.currency ?? null,
            exchangeRate: String(d.exchangeRate ?? 1),
            status: "draft",
            notes: d.notes ?? null,
            subtotal: String(prep.totals.subtotal),
            discountTotal: String(prep.totals.discountTotal),
            taxTotal: String(prep.totals.taxTotal),
            total: String(prep.totals.total),
            amountPaid: "0",
            createdBy: req.auth!.userId,
          })
          .returning();
        await tx.insert(invoiceLinesTable).values(
          prep.lines.map((l) => ({
            invoiceId: inv!.id,
            companyId,
            lineNo: l.lineNo,
            lineType: l.lineType,
            description: l.description,
            accountId: l.accountId,
            itemId: l.itemId,
            warehouse: l.warehouse,
            cogsAccountId: l.cogsAccountId,
            quantity: String(l.quantity),
            unitPrice: String(l.unitPrice),
            discount: String(l.discount),
            taxId: l.taxId,
            taxAmount: String(l.taxAmount),
            lineTotal: String(l.lineTotal),
            costCenterId: l.costCenterId,
            assetNameAr: l.assetNameAr,
            assetNameEn: l.assetNameEn,
            assetUsefulLifeMonths: l.assetUsefulLifeMonths,
            assetSalvageValue:
              l.assetSalvageValue === null ? null : String(l.assetSalvageValue),
            assetAccumulatedAccountId: l.assetAccumulatedAccountId,
            assetExpenseAccountId: l.assetExpenseAccountId,
          })),
        );
        return inv!;
      });
      const lines = await db
        .select()
        .from(invoiceLinesTable)
        .where(eq(invoiceLinesTable.invoiceId, created.id))
        .orderBy(asc(invoiceLinesTable.lineNo));
      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "create",
          entity: codeEntityFor(created.kind),
          entityId: created.id,
          entityLabel: `${docLabelAr(created.kind)} #${created.invoiceNo}`,
          newValue: {
            invoiceNo: created.invoiceNo,
            date: created.date,
            total: created.total,
            status: created.status,
          },
        },
        req.log,
      );
      const relatedCode = await relatedCodeOf(created, companyId);
      res
        .status(201)
        .json(toDetail(created, party.name, lines, relatedCode));
    } catch (err) {
      req.log.error({ err }, "Failed to create invoice");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Update draft ----
router.patch(
  "/invoices/:id",
  requireAuth,
  requireCapability("invoices:update"),
  async (req, res) => {
    const parsed = UpdateInvoiceBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const id = req.params["id"] as string;
    const d = parsed.data;
    if (d.lines.length === 0) {
      res.status(400).json({ error: "يجب إضافة سطر واحد على الأقل" });
      return;
    }
    try {
      const inv = await loadInvoice(id, companyId);
      if (!inv) {
        res.status(404).json({ error: "الفاتورة غير موجودة" });
        return;
      }
      if (inv.status !== "draft") {
        res.status(400).json({ error: "لا يمكن تعديل فاتورة معتمدة" });
        return;
      }
      const side = baseSide(d.kind);
      const isReturn = isReturnKind(d.kind);
      if (isReturn && d.lines.some((l) => l.lineType !== "service")) {
        res.status(400).json({
          error: "إشعارات الخصم/الإضافة تدعم بنود الخدمات فقط حاليًا",
        });
        return;
      }
      const party = await resolveParty(
        side,
        d.customerId,
        d.supplierId,
        companyId,
      );
      if ("error" in party) {
        res.status(400).json({ error: party.error });
        return;
      }
      const taxRates = await loadTaxRates(companyId);
      const prep = prepareLines(side, d.lines as IncomingLine[], taxRates);
      if ("error" in prep) {
        res.status(400).json({ error: prep.error });
        return;
      }
      let relatedInvoiceId: string | null = null;
      if (isReturn) {
        const rel = await validateReturnSource(
          d.kind,
          d.relatedInvoiceId,
          party.id,
          d.currency ?? null,
          prep.totals.total,
          companyId,
        );
        if ("error" in rel) {
          res.status(400).json({ error: rel.error });
          return;
        }
        relatedInvoiceId = rel.relatedInvoiceId;
      }
      const ccErr = await validateCostCenters(
        [d.costCenterId, ...prep.lines.map((l) => l.costCenterId)],
        companyId,
      );
      if (ccErr) {
        res.status(400).json({ error: ccErr });
        return;
      }
      const updated = await db.transaction(async (tx) => {
        // Lock + re-check draft status inside the tx so an approve that commits
        // between the pre-tx read and here can't be silently overwritten.
        const [locked] = await tx
          .select({ status: invoicesTable.status })
          .from(invoicesTable)
          .where(
            and(
              eq(invoicesTable.id, id),
              eq(invoicesTable.companyId, companyId),
            ),
          )
          .for("update")
          .limit(1);
        if (!locked) throw new ApproveError(404, "الفاتورة غير موجودة");
        if (locked.status !== "draft")
          throw new ApproveError(400, "لا يمكن تعديل فاتورة معتمدة");
        const [row] = await tx
          .update(invoicesTable)
          .set({
            kind: d.kind,
            relatedInvoiceId,
            date: d.date,
            dueDate: d.dueDate ?? null,
            customerId: side === "sales" ? party.id : null,
            supplierId: side === "purchase" ? party.id : null,
            costCenterId: d.costCenterId ?? null,
            currency: d.currency ?? null,
            exchangeRate: String(d.exchangeRate ?? 1),
            notes: d.notes ?? null,
            subtotal: String(prep.totals.subtotal),
            discountTotal: String(prep.totals.discountTotal),
            taxTotal: String(prep.totals.taxTotal),
            total: String(prep.totals.total),
          })
          .where(
            and(
              eq(invoicesTable.id, id),
              eq(invoicesTable.companyId, companyId),
            ),
          )
          .returning();
        await tx
          .delete(invoiceLinesTable)
          .where(eq(invoiceLinesTable.invoiceId, id));
        await tx.insert(invoiceLinesTable).values(
          prep.lines.map((l) => ({
            invoiceId: id,
            companyId,
            lineNo: l.lineNo,
            lineType: l.lineType,
            description: l.description,
            accountId: l.accountId,
            itemId: l.itemId,
            warehouse: l.warehouse,
            cogsAccountId: l.cogsAccountId,
            quantity: String(l.quantity),
            unitPrice: String(l.unitPrice),
            discount: String(l.discount),
            taxId: l.taxId,
            taxAmount: String(l.taxAmount),
            lineTotal: String(l.lineTotal),
            costCenterId: l.costCenterId,
            assetNameAr: l.assetNameAr,
            assetNameEn: l.assetNameEn,
            assetUsefulLifeMonths: l.assetUsefulLifeMonths,
            assetSalvageValue:
              l.assetSalvageValue === null ? null : String(l.assetSalvageValue),
            assetAccumulatedAccountId: l.assetAccumulatedAccountId,
            assetExpenseAccountId: l.assetExpenseAccountId,
          })),
        );
        return row!;
      });
      const lines = await db
        .select()
        .from(invoiceLinesTable)
        .where(eq(invoiceLinesTable.invoiceId, id))
        .orderBy(asc(invoiceLinesTable.lineNo));
      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "update",
          entity: codeEntityFor(updated.kind),
          entityId: updated.id,
          entityLabel: `${docLabelAr(updated.kind)} #${updated.invoiceNo}`,
          oldValue: { total: inv.total, status: inv.status },
          newValue: { total: updated.total, status: updated.status },
        },
        req.log,
      );
      const relatedCode = await relatedCodeOf(updated, companyId);
      res.json(toDetail(updated, party.name, lines, relatedCode));
    } catch (err) {
      if (err instanceof ApproveError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      req.log.error({ err }, "Failed to update invoice");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Delete draft ----
router.delete(
  "/invoices/:id",
  requireAuth,
  requireCapability("invoices:delete"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const id = req.params["id"] as string;
    try {
      const inv = await loadInvoice(id, companyId);
      if (!inv) {
        res.status(404).json({ error: "الفاتورة غير موجودة" });
        return;
      }
      if (inv.status !== "draft") {
        res.status(400).json({ error: "لا يمكن حذف فاتورة معتمدة" });
        return;
      }
      // Guard the delete on status='draft' so a concurrent approve that commits
      // first is never silently deleted (the posted JE/stock would be orphaned).
      const deleted = await db
        .delete(invoicesTable)
        .where(
          and(
            eq(invoicesTable.id, id),
            eq(invoicesTable.companyId, companyId),
            eq(invoicesTable.status, "draft"),
          ),
        )
        .returning({ id: invoicesTable.id });
      if (deleted.length === 0) {
        res.status(400).json({ error: "لا يمكن حذف فاتورة معتمدة" });
        return;
      }
      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "delete",
          entity: codeEntityFor(inv.kind),
          entityId: inv.id,
          entityLabel: `${docLabelAr(inv.kind)} #${inv.invoiceNo}`,
          oldValue: { invoiceNo: inv.invoiceNo, status: inv.status },
        },
        req.log,
      );
      res.json({ status: "ok" });
    } catch (err) {
      req.log.error({ err }, "Failed to delete invoice");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Approve + post one balanced journal entry ----
router.post(
  "/invoices/:id/approve",
  requireAuth,
  requireCapability("invoices:update"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const id = req.params["id"] as string;
    try {
      const baseCurrency = await loadBaseCurrency(companyId);
      const { result, partyName } = await db.transaction(async (tx) => {
        // Lock the invoice row FIRST, then read ALL posting inputs inside the
        // tx so a concurrent draft edit/delete can't change lines/party/rate
        // between validation and posting (approve-vs-edit race). The lock also
        // serializes two concurrent approvals (double-approve race).
        const [inv] = await tx
          .select()
          .from(invoicesTable)
          .where(
            and(
              eq(invoicesTable.id, id),
              eq(invoicesTable.companyId, companyId),
            ),
          )
          .for("update")
          .limit(1);
        if (!inv) throw new ApproveError(404, "الفاتورة غير موجودة");
        if (inv.status !== "draft")
          throw new ApproveError(400, "الفاتورة معتمدة بالفعل");

        // Credit/Debit notes (returns) post a self-contained REVERSED entry and
        // never touch inventory/fixed assets (service lines only in v1), so they
        // get a dedicated, simpler posting branch.
        if (isReturnKind(inv.kind)) {
          const rLines = await tx
            .select()
            .from(invoiceLinesTable)
            .where(eq(invoiceLinesTable.invoiceId, id))
            .orderBy(asc(invoiceLinesTable.lineNo));
          if (rLines.length === 0)
            throw new ApproveError(400, "لا يمكن اعتماد إشعار بدون سطور");
          if (rLines.some((l) => l.lineType !== "service"))
            throw new ApproveError(
              400,
              "إشعارات الخصم/الإضافة تدعم بنود الخدمات فقط حاليًا",
            );

          const rSide = baseSide(inv.kind);
          const rParty = await resolveParty(
            rSide,
            inv.customerId,
            inv.supplierId,
            companyId,
            tx,
          );
          if ("error" in rParty) throw new ApproveError(400, rParty.error);

          const rTaxIds = [
            ...new Set(
              rLines.map((l) => l.taxId).filter((x): x is string => !!x),
            ),
          ];
          const rTaxRows = rTaxIds.length
            ? await tx
                .select({
                  id: taxesTable.id,
                  linkedAccountId: taxesTable.linkedAccountId,
                })
                .from(taxesTable)
                .where(
                  and(
                    eq(taxesTable.companyId, companyId),
                    inArray(taxesTable.id, rTaxIds),
                  ),
                )
            : [];
          const rTaxAccount = new Map(
            rTaxRows.map((t) => [t.id, t.linkedAccountId]),
          );
          for (const tid of rTaxIds) {
            if (!rTaxAccount.get(tid))
              throw new ApproveError(400, "الضريبة المحددة بدون حساب مرتبط");
          }

          const rAccountIds: string[] = [rParty.accountId];
          for (const l of rLines) {
            rAccountIds.push(l.accountId);
            if (l.taxId) rAccountIds.push(rTaxAccount.get(l.taxId)!);
          }
          const rAccErr = await validateLeafAccounts(
            rAccountIds,
            companyId,
            tx,
          );
          if (rAccErr) throw new ApproveError(400, rAccErr);

          // All business rows are locked (only the invoice row matters for a
          // service-only note); take the entry-no advisory lock last.
          await lockCompanyEntryNo(tx, companyId);

          const rRate = Number(inv.exchangeRate);
          const isSalesReturn = rSide === "sales";
          const rEntryLines: {
            accountId: string;
            description: string | null;
            debit: number;
            credit: number;
            taxId?: string | null;
            costCenterId?: string | null;
          }[] = [];
          let rPartyBase = 0;
          for (const l of rLines) {
            const lineTotalBase = round2(Number(l.lineTotal) * rRate);
            const taxBase = round2(Number(l.taxAmount) * rRate);
            rPartyBase = round2(rPartyBase + lineTotalBase + taxBase);
            // sales_return reverses a sale: Dr Revenue, Dr VAT, Cr AR.
            // purchase_return reverses a purchase: Cr Expense, Cr VAT, Dr AP.
            rEntryLines.push({
              accountId: l.accountId,
              description: l.description,
              debit: isSalesReturn ? lineTotalBase : 0,
              credit: isSalesReturn ? 0 : lineTotalBase,
              taxId: l.taxId,
              costCenterId: l.costCenterId,
            });
            if (taxBase > 0) {
              rEntryLines.push({
                accountId: rTaxAccount.get(l.taxId!)!,
                description: l.description,
                debit: isSalesReturn ? taxBase : 0,
                credit: isSalesReturn ? 0 : taxBase,
                taxId: l.taxId,
              });
            }
          }
          const rPartyLine = {
            accountId: rParty.accountId,
            description: `${docLabelAr(inv.kind)} #${inv.invoiceNo} - ${rParty.name}`,
            debit: isSalesReturn ? 0 : rPartyBase,
            credit: isSalesReturn ? rPartyBase : 0,
          };
          if (isSalesReturn) rEntryLines.push(rPartyLine);
          else rEntryLines.unshift(rPartyLine);

          const rEntry = await createDraftJournalEntry(tx, {
            companyId,
            baseCurrency,
            date: inv.date,
            reference: `${docLabelAr(inv.kind)} #${inv.invoiceNo}`,
            notes: inv.notes,
            createdBy: req.auth!.userId,
            status: "posted",
            lines: rEntryLines,
          });

          const [rRow] = await tx
            .update(invoicesTable)
            .set({
              status: "approved",
              journalEntryId: rEntry.id,
              approvedAt: new Date(),
            })
            .where(
              and(
                eq(invoicesTable.id, id),
                eq(invoicesTable.companyId, companyId),
              ),
            )
            .returning();
          return { result: rRow!, partyName: rParty.name };
        }

        const lines = await tx
          .select()
          .from(invoiceLinesTable)
          .where(eq(invoiceLinesTable.invoiceId, id))
          .orderBy(asc(invoiceLinesTable.lineNo));
        if (lines.length === 0)
          throw new ApproveError(400, "لا يمكن اعتماد فاتورة بدون سطور");

        const party = await resolveParty(
          inv.kind as "sales" | "purchase",
          inv.customerId,
          inv.supplierId,
          companyId,
          tx,
        );
        if ("error" in party) throw new ApproveError(400, party.error);

        // Gather + validate all accounts touched by this posting.
        const taxIds = [
          ...new Set(lines.map((l) => l.taxId).filter((x): x is string => !!x)),
        ];
        const taxRows = taxIds.length
          ? await tx
              .select({
                id: taxesTable.id,
                linkedAccountId: taxesTable.linkedAccountId,
              })
              .from(taxesTable)
              .where(
                and(
                  eq(taxesTable.companyId, companyId),
                  inArray(taxesTable.id, taxIds),
                ),
              )
          : [];
        const taxAccount = new Map(
          taxRows.map((t) => [t.id, t.linkedAccountId]),
        );
        for (const tid of taxIds) {
          if (!taxAccount.get(tid))
            throw new ApproveError(400, "الضريبة المحددة بدون حساب مرتبط");
        }

        const itemIds = [
          ...new Set(
            lines
              .filter((l) => l.lineType === "inventory")
              .map((l) => l.itemId)
              .filter((x): x is string => !!x),
          ),
        ];
        const accountIds: string[] = [party.accountId];
        for (const l of lines) {
          accountIds.push(l.accountId);
          if (l.taxId) accountIds.push(taxAccount.get(l.taxId)!);
          if (l.lineType === "fixed_asset") {
            accountIds.push(l.assetAccumulatedAccountId!);
            accountIds.push(l.assetExpenseAccountId!);
          }
        }

        const rate = Number(inv.exchangeRate);

        // GLOBAL LOCK ORDER (see memory hesabat-lock-ordering.md): lock ALL
        // business rows first — invoice row (already locked above) then the
        // inventory item rows, in deterministic id order so this can't deadlock
        // against the inventory-movement flow (which locks an item row then the
        // entry advisory lock) — and ONLY THEN take lockCompanyEntryNo.
        const liveState = new Map<string, { qty: number; avg: number }>();
        const itemMap = new Map<
          string,
          typeof inventoryItemsTable.$inferSelect
        >();
        if (itemIds.length) {
          const lockedItems = await tx
            .select()
            .from(inventoryItemsTable)
            .where(
              and(
                eq(inventoryItemsTable.companyId, companyId),
                inArray(inventoryItemsTable.id, itemIds),
              ),
            )
            .orderBy(asc(inventoryItemsTable.id))
            .for("update");
          for (const it of lockedItems) {
            itemMap.set(it.id, it);
            liveState.set(it.id, {
              qty: round4(Number(it.quantityOnHand)),
              avg: round4(Number(it.averageCost)),
            });
          }
        }

        // Validate inventory-line items + their account mappings against the
        // locked rows, then re-validate every touched account is a company leaf.
        for (const l of lines) {
          if (l.lineType === "inventory") {
            const item = itemMap.get(l.itemId!);
            if (!item) throw new ApproveError(400, "أحد الأصناف غير موجود");
            if (inv.kind === "sales") {
              if (!item.inventoryAccountId)
                throw new ApproveError(
                  400,
                  "الصنف بدون حساب مخزون — حدّد حساب المخزون للصنف",
                );
              accountIds.push(item.inventoryAccountId);
              accountIds.push(l.cogsAccountId!);
            }
          }
        }
        const accErr = await validateLeafAccounts(accountIds, companyId, tx);
        if (accErr) throw new ApproveError(400, accErr);

        // All business rows are now locked; safe to take the per-company entry
        // advisory lock and mint the journal entry number.
        await lockCompanyEntryNo(tx, companyId);

        const entryLines: {
          accountId: string;
          description: string | null;
          debit: number;
          credit: number;
          taxId?: string | null;
          costCenterId?: string | null;
        }[] = [];
        // Deferred stock writes (need the entry id first).
        const stockOps: {
          line: InvoiceLine;
          type: "receipt" | "issue";
          unitCost: number;
          totalValue: number;
          newQty: number;
          newAvg: number;
          inventoryAccountId: string;
          counterpartAccountId: string;
        }[] = [];
        const assetOps: { line: InvoiceLine; cost: number; salvage: number }[] =
          [];

        let partyBase = 0; // accumulated AR/AP base amount

        for (const l of lines) {
          const lineTotalBase = round2(Number(l.lineTotal) * rate);
          const taxBase = round2(Number(l.taxAmount) * rate);
          partyBase = round2(partyBase + lineTotalBase + taxBase);

          if (inv.kind === "sales") {
            // Revenue credited, tax credited.
            entryLines.push({
              accountId: l.accountId,
              description: l.description,
              debit: 0,
              credit: lineTotalBase,
              taxId: l.taxId,
              costCenterId: l.costCenterId,
            });
            if (taxBase > 0) {
              entryLines.push({
                accountId: taxAccount.get(l.taxId!)!,
                description: l.description,
                debit: 0,
                credit: taxBase,
                taxId: l.taxId,
              });
            }
            if (l.lineType === "inventory") {
              const item = itemMap.get(l.itemId!)!;
              const state = liveState.get(l.itemId!)!;
              const computed = computeMovement(
                state.qty,
                state.avg,
                "issue",
                Number(l.quantity),
              );
              if (computed === "negative") throw new Error("NEGATIVE_STOCK");
              state.qty = computed.newQty;
              state.avg = computed.newAvg;
              const cogs = computed.totalValue; // base (avg cost is base)
              if (cogs > MONEY_EPS) {
                entryLines.push({
                  accountId: l.cogsAccountId!,
                  description: l.description,
                  debit: cogs,
                  credit: 0,
                  costCenterId: l.costCenterId,
                });
                entryLines.push({
                  accountId: item.inventoryAccountId!,
                  description: l.description,
                  debit: 0,
                  credit: cogs,
                });
              }
              stockOps.push({
                line: l,
                type: "issue",
                unitCost: computed.unitCost,
                totalValue: computed.totalValue,
                newQty: computed.newQty,
                newAvg: computed.newAvg,
                inventoryAccountId: item.inventoryAccountId!,
                counterpartAccountId: l.cogsAccountId!,
              });
            }
          } else {
            // Purchase: debit the expense/inventory/asset account.
            entryLines.push({
              accountId: l.accountId,
              description: l.description,
              debit: lineTotalBase,
              credit: 0,
              taxId: l.taxId,
              costCenterId: l.costCenterId,
            });
            if (taxBase > 0) {
              entryLines.push({
                accountId: taxAccount.get(l.taxId!)!,
                description: l.description,
                debit: taxBase,
                credit: 0,
                taxId: l.taxId,
              });
            }
            if (l.lineType === "inventory") {
              const state = liveState.get(l.itemId!)!;
              const unitCost = round4(lineTotalBase / Number(l.quantity));
              const computed = computeMovement(
                state.qty,
                state.avg,
                "receipt",
                Number(l.quantity),
                unitCost,
              );
              if (computed === "negative") throw new Error("NEGATIVE_STOCK");
              state.qty = computed.newQty;
              state.avg = computed.newAvg;
              stockOps.push({
                line: l,
                type: "receipt",
                unitCost: computed.unitCost,
                totalValue: computed.totalValue,
                newQty: computed.newQty,
                newAvg: computed.newAvg,
                inventoryAccountId: l.accountId,
                counterpartAccountId: party.accountId,
              });
            }
            if (l.lineType === "fixed_asset") {
              assetOps.push({
                line: l,
                cost: lineTotalBase,
                salvage: round2(Number(l.assetSalvageValue ?? 0) * rate),
              });
            }
          }
        }

        // Party AR/AP line.
        if (inv.kind === "sales") {
          entryLines.unshift({
            accountId: party.accountId,
            description: `فاتورة مبيعات #${inv.invoiceNo} - ${party.name}`,
            debit: partyBase,
            credit: 0,
          });
        } else {
          entryLines.push({
            accountId: party.accountId,
            description: `فاتورة مشتريات #${inv.invoiceNo} - ${party.name}`,
            debit: 0,
            credit: partyBase,
          });
        }

        const entry = await createDraftJournalEntry(tx, {
          companyId,
          baseCurrency,
          date: inv.date,
          reference: `${inv.kind === "sales" ? "فاتورة مبيعات" : "فاتورة مشتريات"} #${inv.invoiceNo}`,
          notes: inv.notes,
          createdBy: req.auth!.userId,
          status: "posted",
          lines: entryLines,
        });

        // Apply stock movements linked to this entry.
        for (const op of stockOps) {
          await tx
            .update(inventoryItemsTable)
            .set({
              quantityOnHand: String(op.newQty),
              averageCost: String(op.newAvg),
            })
            .where(eq(inventoryItemsTable.id, op.line.itemId!));
          await tx.insert(inventoryMovementsTable).values({
            companyId,
            itemId: op.line.itemId!,
            date: inv.date,
            type: op.type,
            quantity: String(Number(op.line.quantity)),
            unitCost: String(op.unitCost),
            totalValue: String(op.totalValue),
            inventoryAccountId: op.inventoryAccountId,
            counterpartAccountId: op.counterpartAccountId,
            notes: `فاتورة #${inv.invoiceNo}`,
            journalEntryId: entry.id,
            createdBy: req.auth!.userId,
          });
        }

        // Register fixed assets from purchase fixed-asset lines. Each gets an
        // auto code scoped to the invoice's fiscal year (same generator as the
        // standalone /assets create), so invoice-born assets are never code-less.
        for (const op of assetOps) {
          const assetCode = await generateEntityCode(
            tx,
            companyId,
            "fixed_asset",
            inv.date,
          );
          const [asset] = await tx
            .insert(fixedAssetsTable)
            .values({
              companyId,
              code: assetCode,
              nameAr:
                op.line.assetNameAr ?? op.line.description ?? "أصل ثابت",
              nameEn: op.line.assetNameEn ?? null,
              acquisitionDate: inv.date,
              cost: String(op.cost),
              salvageValue: String(op.salvage),
              usefulLifeMonths: op.line.assetUsefulLifeMonths!,
              method: "straight_line",
              assetAccountId: op.line.accountId,
              accumulatedAccountId: op.line.assetAccumulatedAccountId!,
              expenseAccountId: op.line.assetExpenseAccountId!,
            })
            .returning();
          await tx
            .update(invoiceLinesTable)
            .set({ fixedAssetId: asset!.id })
            .where(eq(invoiceLinesTable.id, op.line.id));
        }

        const [row] = await tx
          .update(invoicesTable)
          .set({
            status: "approved",
            journalEntryId: entry.id,
            approvedAt: new Date(),
          })
          .where(
            and(
              eq(invoicesTable.id, id),
              eq(invoicesTable.companyId, companyId),
            ),
          )
          .returning();
        return { result: row!, partyName: party.name };
      });

      const freshLines = await db
        .select()
        .from(invoiceLinesTable)
        .where(eq(invoiceLinesTable.invoiceId, id))
        .orderBy(asc(invoiceLinesTable.lineNo));
      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "approve",
          entity: codeEntityFor(result.kind),
          entityId: result.id,
          entityLabel: `${docLabelAr(result.kind)} #${result.invoiceNo}`,
          oldValue: { status: "draft" },
          newValue: { status: result.status },
        },
        req.log,
      );
      const relatedCode = await relatedCodeOf(result, companyId);
      res.json(toDetail(result, partyName, freshLines, relatedCode));
    } catch (err) {
      if (err instanceof ApproveError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      if (err instanceof Error && err.message === "NEGATIVE_STOCK") {
        res
          .status(400)
          .json({ error: "الكمية المطلوب صرفها أكبر من الرصيد المتاح" });
        return;
      }
      req.log.error({ err }, "Failed to approve invoice");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Revert approved invoice back to draft ----
// Only allowed for service-only invoices with no payment allocations.
// Deletes the posted JE (JE lines cascade) and resets status to 'draft'.
router.post(
  "/invoices/:id/revert",
  requireAuth,
  requireCapability("invoices:update"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const id = req.params["id"] as string;
    try {
      const inv = await loadInvoice(id, companyId);
      if (!inv) {
        res.status(404).json({ error: "الفاتورة غير موجودة" });
        return;
      }
      if (!["approved", "partially_paid", "paid"].includes(inv.status)) {
        res.status(400).json({ error: "يمكن التراجع عن الفواتير المعتمدة أو المدفوعة فقط" });
        return;
      }
      // Block inventory/fixed-asset lines — stock reversal requires separate logic.
      const invLines = await db
        .select({ lineType: invoiceLinesTable.lineType })
        .from(invoiceLinesTable)
        .where(
          and(
            eq(invoiceLinesTable.invoiceId, id),
            eq(invoiceLinesTable.companyId, companyId),
          ),
        );
      const hasComplexLines = invLines.some(
        (l) => l.lineType === "inventory" || l.lineType === "fixed_asset",
      );
      if (hasComplexLines) {
        res
          .status(400)
          .json({
            error:
              "لا يمكن التراجع عن فواتير تحتوي على أصناف مخزنية أو أصول ثابتة — استخدم إشعار الخصم/الدائن بدلاً من ذلك",
          });
        return;
      }

      await db.transaction(async (tx) => {
        // Lock the invoice row and re-validate inside the tx.
        const locked = await tx
          .select()
          .from(invoicesTable)
          .where(
            and(
              eq(invoicesTable.id, id),
              eq(invoicesTable.companyId, companyId),
            ),
          )
          .for("update")
          .then((r) => r[0]);
        if (!locked || !["approved", "partially_paid", "paid"].includes(locked.status)) {
          throw new ApproveError(400, "الفاتورة غير مؤهلة للتراجع");
        }
        // Delete payments allocated to this invoice (+ their JEs), then the allocations.
        const allocations = await tx
          .select({ paymentId: paymentAllocationsTable.paymentId })
          .from(paymentAllocationsTable)
          .where(
            and(
              eq(paymentAllocationsTable.invoiceId, id),
              eq(paymentAllocationsTable.companyId, companyId),
            ),
          );
        if (allocations.length > 0) {
          const paymentIds = allocations.map((a) => a.paymentId);
          // Fetch payment JE ids before deleting.
          const pmts = await tx
            .select({ id: paymentsTable.id, journalEntryId: paymentsTable.journalEntryId })
            .from(paymentsTable)
            .where(inArray(paymentsTable.id, paymentIds));
          // Delete payment JEs (onDelete:set null clears payments.journalEntryId).
          const pmtJeIds = pmts.map((p) => p.journalEntryId).filter(Boolean) as string[];
          if (pmtJeIds.length > 0) {
            await tx
              .delete(journalEntriesTable)
              .where(inArray(journalEntriesTable.id, pmtJeIds));
          }
          // Delete the payments (payment_allocations cascade via FK).
          await tx
            .delete(paymentsTable)
            .where(inArray(paymentsTable.id, paymentIds));
        }
        // Delete the invoice journal entry (FK onDelete:set null clears invoices.journalEntryId).
        if (locked.journalEntryId) {
          await tx
            .delete(journalEntriesTable)
            .where(eq(journalEntriesTable.id, locked.journalEntryId));
        }
        // Reset invoice to draft with zero amountPaid.
        await tx
          .update(invoicesTable)
          .set({ status: "draft", approvedAt: null, journalEntryId: null, amountPaid: "0" })
          .where(
            and(
              eq(invoicesTable.id, id),
              eq(invoicesTable.companyId, companyId),
            ),
          );
      });

      const updated = await loadInvoice(id, companyId);
      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "update",
          entity: codeEntityFor(inv.kind),
          entityId: inv.id,
          entityLabel: `${docLabelAr(inv.kind)} #${inv.invoiceNo}`,
          oldValue: { status: "approved" },
          newValue: { status: "draft" },
        },
        req.log,
      );
      res.json(updated);
    } catch (err) {
      if (err instanceof ApproveError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      req.log.error({ err }, "Failed to revert invoice");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Excel import ------------------------------------------------------
// Bulk-creates draft invoices from an .xlsx. Simple flat format: one row per
// line with invoice-level columns repeated. Groups by invoiceNo (or any unique
// column the user provides). Auto-generates invoice numbers chronologically so
// sequence is preserved.
// Registered BEFORE the GET /invoices/:id param route so Express matches it.
router.post(
  "/invoices/import",
  requireAuth,
  requireCapability("invoices:create"),
  handleXlsxUpload,
  async (req, res) => {
    const companyId = req.auth!.companyId;
    if (!req.file) {
      res.status(400).json({ error: "لم يتم رفع أي ملف" });
      return;
    }
    const kind = req.query["kind"];
    if (kind !== "sales" && kind !== "purchase") {
      res.status(400).json({ error: "نوع الفاتورة غير صحيح" });
      return;
    }
    try {
      const sheet = await parseSheet(req.file.buffer);
      if (!sheet) {
        res.status(400).json({ error: "الملف لا يحتوي على بيانات" });
        return;
      }
      const required = ["date", "party", "accountId", "quantity", "unitPrice"];
      for (const h of required) {
        if (!sheet.has(h)) {
          res.status(400).json({
            error: `صيغة الملف غير صحيحة. الأعمدة المطلوبة: ${required.join(", ")}`,
          });
          return;
        }
      }

      // Load company-scoped master data for resolution.
      const [customers, suppliers, accounts, taxes] = await Promise.all([
        db
          .select({ id: customersTable.id, name: customersTable.nameAr })
          .from(customersTable)
          .where(eq(customersTable.companyId, companyId)),
        db
          .select({ id: suppliersTable.id, name: suppliersTable.nameAr })
          .from(suppliersTable)
          .where(eq(suppliersTable.companyId, companyId)),
        db
          .select({
            id: accountsTable.id,
            code: accountsTable.code,
            isGroup: accountsTable.isGroup,
          })
          .from(accountsTable)
          .where(eq(accountsTable.companyId, companyId)),
        db
          .select({ id: taxesTable.id, name: taxesTable.nameAr, rate: taxesTable.rate })
          .from(taxesTable)
          .where(eq(taxesTable.companyId, companyId)),
      ]);
      const partyByName = new Map<string, { id: string; name: string; accountId: string }>();
      for (const c of customers) {
        const cust = await db
          .select({ id: customersTable.id, name: customersTable.nameAr, accountId: customersTable.accountId })
          .from(customersTable)
          .where(and(eq(customersTable.id, c.id), eq(customersTable.companyId, companyId)))
          .limit(1);
        if (cust[0]) partyByName.set(c.name, { id: cust[0].id, name: cust[0].name, accountId: cust[0].accountId });
      }
      for (const s of suppliers) {
        const sup = await db
          .select({ id: suppliersTable.id, name: suppliersTable.nameAr, accountId: suppliersTable.accountId })
          .from(suppliersTable)
          .where(and(eq(suppliersTable.id, s.id), eq(suppliersTable.companyId, companyId)))
          .limit(1);
        if (sup[0]) partyByName.set(s.name, { id: sup[0].id, name: sup[0].name, accountId: sup[0].accountId });
      }
      const accountById = new Map(accounts.map((a) => [a.id, a]));
      const taxByName = new Map(taxes.map((t) => [t.name, t]));
      const taxRates = new Map(taxes.map((t) => [t.id, Number(t.rate)]));
      const baseCurrency = await loadBaseCurrency(companyId);

      // Group rows by invoiceNo (or auto-generate groups from row numbers).
      type ImportRow = {
        date: string;
        dueDate: string | null;
        partyName: string;
        currency: string | null;
        exchangeRate: number;
        notes: string | null;
        lineType: "service" | "inventory" | "fixed_asset";
        accountId: string;
        description: string | null;
        quantity: number;
        unitPrice: number;
        discount: number;
        taxName: string | null;
        costCenterId: string | null;
      };
      const groups = new Map<string, ImportRow[]>();
      const groupOrder: string[] = [];
      for (const { rowNo, row } of sheet.rows) {
        const date = sheet.str(row, "date");
        const accountId = sheet.str(row, "accountId");
        const quantity = sheet.num(row, "quantity");
        const unitPrice = sheet.num(row, "unitPrice");
        if (!date && !accountId) continue;
        if (!date || !accountId) {
          res.status(400).json({
            error: `السطر ${rowNo}: لا بد من وجود date و accountId`,
          });
          return;
        }
        if (quantity <= 0 || unitPrice < 0) {
          res.status(400).json({
            error: `السطر ${rowNo}: الكمية والسعر يجب أن يكونا أكبر من صفر`,
          });
          return;
        }
        const key = sheet.has("invoiceNo")
          ? sheet.str(row, "invoiceNo") || `row-${rowNo}`
          : `row-${rowNo}`;
        if (!groups.has(key)) {
          groups.set(key, []);
          groupOrder.push(key);
        }
        groups.get(key)!.push({
          date,
          dueDate: sheet.has("dueDate") ? sheet.str(row, "dueDate") || null : null,
          partyName: sheet.str(row, "party"),
          currency: sheet.has("currency") ? sheet.str(row, "currency") || null : null,
          exchangeRate: sheet.has("exchangeRate") ? sheet.num(row, "exchangeRate") || 1 : 1,
          notes: sheet.has("notes") ? sheet.str(row, "notes") || null : null,
          lineType: (sheet.str(row, "lineType") as any) || "service",
          accountId,
          description: sheet.has("description") ? sheet.str(row, "description") || null : null,
          quantity,
          unitPrice,
          discount: sheet.has("discount") ? sheet.num(row, "discount") : 0,
          taxName: sheet.has("tax") ? sheet.str(row, "tax") || null : null,
          costCenterId: sheet.has("costCenterId") ? sheet.str(row, "costCenterId") || null : null,
        });
      }
      if (groupOrder.length === 0) {
        res.status(400).json({ error: "الملف لا يحتوي على فواتير" });
        return;
      }

      // Validate all rows up-front (all-or-nothing).
      for (let i = 0; i < groupOrder.length; i++) {
        const key = groupOrder[i];
        const rows = groups.get(key)!;
        const first = rows[0];
        const party = partyByName.get(first.partyName);
        if (!party) {
          res.status(400).json({
            error: `الفاتورة ${i + 1}: الطرف "${first.partyName}" غير موجود`,
          });
          return;
        }
        for (const r of rows) {
          const acc = accountById.get(r.accountId);
          if (!acc) {
            res.status(400).json({
              error: `الفاتورة ${i + 1}: الحساب ${r.accountId} غير موجود`,
            });
            return;
          }
          if (acc.isGroup) {
            res.status(400).json({
              error: `الفاتورة ${i + 1}: الحساب ${r.accountId} هو حساب مجموعة`,
            });
            return;
          }
          if (r.taxName) {
            const tax = taxByName.get(r.taxName);
            if (!tax) {
              res.status(400).json({
                error: `الفاتورة ${i + 1}: الضريبة "${r.taxName}" غير موجودة`,
              });
              return;
            }
          }
        }
      }

      // Create all invoices in a single transaction with chronological numbering.
      const createdIds: string[] = await db.transaction(async (tx) => {
        const ids: string[] = [];
        for (const key of groupOrder) {
          const rows = groups.get(key)!;
          const first = rows[0];
          const party = partyByName.get(first.partyName)!;
          const invoiceNo = await nextInvoiceNo(tx, companyId, kind);
          const code = await generateEntityCode(tx, companyId, codeEntityFor(kind as any), first.date);

          const incomingLines: IncomingLine[] = rows.map((r, idx) => {
            const tax = r.taxName ? taxByName.get(r.taxName) : null;
            return {
              lineType: r.lineType || "service",
              description: r.description,
              accountId: r.accountId,
              quantity: r.quantity,
              unitPrice: r.unitPrice,
              discount: r.discount,
              taxId: tax?.id ?? null,
              costCenterId: r.costCenterId,
            };
          });
          const prep = prepareLines(kind as "sales" | "purchase", incomingLines, taxRates);
          if ("error" in prep) {
            throw new Error(`فاتورة ${key}: ${prep.error}`);
          }
          const [inv] = await tx
            .insert(invoicesTable)
            .values({
              companyId,
              kind: kind as "sales" | "purchase",
              invoiceNo,
              code,
              date: first.date,
              dueDate: first.dueDate,
              customerId: kind === "sales" ? party.id : null,
              supplierId: kind === "purchase" ? party.id : null,
              costCenterId: null,
              currency: first.currency ?? baseCurrency,
              exchangeRate: String(first.exchangeRate),
              status: "draft",
              notes: first.notes,
              subtotal: String(prep.totals.subtotal),
              discountTotal: String(prep.totals.discountTotal),
              taxTotal: String(prep.totals.taxTotal),
              total: String(prep.totals.total),
              amountPaid: "0",
              createdBy: req.auth!.userId,
            })
            .returning();
          await tx.insert(invoiceLinesTable).values(
            prep.lines.map((l) => ({
              invoiceId: inv!.id,
              companyId,
              lineNo: l.lineNo,
              lineType: l.lineType,
              description: l.description,
              accountId: l.accountId,
              itemId: l.itemId,
              warehouse: l.warehouse,
              cogsAccountId: l.cogsAccountId,
              quantity: String(l.quantity),
              unitPrice: String(l.unitPrice),
              discount: String(l.discount),
              taxId: l.taxId,
              taxAmount: String(l.taxAmount),
              lineTotal: String(l.lineTotal),
              costCenterId: l.costCenterId,
              assetNameAr: l.assetNameAr,
              assetNameEn: l.assetNameEn,
              assetUsefulLifeMonths: l.assetUsefulLifeMonths,
              assetSalvageValue:
                l.assetSalvageValue === null ? null : String(l.assetSalvageValue),
              assetAccumulatedAccountId: l.assetAccumulatedAccountId,
              assetExpenseAccountId: l.assetExpenseAccountId,
            })),
          );
          ids.push(inv!.id);
        }
        return ids;
      });

      // Audit log (best-effort post-commit).
      for (const id of createdIds) {
        await safeAudit(
          db,
          {
            companyId,
            userId: req.auth!.userId,
            action: "create",
            entity: codeEntityFor(kind as any),
            entityId: id,
            entityLabel: `فاتورة مستوردة`,
          },
          req.log,
        );
      }

      res.status(201).json({ status: "ok", imported: createdIds.length });
    } catch (err) {
      req.log.error({ err }, "Failed to import invoices");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
