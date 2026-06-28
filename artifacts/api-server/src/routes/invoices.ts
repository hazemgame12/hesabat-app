import { Router } from "express";
import { and, eq, inArray, not, isNotNull, gte, lte, asc, desc, sql, count } from "drizzle-orm";
import { parsePagination, paginatedResponse } from "../lib/pagination";
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
  projectsTable,
  branchesTable,
  journalEntriesTable,
  paymentAllocationsTable,
  paymentsTable,
  bankMovementsTable,
  bankReconciliationsTable,
  bankAccountsTable,
  type Invoice,
  type InvoiceLine,
} from "@workspace/db";
import { CreateInvoiceBody, UpdateInvoiceBody } from "@workspace/api-zod";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import { safeAudit } from "../lib/audit";
import { generateEntityCode, type CodeEntity } from "../lib/codes";
import {
  createDraftJournalEntry,
  lockCompanyEntryNo,
} from "../lib/journal-posting";
import { computeMovement, round2, round4 } from "../lib/inventory-posting";
import { exportWorkbook } from "../lib/excel";
import { handleXlsxUpload, parseSheet, cellStr, cellNum } from "../lib/excel";
import ExcelJS from "exceljs";
import { isWriteBlocked, WRITE_BLOCK_MSG } from "../lib/fiscal-year";

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

function invoiceStatusFor(total: number, amountPaid: number): string {
  if (amountPaid >= total - MONEY_EPS) return "paid";
  if (amountPaid > MONEY_EPS) return "partially_paid";
  return "approved";
}

type InvoiceKind =
  | "sales"
  | "purchase"
  | "sales_return"
  | "purchase_return"
  | "quotation"
  | "purchase_order";

// The two "return" documents are credit/debit notes. They reuse the invoice
// machinery but post a REVERSED journal entry against the same control account.
function isReturnKind(kind: string): boolean {
  return kind === "sales_return" || kind === "purchase_return";
}

// Non-posting pre-documents that are confirmed (not approved) and converted.
function isPreDocument(kind: string): boolean {
  return kind === "quotation" || kind === "purchase_order";
}

// Maps any invoice/return kind to its underlying side.
// quotation → sales side (customer), purchase_order → purchase side (supplier).
function baseSide(kind: string): "sales" | "purchase" {
  return kind === "sales" || kind === "sales_return" || kind === "quotation"
    ? "sales"
    : "purchase";
}

// The CodeEntity used to allocate the human-facing code.
function codeEntityFor(kind: string): CodeEntity {
  if (kind === "sales") return "sales_invoice";
  if (kind === "purchase") return "purchase_invoice";
  if (kind === "quotation") return "quotation";
  if (kind === "purchase_order") return "purchase_order";
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
    case "quotation":
      return "عرض سعر";
    case "purchase_order":
      return "أمر شراء";
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

async function validateProjects(
  projectIds: (string | null | undefined)[],
  companyId: string,
): Promise<string | null> {
  const ids = [...new Set(projectIds.filter((x): x is string => !!x))];
  if (ids.length === 0) return null;
  const rows = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(
      and(eq(projectsTable.companyId, companyId), inArray(projectsTable.id, ids)),
    );
  if (rows.length !== ids.length) return "المشروع المحدد غير موجود";
  return null;
}

async function validateBranches(
  branchIds: (string | null | undefined)[],
  companyId: string,
): Promise<string | null> {
  const ids = [...new Set(branchIds.filter((x): x is string => !!x))];
  if (ids.length === 0) return null;
  const rows = await db
    .select({ id: branchesTable.id })
    .from(branchesTable)
    .where(
      and(eq(branchesTable.companyId, companyId), inArray(branchesTable.id, ids)),
    );
  if (rows.length !== ids.length) return "الفرع المحدد غير موجود";
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
    sourceDocumentId: inv.sourceDocumentId ?? null,
    date: inv.date,
    dueDate: inv.dueDate,
    partyId: inv.customerId ?? inv.supplierId,
    partyName,
    costCenterId: inv.costCenterId,
    projectId: inv.projectId,
    branchId: inv.branchId,
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
    whtTotal: Number(inv.whtTotal),
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
    whtTaxId: l.whtTaxId,
    whtAmount: Number(l.whtAmount),
    lineTotal: Number(l.lineTotal),
    costCenterId: l.costCenterId,
    projectId: l.projectId,
    branchId: l.branchId,
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
      kind !== "purchase_return" &&
      kind !== "quotation" &&
      kind !== "purchase_order"
    ) {
      res.status(400).json({ error: "نوع المستند غير صحيح" });
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
      const pg = parsePagination(req.query as Record<string, unknown>);

      if (pg) {
        const [{ total }] = await db
          .select({ total: count() })
          .from(invoicesTable)
          .where(and(...conditions));
        const rows = await db
          .select()
          .from(invoicesTable)
          .where(and(...conditions))
          .orderBy(desc(invoicesTable.invoiceNo))
          .limit(pg.limit)
          .offset(pg.offset);
        const names = await partyNames(rows, companyId);
        const relatedCodes = await relatedCodeMap(rows, companyId);
        res.json(
          paginatedResponse(
            rows.map((r) =>
              toListItem(
                r,
                names.get(r.customerId ?? r.supplierId ?? "") ?? null,
                r.relatedInvoiceId ? (relatedCodes.get(r.relatedInvoiceId) ?? null) : null,
              ),
            ),
            Number(total),
            pg.page,
            pg.limit,
          ),
        );
        return;
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

// ---- Available payments for an invoice (registered before /:id) ----
// Returns existing allocations on this invoice + payments for the same party
// that still carry unallocated balance.
router.get(
  "/invoices/:id/available-payments",
  requireAuth,
  requireCapability("payments:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const id = req.params["id"] as string;
    try {
      const inv = await loadInvoice(id, companyId);
      if (!inv) {
        res.status(404).json({ error: "الفاتورة غير موجودة" });
        return;
      }
      const paymentKind = inv.kind === "sales" ? "collection" : "payment";
      const partyId = inv.customerId ?? inv.supplierId;
      if (!partyId) {
        res.json({ existingAllocations: [], availablePayments: [] });
        return;
      }

      // Allocations already attached to this invoice.
      const existing = await db
        .select({
          id: paymentAllocationsTable.id,
          paymentId: paymentAllocationsTable.paymentId,
          amount: paymentAllocationsTable.amount,
        })
        .from(paymentAllocationsTable)
        .where(
          and(
            eq(paymentAllocationsTable.invoiceId, id),
            eq(paymentAllocationsTable.companyId, companyId),
          ),
        );

      const existingPaymentIds = [...new Set(existing.map((a) => a.paymentId))];
      const existingPaymentsMap = new Map<
        string,
        { paymentNo: number; date: string; currency: string | null }
      >();
      if (existingPaymentIds.length) {
        const pmts = await db
          .select({
            id: paymentsTable.id,
            paymentNo: paymentsTable.paymentNo,
            date: paymentsTable.date,
            currency: paymentsTable.currency,
          })
          .from(paymentsTable)
          .where(inArray(paymentsTable.id, existingPaymentIds));
        for (const p of pmts) existingPaymentsMap.set(p.id, p);
      }

      // Payments for the same party/kind that may have unallocated balance.
      const partyCondition =
        inv.kind === "sales"
          ? eq(paymentsTable.customerId, partyId)
          : eq(paymentsTable.supplierId, partyId);
      const allPayments = await db
        .select()
        .from(paymentsTable)
        .where(
          and(
            eq(paymentsTable.companyId, companyId),
            eq(paymentsTable.kind, paymentKind),
            partyCondition,
          ),
        )
        .orderBy(desc(paymentsTable.paymentNo));

      const availablePayments: {
        id: string;
        paymentNo: number;
        date: string;
        amount: number;
        currency: string | null;
        exchangeRate: number;
        totalAllocated: number;
        unallocatedAmount: number;
        bankMovementId: string | null;
      }[] = [];

      if (allPayments.length) {
        const allocSums = await db
          .select({
            paymentId: paymentAllocationsTable.paymentId,
            totalAllocated: sql<number>`coalesce(sum(${paymentAllocationsTable.amount}), 0)`,
          })
          .from(paymentAllocationsTable)
          .where(
            and(
              eq(paymentAllocationsTable.companyId, companyId),
              inArray(
                paymentAllocationsTable.paymentId,
                allPayments.map((p) => p.id),
              ),
            ),
          )
          .groupBy(paymentAllocationsTable.paymentId);
        const allocSumMap = new Map<string, number>();
        for (const a of allocSums)
          allocSumMap.set(a.paymentId, Number(a.totalAllocated));

        for (const p of allPayments) {
          const totalAllocated = allocSumMap.get(p.id) ?? 0;
          const unallocatedAmount = round2(Number(p.amount) - totalAllocated);
          if (unallocatedAmount > MONEY_EPS) {
            availablePayments.push({
              id: p.id,
              paymentNo: p.paymentNo,
              date: p.date,
              amount: Number(p.amount),
              currency: p.currency,
              exchangeRate: Number(p.exchangeRate),
              totalAllocated: round2(totalAllocated),
              unallocatedAmount,
              bankMovementId: p.bankMovementId ?? null,
            });
          }
        }
      }

      res.json({
        existingAllocations: existing.map((a) => {
          const p = existingPaymentsMap.get(a.paymentId);
          return {
            id: a.id,
            paymentId: a.paymentId,
            paymentNo: p?.paymentNo ?? null,
            date: p?.date ?? null,
            currency: p?.currency ?? null,
            amount: Number(a.amount),
          };
        }),
        availablePayments,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to load available payments");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Allocate a payment to an invoice (registered before /:id) ----
// Creates a payment_allocations row and bumps invoice.amountPaid/status.
// No new JE is created — the payment's JE already posted.
// Lock order: invoice row FOR UPDATE → payment row FOR UPDATE (no entry-no lock).
router.post(
  "/invoices/:id/allocate-payment",
  requireAuth,
  requireCapability("payments:create"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const id = req.params["id"] as string;
    const { paymentId, allocatedAmount } = req.body as {
      paymentId?: string;
      allocatedAmount?: unknown;
    };
    if (
      !paymentId ||
      typeof allocatedAmount !== "number" ||
      allocatedAmount <= 0
    ) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    try {
      await db.transaction(async (tx) => {
        // Lock invoice first.
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
        if (inv.status !== "approved" && inv.status !== "partially_paid") {
          throw new ApproveError(400, "لا يمكن التخصيص على هذه الفاتورة");
        }
        const invTotal = Number(inv.total);
        const invBalance = round2(invTotal - Number(inv.amountPaid));
        if (allocatedAmount > invBalance + MONEY_EPS) {
          throw new ApproveError(400, "المبلغ أكبر من المتبقي على الفاتورة");
        }

        // Lock payment.
        const [payment] = await tx
          .select()
          .from(paymentsTable)
          .where(
            and(
              eq(paymentsTable.id, paymentId),
              eq(paymentsTable.companyId, companyId),
            ),
          )
          .for("update")
          .limit(1);
        if (!payment) throw new ApproveError(404, "السند غير موجود");

        // Verify the payment is for the same party as the invoice.
        const invParty = inv.customerId ?? inv.supplierId;
        const payParty = payment.customerId ?? payment.supplierId;
        if (invParty !== payParty) {
          throw new ApproveError(400, "السند لا يخص نفس الطرف");
        }

        // Re-read allocated total under lock, then check unallocated balance.
        const [allocSum] = await tx
          .select({
            total: sql<number>`coalesce(sum(${paymentAllocationsTable.amount}), 0)`,
          })
          .from(paymentAllocationsTable)
          .where(eq(paymentAllocationsTable.paymentId, paymentId));
        const totalAllocated = Number(allocSum?.total ?? 0);
        const unallocated = round2(Number(payment.amount) - totalAllocated);
        if (allocatedAmount > unallocated + MONEY_EPS) {
          throw new ApproveError(
            400,
            "مبلغ التخصيص أكبر من الرصيد المتاح في السند",
          );
        }

        // Insert allocation row.
        await tx.insert(paymentAllocationsTable).values({
          paymentId,
          companyId,
          invoiceId: id,
          amount: String(round2(allocatedAmount)),
        });

        // Update invoice amountPaid + status.
        const newPaid = round2(Number(inv.amountPaid) + allocatedAmount);
        await tx
          .update(invoicesTable)
          .set({
            amountPaid: String(newPaid),
            status: invoiceStatusFor(invTotal, newPaid),
          })
          .where(
            and(
              eq(invoicesTable.id, id),
              eq(invoicesTable.companyId, companyId),
            ),
          );
      });

      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "update",
          entity: "invoice",
          entityId: id,
          entityLabel: "تخصيص دفعة على الفاتورة",
          newValue: { paymentId, allocatedAmount },
        },
        req.log,
      );
      res.status(201).json({ status: "ok" });
    } catch (err) {
      if (err instanceof ApproveError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      req.log.error({ err }, "Failed to allocate payment to invoice");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Delete a payment allocation from an invoice ----
// Reverses invoice.amountPaid/status; the payment itself is untouched.
router.delete(
  "/invoices/:id/allocations/:allocationId",
  requireAuth,
  requireCapability("payments:create"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const id = req.params["id"] as string;
    const allocationId = req.params["allocationId"] as string;
    try {
      const [alloc] = await db
        .select()
        .from(paymentAllocationsTable)
        .where(
          and(
            eq(paymentAllocationsTable.id, allocationId),
            eq(paymentAllocationsTable.invoiceId, id),
            eq(paymentAllocationsTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!alloc) {
        res.status(404).json({ error: "التخصيص غير موجود" });
        return;
      }

      // Block if the payment period is locked OR the linked bank movement is
      // cleared inside a completed reconciliation.
      const [pmtRow] = await db
        .select({ date: paymentsTable.date, bankMovementId: paymentsTable.bankMovementId })
        .from(paymentsTable)
        .where(
          and(
            eq(paymentsTable.id, alloc.paymentId),
            eq(paymentsTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (pmtRow) {
        const wb = await isWriteBlocked(db, companyId, pmtRow.date);
        if (wb) {
          res
            .status(wb === "period_locked" ? 423 : 400)
            .json({ error: WRITE_BLOCK_MSG[wb] });
          return;
        }
        // Block if the linked bank movement has been cleared in a completed
        // reconciliation — removing the allocation would desync the reconciled
        // statement without reversing the JE.
        if (pmtRow.bankMovementId) {
          const [movement] = await db
            .select({
              reconciliationId: bankMovementsTable.reconciliationId,
              isCleared: bankMovementsTable.isCleared,
            })
            .from(bankMovementsTable)
            .where(eq(bankMovementsTable.id, pmtRow.bankMovementId))
            .limit(1);
          if (movement?.isCleared && movement.reconciliationId) {
            const [recon] = await db
              .select({ status: bankReconciliationsTable.status })
              .from(bankReconciliationsTable)
              .where(eq(bankReconciliationsTable.id, movement.reconciliationId))
              .limit(1);
            if (recon?.status === "completed") {
              res.status(423).json({
                error:
                  "لا يمكن إزالة التخصيص: السند مرتبط بتسوية بنكية مكتملة",
              });
              return;
            }
          }
        }
      }

      await db.transaction(async (tx) => {
        // Lock invoice FOR UPDATE.
        const [inv] = await tx
          .select({
            total: invoicesTable.total,
            amountPaid: invoicesTable.amountPaid,
          })
          .from(invoicesTable)
          .where(
            and(
              eq(invoicesTable.id, id),
              eq(invoicesTable.companyId, companyId),
            ),
          )
          .for("update")
          .limit(1);
        if (!inv) throw new Error("INVOICE_NOT_FOUND");

        const amount = Number(alloc.amount);
        const newPaid = round2(Math.max(0, Number(inv.amountPaid) - amount));
        await tx
          .update(invoicesTable)
          .set({
            amountPaid: String(newPaid),
            status: invoiceStatusFor(Number(inv.total), newPaid),
          })
          .where(
            and(
              eq(invoicesTable.id, id),
              eq(invoicesTable.companyId, companyId),
            ),
          );

        await tx
          .delete(paymentAllocationsTable)
          .where(eq(paymentAllocationsTable.id, allocationId));
      });

      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "update",
          entity: "invoice",
          entityId: id,
          entityLabel: "إلغاء تخصيص دفعة",
          oldValue: { allocationId, amount: alloc.amount },
        },
        req.log,
      );
      res.json({ status: "ok" });
    } catch (err) {
      req.log.error({ err }, "Failed to delete payment allocation");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Edit (PATCH) an existing allocation amount (registered before /:id) ----
router.patch(
  "/invoices/:id/allocations/:allocationId",
  requireAuth,
  requireCapability("payments:update"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const id = req.params["id"] as string;
    const allocationId = req.params["allocationId"] as string;
    const { allocatedAmount } = req.body as { allocatedAmount?: unknown };
    if (
      typeof allocatedAmount !== "number" ||
      isNaN(allocatedAmount) ||
      allocatedAmount <= MONEY_EPS
    ) {
      res.status(400).json({ error: "المبلغ غير صحيح" });
      return;
    }
    try {
      const [alloc] = await db
        .select()
        .from(paymentAllocationsTable)
        .where(
          and(
            eq(paymentAllocationsTable.id, allocationId),
            eq(paymentAllocationsTable.invoiceId, id),
            eq(paymentAllocationsTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!alloc) {
        res.status(404).json({ error: "التخصيص غير موجود" });
        return;
      }

      const [pmtRow] = await db
        .select({ date: paymentsTable.date })
        .from(paymentsTable)
        .where(
          and(
            eq(paymentsTable.id, alloc.paymentId),
            eq(paymentsTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (pmtRow) {
        const wb = await isWriteBlocked(db, companyId, pmtRow.date);
        if (wb) {
          res
            .status(wb === "period_locked" ? 423 : 400)
            .json({ error: WRITE_BLOCK_MSG[wb] });
          return;
        }
      }

      await db.transaction(async (tx) => {
        const [inv] = await tx
          .select({ total: invoicesTable.total, amountPaid: invoicesTable.amountPaid })
          .from(invoicesTable)
          .where(and(eq(invoicesTable.id, id), eq(invoicesTable.companyId, companyId)))
          .for("update")
          .limit(1);
        if (!inv) throw new Error("NOT_FOUND");

        await tx
          .select({ amount: paymentsTable.amount })
          .from(paymentsTable)
          .where(and(eq(paymentsTable.id, alloc.paymentId), eq(paymentsTable.companyId, companyId)))
          .for("update")
          .limit(1);

        const oldAmount = Number(alloc.amount);
        const total = Number(inv.total);
        const amountPaid = Number(inv.amountPaid);

        // Invoice balance after reversing old allocation
        const invBalance = round2(total - amountPaid + oldAmount);
        if (allocatedAmount > invBalance + MONEY_EPS) {
          throw new Error("EXCEEDS_INVOICE");
        }

        // Payment unallocated after reversing old allocation
        const [pmtTotals] = await tx
          .select({
            pmtAmount: paymentsTable.amount,
            allocTotal: sql<string>`coalesce(sum(${paymentAllocationsTable.amount}), 0)`,
          })
          .from(paymentsTable)
          .leftJoin(paymentAllocationsTable, eq(paymentAllocationsTable.paymentId, paymentsTable.id))
          .where(eq(paymentsTable.id, alloc.paymentId))
          .groupBy(paymentsTable.id)
          .limit(1);
        const pmtUnallocated = round2(
          Number(pmtTotals?.pmtAmount ?? 0) - Number(pmtTotals?.allocTotal ?? 0) + oldAmount,
        );
        if (allocatedAmount > pmtUnallocated + MONEY_EPS) {
          throw new Error("EXCEEDS_PAYMENT");
        }

        await tx
          .update(paymentAllocationsTable)
          .set({ amount: String(allocatedAmount) })
          .where(eq(paymentAllocationsTable.id, allocationId));

        // Recompute invoice.amountPaid from sum of all its allocations
        const [newSum] = await tx
          .select({
            total: sql<string>`coalesce(sum(${paymentAllocationsTable.amount}), 0)`,
          })
          .from(paymentAllocationsTable)
          .where(eq(paymentAllocationsTable.invoiceId, id));
        const newAmountPaid = round2(Number(newSum?.total ?? 0));
        await tx
          .update(invoicesTable)
          .set({ amountPaid: String(newAmountPaid), status: invoiceStatusFor(total, newAmountPaid) })
          .where(eq(invoicesTable.id, id));
      });

      res.json({ status: "ok" });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message === "EXCEEDS_INVOICE") {
          res.status(422).json({ error: "المبلغ يتجاوز رصيد الفاتورة المتبقي" });
          return;
        }
        if (err.message === "EXCEEDS_PAYMENT") {
          res.status(422).json({ error: "المبلغ يتجاوز الرصيد غير الموزع في السند" });
          return;
        }
        if (err.message === "NOT_FOUND") {
          res.status(404).json({ error: "لم يتم العثور على السجل" });
          return;
        }
      }
      req.log.error({ err }, "Failed to update payment allocation");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Available bank movements to link from an invoice (registered before /:id) ----
// Returns unlinked movements of matching direction that can be linked to create a payment.
router.get(
  "/invoices/:id/available-movements",
  requireAuth,
  requireCapability("payments:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const id = req.params["id"] as string;
    try {
      const inv = await loadInvoice(id, companyId);
      if (!inv) {
        res.status(404).json({ error: "الفاتورة غير موجودة" });
        return;
      }

      const movType =
        inv.kind === "sales" ? "customer_collection" : "supplier_payment";
      const movDirection = inv.kind === "sales" ? "in" : "out";

      // Collect all movement IDs already linked to a payment in this company.
      const linked = await db
        .select({ bankMovementId: paymentsTable.bankMovementId })
        .from(paymentsTable)
        .where(
          and(
            eq(paymentsTable.companyId, companyId),
            isNotNull(paymentsTable.bankMovementId),
          ),
        );
      const linkedIds = linked
        .map((r) => r.bankMovementId)
        .filter((x): x is string => !!x);

      const conds = [
        eq(bankMovementsTable.companyId, companyId),
        eq(bankMovementsTable.type, movType),
        eq(bankMovementsTable.direction, movDirection),
        eq(bankMovementsTable.isCleared, false),
      ];
      if (linkedIds.length > 0) {
        conds.push(not(inArray(bankMovementsTable.id, linkedIds)));
      }

      const movements = await db
        .select({
          id: bankMovementsTable.id,
          date: bankMovementsTable.date,
          amount: bankMovementsTable.amount,
          currency: bankMovementsTable.currency,
          reference: bankMovementsTable.reference,
          notes: bankMovementsTable.notes,
          bankAccountId: bankMovementsTable.bankAccountId,
        })
        .from(bankMovementsTable)
        .where(and(...conds))
        .orderBy(desc(bankMovementsTable.date))
        .limit(100);

      const bankIds = [...new Set(movements.map((m) => m.bankAccountId))];
      const accountNames = new Map<string, string>();
      if (bankIds.length > 0) {
        const accts = await db
          .select({ id: bankAccountsTable.id, name: bankAccountsTable.nameAr })
          .from(bankAccountsTable)
          .where(inArray(bankAccountsTable.id, bankIds));
        accts.forEach((a) => accountNames.set(a.id, a.name));
      }

      res.json(
        movements.map((m) => ({
          id: m.id,
          date: m.date,
          amount: Number(m.amount),
          currency: m.currency,
          reference: m.reference ?? null,
          notes: m.notes ?? null,
          bankAccountName: accountNames.get(m.bankAccountId) ?? null,
        })),
      );
    } catch (err) {
      req.log.error({ err }, "Failed to load available movements");
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
  whtTaxId: string | null;
  whtAmount: number;
  lineTotal: number;
  costCenterId: string | null;
  projectId: string | null;
  branchId: string | null;
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
  whtTaxId?: string | null;
  costCenterId?: string | null;
  projectId?: string | null;
  branchId?: string | null;
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
    const whtRate = l.whtTaxId ? (taxRates.get(l.whtTaxId) ?? null) : 0;
    if (whtRate === null) return { error: "ضريبة الخصم من المنبع المحددة غير موجودة" };
    const { lineTotal, taxAmount } = lineMoney(
      l.quantity,
      l.unitPrice,
      discount,
      taxRate,
    );
    const whtAmount = round2((lineTotal * whtRate) / 100);
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
      whtTaxId: l.whtTaxId ?? null,
      whtAmount,
      lineTotal,
      costCenterId: l.costCenterId ?? null,
      projectId: l.projectId ?? null,
      branchId: l.branchId ?? null,
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
    totals.whtTotal = round2(totals.whtTotal + whtAmount);
    // total = net (after discount) + VAT - WHT (WHT reduces the amount due).
    totals.total = round2(totals.total + lineTotal + taxAmount - whtAmount);
  }
  return { lines: out, totals };
}

function emptyTotals() {
  return { subtotal: 0, discountTotal: 0, taxTotal: 0, whtTotal: 0, total: 0 };
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
      const wbInv = await isWriteBlocked(db, companyId, d.date);
      if (wbInv) {
        res.status(wbInv === "period_locked" ? 423 : 400).json({ error: WRITE_BLOCK_MSG[wbInv] });
        return;
      }
      const side = baseSide(d.kind);
      const isReturn = isReturnKind(d.kind);
      const isPreDoc = isPreDocument(d.kind);
      if (isReturn && d.lines.some((l) => l.lineType !== "service")) {
        res.status(400).json({
          error: "إشعارات الخصم/الإضافة تدعم بنود الخدمات فقط حاليًا",
        });
        return;
      }
      if (isPreDoc && d.lines.some((l) => l.lineType !== "service")) {
        res.status(400).json({
          error: "عروض الأسعار وأوامر الشراء تدعم بنود الخدمات فقط في هذا الإصدار",
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
      const projErr = await validateProjects(
        [d.projectId, ...prep.lines.map((l) => l.projectId)],
        companyId,
      );
      if (projErr) {
        res.status(400).json({ error: projErr });
        return;
      }
      const branchErr = await validateBranches(
        [d.branchId, ...prep.lines.map((l) => l.branchId)],
        companyId,
      );
      if (branchErr) {
        res.status(400).json({ error: branchErr });
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
            projectId: d.projectId ?? null,
            branchId: d.branchId ?? null,
            currency: d.currency ?? null,
            exchangeRate: String(d.exchangeRate ?? 1),
            status: "draft",
            notes: d.notes ?? null,
            subtotal: String(prep.totals.subtotal),
            discountTotal: String(prep.totals.discountTotal),
            taxTotal: String(prep.totals.taxTotal),
            whtTotal: String(prep.totals.whtTotal),
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
            whtTaxId: l.whtTaxId,
            whtAmount: String(l.whtAmount),
            lineTotal: String(l.lineTotal),
            costCenterId: l.costCenterId,
            projectId: l.projectId,
            branchId: l.branchId,
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
      const wbInvUpdate =
        (await isWriteBlocked(db, companyId, inv.date)) ||
        (await isWriteBlocked(db, companyId, d.date));
      if (wbInvUpdate) {
        res.status(wbInvUpdate === "period_locked" ? 423 : 400).json({ error: WRITE_BLOCK_MSG[wbInvUpdate] });
        return;
      }
      const side = baseSide(d.kind);
      const isReturn = isReturnKind(d.kind);
      const isPreDoc = isPreDocument(d.kind);
      if (isReturn && d.lines.some((l) => l.lineType !== "service")) {
        res.status(400).json({
          error: "إشعارات الخصم/الإضافة تدعم بنود الخدمات فقط حاليًا",
        });
        return;
      }
      if (isPreDoc && d.lines.some((l) => l.lineType !== "service")) {
        res.status(400).json({
          error: "عروض الأسعار وأوامر الشراء تدعم بنود الخدمات فقط في هذا الإصدار",
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
      const projErr = await validateProjects(
        [d.projectId, ...prep.lines.map((l) => l.projectId)],
        companyId,
      );
      if (projErr) {
        res.status(400).json({ error: projErr });
        return;
      }
      const branchErr = await validateBranches(
        [d.branchId, ...prep.lines.map((l) => l.branchId)],
        companyId,
      );
      if (branchErr) {
        res.status(400).json({ error: branchErr });
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
            projectId: d.projectId ?? null,
            branchId: d.branchId ?? null,
            currency: d.currency ?? null,
            exchangeRate: String(d.exchangeRate ?? 1),
            notes: d.notes ?? null,
            subtotal: String(prep.totals.subtotal),
            discountTotal: String(prep.totals.discountTotal),
            taxTotal: String(prep.totals.taxTotal),
            whtTotal: String(prep.totals.whtTotal),
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
            whtTaxId: l.whtTaxId,
            whtAmount: String(l.whtAmount),
            lineTotal: String(l.lineTotal),
            costCenterId: l.costCenterId,
            projectId: l.projectId,
            branchId: l.branchId,
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
        if (!inv) throw new ApproveError(404, "المستند غير موجود");
        if (inv.status !== "draft")
          throw new ApproveError(400, "المستند مؤكد أو معتمد بالفعل");

        const wbApprove = await isWriteBlocked(tx, companyId, inv.date);
        if (wbApprove)
          throw new ApproveError(
            wbApprove === "period_locked" ? 423 : 400,
            WRITE_BLOCK_MSG[wbApprove],
          );

        // Pre-documents (quotation / purchase_order) are confirmed without
        // posting a journal entry — just flip the status to "confirmed".
        if (isPreDocument(inv.kind)) {
          const preSide = baseSide(inv.kind);
          const preParty = await resolveParty(
            preSide,
            inv.customerId,
            inv.supplierId,
            companyId,
            tx,
          );
          const [confirmed] = await tx
            .update(invoicesTable)
            .set({ status: "confirmed", approvedAt: new Date() })
            .where(
              and(
                eq(invoicesTable.id, id),
                eq(invoicesTable.companyId, companyId),
              ),
            )
            .returning();
          return {
            result: confirmed!,
            partyName: "error" in preParty ? "" : preParty.name,
          };
        }

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
          const rWhtTaxIds = [
            ...new Set(
              rLines.map((l) => l.whtTaxId).filter((x): x is string => !!x),
            ),
          ];
          const rAllTaxIds = [...new Set([...rTaxIds, ...rWhtTaxIds])];
          const rAllTaxRows = rAllTaxIds.length
            ? await tx
                .select({
                  id: taxesTable.id,
                  linkedAccountId: taxesTable.linkedAccountId,
                  whtDebitAccountId: taxesTable.whtDebitAccountId,
                })
                .from(taxesTable)
                .where(
                  and(
                    eq(taxesTable.companyId, companyId),
                    inArray(taxesTable.id, rAllTaxIds),
                  ),
                )
            : [];
          const rTaxMeta = new Map(rAllTaxRows.map((t) => [t.id, t]));
          const rTaxAccount = new Map(
            rTaxIds.map((id) => [id, rTaxMeta.get(id)?.linkedAccountId ?? null]),
          );
          for (const tid of rTaxIds) {
            if (!rTaxAccount.get(tid))
              throw new ApproveError(400, "الضريبة المحددة بدون حساب مرتبط");
          }
          const rIsSales = rSide === "sales";
          const rWhtAccount = new Map(
            rWhtTaxIds.map((id) => {
              const m = rTaxMeta.get(id);
              return [id, rIsSales ? m?.whtDebitAccountId ?? null : m?.linkedAccountId ?? null];
            }),
          );
          for (const tid of rWhtTaxIds) {
            if (!rWhtAccount.get(tid))
              throw new ApproveError(400, "ضريبة الخصم من المنبع بدون حساب مرتبط في الإشعار");
          }

          const rAccountIds: string[] = [rParty.accountId];
          for (const l of rLines) {
            rAccountIds.push(l.accountId);
            if (l.taxId) rAccountIds.push(rTaxAccount.get(l.taxId)!);
            if (l.whtTaxId) rAccountIds.push(rWhtAccount.get(l.whtTaxId)!);
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
            const whtBase = round2(Number(l.whtAmount) * rRate);
            // WHT reverses too: sales_return Cr WHT Receivable, purchase_return Dr WHT Payable.
            rPartyBase = round2(rPartyBase + lineTotalBase + taxBase - whtBase);
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
            if (whtBase > 0) {
              // sales_return: Cr WHT Receivable (reverse the Dr on original sale).
              // purchase_return: Dr WHT Payable (reverse the Cr on original purchase).
              rEntryLines.push({
                accountId: rWhtAccount.get(l.whtTaxId!)!,
                description: l.description,
                debit: isSalesReturn ? 0 : whtBase,
                credit: isSalesReturn ? whtBase : 0,
                taxId: l.whtTaxId,
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
        const whtTaxIds = [
          ...new Set(lines.map((l) => l.whtTaxId).filter((x): x is string => !!x)),
        ];
        // Load all tax metadata in one query (VAT + WHT combined).
        const allTaxIds = [...new Set([...taxIds, ...whtTaxIds])];
        const allTaxRows = allTaxIds.length
          ? await tx
              .select({
                id: taxesTable.id,
                kind: taxesTable.kind,
                linkedAccountId: taxesTable.linkedAccountId,
                whtDebitAccountId: taxesTable.whtDebitAccountId,
              })
              .from(taxesTable)
              .where(
                and(
                  eq(taxesTable.companyId, companyId),
                  inArray(taxesTable.id, allTaxIds),
                ),
              )
          : [];
        const taxMeta = new Map(allTaxRows.map((t) => [t.id, t]));
        // For VAT: uses linkedAccountId (Dr on purchase, Cr on sales).
        const taxAccount = new Map(
          taxIds.map((id) => [id, taxMeta.get(id)?.linkedAccountId ?? null]),
        );
        for (const tid of taxIds) {
          if (!taxAccount.get(tid))
            throw new ApproveError(400, "الضريبة المحددة بدون حساب مرتبط");
        }
        // For WHT: purchase uses linkedAccountId (Cr WHT Payable);
        //          sales uses whtDebitAccountId (Dr WHT Receivable).
        const isSalesInv = inv.kind === "sales";
        const whtAccount = new Map(
          whtTaxIds.map((id) => {
            const m = taxMeta.get(id);
            return [id, isSalesInv ? m?.whtDebitAccountId ?? null : m?.linkedAccountId ?? null];
          }),
        );
        for (const tid of whtTaxIds) {
          if (!whtAccount.get(tid))
            throw new ApproveError(
              400,
              isSalesInv
                ? "ضريبة الخصم من المنبع بدون حساب خصم مدين (للمبيعات)"
                : "ضريبة الخصم من المنبع بدون حساب دائن مرتبط (للمشتريات)",
            );
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
          if (l.whtTaxId) accountIds.push(whtAccount.get(l.whtTaxId)!);
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

        let partyBase = 0; // accumulated AR/AP base amount (net of WHT)

        for (const l of lines) {
          const lineTotalBase = round2(Number(l.lineTotal) * rate);
          const taxBase = round2(Number(l.taxAmount) * rate);
          const whtBase = round2(Number(l.whtAmount) * rate);
          // WHT reduces the amount owed by/to the party.
          partyBase = round2(partyBase + lineTotalBase + taxBase - whtBase);

          if (inv.kind === "sales") {
            // Revenue credited, VAT credited.
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
            // WHT: Dr WHT Receivable (customer withholds from you).
            if (whtBase > 0) {
              entryLines.push({
                accountId: whtAccount.get(l.whtTaxId!)!,
                description: l.description,
                debit: whtBase,
                credit: 0,
                taxId: l.whtTaxId,
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
            // WHT: Cr WHT Payable (you withhold from the supplier).
            if (whtBase > 0) {
              entryLines.push({
                accountId: whtAccount.get(l.whtTaxId!)!,
                description: l.description,
                debit: 0,
                credit: whtBase,
                taxId: l.whtTaxId,
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
      if (!["approved", "partially_paid", "paid", "confirmed"].includes(inv.status)) {
        res.status(400).json({ error: "يمكن التراجع عن المستندات المؤكدة أو المعتمدة أو المدفوعة فقط" });
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
        if (!locked || !["approved", "partially_paid", "paid", "confirmed"].includes(locked.status)) {
          throw new ApproveError(400, "المستند غير مؤهل للتراجع");
        }
        // For pre-documents (quotation/purchase_order): just reset to draft —
        // there is no JE and no payments to reverse.
        if (isPreDocument(locked.kind)) {
          await tx
            .update(invoicesTable)
            .set({ status: "draft", approvedAt: null })
            .where(
              and(
                eq(invoicesTable.id, id),
                eq(invoicesTable.companyId, companyId),
              ),
            );
          return;
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

// ---- Convert pre-document → posted invoice ----
// Converts a quotation → sales invoice or a purchase_order → purchase invoice.
// Copies all lines, creates the new invoice in draft status (ready for approval),
// and marks the source document status as "converted".
// Registered BEFORE the GET /invoices/:id param route so Express matches it.
router.post(
  "/invoices/:id/convert",
  requireAuth,
  requireCapability("invoices:create"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const sourceId = req.params["id"] as string;
    try {
      const [source] = await db
        .select()
        .from(invoicesTable)
        .where(
          and(
            eq(invoicesTable.id, sourceId),
            eq(invoicesTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!source) {
        res.status(404).json({ error: "المستند غير موجود" });
        return;
      }
      if (!isPreDocument(source.kind)) {
        res.status(400).json({ error: "يمكن التحويل من عروض الأسعار وأوامر الشراء فقط" });
        return;
      }
      if (source.status === "converted") {
        res.status(400).json({ error: "هذا المستند محوَّل بالفعل إلى فاتورة" });
        return;
      }

      const sourceLines = await db
        .select()
        .from(invoiceLinesTable)
        .where(eq(invoiceLinesTable.invoiceId, sourceId))
        .orderBy(asc(invoiceLinesTable.lineNo));

      const targetKind = source.kind === "quotation" ? "sales" : "purchase";
      const targetEntity = codeEntityFor(targetKind);

      const created = await db.transaction(async (tx) => {
        // Lock source document to prevent concurrent conversions.
        const [locked] = await tx
          .select()
          .from(invoicesTable)
          .where(
            and(
              eq(invoicesTable.id, sourceId),
              eq(invoicesTable.companyId, companyId),
            ),
          )
          .for("update")
          .limit(1);
        if (!locked || locked.status === "converted") {
          throw new ApproveError(400, "هذا المستند محوَّل بالفعل");
        }

        const invoiceNo = await nextInvoiceNo(tx, companyId, targetKind);
        const code = await generateEntityCode(
          tx,
          companyId,
          targetEntity,
          source.date,
        );
        const [newInv] = await tx
          .insert(invoicesTable)
          .values({
            companyId,
            kind: targetKind,
            invoiceNo,
            code,
            sourceDocumentId: sourceId,
            date: source.date,
            dueDate: source.dueDate ?? null,
            customerId: targetKind === "sales" ? source.customerId : null,
            supplierId: targetKind === "purchase" ? source.supplierId : null,
            costCenterId: source.costCenterId ?? null,
            projectId: source.projectId ?? null,
            branchId: source.branchId ?? null,
            currency: source.currency ?? null,
            exchangeRate: source.exchangeRate,
            status: "draft",
            notes: source.notes ?? null,
            subtotal: source.subtotal,
            discountTotal: source.discountTotal,
            taxTotal: source.taxTotal,
            total: source.total,
            amountPaid: "0",
            createdBy: req.auth!.userId,
          })
          .returning();

        if (sourceLines.length > 0) {
          await tx.insert(invoiceLinesTable).values(
            sourceLines.map((l) => ({
              invoiceId: newInv!.id,
              companyId,
              lineNo: l.lineNo,
              lineType: l.lineType,
              description: l.description,
              accountId: l.accountId,
              itemId: l.itemId,
              warehouse: l.warehouse,
              cogsAccountId: l.cogsAccountId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              discount: l.discount,
              taxId: l.taxId,
              taxAmount: l.taxAmount,
              lineTotal: l.lineTotal,
              costCenterId: l.costCenterId,
              projectId: l.projectId,
              branchId: l.branchId,
              assetNameAr: l.assetNameAr,
              assetNameEn: l.assetNameEn,
              assetUsefulLifeMonths: l.assetUsefulLifeMonths,
              assetSalvageValue: l.assetSalvageValue,
              assetAccumulatedAccountId: l.assetAccumulatedAccountId,
              assetExpenseAccountId: l.assetExpenseAccountId,
            })),
          );
        }

        // Mark the source document as converted.
        await tx
          .update(invoicesTable)
          .set({ status: "converted" })
          .where(
            and(
              eq(invoicesTable.id, sourceId),
              eq(invoicesTable.companyId, companyId),
            ),
          );

        return newInv!;
      });

      const freshLines = await db
        .select()
        .from(invoiceLinesTable)
        .where(eq(invoiceLinesTable.invoiceId, created.id))
        .orderBy(asc(invoiceLinesTable.lineNo));

      const targetSide = baseSide(targetKind);
      const partyResult = await resolveParty(
        targetSide,
        created.customerId,
        created.supplierId,
        companyId,
      );
      const partyName = "error" in partyResult ? null : partyResult.name;

      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "create",
          entity: targetEntity,
          entityId: created.id,
          entityLabel: `${docLabelAr(targetKind)} #${created.invoiceNo} (تحويل من ${docLabelAr(source.kind)} #${source.invoiceNo})`,
          newValue: {
            invoiceNo: created.invoiceNo,
            sourceDocumentId: sourceId,
            status: "draft",
          },
        },
        req.log,
      );

      res.status(201).json(toDetail(created, partyName, freshLines));
    } catch (err) {
      if (err instanceof ApproveError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      req.log.error({ err }, "Failed to convert pre-document to invoice");
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
        projectId: string | null;
        branchId: string | null;
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
          projectId: sheet.has("projectId") ? sheet.str(row, "projectId") || null : null,
          branchId: sheet.has("branchId") ? sheet.str(row, "branchId") || null : null,
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
          const ccErr = await validateCostCenters(
            rows.map((r) => r.costCenterId),
            companyId,
          );
          if (ccErr) {
            res.status(400).json({
              error: `الفاتورة ${i + 1}: ${ccErr}`,
            });
            return;
          }
          const projErr = await validateProjects(
            rows.map((r) => r.projectId),
            companyId,
          );
          if (projErr) {
            res.status(400).json({
              error: `الفاتورة ${i + 1}: ${projErr}`,
            });
            return;
          }
          const branchErr = await validateBranches(
            rows.map((r) => r.branchId),
            companyId,
          );
          if (branchErr) {
            res.status(400).json({
              error: `الفاتورة ${i + 1}: ${branchErr}`,
            });
            return;
          }
          const firstCostCenterId = rows[0]?.costCenterId ?? null;
          const firstProjectId = rows[0]?.projectId ?? null;
          const firstBranchId = rows[0]?.branchId ?? null;
          const headerDimsMismatch = rows.some(
            (r) =>
              (r.costCenterId ?? null) !== firstCostCenterId ||
              (r.projectId ?? null) !== firstProjectId ||
              (r.branchId ?? null) !== firstBranchId,
          );
          if (headerDimsMismatch) {
            res.status(400).json({
              error:
                `الفاتورة ${i + 1}: يجب أن تكون أبعاد رأس الفاتورة (costCenterId/projectId/branchId) موحّدة بين كل السطور`,
            });
            return;
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
              projectId: r.projectId,
              branchId: r.branchId,
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
              costCenterId: first.costCenterId ?? null,
              projectId: first.projectId ?? null,
              branchId: first.branchId ?? null,
              currency: first.currency ?? baseCurrency,
              exchangeRate: String(first.exchangeRate),
              status: "draft",
              notes: first.notes,
              subtotal: String(prep.totals.subtotal),
              discountTotal: String(prep.totals.discountTotal),
              taxTotal: String(prep.totals.taxTotal),
              whtTotal: String(prep.totals.whtTotal),
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
              whtTaxId: l.whtTaxId,
              whtAmount: String(l.whtAmount),
              lineTotal: String(l.lineTotal),
              costCenterId: l.costCenterId,
              projectId: l.projectId,
              branchId: l.branchId,
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
