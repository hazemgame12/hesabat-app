import { Router } from "express";
import { and, eq, gte, lte, asc, sql } from "drizzle-orm";
import {
  db,
  invoicesTable,
  invoiceLinesTable,
  taxesTable,
  employeesTable,
  payrollRunsTable,
  payrollRunLinesTable,
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
    eq(taxesTable.kind, "vat"),
    sql`${invoicesTable.status} = ANY(${POSTED_INVOICE_STATUSES})`,
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
    const from = (req.query["from"] as string | undefined) || null;
    const to = (req.query["to"] as string | undefined) || null;
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
    const from = (req.query["from"] as string | undefined) || null;
    const to = (req.query["to"] as string | undefined) || null;
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

export default router;
