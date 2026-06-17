import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  accountsTable,
  customersTable,
  suppliersTable,
  taxesTable,
  costCentersTable,
  journalEntriesTable,
  journalEntryLinesTable,
  invoicesTable,
  invoiceLinesTable,
  companiesTable,
  bankAccountsTable,
  bankMovementsTable,
  inventoryItemsTable,
} from "@workspace/db";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import { handleXlsxUpload } from "../lib/excel";
import { uploadLimiter } from "../lib/rate-limit";
import { generateEntityCode } from "../lib/codes";
import { allocateEntryNo } from "../lib/journal-posting";
import { safeAudit } from "../lib/audit";
import ExcelJS from "exceljs";
import type { Request, Response } from "express";

const router = Router();

// ---- Math helpers ----
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---- Cell string helper (same as excel.ts but inline to avoid import changes) ----
function cellStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && "text" in v) return String((v as { text: unknown }).text).trim();
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

// ---- Date parsing with format selection ----
export function parseDateValue(value: string, format: string): string | null {
  const v = value.trim();
  if (!v) return null;

  // Excel serial number (numeric string 40000–60000)
  const asNum = Number(v.replace(/,/g, ""));
  if (
    !isNaN(asNum) &&
    asNum > 40000 &&
    asNum < 60000 &&
    (format === "excel-serial" || /^\d{5}$/.test(v))
  ) {
    const d = new Date((asNum - 25569) * 86400000);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  const sep = v.includes("/") ? "/" : v.includes("-") ? "-" : v.includes(".") ? "." : null;
  if (!sep) return null;
  const parts = v.split(sep).map((p) => parseInt(p.trim(), 10));
  if (parts.length < 3 || parts.some((n) => isNaN(n))) return null;
  const [p1, p2, p3] = parts as [number, number, number];
  let day: number, month: number, year: number;
  if (format === "YYYY-MM-DD" || p1 > 31) {
    [year, month, day] = [p1, p2, p3];
  } else if (format === "MM/DD/YYYY") {
    [month, day, year] = [p1, p2, p3];
  } else {
    // DD/MM/YYYY (default) and auto
    [day, month, year] = [p1, p2, p3];
  }
  if (year < 100) year += 2000;
  if (year < 1900 || year > 2100) return null;
  const d = new Date(year, month - 1, day);
  if (isNaN(d.getTime()) || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

// ---- Mapped-row helpers ----
function getMappedStr(
  row: Record<string, string>,
  columnMap: Record<string, string>,
  field: string,
): string {
  const col = columnMap[field];
  return col ? (row[col] ?? "").trim() : "";
}

function getMappedNum(
  row: Record<string, string>,
  columnMap: Record<string, string>,
  field: string,
): number {
  const s = getMappedStr(row, columnMap, field).replace(/,/g, "");
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

// ---- Load base currency ----
async function loadBaseCurrency(companyId: string): Promise<string> {
  const [c] = await db
    .select({ baseCurrency: companiesTable.baseCurrency })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);
  return (c?.baseCurrency ?? "EGP").toUpperCase();
}

// =============================================================================
// POST /import/parse-preview
// Parses an xlsx file and returns raw headers + up to 500 rows (no DB writes).
// =============================================================================
router.post(
  "/import/parse-preview",
  requireAuth,
  uploadLimiter,
  handleXlsxUpload,
  async (req: Request, res: Response) => {
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

      const headers: string[] = [];
      ws.getRow(1).eachCell((cell) => {
        const h = cellStr(cell.value);
        if (h) headers.push(h);
      });
      if (headers.length === 0) {
        res.status(400).json({ error: "لا توجد أعمدة في الصف الأول" });
        return;
      }

      const rows: Record<string, string>[] = [];
      for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const obj: Record<string, string> = {};
        let hasData = false;
        headers.forEach((h, i) => {
          const val = cellStr(row.getCell(i + 1).value);
          obj[h] = val;
          if (val) hasData = true;
        });
        if (hasData) rows.push(obj);
        if (rows.length >= 500) break;
      }

      res.json({ headers, rows, totalRows: rows.length });
    } catch (err) {
      req.log.error({ err }, "import parse-preview failed");
      res.status(400).json({ error: "تعذّر قراءة الملف. تأكد أنه ملف Excel صحيح." });
    }
  },
);

// =============================================================================
// POST /import/execute
// body: { type, columnMap, rows, dateFormat?, dryRun? }
// type: "journal" | "sales" | "purchase"
// dryRun=true  → validate only, returns per-group results (no DB writes)
// dryRun=false → validate + save to DB (skip groups with errors)
// =============================================================================
router.post(
  "/import/execute",
  requireAuth,
  uploadLimiter,
  (req: Request, res: Response, next) => {
    const type = req.body?.type;
    const cap =
      type === "journal" || type === "opening-balances"
        ? "journal:create"
        : type === "bank-statement"
          ? "bank:create"
          : "invoices:create";
    requireCapability(cap)(req, res, next);
  },
  async (req: Request, res: Response) => {
    const {
      type,
      columnMap,
      rows,
      dateFormat = "auto",
      dryRun = true,
    } = req.body ?? {};
    const companyId = req.auth!.companyId;
    const userId = req.auth!.userId;

    if (!type || !columnMap || !Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: "بيانات غير مكتملة" });
      return;
    }

    try {
      if (type === "journal") {
        await handleJournalImport(req, res, {
          companyId,
          userId,
          rows,
          columnMap,
          dateFormat,
          dryRun: Boolean(dryRun),
        });
      } else if (type === "sales" || type === "purchase") {
        await handleInvoiceImport(req, res, {
          companyId,
          userId,
          kind: type as "sales" | "purchase",
          rows,
          columnMap,
          dateFormat,
          dryRun: Boolean(dryRun),
        });
      } else if (type === "opening-balances") {
        await handleOpeningBalancesImport(req, res, {
          companyId,
          userId,
          rows,
          columnMap,
          dryRun: Boolean(dryRun),
        });
      } else if (type === "bank-statement") {
        const bankAccountId = (req.body?.bankAccountId ?? "") as string;
        await handleBankStatementImport(req, res, {
          companyId,
          userId,
          rows,
          columnMap,
          dateFormat,
          dryRun: Boolean(dryRun),
          bankAccountId,
        });
      } else {
        res.status(400).json({ error: "نوع غير معروف" });
      }
    } catch (err) {
      req.log.error({ err }, "import execute failed");
      res.status(500).json({ error: "حدث خطأ في الخادم أثناء الاستيراد" });
    }
  },
);

// =============================================================================
// JOURNAL IMPORT HANDLER
// =============================================================================
type JournalMappedRow = {
  _rowIndex: number;
  entryRef: string;
  date: string | null;
  notes: string;
  accountCode: string;
  description: string;
  debit: number;
  credit: number;
  currency: string;
  exchangeRate: number;
  costCenterName: string;
};

type JournalGroup = {
  key: string;
  date: string | null;
  ref: string;
  notes: string;
  rows: JournalMappedRow[];
  lines: JournalPreparedLine[];
  _status: "ok" | "warning" | "error";
  _errors: string[];
};

type JournalPreparedLine = {
  accountId: string;
  accountCode: string;
  description: string | null;
  currency: string;
  exchangeRate: number;
  debit: number;
  credit: number;
  debitBase: number;
  creditBase: number;
  costCenterId: string | null;
};

async function handleJournalImport(
  req: Request,
  res: Response,
  opts: {
    companyId: string;
    userId: string;
    rows: Record<string, string>[];
    columnMap: Record<string, string>;
    dateFormat: string;
    dryRun: boolean;
  },
): Promise<void> {
  const { companyId, userId, rows, columnMap, dateFormat, dryRun } = opts;

  // Load reference data
  const [accounts, costCenters] = await Promise.all([
    db
      .select({
        id: accountsTable.id,
        code: accountsTable.code,
        isGroup: accountsTable.isGroup,
      })
      .from(accountsTable)
      .where(eq(accountsTable.companyId, companyId)),
    db
      .select({ id: costCentersTable.id, nameAr: costCentersTable.nameAr })
      .from(costCentersTable)
      .where(eq(costCentersTable.companyId, companyId)),
  ]);
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const ccByName = new Map(costCenters.map((c) => [c.nameAr, c.id]));

  // Map raw rows
  const mapped: JournalMappedRow[] = [];
  let autoIdx = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const accountCode = getMappedStr(row, columnMap, "accountCode");
    const rawDate = getMappedStr(row, columnMap, "date");
    if (!accountCode && !rawDate) continue;
    mapped.push({
      _rowIndex: i,
      entryRef: getMappedStr(row, columnMap, "entryRef"),
      date: rawDate ? parseDateValue(rawDate, dateFormat) : null,
      notes: getMappedStr(row, columnMap, "notes"),
      accountCode,
      description: getMappedStr(row, columnMap, "description"),
      debit: getMappedNum(row, columnMap, "debit"),
      credit: getMappedNum(row, columnMap, "credit"),
      currency: getMappedStr(row, columnMap, "currency") || "EGP",
      exchangeRate: getMappedNum(row, columnMap, "exchangeRate") || 1,
      costCenterName: getMappedStr(row, columnMap, "costCenterName"),
    });
    autoIdx++;
  }

  if (mapped.length === 0) {
    res.status(400).json({ error: "لا توجد بيانات للاستيراد" });
    return;
  }

  // Group rows by entryRef (or auto-key per date+sequence)
  const groupsMap = new Map<
    string,
    { date: string | null; ref: string; notes: string; rows: JournalMappedRow[] }
  >();
  const groupOrder: string[] = [];
  let seqKey = 0;

  for (const r of mapped) {
    const key = r.entryRef
      ? r.entryRef
      : `__auto__${r.date ?? "nodate"}_${seqKey++}`;
    if (!groupsMap.has(key)) {
      groupsMap.set(key, { date: r.date, ref: r.entryRef, notes: r.notes, rows: [] });
      groupOrder.push(key);
    }
    groupsMap.get(key)!.rows.push(r);
  }

  // Validate each group
  const validated: JournalGroup[] = [];
  for (const key of groupOrder) {
    const g = groupsMap.get(key)!;
    const errors: string[] = [];
    let status: "ok" | "warning" | "error" = "ok";

    if (!g.date) {
      errors.push("التاريخ مفقود أو غير صحيح");
      status = "error";
    }
    if (g.rows.length < 2) {
      errors.push("القيد يجب أن يحتوي على سطرين على الأقل");
      status = "error";
    }

    const lines: JournalPreparedLine[] = [];
    for (const r of g.rows) {
      if (!r.accountCode) {
        errors.push(`السطر ${r._rowIndex + 2}: كود الحساب مفقود`);
        status = "error";
        continue;
      }
      const acc = byCode.get(r.accountCode);
      if (!acc) {
        errors.push(`كود الحساب "${r.accountCode}" غير موجود في شجرة الحسابات`);
        status = "error";
        continue;
      }
      if (acc.isGroup) {
        errors.push(`الحساب "${r.accountCode}" حساب مجموعة لا يقبل ترحيلاً مباشراً`);
        status = "error";
        continue;
      }
      if (r.debit === 0 && r.credit === 0) {
        errors.push(`سطر الحساب "${r.accountCode}": المدين والدائن كلاهما صفر`);
        if (status === "ok") status = "warning";
      }
      const costCenterId = r.costCenterName
        ? (ccByName.get(r.costCenterName) ?? null)
        : null;
      if (r.costCenterName && !costCenterId) {
        errors.push(`مركز التكلفة "${r.costCenterName}" غير موجود (سيتم التجاهل)`);
        if (status === "ok") status = "warning";
      }
      lines.push({
        accountId: acc.id,
        accountCode: r.accountCode,
        description: r.description || null,
        currency: r.currency,
        exchangeRate: r.exchangeRate,
        debit: r.debit,
        credit: r.credit,
        debitBase: round2(r.debit * r.exchangeRate),
        creditBase: round2(r.credit * r.exchangeRate),
        costCenterId,
      });
    }

    // Balance check
    if (status !== "error" && lines.length >= 2) {
      const totalDebitBase = round2(lines.reduce((s, l) => s + l.debitBase, 0));
      const totalCreditBase = round2(lines.reduce((s, l) => s + l.creditBase, 0));
      if (Math.abs(totalDebitBase - totalCreditBase) > 0.005) {
        errors.push(
          `القيد غير متوازن: مجموع المدين (${totalDebitBase}) ≠ مجموع الدائن (${totalCreditBase})`,
        );
        status = "error";
      }
    }

    validated.push({
      key,
      date: g.date,
      ref: g.ref,
      notes: g.notes,
      rows: g.rows,
      lines,
      _status: status,
      _errors: errors,
    });
  }

  if (dryRun) {
    const summary = {
      total: validated.length,
      ok: validated.filter((g) => g._status === "ok").length,
      warning: validated.filter((g) => g._status === "warning").length,
      error: validated.filter((g) => g._status === "error").length,
      totalRows: mapped.length,
    };
    res.json({
      groups: validated.map((g) => ({
        key: g.key,
        date: g.date,
        ref: g.ref,
        notes: g.notes,
        lineCount: g.rows.length,
        _status: g._status,
        _errors: g._errors,
        rows: g.rows.map((r) => ({
          _rowIndex: r._rowIndex,
          date: r.date,
          accountCode: r.accountCode,
          description: r.description,
          debit: r.debit,
          credit: r.credit,
          currency: r.currency,
        })),
      })),
      summary,
    });
    return;
  }

  // Execute: only import groups without errors
  const valid = validated.filter((g) => g._status !== "error");
  if (valid.length === 0) {
    res.status(400).json({ error: "لا توجد قيود صحيحة للاستيراد" });
    return;
  }

  const created = await db.transaction(async (tx) => {
    let count = 0;
    for (const g of valid) {
      const entryNo = await allocateEntryNo(tx, companyId, g.date!);
      const [entry] = await tx
        .insert(journalEntriesTable)
        .values({
          companyId,
          entryNo,
          date: g.date!,
          reference: g.ref || null,
          notes: g.notes || null,
          status: "draft",
          createdBy: userId,
        })
        .returning();
      await tx.insert(journalEntryLinesTable).values(
        g.lines.map((l, i) => ({
          entryId: entry!.id,
          companyId,
          lineNo: i + 1,
          accountId: l.accountId,
          description: l.description,
          currency: l.currency,
          exchangeRate: String(l.exchangeRate),
          debit: String(round2(l.debit)),
          credit: String(round2(l.credit)),
          debitBase: String(l.debitBase),
          creditBase: String(l.creditBase),
          costCenterId: l.costCenterId,
        })),
      );
      count++;
    }
    return count;
  });

  res.status(201).json({
    imported: created,
    skipped: validated.length - valid.length,
    total: validated.length,
  });
}

// =============================================================================
// INVOICE IMPORT HANDLER
// =============================================================================
type InvoiceMappedRow = {
  _rowIndex: number;
  groupKey: string;
  date: string | null;
  partyName: string;
  currency: string;
  exchangeRate: number;
  accountCode: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxName: string;
  costCenterName: string;
};

type InvoicePreparedLine = {
  lineNo: number;
  accountId: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxId: string | null;
  taxAmount: number;
  lineTotal: number;
  costCenterId: string | null;
};

type ValidatedInvoice = {
  key: string;
  date: string;
  partyName: string;
  partyId: string | null;
  currency: string;
  exchangeRate: number;
  preparedLines: InvoicePreparedLine[];
  totals: { subtotal: number; discountTotal: number; taxTotal: number; total: number };
  rows: InvoiceMappedRow[];
  _status: "ok" | "warning" | "error";
  _errors: string[];
};

async function handleInvoiceImport(
  req: Request,
  res: Response,
  opts: {
    companyId: string;
    userId: string;
    kind: "sales" | "purchase";
    rows: Record<string, string>[];
    columnMap: Record<string, string>;
    dateFormat: string;
    dryRun: boolean;
  },
): Promise<void> {
  const { companyId, userId, kind, rows, columnMap, dateFormat, dryRun } = opts;

  // Load reference data
  const [partiesRaw, accounts, taxes, costCenters, baseCurrency] =
    await Promise.all([
      kind === "sales"
        ? db
            .select({ id: customersTable.id, nameAr: customersTable.nameAr })
            .from(customersTable)
            .where(eq(customersTable.companyId, companyId))
        : db
            .select({ id: suppliersTable.id, nameAr: suppliersTable.nameAr })
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
        .select({ id: taxesTable.id, nameAr: taxesTable.nameAr, rate: taxesTable.rate })
        .from(taxesTable)
        .where(eq(taxesTable.companyId, companyId)),
      db
        .select({ id: costCentersTable.id, nameAr: costCentersTable.nameAr })
        .from(costCentersTable)
        .where(eq(costCentersTable.companyId, companyId)),
      loadBaseCurrency(companyId),
    ]);

  const partyByName = new Map(partiesRaw.map((p) => [p.nameAr, p.id]));
  const accountByCode = new Map(accounts.map((a) => [a.code, a]));
  const taxByName = new Map(
    taxes.map((t) => [t.nameAr, { id: t.id, rate: Number(t.rate) }]),
  );
  const ccByName = new Map(costCenters.map((c) => [c.nameAr, c.id]));

  // Map rows
  const mapped: InvoiceMappedRow[] = [];
  let autoGroup = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const partyName = getMappedStr(row, columnMap, "partyName");
    const accountCode = getMappedStr(row, columnMap, "accountCode");
    if (!partyName && !accountCode) continue;
    const rawDate = getMappedStr(row, columnMap, "date");
    const invoiceNo = getMappedStr(row, columnMap, "invoiceNo");
    const groupKey =
      invoiceNo || `__auto__${rawDate}_${partyName}_${autoGroup++}`;
    mapped.push({
      _rowIndex: i,
      groupKey,
      date: rawDate ? parseDateValue(rawDate, dateFormat) : null,
      partyName,
      currency: getMappedStr(row, columnMap, "currency") || baseCurrency,
      exchangeRate: getMappedNum(row, columnMap, "exchangeRate") || 1,
      accountCode,
      description: getMappedStr(row, columnMap, "description"),
      quantity: getMappedNum(row, columnMap, "quantity") || 1,
      unitPrice: getMappedNum(row, columnMap, "unitPrice"),
      discount: getMappedNum(row, columnMap, "discount"),
      taxName: getMappedStr(row, columnMap, "taxName"),
      costCenterName: getMappedStr(row, columnMap, "costCenterName"),
    });
  }

  if (mapped.length === 0) {
    res.status(400).json({ error: "لا توجد بيانات للاستيراد" });
    return;
  }

  // Group by invoiceKey
  const groupsMap = new Map<string, InvoiceMappedRow[]>();
  const groupOrder: string[] = [];
  for (const r of mapped) {
    if (!groupsMap.has(r.groupKey)) {
      groupsMap.set(r.groupKey, []);
      groupOrder.push(r.groupKey);
    }
    groupsMap.get(r.groupKey)!.push(r);
  }

  // Validate groups
  const validated: ValidatedInvoice[] = [];
  for (const key of groupOrder) {
    const lines = groupsMap.get(key)!;
    const first = lines[0]!;
    const errors: string[] = [];
    let status: "ok" | "warning" | "error" = "ok";

    if (!first.date) {
      errors.push("التاريخ مفقود أو غير صحيح");
      status = "error";
    }
    if (!first.partyName) {
      errors.push(kind === "sales" ? "اسم العميل مفقود" : "اسم المورد مفقود");
      status = "error";
    }
    const partyId = partyByName.get(first.partyName) ?? null;
    if (first.partyName && !partyId) {
      errors.push(
        `${kind === "sales" ? "العميل" : "المورد"} "${first.partyName}" غير موجود في النظام`,
      );
      status = "error";
    }

    const preparedLines: InvoicePreparedLine[] = [];
    const totals = { subtotal: 0, discountTotal: 0, taxTotal: 0, total: 0 };

    for (let li = 0; li < lines.length; li++) {
      const l = lines[li]!;
      if (!l.accountCode) {
        errors.push(`السطر ${li + 1}: كود الحساب مفقود`);
        status = "error";
        continue;
      }
      const acc = accountByCode.get(l.accountCode);
      if (!acc) {
        errors.push(`كود الحساب "${l.accountCode}" غير موجود`);
        status = "error";
        continue;
      }
      if (acc.isGroup) {
        errors.push(`الحساب "${l.accountCode}" هو حساب مجموعة ولا يمكن استخدامه`);
        status = "error";
        continue;
      }
      if (l.quantity <= 0) {
        errors.push(`السطر ${li + 1}: الكمية يجب أن تكون أكبر من صفر (${l.quantity})`);
        status = "error";
        continue;
      }
      if (l.unitPrice < 0) {
        errors.push(`السطر ${li + 1}: السعر لا يمكن أن يكون سالباً`);
        status = "error";
        continue;
      }

      const tax = l.taxName ? taxByName.get(l.taxName) : null;
      if (l.taxName && !tax) {
        errors.push(`الضريبة "${l.taxName}" غير موجودة (سيتم التجاهل)`);
        if (status === "ok") status = "warning";
      }
      const costCenterId = l.costCenterName
        ? (ccByName.get(l.costCenterName) ?? null)
        : null;
      if (l.costCenterName && !costCenterId) {
        errors.push(`مركز التكلفة "${l.costCenterName}" غير موجود (سيتم التجاهل)`);
        if (status === "ok") status = "warning";
      }

      const lineSubtotal = round2(l.unitPrice * l.quantity);
      const discountAmt = round2(lineSubtotal * (l.discount / 100));
      const lineTotal = round2(lineSubtotal - discountAmt);
      const taxRate = tax?.rate ?? 0;
      const taxAmount = round2(lineTotal * (taxRate / 100));

      totals.subtotal = round2(totals.subtotal + lineSubtotal);
      totals.discountTotal = round2(totals.discountTotal + discountAmt);
      totals.taxTotal = round2(totals.taxTotal + taxAmount);
      totals.total = round2(totals.total + lineTotal + taxAmount);

      preparedLines.push({
        lineNo: li + 1,
        accountId: acc.id,
        description: l.description || null,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
        taxId: tax?.id ?? null,
        taxAmount,
        lineTotal,
        costCenterId,
      });
    }

    validated.push({
      key,
      date: first.date ?? "",
      partyName: first.partyName,
      partyId,
      currency: first.currency,
      exchangeRate: first.exchangeRate,
      preparedLines,
      totals,
      rows: lines,
      _status: status,
      _errors: errors,
    });
  }

  if (dryRun) {
    const summary = {
      total: validated.length,
      ok: validated.filter((i) => i._status === "ok").length,
      warning: validated.filter((i) => i._status === "warning").length,
      error: validated.filter((i) => i._status === "error").length,
      totalRows: mapped.length,
    };
    res.json({
      groups: validated.map((inv) => ({
        key: inv.key,
        date: inv.date,
        partyName: inv.partyName,
        lineCount: inv.rows.length,
        total: inv.totals.total,
        _status: inv._status,
        _errors: inv._errors,
        rows: inv.rows.map((l) => ({
          _rowIndex: l._rowIndex,
          accountCode: l.accountCode,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          taxName: l.taxName,
        })),
      })),
      summary,
    });
    return;
  }

  // Execute: only import groups without errors
  const valid = validated.filter((i) => i._status !== "error");
  if (valid.length === 0) {
    res.status(400).json({ error: "لا توجد فواتير صحيحة للاستيراد" });
    return;
  }

  const codeEntity = kind === "sales" ? "sales_invoice" : ("purchase_invoice" as const);
  const createdIds: string[] = await db.transaction(async (tx) => {
    const ids: string[] = [];
    for (const inv of valid) {
      // Concurrency-safe invoice number allocation
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${companyId + ":inv:" + kind}))`,
      );
      const [{ maxNo }] = await tx
        .select({
          maxNo: sql<number>`coalesce(max(${invoicesTable.invoiceNo}), 0)`,
        })
        .from(invoicesTable)
        .where(
          and(eq(invoicesTable.companyId, companyId), eq(invoicesTable.kind, kind)),
        );
      const invoiceNo = Number(maxNo) + 1;
      const code = await generateEntityCode(tx, companyId, codeEntity, inv.date);

      const [created] = await tx
        .insert(invoicesTable)
        .values({
          companyId,
          kind,
          invoiceNo,
          code,
          date: inv.date,
          dueDate: null,
          customerId: kind === "sales" ? inv.partyId : null,
          supplierId: kind === "purchase" ? inv.partyId : null,
          currency: inv.currency,
          exchangeRate: String(inv.exchangeRate),
          status: "draft",
          notes: null,
          subtotal: String(inv.totals.subtotal),
          discountTotal: String(inv.totals.discountTotal),
          taxTotal: String(inv.totals.taxTotal),
          total: String(inv.totals.total),
          amountPaid: "0",
          createdBy: userId,
        })
        .returning();

      await tx.insert(invoiceLinesTable).values(
        inv.preparedLines.map((l) => ({
          invoiceId: created!.id,
          companyId,
          lineNo: l.lineNo,
          lineType: "service" as const,
          description: l.description,
          accountId: l.accountId,
          quantity: String(l.quantity),
          unitPrice: String(l.unitPrice),
          discount: String(l.discount),
          taxId: l.taxId,
          taxAmount: String(l.taxAmount),
          lineTotal: String(l.lineTotal),
          costCenterId: l.costCenterId,
        })),
      );
      ids.push(created!.id);
    }
    return ids;
  });

  for (const id of createdIds) {
    await safeAudit(
      db,
      {
        companyId,
        userId,
        action: "create",
        entity: codeEntity,
        entityId: id,
        entityLabel: `فاتورة مستوردة عبر معالج الاستيراد`,
      },
      req.log,
    );
  }

  res.status(201).json({
    imported: createdIds.length,
    skipped: validated.length - valid.length,
    total: validated.length,
  });
}

// =============================================================================
// LOAD OPENING BALANCE SNAPSHOT (for import merge)
// =============================================================================
async function loadObSnapshot(companyId: string): Promise<{
  date: string | null;
  banks: Array<{ bankAccountId: string; balance: number }>;
  customers: Array<{ customerId: string; balance: number }>;
  suppliers: Array<{ supplierId: string; balance: number }>;
  inventory: Array<{ itemId: string; quantity: number; unitCost: number }>;
}> {
  const [entry] = await db
    .select({ id: journalEntriesTable.id, date: journalEntriesTable.date })
    .from(journalEntriesTable)
    .where(
      and(
        eq(journalEntriesTable.companyId, companyId),
        eq(journalEntriesTable.isOpeningBalance, true),
      ),
    )
    .limit(1);

  const lines = entry
    ? await db
        .select({
          accountId: journalEntryLinesTable.accountId,
          debit: journalEntryLinesTable.debitBase,
          credit: journalEntryLinesTable.creditBase,
        })
        .from(journalEntryLinesTable)
        .where(eq(journalEntryLinesTable.entryId, entry.id))
    : [];

  const [banks, customers, suppliers, items] = await Promise.all([
    db
      .select({ id: bankAccountsTable.id, openingBalance: bankAccountsTable.openingBalance })
      .from(bankAccountsTable)
      .where(eq(bankAccountsTable.companyId, companyId)),
    db
      .select({ id: customersTable.id, accountId: customersTable.accountId })
      .from(customersTable)
      .where(eq(customersTable.companyId, companyId)),
    db
      .select({ id: suppliersTable.id, accountId: suppliersTable.accountId })
      .from(suppliersTable)
      .where(eq(suppliersTable.companyId, companyId)),
    db
      .select({
        id: inventoryItemsTable.id,
        quantityOnHand: inventoryItemsTable.quantityOnHand,
        averageCost: inventoryItemsTable.averageCost,
      })
      .from(inventoryItemsTable)
      .where(eq(inventoryItemsTable.companyId, companyId)),
  ]);

  const custByAccount = new Map(customers.map((c) => [c.accountId, c.id]));
  const suppByAccount = new Map(suppliers.map((s) => [s.accountId, s.id]));
  const MONEY_EPS = 0.005;

  const customersOut: Array<{ customerId: string; balance: number }> = [];
  const suppliersOut: Array<{ supplierId: string; balance: number }> = [];

  for (const l of lines) {
    const debit = round2(Number(l.debit));
    const credit = round2(Number(l.credit));
    if (custByAccount.has(l.accountId)) {
      customersOut.push({
        customerId: custByAccount.get(l.accountId)!,
        balance: round2(debit - credit),
      });
    } else if (suppByAccount.has(l.accountId)) {
      suppliersOut.push({
        supplierId: suppByAccount.get(l.accountId)!,
        balance: round2(credit - debit),
      });
    }
  }

  const banksOut = banks
    .map((b) => ({ bankAccountId: b.id, balance: round2(Number(b.openingBalance)) }))
    .filter((b) => Math.abs(b.balance) > MONEY_EPS);

  const inventoryOut = items
    .map((i) => ({
      itemId: i.id,
      quantity: Math.round(Number(i.quantityOnHand) * 10000) / 10000,
      unitCost: Math.round(Number(i.averageCost) * 10000) / 10000,
    }))
    .filter((i) => Math.abs(i.quantity) > 0.00005);

  return {
    date: entry?.date ?? null,
    banks: banksOut,
    customers: customersOut,
    suppliers: suppliersOut,
    inventory: inventoryOut,
  };
}

// =============================================================================
// OPENING BALANCES IMPORT HANDLER
// =============================================================================
async function handleOpeningBalancesImport(
  req: Request,
  res: Response,
  opts: {
    companyId: string;
    userId: string;
    rows: Record<string, string>[];
    columnMap: Record<string, string>;
    dryRun: boolean;
  },
): Promise<void> {
  const { companyId, rows, columnMap, dryRun } = opts;

  const [accounts, banks, customers, suppliers, inventory] = await Promise.all([
    db
      .select({ id: accountsTable.id, code: accountsTable.code, isGroup: accountsTable.isGroup })
      .from(accountsTable)
      .where(eq(accountsTable.companyId, companyId)),
    db
      .select({ accountId: bankAccountsTable.accountId })
      .from(bankAccountsTable)
      .where(eq(bankAccountsTable.companyId, companyId)),
    db
      .select({ accountId: customersTable.accountId, controlAccountId: customersTable.controlAccountId })
      .from(customersTable)
      .where(eq(customersTable.companyId, companyId)),
    db
      .select({ accountId: suppliersTable.accountId, controlAccountId: suppliersTable.controlAccountId })
      .from(suppliersTable)
      .where(eq(suppliersTable.companyId, companyId)),
    db
      .select({ inventoryAccountId: inventoryItemsTable.inventoryAccountId })
      .from(inventoryItemsTable)
      .where(eq(inventoryItemsTable.companyId, companyId)),
  ]);

  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const managedAccountIds = new Set<string>([
    ...banks.map((b) => b.accountId),
    ...customers.flatMap((c) =>
      [c.accountId, c.controlAccountId].filter((x): x is string => Boolean(x)),
    ),
    ...suppliers.flatMap((s) =>
      [s.accountId, s.controlAccountId].filter((x): x is string => Boolean(x)),
    ),
    ...inventory.map((i) => i.inventoryAccountId),
  ]);

  type PrepRow = {
    key: string;
    date: null;
    lineCount: number;
    total: number;
    accountCode: string;
    debit: number;
    credit: number;
    accountId?: string;
    _status: "ok" | "warning" | "error";
    _errors: string[];
    rows: Array<Record<string, unknown>>;
  };

  const prepared: PrepRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const accountCode = getMappedStr(row, columnMap, "accountCode");
    if (!accountCode) continue;
    const debit = getMappedNum(row, columnMap, "debit");
    const credit = getMappedNum(row, columnMap, "credit");

    const errors: string[] = [];
    let status: "ok" | "warning" | "error" = "ok";
    let accountId: string | undefined;

    const acc = byCode.get(accountCode);
    if (!acc) {
      errors.push(`كود الحساب "${accountCode}" غير موجود في شجرة الحسابات`);
      status = "error";
    } else if (acc.isGroup) {
      errors.push(`الحساب "${accountCode}" حساب مجموعة — لا يقبل ترحيلاً مباشراً`);
      status = "error";
    } else if (managedAccountIds.has(acc.id)) {
      errors.push(`الحساب "${accountCode}" يُدار عبر قسمه الخاص (بنوك / عملاء / موردون / مخزون)`);
      status = "error";
    } else if (debit > 0 && credit > 0) {
      errors.push("لا يمكن تعبئة مدين ودائن معاً في نفس السطر");
      status = "error";
    } else if (debit === 0 && credit === 0) {
      errors.push("المدين والدائن كلاهما صفر — سيتم تجاهل هذا السطر");
      status = "warning";
    } else {
      accountId = acc.id;
    }

    prepared.push({
      key: accountCode,
      date: null,
      lineCount: 1,
      total: debit || credit,
      accountCode,
      debit,
      credit,
      accountId,
      _status: status,
      _errors: errors,
      rows: [row as Record<string, unknown>],
    });
  }

  if (prepared.length === 0) {
    res.status(400).json({ error: "لا توجد بيانات للاستيراد" });
    return;
  }

  const summary = {
    total: prepared.length,
    ok: prepared.filter((p) => p._status === "ok").length,
    warning: prepared.filter((p) => p._status === "warning").length,
    error: prepared.filter((p) => p._status === "error").length,
    totalRows: rows.length,
  };

  if (dryRun) {
    res.json({
      groups: prepared.map((p) => ({
        key: p.key,
        date: p.date,
        lineCount: 1,
        total: p.total,
        _status: p._status,
        _errors: p._errors,
        rows: [{ accountCode: p.accountCode, debit: p.debit, credit: p.credit }],
      })),
      summary,
    });
    return;
  }

  const validAccounts = prepared
    .filter((p) => p._status !== "error" && p.accountId)
    .map((p) => ({ accountId: p.accountId!, debit: p.debit, credit: p.credit }));

  if (validAccounts.length === 0) {
    res.status(400).json({ error: "لا توجد حسابات صحيحة للاستيراد" });
    return;
  }

  const snapshot = await loadObSnapshot(companyId);
  const saveDate = snapshot.date ?? new Date().toISOString().slice(0, 10);

  const port = process.env.PORT ?? "5000";
  const saveRes = await fetch(`http://localhost:${port}/api/opening-balances`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(req.headers.cookie ? { Cookie: req.headers.cookie as string } : {}),
    },
    body: JSON.stringify({
      date: saveDate,
      accounts: validAccounts,
      banks: snapshot.banks,
      customers: snapshot.customers,
      suppliers: snapshot.suppliers,
      inventory: snapshot.inventory,
    }),
  });

  if (!saveRes.ok) {
    const errBody = await saveRes.json().catch(() => ({}));
    res
      .status(saveRes.status)
      .json({ error: (errBody as { error?: string })?.error ?? "تعذّر حفظ الأرصدة الافتتاحية" });
    return;
  }

  res.status(201).json({
    imported: validAccounts.length,
    skipped: prepared.length - validAccounts.length,
    total: prepared.length,
  });
}

// =============================================================================
// BANK STATEMENT IMPORT HANDLER
// =============================================================================
async function handleBankStatementImport(
  req: Request,
  res: Response,
  opts: {
    companyId: string;
    userId: string;
    rows: Record<string, string>[];
    columnMap: Record<string, string>;
    dateFormat: string;
    dryRun: boolean;
    bankAccountId: string;
  },
): Promise<void> {
  const { companyId, userId, rows, columnMap, dateFormat, dryRun, bankAccountId } = opts;

  if (!bankAccountId) {
    res.status(400).json({ error: "لم يُحدَّد الحساب البنكي — أغلق الويزارد وحدد حساباً أولاً" });
    return;
  }

  const [bankAccount] = await db
    .select({ id: bankAccountsTable.id, currency: bankAccountsTable.currency })
    .from(bankAccountsTable)
    .where(
      and(
        eq(bankAccountsTable.id, bankAccountId),
        eq(bankAccountsTable.companyId, companyId),
      ),
    );

  if (!bankAccount) {
    res.status(400).json({ error: "الحساب البنكي غير موجود أو لا تملك صلاحية الوصول إليه" });
    return;
  }

  type PrepRow = {
    key: string;
    date: string | null;
    lineCount: number;
    total: number;
    notes: string;
    direction: "in" | "out";
    amount: number;
    reference: string;
    _status: "ok" | "warning" | "error";
    _errors: string[];
    rows: Array<Record<string, unknown>>;
  };

  const prepared: PrepRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rawDate = getMappedStr(row, columnMap, "date");
    const debitRaw = getMappedNum(row, columnMap, "debit");
    const creditRaw = getMappedNum(row, columnMap, "credit");
    const notes = getMappedStr(row, columnMap, "notes");
    const reference = getMappedStr(row, columnMap, "reference");

    if (!rawDate && debitRaw === 0 && creditRaw === 0) continue;

    const errors: string[] = [];
    let status: "ok" | "warning" | "error" = "ok";

    const date = rawDate ? parseDateValue(rawDate, dateFormat) : null;
    if (!date) {
      errors.push("التاريخ مفقود أو غير صحيح");
      status = "error";
    }

    let direction: "in" | "out" = "in";
    let amount = 0;

    if (debitRaw > 0 && creditRaw === 0) {
      direction = "in";
      amount = debitRaw;
    } else if (creditRaw > 0 && debitRaw === 0) {
      direction = "out";
      amount = creditRaw;
    } else if (debitRaw > 0 && creditRaw > 0) {
      errors.push("مدين ودائن في نفس السطر — تحقق من البيانات");
      status = "error";
    } else {
      errors.push("لا يوجد مبلغ — تحقق من ربط عمود الوارد أو الصادر");
      status = "error";
    }

    prepared.push({
      key: String(i + 1),
      date,
      lineCount: 1,
      total: amount,
      notes,
      direction,
      amount,
      reference,
      _status: status,
      _errors: errors,
      rows: [row as Record<string, unknown>],
    });
  }

  if (prepared.length === 0) {
    res.status(400).json({ error: "لا توجد بيانات للاستيراد" });
    return;
  }

  const summary = {
    total: prepared.length,
    ok: prepared.filter((p) => p._status === "ok").length,
    warning: prepared.filter((p) => p._status === "warning").length,
    error: prepared.filter((p) => p._status === "error").length,
    totalRows: rows.length,
  };

  if (dryRun) {
    res.json({
      groups: prepared.map((p) => ({
        key: p.key,
        date: p.date,
        lineCount: 1,
        total: p.total,
        notes: p.notes,
        _status: p._status,
        _errors: p._errors,
        rows: [
          {
            date: p.date,
            direction: p.direction === "in" ? "↑ وارد" : "↓ صادر",
            amount: p.amount,
            notes: p.notes,
            reference: p.reference,
          },
        ],
      })),
      summary,
    });
    return;
  }

  const valid = prepared.filter((p) => p._status !== "error");
  if (valid.length === 0) {
    res.status(400).json({ error: "لا توجد حركات صحيحة للاستيراد" });
    return;
  }

  await db.insert(bankMovementsTable).values(
    valid.map((p) => ({
      companyId,
      bankAccountId,
      date: p.date!,
      type: p.direction === "in" ? "deposit" : "withdrawal",
      direction: p.direction,
      amount: String(round2(p.amount)),
      currency: bankAccount.currency,
      exchangeRate: "1",
      description: null,
      notes: p.notes || null,
      reference: p.reference || null,
      createdBy: userId,
    })),
  );

  res.status(201).json({
    imported: valid.length,
    skipped: prepared.length - valid.length,
    total: prepared.length,
  });
}

export default router;
