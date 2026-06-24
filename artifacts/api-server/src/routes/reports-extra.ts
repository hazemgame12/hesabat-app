import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod/v4";
import { and, eq, gte, lte, asc, inArray } from "drizzle-orm";
import {
  db,
  invoicesTable,
  invoiceLinesTable,
  taxesTable,
  employeesTable,
  payrollRunsTable,
  payrollRunLinesTable,
  costCentersTable,
  advancesTable,
} from "@workspace/db";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import { round2 } from "../lib/inventory-posting";
import { exportWorkbook } from "../lib/excel";

const router = Router();

// Active (non-draft, non-cancelled) invoice statuses — same set the other
// receivables reports use, so VAT figures reconcile with invoice totals.
const POSTED_INVOICE_STATUSES = ["approved", "partially_paid", "paid"];

// Shared from/to query validation for the tax reports. Both bounds are optional
// (an open range = "all dates"), must be ISO `YYYY-MM-DD`, and `from` must not be
// after `to`. On failure it writes a 400 and returns null so the caller bails.
// True only for a real calendar date in `YYYY-MM-DD` form (rejects e.g. 2025-13-99).
function isValidIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const dt = new Date(`${s}T00:00:00Z`);
  return (
    !Number.isNaN(dt.getTime()) &&
    dt.getUTCMonth() + 1 === Number(m[2]) &&
    dt.getUTCDate() === Number(m[3])
  );
}

const isoDate = z.string().refine(isValidIsoDate, { message: "invalid date" });

const dateRangeQuerySchema = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: "from must be on or before to",
  });

function parseDateRange(
  req: Request,
  res: Response,
): { from: string | null; to: string | null } | null {
  const parsed = dateRangeQuerySchema.safeParse({
    from: (req.query["from"] as string | undefined) || undefined,
    to: (req.query["to"] as string | undefined) || undefined,
  });
  if (!parsed.success) {
    res.status(400).json({ error: "صيغة التاريخ غير صحيحة" });
    return null;
  }
  return { from: parsed.data.from ?? null, to: parsed.data.to ?? null };
}

// ---- VAT / tax report --------------------------------------------------------
// Output tax = VAT charged on posted SALES invoice lines.
// Input tax  = VAT paid on posted PURCHASE invoice lines.
// Net VAT     = output − input (a positive figure is payable to the authority).
// Only lines whose linked tax is of kind 'vat' are counted; rows are grouped by
// the tax (rate) so the user can see the breakdown per VAT band.
type VatRow = {
  taxId: string;
  taxName: string;
  rate: number;
  salesBase: number;
  outputTax: number;
  purchaseBase: number;
  inputTax: number;
};

async function computeVatReport(
  companyId: string,
  from: string | null,
  to: string | null,
) {
  const conds = [
    eq(invoiceLinesTable.companyId, companyId),
    eq(invoicesTable.companyId, companyId),
    eq(taxesTable.companyId, companyId),
    eq(taxesTable.kind, "vat"),
    inArray(invoicesTable.status, POSTED_INVOICE_STATUSES),
  ];
  if (from) conds.push(gte(invoicesTable.date, from));
  if (to) conds.push(lte(invoicesTable.date, to));

  const lines = await db
    .select({
      kind: invoicesTable.kind,
      taxId: taxesTable.id,
      taxNameAr: taxesTable.nameAr,
      rate: taxesTable.rate,
      lineTotal: invoiceLinesTable.lineTotal,
      taxAmount: invoiceLinesTable.taxAmount,
    })
    .from(invoiceLinesTable)
    .innerJoin(
      invoicesTable,
      eq(invoicesTable.id, invoiceLinesTable.invoiceId),
    )
    .innerJoin(taxesTable, eq(taxesTable.id, invoiceLinesTable.taxId))
    .where(and(...conds));

  const rows = new Map<string, VatRow>();
  let outputTax = 0;
  let inputTax = 0;
  let salesBase = 0;
  let purchaseBase = 0;
  for (const l of lines) {
    const base = Number(l.lineTotal) || 0;
    const tax = Number(l.taxAmount) || 0;
    const row = rows.get(l.taxId) ?? {
      taxId: l.taxId,
      taxName: l.taxNameAr,
      rate: Number(l.rate) || 0,
      salesBase: 0,
      outputTax: 0,
      purchaseBase: 0,
      inputTax: 0,
    };
    if (l.kind === "sales") {
      row.salesBase = round2(row.salesBase + base);
      row.outputTax = round2(row.outputTax + tax);
      salesBase = round2(salesBase + base);
      outputTax = round2(outputTax + tax);
    } else {
      row.purchaseBase = round2(row.purchaseBase + base);
      row.inputTax = round2(row.inputTax + tax);
      purchaseBase = round2(purchaseBase + base);
      inputTax = round2(inputTax + tax);
    }
    rows.set(l.taxId, row);
  }

  return {
    from: from ?? null,
    to: to ?? null,
    salesBase,
    purchaseBase,
    outputTax,
    inputTax,
    netVat: round2(outputTax - inputTax),
    rows: [...rows.values()].sort((a, b) => b.rate - a.rate),
  };
}

router.get(
  "/reports/vat",
  requireAuth,
  requireCapability("invoices:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const range = parseDateRange(req, res);
    if (!range) return;
    const { from, to } = range;
    try {
      res.json(await computeVatReport(companyId, from, to));
    } catch (err) {
      req.log.error({ err }, "Failed to build VAT report");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.get(
  "/reports/vat/export",
  requireAuth,
  requireCapability("invoices:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const range = parseDateRange(req, res);
    if (!range) return;
    const { from, to } = range;
    try {
      const report = await computeVatReport(companyId, from, to);
      await exportWorkbook(res, {
        sheetName: "VAT",
        fileName: "vat-report",
        columns: [
          { header: "الضريبة", value: (r: VatRow) => r.taxName, width: 28 },
          { header: "النسبة %", value: (r: VatRow) => r.rate },
          { header: "وعاء المبيعات", value: (r: VatRow) => r.salesBase, width: 16 },
          { header: "ضريبة المخرجات", value: (r: VatRow) => r.outputTax, width: 16 },
          { header: "وعاء المشتريات", value: (r: VatRow) => r.purchaseBase, width: 16 },
          { header: "ضريبة المدخلات", value: (r: VatRow) => r.inputTax, width: 16 },
          {
            header: "صافي الضريبة",
            value: (r: VatRow) => round2(r.outputTax - r.inputTax),
            width: 16,
          },
        ],
        rows: report.rows,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to export VAT report");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Employee statement ------------------------------------------------------
// Payroll history (one row per run period) for a single employee over a range,
// plus advances granted in the same window. `from`/`to` are dates; payroll runs
// are keyed by 'YYYY-MM', so we compare on the month prefix.
type EmpPayrollRow = {
  period: string;
  baseSalary: number;
  totalAllowances: number;
  totalDeductions: number;
  netPay: number;
};
type EmpAdvanceRow = {
  date: string;
  amount: number;
  repaymentMonths: number;
  monthlyInstallment: number;
  totalRepaid: number;
  status: string;
};

async function computeEmployeeStatement(
  companyId: string,
  employeeId: string,
  from: string | null,
  to: string | null,
) {
  const [emp] = await db
    .select({
      id: employeesTable.id,
      code: employeesTable.code,
      nameAr: employeesTable.nameAr,
    })
    .from(employeesTable)
    .where(
      and(
        eq(employeesTable.id, employeeId),
        eq(employeesTable.companyId, companyId),
      ),
    )
    .limit(1);
  if (!emp) return null;

  const fromMonth = from ? from.slice(0, 7) : null;
  const toMonth = to ? to.slice(0, 7) : null;

  const payConds = [
    eq(payrollRunLinesTable.companyId, companyId),
    eq(payrollRunLinesTable.employeeId, employeeId),
  ];
  if (fromMonth) payConds.push(gte(payrollRunsTable.period, fromMonth));
  if (toMonth) payConds.push(lte(payrollRunsTable.period, toMonth));

  const payLines = await db
    .select({
      period: payrollRunsTable.period,
      baseSalary: payrollRunLinesTable.baseSalary,
      totalAllowances: payrollRunLinesTable.totalAllowances,
      totalDeductions: payrollRunLinesTable.totalDeductions,
      netPay: payrollRunLinesTable.netPay,
    })
    .from(payrollRunLinesTable)
    .innerJoin(
      payrollRunsTable,
      eq(payrollRunsTable.id, payrollRunLinesTable.runId),
    )
    .where(and(...payConds))
    .orderBy(asc(payrollRunsTable.period));

  const payrollLines: EmpPayrollRow[] = payLines.map((l) => ({
    period: l.period,
    baseSalary: Number(l.baseSalary) || 0,
    totalAllowances: Number(l.totalAllowances) || 0,
    totalDeductions: Number(l.totalDeductions) || 0,
    netPay: Number(l.netPay) || 0,
  }));

  const totals = payrollLines.reduce(
    (acc, l) => ({
      baseSalary: round2(acc.baseSalary + l.baseSalary),
      totalAllowances: round2(acc.totalAllowances + l.totalAllowances),
      totalDeductions: round2(acc.totalDeductions + l.totalDeductions),
      netPay: round2(acc.netPay + l.netPay),
    }),
    { baseSalary: 0, totalAllowances: 0, totalDeductions: 0, netPay: 0 },
  );

  const advConds = [
    eq(advancesTable.companyId, companyId),
    eq(advancesTable.employeeId, employeeId),
  ];
  if (from) advConds.push(gte(advancesTable.date, from));
  if (to) advConds.push(lte(advancesTable.date, to));

  const advRows = await db
    .select()
    .from(advancesTable)
    .where(and(...advConds))
    .orderBy(asc(advancesTable.date));

  const advances: EmpAdvanceRow[] = advRows.map((a) => ({
    date: a.date,
    amount: Number(a.amount) || 0,
    repaymentMonths: a.repaymentMonths,
    monthlyInstallment: Number(a.monthlyInstallment) || 0,
    totalRepaid: Number(a.totalRepaid) || 0,
    status: a.status,
  }));
  const totalAdvances = round2(
    advances.reduce((s, a) => s + a.amount, 0),
  );

  return {
    employeeId: emp.id,
    employeeCode: emp.code,
    employeeName: emp.nameAr,
    from: from ?? null,
    to: to ?? null,
    payrollLines,
    totals,
    advances,
    totalAdvances,
  };
}

router.get(
  "/reports/employee-statement",
  requireAuth,
  requireCapability("payroll:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const employeeId = req.query["employeeId"];
    const from = (req.query["from"] as string | undefined) || null;
    const to = (req.query["to"] as string | undefined) || null;
    if (typeof employeeId !== "string" || !employeeId) {
      res.status(400).json({ error: "الموظف مطلوب" });
      return;
    }
    try {
      const report = await computeEmployeeStatement(
        companyId,
        employeeId,
        from,
        to,
      );
      if (!report) {
        res.status(404).json({ error: "الموظف غير موجود" });
        return;
      }
      res.json(report);
    } catch (err) {
      req.log.error({ err }, "Failed to build employee statement");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.get(
  "/reports/employee-statement/export",
  requireAuth,
  requireCapability("payroll:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const employeeId = req.query["employeeId"];
    const from = (req.query["from"] as string | undefined) || null;
    const to = (req.query["to"] as string | undefined) || null;
    if (typeof employeeId !== "string" || !employeeId) {
      res.status(400).json({ error: "الموظف مطلوب" });
      return;
    }
    try {
      const report = await computeEmployeeStatement(
        companyId,
        employeeId,
        from,
        to,
      );
      if (!report) {
        res.status(404).json({ error: "الموظف غير موجود" });
        return;
      }
      await exportWorkbook(res, {
        sheetName: "Payroll",
        fileName: `employee-${report.employeeCode}`,
        columns: [
          { header: "الشهر", value: (r: EmpPayrollRow) => r.period },
          { header: "الراتب الأساسي", value: (r: EmpPayrollRow) => r.baseSalary, width: 16 },
          { header: "البدلات", value: (r: EmpPayrollRow) => r.totalAllowances, width: 16 },
          { header: "الاستقطاعات", value: (r: EmpPayrollRow) => r.totalDeductions, width: 16 },
          { header: "صافي الراتب", value: (r: EmpPayrollRow) => r.netPay, width: 16 },
        ],
        rows: report.payrollLines,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to export employee statement");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Withholding tax (WHT) report -------------------------------------------
// Withholding tax the company withheld from its suppliers — i.e. lines on POSTED
// PURCHASE invoices whose linked tax is of kind 'wht'. Rows are grouped by the
// tax (each tax carries its own rate/category, e.g. Egypt: supplies/contracting
// 0.5–1%, services 3%, commissions/professions 5%). The base is the line value
// excluding VAT; `whtAmount` is the amount withheld. The EGP 300 filing
// threshold is a reporting rule surfaced in the UI, not a filter here.
type WhtRow = {
  taxId: string;
  taxName: string;
  rate: number;
  base: number;
  whtAmount: number;
};

async function computeWhtReport(
  companyId: string,
  from: string | null,
  to: string | null,
) {
  const conds = [
    eq(invoiceLinesTable.companyId, companyId),
    eq(invoicesTable.companyId, companyId),
    eq(taxesTable.companyId, companyId),
    eq(taxesTable.kind, "wht"),
    eq(invoicesTable.kind, "purchase"),
    inArray(invoicesTable.status, POSTED_INVOICE_STATUSES),
  ];
  if (from) conds.push(gte(invoicesTable.date, from));
  if (to) conds.push(lte(invoicesTable.date, to));

  const lines = await db
    .select({
      taxId: taxesTable.id,
      taxNameAr: taxesTable.nameAr,
      rate: taxesTable.rate,
      lineTotal: invoiceLinesTable.lineTotal,
      taxAmount: invoiceLinesTable.taxAmount,
    })
    .from(invoiceLinesTable)
    .innerJoin(invoicesTable, eq(invoicesTable.id, invoiceLinesTable.invoiceId))
    .innerJoin(taxesTable, eq(taxesTable.id, invoiceLinesTable.taxId))
    .where(and(...conds));

  const rows = new Map<string, WhtRow>();
  let totalBase = 0;
  let totalWht = 0;
  for (const l of lines) {
    const base = Number(l.lineTotal) || 0;
    const wht = Number(l.taxAmount) || 0;
    const row = rows.get(l.taxId) ?? {
      taxId: l.taxId,
      taxName: l.taxNameAr,
      rate: Number(l.rate) || 0,
      base: 0,
      whtAmount: 0,
    };
    row.base = round2(row.base + base);
    row.whtAmount = round2(row.whtAmount + wht);
    totalBase = round2(totalBase + base);
    totalWht = round2(totalWht + wht);
    rows.set(l.taxId, row);
  }

  return {
    from: from ?? null,
    to: to ?? null,
    totalBase,
    totalWht,
    rows: [...rows.values()].sort((a, b) => b.rate - a.rate),
  };
}

router.get(
  "/reports/wht",
  requireAuth,
  requireCapability("invoices:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const range = parseDateRange(req, res);
    if (!range) return;
    const { from, to } = range;
    try {
      res.json(await computeWhtReport(companyId, from, to));
    } catch (err) {
      req.log.error({ err }, "Failed to build WHT report");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.get(
  "/reports/wht/export",
  requireAuth,
  requireCapability("invoices:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const range = parseDateRange(req, res);
    if (!range) return;
    const { from, to } = range;
    try {
      const report = await computeWhtReport(companyId, from, to);
      await exportWorkbook(res, {
        sheetName: "WHT",
        fileName: "wht-report",
        columns: [
          { header: "الضريبة/الفئة", value: (r: WhtRow) => r.taxName, width: 30 },
          { header: "النسبة %", value: (r: WhtRow) => r.rate },
          { header: "وعاء الخصم", value: (r: WhtRow) => r.base, width: 18 },
          { header: "المبلغ المخصوم", value: (r: WhtRow) => r.whtAmount, width: 18 },
        ],
        rows: report.rows,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to export WHT report");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Payroll-tax (كسب العمل) summary ----------------------------------------
// Company-wide payroll summary over a period: one row per payroll run period
// with headcount, gross (base + allowances), total deductions and net pay. The
// payroll/income tax itself is part of `totalDeductions` (not stored as its own
// column), so this is the filing base for كسب العمل rather than an isolated tax
// figure — surfaced as such in the UI.
type PayrollTaxRow = {
  period: string;
  employeeCount: number;
  gross: number;
  deductions: number;
  netPay: number;
};

async function computePayrollTaxReport(
  companyId: string,
  from: string | null,
  to: string | null,
) {
  const fromMonth = from ? from.slice(0, 7) : null;
  const toMonth = to ? to.slice(0, 7) : null;

  const conds = [
    eq(payrollRunLinesTable.companyId, companyId),
    eq(payrollRunsTable.companyId, companyId),
  ];
  if (fromMonth) conds.push(gte(payrollRunsTable.period, fromMonth));
  if (toMonth) conds.push(lte(payrollRunsTable.period, toMonth));

  const lines = await db
    .select({
      period: payrollRunsTable.period,
      baseSalary: payrollRunLinesTable.baseSalary,
      totalAllowances: payrollRunLinesTable.totalAllowances,
      totalDeductions: payrollRunLinesTable.totalDeductions,
      netPay: payrollRunLinesTable.netPay,
    })
    .from(payrollRunLinesTable)
    .innerJoin(
      payrollRunsTable,
      eq(payrollRunsTable.id, payrollRunLinesTable.runId),
    )
    .where(and(...conds))
    .orderBy(asc(payrollRunsTable.period));

  const map = new Map<string, PayrollTaxRow>();
  const totals = { employeeCount: 0, gross: 0, deductions: 0, netPay: 0 };
  for (const l of lines) {
    const gross = round2((Number(l.baseSalary) || 0) + (Number(l.totalAllowances) || 0));
    const ded = Number(l.totalDeductions) || 0;
    const net = Number(l.netPay) || 0;
    const row = map.get(l.period) ?? {
      period: l.period,
      employeeCount: 0,
      gross: 0,
      deductions: 0,
      netPay: 0,
    };
    row.employeeCount += 1;
    row.gross = round2(row.gross + gross);
    row.deductions = round2(row.deductions + ded);
    row.netPay = round2(row.netPay + net);
    map.set(l.period, row);
    totals.employeeCount += 1;
    totals.gross = round2(totals.gross + gross);
    totals.deductions = round2(totals.deductions + ded);
    totals.netPay = round2(totals.netPay + net);
  }

  return {
    from: from ?? null,
    to: to ?? null,
    rows: [...map.values()].sort((a, b) => a.period.localeCompare(b.period)),
    totals,
  };
}

router.get(
  "/reports/payroll-tax",
  requireAuth,
  requireCapability("payroll:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const range = parseDateRange(req, res);
    if (!range) return;
    const { from, to } = range;
    try {
      res.json(await computePayrollTaxReport(companyId, from, to));
    } catch (err) {
      req.log.error({ err }, "Failed to build payroll-tax report");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.get(
  "/reports/payroll-tax/export",
  requireAuth,
  requireCapability("payroll:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const range = parseDateRange(req, res);
    if (!range) return;
    const { from, to } = range;
    try {
      const report = await computePayrollTaxReport(companyId, from, to);
      await exportWorkbook(res, {
        sheetName: "Payroll",
        fileName: "payroll-tax-report",
        columns: [
          { header: "الشهر", value: (r: PayrollTaxRow) => r.period, width: 12 },
          { header: "عدد الموظفين", value: (r: PayrollTaxRow) => r.employeeCount },
          { header: "إجمالي الأجر", value: (r: PayrollTaxRow) => r.gross, width: 16 },
          { header: "الاستقطاعات", value: (r: PayrollTaxRow) => r.deductions, width: 16 },
          { header: "صافي المرتبات", value: (r: PayrollTaxRow) => r.netPay, width: 16 },
        ],
        rows: report.rows,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to export payroll-tax report");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ───────────────────────────────────────────────
// Payroll Detail Report — per-employee breakdown
// ───────────────────────────────────────────────

router.get(
  "/reports/payroll-detail",
  requireAuth,
  requireCapability("payroll:read"),
  async (req: Request, res: Response) => {
    try {
      const companyId = req.auth!.companyId;
      const from = typeof req.query.from === "string" ? req.query.from : null;
      const to = typeof req.query.to === "string" ? req.query.to : null;
      const fromMonth = from ? from.slice(0, 7) : null;
      const toMonth = to ? to.slice(0, 7) : null;

      const conds = [
        eq(payrollRunLinesTable.companyId, companyId),
        eq(payrollRunsTable.companyId, companyId),
      ];
      if (fromMonth) conds.push(gte(payrollRunsTable.period, fromMonth));
      if (toMonth) conds.push(lte(payrollRunsTable.period, toMonth));

      const lines = await db
        .select({
          period: payrollRunsTable.period,
          employeeName: payrollRunLinesTable.employeeName,
          costCenterName: costCentersTable.nameAr,
          baseSalary: payrollRunLinesTable.baseSalary,
          totalAllowances: payrollRunLinesTable.totalAllowances,
          employeeInsurance: payrollRunLinesTable.employeeInsurance,
          companyInsurance: payrollRunLinesTable.companyInsurance,
          payrollTax: payrollRunLinesTable.payrollTax,
          totalDeductions: payrollRunLinesTable.totalDeductions,
          netPay: payrollRunLinesTable.netPay,
        })
        .from(payrollRunLinesTable)
        .innerJoin(payrollRunsTable, eq(payrollRunsTable.id, payrollRunLinesTable.runId))
        .leftJoin(costCentersTable, eq(costCentersTable.id, payrollRunLinesTable.costCenterId))
        .where(and(...conds))
        .orderBy(asc(payrollRunsTable.period), asc(payrollRunLinesTable.employeeName));

      const rows = lines.map((l) => ({
        period: l.period,
        employeeName: l.employeeName,
        costCenterName: l.costCenterName ?? null,
        baseSalary: Number(l.baseSalary) || 0,
        allowances: Number(l.totalAllowances) || 0,
        employeeInsurance: Number(l.employeeInsurance) || 0,
        companyInsurance: Number(l.companyInsurance) || 0,
        payrollTax: Number(l.payrollTax) || 0,
        totalDeductions: Number(l.totalDeductions) || 0,
        netPay: Number(l.netPay) || 0,
      }));

      const totals = rows.reduce(
        (acc, r) => ({
          gross: round2(acc.gross + r.baseSalary + r.allowances),
          payrollTax: round2(acc.payrollTax + r.payrollTax),
          totalDeductions: round2(acc.totalDeductions + r.totalDeductions),
          netPay: round2(acc.netPay + r.netPay),
        }),
        { gross: 0, payrollTax: 0, totalDeductions: 0, netPay: 0 },
      );

      res.json({ from, to, rows, totals });
    } catch (err) {
      req.log.error({ err }, "Failed to fetch payroll-detail report");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
