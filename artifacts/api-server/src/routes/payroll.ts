import { Router } from "express";
import { and, eq, asc, desc, inArray, sql, count } from "drizzle-orm";
import { parsePagination, paginatedResponse } from "../lib/pagination";
import {
  db,
  employeesTable,
  employeePayComponentsTable,
  payrollRunsTable,
  payrollRunLinesTable,
  accountsTable,
  companiesTable,
  journalEntriesTable,
  advancesTable,
  advanceInstallmentsTable,
  type Employee,
  type EmployeePayComponent,
  type PayrollRun,
  type PayrollRunLine,
  type Advance,
} from "@workspace/db";
import {
  CreateEmployeeBody,
  UpdateEmployeeBody,
  CreatePayrollRunBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import { generateEntityCode } from "../lib/codes";
import {
  createDraftJournalEntry,
  lockCompanyEntryNo,
} from "../lib/journal-posting";
import {
  exportWorkbook,
  handleXlsxUpload,
  parseSheet,
} from "../lib/excel";

const router = Router();

const round2 = (n: number) => Math.round(n * 100) / 100;
const EPS = 0.005;

// Thrown inside the payroll transaction to surface a 400 to the client.
class PayrollError extends Error {}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "23505"
  );
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function toComponent(row: EmployeePayComponent) {
  return {
    id: row.id,
    kind: row.kind,
    nameAr: row.nameAr,
    amount: Number(row.amount),
    isActive: row.isActive,
  };
}

function toEmployee(row: Employee, components: EmployeePayComponent[]) {
  return {
    id: row.id,
    code: row.code,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    jobTitle: row.jobTitle,
    hireDate: row.hireDate,
    status: row.status,
    baseSalary: Number(row.baseSalary),
    notes: row.notes,
    components: components.map(toComponent),
    createdAt: row.createdAt.toISOString(),
  };
}

function toRun(row: PayrollRun, lines: PayrollRunLine[], entryNo: number | null) {
  return {
    id: row.id,
    period: row.period,
    status: row.status,
    salaryExpenseAccountId: row.salaryExpenseAccountId,
    netPayableAccountId: row.netPayableAccountId,
    deductionsAccountId: row.deductionsAccountId,
    totalGross: Number(row.totalGross),
    totalDeductions: Number(row.totalDeductions),
    totalNet: Number(row.totalNet),
    employeeCount: row.employeeCount,
    notes: row.notes,
    journalEntryId: row.journalEntryId,
    journalEntryNo: entryNo,
    createdAt: row.createdAt.toISOString(),
    lines: lines.map((l) => ({
      id: l.id,
      employeeId: l.employeeId,
      employeeName: l.employeeName,
      baseSalary: Number(l.baseSalary),
      totalAllowances: Number(l.totalAllowances),
      totalDeductions: Number(l.totalDeductions),
      netPay: Number(l.netPay),
    })),
  };
}

// Verifies every mapped account exists, belongs to the caller's company, and is
// a leaf (non-group) account. Returns an Arabic error message when invalid.
async function validatePayrollAccounts(
  accountIds: string[],
  companyId: string,
): Promise<string | null> {
  const ids = [...new Set(accountIds.filter(Boolean))];
  if (ids.length === 0) return null;
  const rows = await db
    .select({ id: accountsTable.id, isGroup: accountsTable.isGroup })
    .from(accountsTable)
    .where(
      and(
        eq(accountsTable.companyId, companyId),
        inArray(accountsTable.id, ids),
      ),
    );
  const map = new Map(rows.map((r) => [r.id, r]));
  for (const id of ids) {
    const acc = map.get(id);
    if (!acc) return "أحد الحسابات المحددة غير موجود";
    if (acc.isGroup) return "لا يمكن الترحيل إلى حساب رئيسي";
  }
  return null;
}

async function loadComponents(
  employeeIds: string[],
  companyId: string,
): Promise<Map<string, EmployeePayComponent[]>> {
  const map = new Map<string, EmployeePayComponent[]>();
  if (employeeIds.length === 0) return map;
  const rows = await db
    .select()
    .from(employeePayComponentsTable)
    .where(
      and(
        eq(employeePayComponentsTable.companyId, companyId),
        inArray(employeePayComponentsTable.employeeId, employeeIds),
      ),
    )
    .orderBy(asc(employeePayComponentsTable.createdAt));
  for (const row of rows) {
    const list = map.get(row.employeeId) ?? [];
    list.push(row);
    map.set(row.employeeId, list);
  }
  return map;
}

// ---- Employees ----

router.get(
  "/employees",
  requireAuth,
  requireCapability("payroll:read"),
  async (req, res) => {
    try {
      const companyId = req.auth!.companyId;
      const pg = parsePagination(req.query as Record<string, unknown>);

      if (pg) {
        const [{ total }] = await db
          .select({ total: count() })
          .from(employeesTable)
          .where(eq(employeesTable.companyId, companyId));
        const rows = await db
          .select()
          .from(employeesTable)
          .where(eq(employeesTable.companyId, companyId))
          .orderBy(asc(employeesTable.code))
          .limit(pg.limit)
          .offset(pg.offset);
        const compMap = await loadComponents(rows.map((r) => r.id), companyId);
        res.json(
          paginatedResponse(
            rows.map((r) => toEmployee(r, compMap.get(r.id) ?? [])),
            Number(total),
            pg.page,
            pg.limit,
          ),
        );
        return;
      }

      const rows = await db
        .select()
        .from(employeesTable)
        .where(eq(employeesTable.companyId, companyId))
        .orderBy(asc(employeesTable.code));
      const compMap = await loadComponents(
        rows.map((r) => r.id),
        companyId,
      );
      res.json(rows.map((r) => toEmployee(r, compMap.get(r.id) ?? [])));
    } catch (err) {
      req.log.error({ err }, "Failed to list employees");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Excel export / import (employees) ------------------------------------

// Streams all of the company's employees as an .xlsx workbook (round-trips the
// import format; pay components are managed separately and not included here).
router.get(
  "/employees/export",
  requireAuth,
  requireCapability("payroll:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    try {
      const rows = await db
        .select()
        .from(employeesTable)
        .where(eq(employeesTable.companyId, companyId))
        .orderBy(asc(employeesTable.code));
      await exportWorkbook(res, {
        sheetName: "Employees",
        fileName: "employees-export",
        columns: [
          { header: "code", value: (r) => r.code },
          { header: "nameAr", value: (r) => r.nameAr },
          { header: "nameEn", value: (r) => r.nameEn ?? "" },
          { header: "jobTitle", value: (r) => r.jobTitle ?? "" },
          { header: "hireDate", value: (r) => r.hireDate },
          { header: "status", value: (r) => r.status },
          { header: "baseSalary", value: (r) => Number(r.baseSalary) },
          { header: "notes", value: (r) => r.notes ?? "" },
        ],
        rows,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to export employees");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// Bulk-creates employees from an .xlsx (round-trips the export format).
// All-or-nothing: any invalid/duplicate row aborts the whole import.
router.post(
  "/employees/import",
  requireAuth,
  requireCapability("payroll:create"),
  handleXlsxUpload,
  async (req, res) => {
    const companyId = req.auth!.companyId;
    if (!req.file) {
      res.status(400).json({ error: "لم يتم رفع أي ملف" });
      return;
    }
    try {
      const sheet = await parseSheet(req.file.buffer);
      if (!sheet) {
        res.status(400).json({ error: "الملف لا يحتوي على بيانات" });
        return;
      }
      if (!sheet.has("code") || !sheet.has("nameAr")) {
        res.status(400).json({
          error:
            "صيغة الملف غير صحيحة. الأعمدة المطلوبة: code, nameAr, hireDate, baseSalary",
        });
        return;
      }

      const existing = await db
        .select({ code: employeesTable.code })
        .from(employeesTable)
        .where(eq(employeesTable.companyId, companyId));
      const existingCodes = new Set(existing.map((e) => e.code));

      type Row = {
        code: string;
        nameAr: string;
        nameEn: string | null;
        jobTitle: string | null;
        hireDate: string;
        status: "active" | "terminated";
        baseSalary: number;
        notes: string | null;
      };
      const parsed: Row[] = [];
      const seen = new Set<string>();
      for (const { rowNo, row } of sheet.rows) {
        const code = sheet.str(row, "code");
        const nameAr = sheet.str(row, "nameAr");
        if (!code && !nameAr) continue; // skip blank rows
        if (!code || !nameAr) {
          res
            .status(400)
            .json({ error: `السطر ${rowNo}: code و nameAr مطلوبان` });
          return;
        }
        if (seen.has(code) || existingCodes.has(code)) {
          res
            .status(400)
            .json({ error: `السطر ${rowNo}: كود الموظف ${code} مكرر` });
          return;
        }
        const hireDate = sheet.str(row, "hireDate");
        if (!hireDate) {
          res.status(400).json({ error: `السطر ${rowNo}: hireDate مطلوب` });
          return;
        }
        const baseStr = sheet.has("baseSalary")
          ? sheet.str(row, "baseSalary")
          : "";
        const baseSalary = baseStr ? sheet.num(row, "baseSalary") : 0;
        if (baseSalary < 0) {
          res
            .status(400)
            .json({ error: `السطر ${rowNo}: الراتب الأساسي غير صحيح` });
          return;
        }
        const statusRaw = sheet.has("status") ? sheet.str(row, "status") : "";
        const status = statusRaw === "terminated" ? "terminated" : "active";
        seen.add(code);
        parsed.push({
          code,
          nameAr,
          nameEn: sheet.str(row, "nameEn") || null,
          jobTitle: sheet.str(row, "jobTitle") || null,
          hireDate,
          status,
          baseSalary,
          notes: sheet.str(row, "notes") || null,
        });
      }
      if (parsed.length === 0) {
        res.status(400).json({ error: "الملف لا يحتوي على موظفين" });
        return;
      }

      await db.transaction(async (tx) => {
        for (const r of parsed) {
          await tx.insert(employeesTable).values({
            companyId,
            code: r.code,
            nameAr: r.nameAr,
            nameEn: r.nameEn,
            jobTitle: r.jobTitle,
            hireDate: r.hireDate,
            status: r.status,
            baseSalary: String(r.baseSalary),
            notes: r.notes,
          });
        }
      });
      res.json({ imported: parsed.length });
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "يوجد كود موظف مكرر في الملف" });
        return;
      }
      req.log.error({ err }, "Failed to import employees");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.get(
  "/employees/:id",
  requireAuth,
  requireCapability("payroll:read"),
  async (req, res) => {
    const id = req.params["id"] as string;
    try {
      const companyId = req.auth!.companyId;
      const [row] = await db
        .select()
        .from(employeesTable)
        .where(
          and(
            eq(employeesTable.id, id),
            eq(employeesTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "الموظف غير موجود" });
        return;
      }
      const compMap = await loadComponents([id], companyId);
      res.json(toEmployee(row, compMap.get(id) ?? []));
    } catch (err) {
      req.log.error({ err }, "Failed to get employee");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

async function insertComponents(
  tx: Tx,
  companyId: string,
  employeeId: string,
  components: { kind: string; nameAr: string; amount: number; isActive?: boolean }[],
) {
  if (components.length === 0) return;
  await tx.insert(employeePayComponentsTable).values(
    components.map((c) => ({
      companyId,
      employeeId,
      kind: c.kind,
      nameAr: c.nameAr,
      amount: String(c.amount),
      isActive: c.isActive ?? true,
    })),
  );
}

router.post(
  "/employees",
  requireAuth,
  requireCapability("payroll:create"),
  async (req, res) => {
    const parsed = CreateEmployeeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const d = parsed.data;
    try {
      const created = await db.transaction(async (tx) => {
        const code = await generateEntityCode(
          tx,
          companyId,
          "employee",
          d.hireDate,
        );
        const [row] = await tx
          .insert(employeesTable)
          .values({
            companyId,
            code,
            nameAr: d.nameAr,
            nameEn: d.nameEn ?? null,
            jobTitle: d.jobTitle ?? null,
            hireDate: d.hireDate,
            status: d.status ?? "active",
            baseSalary: String(d.baseSalary),
            notes: d.notes ?? null,
          })
          .returning();
        await insertComponents(tx, companyId, row!.id, d.components ?? []);
        return row!;
      });
      const compMap = await loadComponents([created.id], companyId);
      res.status(201).json(toEmployee(created, compMap.get(created.id) ?? []));
    } catch (err) {
      req.log.error({ err }, "Failed to create employee");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.patch(
  "/employees/:id",
  requireAuth,
  requireCapability("payroll:update"),
  async (req, res) => {
    const id = req.params["id"] as string;
    const parsed = UpdateEmployeeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const d = parsed.data;
    try {
      const [existing] = await db
        .select()
        .from(employeesTable)
        .where(
          and(
            eq(employeesTable.id, id),
            eq(employeesTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "الموظف غير موجود" });
        return;
      }
      const updates: Record<string, unknown> = {};
      if (d.nameAr !== undefined) updates["nameAr"] = d.nameAr;
      if (d.nameEn !== undefined) updates["nameEn"] = d.nameEn;
      if (d.jobTitle !== undefined) updates["jobTitle"] = d.jobTitle;
      if (d.hireDate !== undefined) updates["hireDate"] = d.hireDate;
      if (d.status !== undefined) updates["status"] = d.status;
      if (d.baseSalary !== undefined)
        updates["baseSalary"] = String(d.baseSalary);
      if (d.notes !== undefined) updates["notes"] = d.notes;

      await db.transaction(async (tx) => {
        if (Object.keys(updates).length > 0) {
          await tx
            .update(employeesTable)
            .set(updates)
            .where(
              and(
                eq(employeesTable.id, id),
                eq(employeesTable.companyId, companyId),
              ),
            );
        }
        // When components are provided, replace the full set.
        if (d.components !== undefined) {
          await tx
            .delete(employeePayComponentsTable)
            .where(
              and(
                eq(employeePayComponentsTable.companyId, companyId),
                eq(employeePayComponentsTable.employeeId, id),
              ),
            );
          await insertComponents(tx, companyId, id, d.components);
        }
      });
      const [row] = await db
        .select()
        .from(employeesTable)
        .where(
          and(
            eq(employeesTable.id, id),
            eq(employeesTable.companyId, companyId),
          ),
        )
        .limit(1);
      const compMap = await loadComponents([id], companyId);
      res.json(toEmployee(row!, compMap.get(id) ?? []));
    } catch (err) {
      req.log.error({ err }, "Failed to update employee");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.delete(
  "/employees/:id",
  requireAuth,
  requireCapability("payroll:delete"),
  async (req, res) => {
    const id = req.params["id"] as string;
    const companyId = req.auth!.companyId;
    try {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(payrollRunLinesTable)
        .where(
          and(
            eq(payrollRunLinesTable.employeeId, id),
            eq(payrollRunLinesTable.companyId, companyId),
          ),
        );
      if (Number(count) > 0) {
        res.status(400).json({ error: "لا يمكن حذف موظف له سجل رواتب" });
        return;
      }
      const deleted = await db
        .delete(employeesTable)
        .where(
          and(
            eq(employeesTable.id, id),
            eq(employeesTable.companyId, companyId),
          ),
        )
        .returning({ id: employeesTable.id });
      if (deleted.length === 0) {
        res.status(404).json({ error: "الموظف غير موجود" });
        return;
      }
      res.json({ status: "ok" });
    } catch (err) {
      req.log.error({ err }, "Failed to delete employee");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Payroll runs ----

router.get(
  "/payroll/runs",
  requireAuth,
  requireCapability("payroll:read"),
  async (req, res) => {
    try {
      const companyId = req.auth!.companyId;
      const rows = await db
        .select({
          run: payrollRunsTable,
          entryNo: journalEntriesTable.entryNo,
        })
        .from(payrollRunsTable)
        .leftJoin(
          journalEntriesTable,
          eq(payrollRunsTable.journalEntryId, journalEntriesTable.id),
        )
        .where(eq(payrollRunsTable.companyId, companyId))
        .orderBy(desc(payrollRunsTable.period));
      res.json(rows.map((r) => toRun(r.run, [], r.entryNo ?? null)));
    } catch (err) {
      req.log.error({ err }, "Failed to list payroll runs");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Excel export (payroll runs) ------------------------------------------

// Streams all of the company's payroll runs as an .xlsx workbook. Export only:
// payroll runs are transactional (each run posts a consolidated journal entry)
// and are created exclusively via POST /payroll/runs — never imported.
router.get(
  "/payroll/runs/export",
  requireAuth,
  requireCapability("payroll:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    try {
      const rows = await db
        .select({
          run: payrollRunsTable,
          entryNo: journalEntriesTable.entryNo,
        })
        .from(payrollRunsTable)
        .leftJoin(
          journalEntriesTable,
          eq(payrollRunsTable.journalEntryId, journalEntriesTable.id),
        )
        .where(eq(payrollRunsTable.companyId, companyId))
        .orderBy(desc(payrollRunsTable.period));
      await exportWorkbook(res, {
        sheetName: "PayrollRuns",
        fileName: "payroll-runs-export",
        columns: [
          { header: "period", value: (r) => r.run.period },
          { header: "status", value: (r) => r.run.status },
          { header: "employeeCount", value: (r) => r.run.employeeCount },
          { header: "totalGross", value: (r) => Number(r.run.totalGross) },
          {
            header: "totalDeductions",
            value: (r) => Number(r.run.totalDeductions),
          },
          { header: "totalNet", value: (r) => Number(r.run.totalNet) },
          { header: "journalEntryNo", value: (r) => r.entryNo ?? "" },
          { header: "notes", value: (r) => r.run.notes ?? "" },
        ],
        rows,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to export payroll runs");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.get(
  "/payroll/runs/:id",
  requireAuth,
  requireCapability("payroll:read"),
  async (req, res) => {
    const id = req.params["id"] as string;
    try {
      const companyId = req.auth!.companyId;
      const [row] = await db
        .select({
          run: payrollRunsTable,
          entryNo: journalEntriesTable.entryNo,
        })
        .from(payrollRunsTable)
        .leftJoin(
          journalEntriesTable,
          eq(payrollRunsTable.journalEntryId, journalEntriesTable.id),
        )
        .where(
          and(
            eq(payrollRunsTable.id, id),
            eq(payrollRunsTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "تشغيل الرواتب غير موجود" });
        return;
      }
      const lines = await db
        .select()
        .from(payrollRunLinesTable)
        .where(
          and(
            eq(payrollRunLinesTable.runId, id),
            eq(payrollRunLinesTable.companyId, companyId),
          ),
        )
        .orderBy(asc(payrollRunLinesTable.employeeName));
      res.json(toRun(row.run, lines, row.entryNo ?? null));
    } catch (err) {
      req.log.error({ err }, "Failed to get payroll run");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// Runs payroll for a period. For every active employee, gross = base salary +
// active allowances; deductions = active deductions; net = gross − deductions.
// Emits ONE consolidated draft journal entry: Dr salary expense (total gross),
// Cr deductions account (total deductions, if any), Cr net-payable (total net).
// unique(company, period) prevents double-running a month.
router.post(
  "/payroll/runs",
  requireAuth,
  requireCapability("payroll:create"),
  async (req, res) => {
    const parsed = CreatePayrollRunBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const d = parsed.data;
    const period = d.period.slice(0, 7); // YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(period)) {
      res.status(400).json({ error: "الفترة غير صحيحة" });
      return;
    }
    const month = Number(period.slice(5, 7));
    if (month < 1 || month > 12) {
      res.status(400).json({ error: "الشهر غير صحيح" });
      return;
    }
    if (d.deductionsAccountId === d.salaryExpenseAccountId) {
      res
        .status(400)
        .json({ error: "حساب الخصومات يجب أن يختلف عن حساب المصروف" });
      return;
    }
    try {
      const existingRun = await db
        .select({ id: payrollRunsTable.id })
        .from(payrollRunsTable)
        .where(
          and(
            eq(payrollRunsTable.companyId, companyId),
            eq(payrollRunsTable.period, period),
          ),
        )
        .limit(1);
      if (existingRun.length > 0) {
        res.status(409).json({ error: "تم تشغيل رواتب هذا الشهر بالفعل" });
        return;
      }

      const accErr = await validatePayrollAccounts(
        [
          d.salaryExpenseAccountId,
          d.netPayableAccountId,
          ...(d.deductionsAccountId ? [d.deductionsAccountId] : []),
        ],
        companyId,
      );
      if (accErr) {
        res.status(400).json({ error: accErr });
        return;
      }

      const [company] = await db
        .select({ baseCurrency: companiesTable.baseCurrency })
        .from(companiesTable)
        .where(eq(companiesTable.id, companyId))
        .limit(1);
      const baseCurrency = (company?.baseCurrency || "EGP").toUpperCase();

      // Active employees + their active components.
      const employees = await db
        .select()
        .from(employeesTable)
        .where(
          and(
            eq(employeesTable.companyId, companyId),
            eq(employeesTable.status, "active"),
          ),
        )
        .orderBy(asc(employeesTable.code));
      const compMap = await loadComponents(
        employees.map((e) => e.id),
        companyId,
      );

      // Period end date (last day) — used to gate advances whose deduction
      // hasn't started yet (startDate after the period).
      const [yy, mm] = period.split("-").map(Number);
      const lastDayNum = new Date(yy!, mm!, 0).getDate();
      const periodEnd = `${period}-${String(lastDayNum).padStart(2, "0")}`;

      // Per-employee pay independent of advances (base + active allowances/
      // deductions). Advance installments are computed later INSIDE the tx
      // against freshly row-locked balances to avoid lost updates.
      type EmpPay = {
        id: string;
        nameAr: string;
        base: number;
        allowances: number;
        regularDeductions: number;
        gross: number;
      };
      const empPays: EmpPay[] = [];
      for (const e of employees) {
        const comps = (compMap.get(e.id) ?? []).filter((c) => c.isActive);
        const base = round2(Number(e.baseSalary));
        let allowances = 0;
        let deductions = 0;
        for (const c of comps) {
          const amt = round2(Number(c.amount));
          if (c.kind === "allowance") allowances = round2(allowances + amt);
          else if (c.kind === "deduction") deductions = round2(deductions + amt);
        }
        const gross = round2(base + allowances);
        if (gross <= EPS) continue; // skip employees with nothing to pay
        empPays.push({
          id: e.id,
          nameAr: e.nameAr,
          base,
          allowances,
          regularDeductions: deductions,
          gross,
        });
      }

      if (empPays.length === 0) {
        res.status(400).json({ error: "لا يوجد موظفون نشطون للصرف" });
        return;
      }

      const totalRegularDeductions = round2(
        empPays.reduce((s, e) => s + e.regularDeductions, 0),
      );

      // Only *regular* deductions need a deductions account; advance
      // installments are credited to their own advances account(s).
      if (totalRegularDeductions > EPS && !d.deductionsAccountId) {
        res.status(400).json({
          error: "يوجد خصومات — يجب تحديد حساب الخصومات",
        });
        return;
      }

      // Consolidated draft entry is dated the last day of the period.
      const entryDate = periodEnd;

      type AdvanceDeduction = {
        advance: Advance;
        amount: number;
        willFinish: boolean;
      };

      const result = await db.transaction(async (tx) => {
        // Serialize advance allocation per company FIRST (re-entrant with the
        // lock createDraftJournalEntry takes) so concurrent runs on different
        // periods can't lost-update advances.totalRepaid.
        await lockCompanyEntryNo(tx, companyId);

        // Re-read active advances FOR UPDATE under the lock — fresh balances.
        const empIds = empPays.map((e) => e.id);
        const advanceRows =
          empIds.length > 0
            ? await tx
                .select()
                .from(advancesTable)
                .where(
                  and(
                    eq(advancesTable.companyId, companyId),
                    eq(advancesTable.status, "active"),
                    inArray(advancesTable.employeeId, empIds),
                  ),
                )
                .for("update")
            : [];

        const advancesByEmp = new Map<string, AdvanceDeduction[]>();
        for (const a of advanceRows) {
          if (a.startDate > periodEnd) continue; // not started yet
          const remaining = round2(Number(a.amount) - Number(a.totalRepaid));
          if (remaining <= EPS) continue; // already repaid
          const installment = round2(
            Math.min(Number(a.monthlyInstallment), remaining),
          );
          if (installment <= EPS) continue;
          const list = advancesByEmp.get(a.employeeId) ?? [];
          list.push({
            advance: a,
            amount: installment,
            willFinish: round2(remaining - installment) <= EPS,
          });
          advancesByEmp.set(a.employeeId, list);
        }

        // Assemble run lines + totals using the fresh advance balances.
        const runLines: {
          employeeId: string;
          employeeName: string;
          baseSalary: number;
          totalAllowances: number;
          totalDeductions: number;
          netPay: number;
        }[] = [];
        let totalGross = 0;
        let totalNet = 0;
        let totalAdvanceInstallments = 0;
        const advanceCreditByAccount = new Map<string, number>();
        const installmentsToApply: AdvanceDeduction[] = [];
        for (const e of empPays) {
          const empAdvances = advancesByEmp.get(e.id) ?? [];
          const advanceTotal = round2(
            empAdvances.reduce((s, x) => s + x.amount, 0),
          );
          const lineDeductions = round2(e.regularDeductions + advanceTotal);
          const net = round2(e.gross - lineDeductions);
          if (net < -EPS) {
            throw new PayrollError(
              `الخصومات تتجاوز إجمالي الراتب للموظف ${e.nameAr}`,
            );
          }
          runLines.push({
            employeeId: e.id,
            employeeName: e.nameAr,
            baseSalary: e.base,
            totalAllowances: e.allowances,
            totalDeductions: lineDeductions,
            netPay: net,
          });
          totalGross = round2(totalGross + e.gross);
          totalNet = round2(totalNet + net);
          totalAdvanceInstallments = round2(
            totalAdvanceInstallments + advanceTotal,
          );
          for (const ad of empAdvances) {
            installmentsToApply.push(ad);
            const accId = ad.advance.advancesAccountId;
            advanceCreditByAccount.set(
              accId,
              round2((advanceCreditByAccount.get(accId) ?? 0) + ad.amount),
            );
          }
        }
        const totalDeductions = round2(
          totalRegularDeductions + totalAdvanceInstallments,
        );

        // Advance accounts being credited must still be valid leaf accounts.
        const advAccErr = await validatePayrollAccounts(
          [...advanceCreditByAccount.keys()],
          companyId,
        );
        if (advAccErr) throw new PayrollError(advAccErr);

        // Posting lines: Dr expense (gross) / Cr deductions / Cr advances / Cr net.
        const postingLines: {
          accountId: string;
          description?: string | null;
          debit: number;
          credit: number;
        }[] = [
          {
            accountId: d.salaryExpenseAccountId,
            description: `رواتب ${period}`,
            debit: totalGross,
            credit: 0,
          },
        ];
        if (totalRegularDeductions > EPS && d.deductionsAccountId) {
          postingLines.push({
            accountId: d.deductionsAccountId,
            description: `خصومات رواتب ${period}`,
            debit: 0,
            credit: totalRegularDeductions,
          });
        }
        // Advance installments lower the advances asset account(s).
        for (const [accountId, amount] of advanceCreditByAccount) {
          if (amount <= EPS) continue;
          postingLines.push({
            accountId,
            description: `سداد أقساط سلف ${period}`,
            debit: 0,
            credit: amount,
          });
        }
        postingLines.push({
          accountId: d.netPayableAccountId,
          description: `صافي رواتب ${period}`,
          debit: 0,
          credit: totalNet,
        });

        const entry = await createDraftJournalEntry(tx, {
          companyId,
          baseCurrency,
          date: entryDate,
          reference: `رواتب ${period}`,
          notes: `رواتب شهر ${period} (${runLines.length} موظف)`,
          createdBy: req.auth!.userId,
          lines: postingLines,
        });
        const [run] = await tx
          .insert(payrollRunsTable)
          .values({
            companyId,
            period,
            status: "posted",
            salaryExpenseAccountId: d.salaryExpenseAccountId,
            netPayableAccountId: d.netPayableAccountId,
            deductionsAccountId: d.deductionsAccountId ?? null,
            totalGross: String(totalGross),
            totalDeductions: String(totalDeductions),
            totalNet: String(totalNet),
            employeeCount: runLines.length,
            notes: d.notes ?? null,
            journalEntryId: entry.id,
            createdBy: req.auth!.userId,
          })
          .returning();
        await tx.insert(payrollRunLinesTable).values(
          runLines.map((l) => ({
            companyId,
            runId: run!.id,
            employeeId: l.employeeId,
            employeeName: l.employeeName,
            baseSalary: String(l.baseSalary),
            totalAllowances: String(l.totalAllowances),
            totalDeductions: String(l.totalDeductions),
            netPay: String(l.netPay),
          })),
        );
        // Persist each advance installment + bump totalRepaid arithmetically
        // (concurrent runs accumulate) and flip to 'finished' when fully repaid.
        if (installmentsToApply.length > 0) {
          await tx.insert(advanceInstallmentsTable).values(
            installmentsToApply.map((ad) => ({
              companyId,
              advanceId: ad.advance.id,
              payrollRunId: run!.id,
              period,
              amount: String(ad.amount),
            })),
          );
          for (const ad of installmentsToApply) {
            await tx
              .update(advancesTable)
              .set({
                totalRepaid: sql`${advancesTable.totalRepaid} + ${ad.amount}`,
                status: ad.willFinish ? "finished" : "active",
              })
              .where(
                and(
                  eq(advancesTable.id, ad.advance.id),
                  eq(advancesTable.companyId, companyId),
                ),
              );
          }
        }
        return { run: run!, entryNo: entry.entryNo };
      });

      const lines = await db
        .select()
        .from(payrollRunLinesTable)
        .where(
          and(
            eq(payrollRunLinesTable.companyId, companyId),
            eq(payrollRunLinesTable.runId, result.run.id),
          ),
        )
        .orderBy(asc(payrollRunLinesTable.employeeName));
      res.status(201).json(toRun(result.run, lines, result.entryNo));
    } catch (err) {
      // Validation failures discovered inside the tx (negative net / invalid
      // advance account) surface as a 400.
      if (err instanceof PayrollError) {
        res.status(400).json({ error: err.message });
        return;
      }
      // Concurrent runs can both pass the pre-check and race on the
      // unique(company_id, period) constraint; map that to a deterministic 409.
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "تم تشغيل رواتب هذا الشهر بالفعل" });
        return;
      }
      req.log.error({ err }, "Failed to run payroll");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
