import { Router } from "express";
import { and, eq, asc, desc, inArray, sql } from "drizzle-orm";
import {
  db,
  employeesTable,
  employeePayComponentsTable,
  payrollRunsTable,
  payrollRunLinesTable,
  accountsTable,
  companiesTable,
  journalEntriesTable,
  type Employee,
  type EmployeePayComponent,
  type PayrollRun,
  type PayrollRunLine,
} from "@workspace/db";
import {
  CreateEmployeeBody,
  UpdateEmployeeBody,
  CreatePayrollRunBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import { createDraftJournalEntry } from "../lib/journal-posting";

const router = Router();

const round2 = (n: number) => Math.round(n * 100) / 100;
const EPS = 0.005;

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
      const existing = await db
        .select({ id: employeesTable.id })
        .from(employeesTable)
        .where(
          and(
            eq(employeesTable.companyId, companyId),
            eq(employeesTable.code, d.code),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        res.status(409).json({ error: "كود الموظف مستخدم بالفعل" });
        return;
      }
      const created = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(employeesTable)
          .values({
            companyId,
            code: d.code,
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
      if (d.code !== undefined && d.code !== existing.code) {
        const dup = await db
          .select({ id: employeesTable.id })
          .from(employeesTable)
          .where(
            and(
              eq(employeesTable.companyId, companyId),
              eq(employeesTable.code, d.code),
            ),
          )
          .limit(1);
        if (dup.length > 0) {
          res.status(409).json({ error: "كود الموظف مستخدم بالفعل" });
          return;
        }
      }
      const updates: Record<string, unknown> = {};
      if (d.code !== undefined) updates["code"] = d.code;
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

      const runLines: {
        employeeId: string;
        employeeName: string;
        baseSalary: number;
        totalAllowances: number;
        totalDeductions: number;
        netPay: number;
      }[] = [];
      let totalGross = 0;
      let totalDeductions = 0;
      let totalNet = 0;

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
        const net = round2(gross - deductions);
        if (gross <= EPS) continue; // skip employees with nothing to pay
        runLines.push({
          employeeId: e.id,
          employeeName: e.nameAr,
          baseSalary: base,
          totalAllowances: allowances,
          totalDeductions: deductions,
          netPay: net,
        });
        totalGross = round2(totalGross + gross);
        totalDeductions = round2(totalDeductions + deductions);
        totalNet = round2(totalNet + net);
      }

      if (runLines.length === 0) {
        res.status(400).json({ error: "لا يوجد موظفون نشطون للصرف" });
        return;
      }

      // Deductions must never exceed gross for any employee (negative net pay).
      const negativeNet = runLines.find((l) => l.netPay < -EPS);
      if (negativeNet) {
        res.status(400).json({
          error: `الخصومات تتجاوز إجمالي الراتب للموظف ${negativeNet.employeeName}`,
        });
        return;
      }

      if (totalDeductions > EPS && !d.deductionsAccountId) {
        res.status(400).json({
          error: "يوجد خصومات — يجب تحديد حساب الخصومات",
        });
        return;
      }

      // Posting lines: Dr expense (gross) / Cr deductions / Cr net payable.
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
      if (totalDeductions > EPS && d.deductionsAccountId) {
        postingLines.push({
          accountId: d.deductionsAccountId,
          description: `خصومات رواتب ${period}`,
          debit: 0,
          credit: totalDeductions,
        });
      }
      postingLines.push({
        accountId: d.netPayableAccountId,
        description: `صافي رواتب ${period}`,
        debit: 0,
        credit: totalNet,
      });

      // Post the consolidated draft entry dated the last day of the period.
      const [y, m] = period.split("-").map(Number);
      const lastDay = new Date(y!, m!, 0).getDate();
      const entryDate = `${period}-${String(lastDay).padStart(2, "0")}`;

      const result = await db.transaction(async (tx) => {
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
