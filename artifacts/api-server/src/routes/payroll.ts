import { Router } from "express";
import { and, eq, asc, desc, inArray, sql, count } from "drizzle-orm";
import { parsePagination, paginatedResponse } from "../lib/pagination";
import {
  db,
  employeesTable,
  employeePayComponentsTable,
  payrollRunsTable,
  payrollRunLinesTable,
  payrollSettingsTable,
  accountsTable,
  companiesTable,
  costCentersTable,
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
import { isWriteBlocked, WRITE_BLOCK_MSG } from "../lib/fiscal-year";

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

// Egyptian social insurance rates (Law 79/2019)
const EG_EMPLOYEE_RATE = 0.11;
const EG_COMPANY_RATE = 0.1875;

function toComponent(row: EmployeePayComponent) {
  return {
    id: row.id,
    kind: row.kind,
    nameAr: row.nameAr,
    amount: Number(row.amount),
    isActive: row.isActive,
    linkedAccountId: row.linkedAccountId ?? null,
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
    employeeType: row.employeeType,
    nationalId: row.nationalId ?? null,
    costCenterId: row.costCenterId ?? null,
    insuranceSalary: row.insuranceSalary != null ? Number(row.insuranceSalary) : null,
    includeInsurance: row.includeInsurance,
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
    deductionsAccountId: row.deductionsAccountId ?? null,
    insuranceExpenseAccountId: row.insuranceExpenseAccountId ?? null,
    insuranceLiabilityAccountId: row.insuranceLiabilityAccountId ?? null,
    totalGross: Number(row.totalGross),
    totalDeductions: Number(row.totalDeductions),
    totalNet: Number(row.totalNet),
    companyInsuranceTotal: Number(row.companyInsuranceTotal),
    employeeInsuranceTotal: Number(row.employeeInsuranceTotal),
    totalPayrollTax: Number(row.totalPayrollTax ?? 0),
    payrollTaxLiabilityAccountId: row.payrollTaxLiabilityAccountId ?? null,
    employeeCount: row.employeeCount,
    notes: row.notes,
    journalEntryId: row.journalEntryId,
    journalEntryNo: entryNo,
    createdAt: row.createdAt.toISOString(),
    lines: lines.map((l) => ({
      id: l.id,
      employeeId: l.employeeId,
      employeeName: l.employeeName,
      costCenterId: l.costCenterId ?? null,
      baseSalary: Number(l.baseSalary),
      totalAllowances: Number(l.totalAllowances),
      totalDeductions: Number(l.totalDeductions),
      insuranceSalary: Number(l.insuranceSalary),
      companyInsurance: Number(l.companyInsurance),
      employeeInsurance: Number(l.employeeInsurance),
      payrollTax: Number(l.payrollTax ?? 0),
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

// Streams all of the company's employees as an .xlsx workbook.
// Includes baseSalary, payroll_tax (ضريبة كسب العمل), and one column per
// unique pay-component name (allowances then deductions). The import endpoint
// round-trips this format: existing employees get their payroll_tax and
// component amounts updated; unknown codes create new employees.
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

      // Load all pay components for these employees.
      const empIds = rows.map((r) => r.id);
      const allComps =
        empIds.length > 0
          ? await db
              .select()
              .from(employeePayComponentsTable)
              .where(
                and(
                  eq(employeePayComponentsTable.companyId, companyId),
                  inArray(employeePayComponentsTable.employeeId, empIds),
                ),
              )
              .orderBy(asc(employeePayComponentsTable.createdAt))
          : [];

      const compsByEmp = new Map<string, typeof allComps>();
      for (const c of allComps) {
        if (!compsByEmp.has(c.employeeId)) compsByEmp.set(c.employeeId, []);
        compsByEmp.get(c.employeeId)!.push(c);
      }

      // Collect unique component names in order of first appearance, grouped
      // by kind so allowances come before deductions.
      const allowanceNames: string[] = [];
      const deductionNames: string[] = [];
      for (const c of allComps) {
        if (c.kind === "allowance" && !allowanceNames.includes(c.nameAr))
          allowanceNames.push(c.nameAr);
        if (c.kind === "deduction" && !deductionNames.includes(c.nameAr))
          deductionNames.push(c.nameAr);
      }

      type EmpRow = (typeof rows)[number];
      const dynamicCols = [
        ...allowanceNames.map((name) => ({
          header: name,
          value: (r: EmpRow) =>
            Number(
              compsByEmp
                .get(r.id)
                ?.find((c) => c.kind === "allowance" && c.nameAr === name)
                ?.amount ?? 0,
            ),
        })),
        ...deductionNames.map((name) => ({
          header: name,
          value: (r: EmpRow) =>
            Number(
              compsByEmp
                .get(r.id)
                ?.find((c) => c.kind === "deduction" && c.nameAr === name)
                ?.amount ?? 0,
            ),
        })),
      ];

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
          {
            header: "payroll_tax",
            value: (r) => Number((r as any).payrollTax ?? 0),
          },
          ...dynamicCols,
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

// Imports employees from an .xlsx that round-trips the export format.
// All-or-nothing transaction.
// • New codes   → create employee.
// • Existing codes → update payroll_tax + component amounts (other fields
//   like name/salary are left unchanged so the user can safely re-upload
//   the monthly sheet without accidentally overwriting master data).
// Any column header that is not a known fixed field is treated as a pay-
// component name and its numeric value is used to update that component's
// amount for the employee (component must already exist).
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
      if (!sheet.has("code")) {
        res.status(400).json({
          error: "صيغة الملف غير صحيحة. العمود المطلوب: code",
        });
        return;
      }

      // Detect dynamic component columns (everything that isn't a fixed field).
      const FIXED_COLS = new Set([
        "code", "nameAr", "nameEn", "jobTitle", "hireDate",
        "status", "baseSalary", "payroll_tax", "notes",
      ]);
      const compCols = Object.keys(sheet.colIndex).filter(
        (h) => !FIXED_COLS.has(h),
      );

      // Load existing employees for this company (code → id map).
      const existing = await db
        .select({ id: employeesTable.id, code: employeesTable.code })
        .from(employeesTable)
        .where(eq(employeesTable.companyId, companyId));
      const existingByCode = new Map(existing.map((e) => [e.code, e.id]));

      type ParsedRow = {
        code: string;
        nameAr: string;
        nameEn: string | null;
        jobTitle: string | null;
        hireDate: string;
        status: "active" | "terminated";
        baseSalary: number;
        payrollTax: number;
        components: Record<string, number>; // nameAr → amount
        notes: string | null;
        isNew: boolean;
      };
      const parsed: ParsedRow[] = [];
      const seen = new Set<string>();

      for (const { rowNo, row } of sheet.rows) {
        const code = sheet.str(row, "code");
        if (!code) continue; // skip blank rows

        if (seen.has(code)) {
          res.status(400).json({ error: `السطر ${rowNo}: كود الموظف ${code} مكرر في الملف` });
          return;
        }

        const isNew = !existingByCode.has(code);
        if (isNew) {
          // New employees require nameAr and hireDate.
          const nameAr = sheet.str(row, "nameAr");
          if (!nameAr) {
            res.status(400).json({ error: `السطر ${rowNo}: nameAr مطلوب للموظفين الجدد` });
            return;
          }
          const hireDate = sheet.str(row, "hireDate");
          if (!hireDate) {
            res.status(400).json({ error: `السطر ${rowNo}: hireDate مطلوب للموظفين الجدد` });
            return;
          }
          const baseSalary = sheet.has("baseSalary") ? sheet.num(row, "baseSalary") : 0;
          if (baseSalary < 0) {
            res.status(400).json({ error: `السطر ${rowNo}: الراتب الأساسي غير صحيح` });
            return;
          }
          const statusRaw = sheet.has("status") ? sheet.str(row, "status") : "";
          const components: Record<string, number> = {};
          for (const col of compCols) components[col] = sheet.num(row, col);
          seen.add(code);
          parsed.push({
            code,
            nameAr,
            nameEn: sheet.str(row, "nameEn") || null,
            jobTitle: sheet.str(row, "jobTitle") || null,
            hireDate,
            status: statusRaw === "terminated" ? "terminated" : "active",
            baseSalary,
            payrollTax: sheet.has("payroll_tax") ? sheet.num(row, "payroll_tax") : 0,
            components,
            notes: sheet.str(row, "notes") || null,
            isNew: true,
          });
        } else {
          // Existing employee: only update payroll_tax + component amounts.
          const components: Record<string, number> = {};
          for (const col of compCols) components[col] = sheet.num(row, col);
          seen.add(code);
          parsed.push({
            code,
            nameAr: "", nameEn: null, jobTitle: null,
            hireDate: "", status: "active", baseSalary: 0,
            payrollTax: sheet.has("payroll_tax") ? sheet.num(row, "payroll_tax") : 0,
            components,
            notes: null,
            isNew: false,
          });
        }
      }

      if (parsed.length === 0) {
        res.status(400).json({ error: "الملف لا يحتوي على موظفين" });
        return;
      }

      let created = 0;
      let updated = 0;

      await db.transaction(async (tx) => {
        for (const r of parsed) {
          if (r.isNew) {
            const [inserted] = await tx.insert(employeesTable).values({
              companyId,
              code: r.code,
              nameAr: r.nameAr,
              nameEn: r.nameEn,
              jobTitle: r.jobTitle,
              hireDate: r.hireDate,
              status: r.status,
              baseSalary: String(r.baseSalary),
              payrollTax: String(r.payrollTax),
              notes: r.notes,
            } as any).returning({ id: employeesTable.id });
            created++;
            // Insert components for new employees.
            for (const [nameAr, amount] of Object.entries(r.components)) {
              if (amount > 0) {
                await tx.insert(employeePayComponentsTable).values({
                  companyId,
                  employeeId: inserted!.id,
                  kind: "allowance", // default — user can adjust via modal
                  nameAr,
                  amount: String(amount),
                });
              }
            }
          } else {
            const empId = existingByCode.get(r.code)!;
            // Update payroll_tax.
            await tx
              .update(employeesTable)
              .set({ payrollTax: String(r.payrollTax) } as any)
              .where(
                and(
                  eq(employeesTable.id, empId),
                  eq(employeesTable.companyId, companyId),
                ),
              );
            // Update component amounts by nameAr match.
            for (const [nameAr, amount] of Object.entries(r.components)) {
              await tx
                .update(employeePayComponentsTable)
                .set({ amount: String(amount) })
                .where(
                  and(
                    eq(employeePayComponentsTable.companyId, companyId),
                    eq(employeePayComponentsTable.employeeId, empId),
                    eq(employeePayComponentsTable.nameAr, nameAr),
                  ),
                );
            }
            updated++;
          }
        }
      });
      res.json({ created, updated, imported: created + updated });
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
  components: { kind: string; nameAr: string; amount: number; isActive?: boolean; linkedAccountId?: string | null }[],
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
      linkedAccountId: c.linkedAccountId ?? null,
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
            employeeType: (d as any).employeeType ?? "permanent",
            nationalId: (d as any).nationalId ?? null,
            costCenterId: (d as any).costCenterId ?? null,
            insuranceSalary: (d as any).insuranceSalary != null ? String((d as any).insuranceSalary) : null,
            includeInsurance: (d as any).includeInsurance ?? true,
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
      if (d.baseSalary !== undefined) updates["baseSalary"] = String(d.baseSalary);
      if (d.notes !== undefined) updates["notes"] = d.notes;
      const dAny = d as any;
      if (dAny.employeeType !== undefined) updates["employeeType"] = dAny.employeeType;
      if (dAny.nationalId !== undefined) updates["nationalId"] = dAny.nationalId;
      if (dAny.costCenterId !== undefined) updates["costCenterId"] = dAny.costCenterId;
      if (dAny.insuranceSalary !== undefined) updates["insuranceSalary"] = dAny.insuranceSalary != null ? String(dAny.insuranceSalary) : null;
      if (dAny.includeInsurance !== undefined) updates["includeInsurance"] = dAny.includeInsurance;
      if (dAny.payrollTax !== undefined) updates["payrollTax"] = dAny.payrollTax != null ? String(dAny.payrollTax) : "0";

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

// ---- Payroll settings ----

router.get(
  "/payroll/settings",
  requireAuth,
  requireCapability("payroll:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    try {
      const [row] = await db
        .select()
        .from(payrollSettingsTable)
        .where(eq(payrollSettingsTable.companyId, companyId))
        .limit(1);
      res.json({
        salaryExpenseAccountId: row?.salaryExpenseAccountId ?? null,
        netPayableAccountId: row?.netPayableAccountId ?? null,
        deductionsAccountId: row?.deductionsAccountId ?? null,
        insuranceExpenseAccountId: row?.insuranceExpenseAccountId ?? null,
        insuranceLiabilityAccountId: row?.insuranceLiabilityAccountId ?? null,
        payrollTaxLiabilityAccountId: row?.payrollTaxLiabilityAccountId ?? null,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to get payroll settings");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.put(
  "/payroll/settings",
  requireAuth,
  requireCapability("payroll:create"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const body = req.body as {
      salaryExpenseAccountId?: string | null;
      netPayableAccountId?: string | null;
      deductionsAccountId?: string | null;
      insuranceExpenseAccountId?: string | null;
      insuranceLiabilityAccountId?: string | null;
      payrollTaxLiabilityAccountId?: string | null;
    };
    try {
      const ids = [
        body.salaryExpenseAccountId,
        body.netPayableAccountId,
        body.deductionsAccountId,
        body.insuranceExpenseAccountId,
        body.insuranceLiabilityAccountId,
        body.payrollTaxLiabilityAccountId,
      ].filter((x): x is string => !!x);
      if (ids.length > 0) {
        const err = await validatePayrollAccounts(ids, companyId);
        if (err) {
          res.status(400).json({ error: err });
          return;
        }
      }
      await db
        .insert(payrollSettingsTable)
        .values({
          companyId,
          salaryExpenseAccountId: body.salaryExpenseAccountId ?? null,
          netPayableAccountId: body.netPayableAccountId ?? null,
          deductionsAccountId: body.deductionsAccountId ?? null,
          insuranceExpenseAccountId: body.insuranceExpenseAccountId ?? null,
          insuranceLiabilityAccountId: body.insuranceLiabilityAccountId ?? null,
          payrollTaxLiabilityAccountId: body.payrollTaxLiabilityAccountId ?? null,
        })
        .onConflictDoUpdate({
          target: payrollSettingsTable.companyId,
          set: {
            salaryExpenseAccountId: body.salaryExpenseAccountId ?? null,
            netPayableAccountId: body.netPayableAccountId ?? null,
            deductionsAccountId: body.deductionsAccountId ?? null,
            insuranceExpenseAccountId: body.insuranceExpenseAccountId ?? null,
            insuranceLiabilityAccountId: body.insuranceLiabilityAccountId ?? null,
            payrollTaxLiabilityAccountId: body.payrollTaxLiabilityAccountId ?? null,
          },
        });
      const [row] = await db
        .select()
        .from(payrollSettingsTable)
        .where(eq(payrollSettingsTable.companyId, companyId))
        .limit(1);
      res.json({
        salaryExpenseAccountId: row?.salaryExpenseAccountId ?? null,
        netPayableAccountId: row?.netPayableAccountId ?? null,
        deductionsAccountId: row?.deductionsAccountId ?? null,
        insuranceExpenseAccountId: row?.insuranceExpenseAccountId ?? null,
        insuranceLiabilityAccountId: row?.insuranceLiabilityAccountId ?? null,
        payrollTaxLiabilityAccountId: row?.payrollTaxLiabilityAccountId ?? null,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to update payroll settings");
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
    try {
      // Load payroll account settings for this company
      const [settings] = await db
        .select()
        .from(payrollSettingsTable)
        .where(eq(payrollSettingsTable.companyId, companyId))
        .limit(1);
      if (!settings?.salaryExpenseAccountId || !settings?.netPayableAccountId) {
        res.status(400).json({ error: "يجب ضبط إعدادات حسابات الرواتب أولاً" });
        return;
      }
      // Narrow from string | null | undefined to string (checked above)
      const salaryExpAccId = settings.salaryExpenseAccountId as string;
      const netPayableAccId = settings.netPayableAccountId as string;

      // Per-employee payroll tax map (keyed by employeeId)
      const employeeTaxMap = new Map<string, number>();
      for (const et of (d.employeeTaxes ?? [])) {
        if (et.payrollTax > EPS) employeeTaxMap.set(et.employeeId, et.payrollTax);
      }

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
      const wbPayroll = await isWriteBlocked(db, companyId, period + "-01");
      if (wbPayroll) {
        res.status(wbPayroll === "period_locked" ? 423 : 400).json({ error: WRITE_BLOCK_MSG[wbPayroll] });
        return;
      }

      const accErr = await validatePayrollAccounts(
        [
          settings.salaryExpenseAccountId,
          settings.netPayableAccountId,
          ...(settings.deductionsAccountId ? [settings.deductionsAccountId] : []),
        ],
        companyId,
      );
      if (accErr) {
        res.status(400).json({ error: accErr });
        return;
      }

      const [company] = await db
        .select({ baseCurrency: companiesTable.baseCurrency, country: companiesTable.country })
        .from(companiesTable)
        .where(eq(companiesTable.id, companyId))
        .limit(1);
      const baseCurrency = (company?.baseCurrency || "EGP").toUpperCase();
      const isEgypt = (company?.country ?? "EG").toUpperCase() === "EG";

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
        costCenterId: string | null;
        base: number;
        allowances: number;
        // deductions split by whether they have a linked account
        unlinkedDeductions: number;   // Cr catch-all deductionsAccountId
        linkedDeductions: { accountId: string; amount: number }[];
        gross: number;
        // social insurance
        insuranceSalary: number;
        employeeInsurance: number;
        companyInsurance: number;
      };
      const empPays: EmpPay[] = [];
      for (const e of employees) {
        const comps = (compMap.get(e.id) ?? []).filter((c) => c.isActive);
        const base = round2(Number(e.baseSalary));
        let allowances = 0;
        let unlinkedDeductions = 0;
        const linkedDeductionMap = new Map<string, number>();
        for (const c of comps) {
          const amt = round2(Number(c.amount));
          if (c.kind === "allowance") {
            allowances = round2(allowances + amt);
          } else if (c.kind === "deduction") {
            if (c.linkedAccountId) {
              linkedDeductionMap.set(c.linkedAccountId, round2((linkedDeductionMap.get(c.linkedAccountId) ?? 0) + amt));
            } else {
              unlinkedDeductions = round2(unlinkedDeductions + amt);
            }
          }
        }
        const linkedDeductions = [...linkedDeductionMap.entries()].map(([accountId, amount]) => ({ accountId, amount }));
        const gross = round2(base + allowances);
        if (gross <= EPS) continue; // skip employees with nothing to pay

        // Social insurance (EG: auto; other countries: 0 — add manually via components)
        let insuranceSalary = 0;
        let employeeInsurance = 0;
        let companyInsurance = 0;
        if (isEgypt && e.includeInsurance) {
          const insSalary = e.insuranceSalary != null ? round2(Number(e.insuranceSalary)) : base;
          if (insSalary > EPS) {
            insuranceSalary = insSalary;
            employeeInsurance = round2(insSalary * EG_EMPLOYEE_RATE);
            companyInsurance = round2(insSalary * EG_COMPANY_RATE);
          }
        }

        empPays.push({ id: e.id, nameAr: e.nameAr, costCenterId: e.costCenterId ?? null, base, allowances, unlinkedDeductions, linkedDeductions, gross, insuranceSalary, employeeInsurance, companyInsurance });
      }

      if (empPays.length === 0) {
        res.status(400).json({ error: "لا يوجد موظفون نشطون للصرف" });
        return;
      }

      const totalUnlinkedDeductions = round2(empPays.reduce((s, e) => s + e.unlinkedDeductions, 0));
      const totalCompanyInsurance = round2(empPays.reduce((s, e) => s + e.companyInsurance, 0));
      const totalEmployeeInsurance = round2(empPays.reduce((s, e) => s + e.employeeInsurance, 0));

      // Aggregate linked deductions by account across all employees
      const allLinkedByAccount = new Map<string, number>();
      for (const e of empPays) {
        for (const { accountId, amount } of e.linkedDeductions) {
          allLinkedByAccount.set(accountId, round2((allLinkedByAccount.get(accountId) ?? 0) + amount));
        }
      }

      // Only *unlinked* deductions need the catch-all deductions account
      if (totalUnlinkedDeductions > EPS && !settings.deductionsAccountId) {
        res.status(400).json({ error: "يوجد خصومات — يجب تحديد حساب الخصومات في إعدادات الرواتب" });
        return;
      }
      // Insurance accounts required when there are auto-computed insurance amounts
      if (totalCompanyInsurance > EPS && (!settings.insuranceExpenseAccountId || !settings.insuranceLiabilityAccountId)) {
        res.status(400).json({ error: "يوجد تأمينات اجتماعية — يجب تحديد حسابا التأمين في إعدادات الرواتب" });
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
          costCenterId: string | null;
          baseSalary: number;
          totalAllowances: number;
          totalDeductions: number;
          insuranceSalary: number;
          companyInsurance: number;
          employeeInsurance: number;
          payrollTax: number;
          netPay: number;
        }[] = [];
        let totalGross = 0;
        let totalNet = 0;
        let totalPayrollTax = 0;
        let totalAdvanceInstallments = 0;
        const advanceCreditByAccount = new Map<string, number>();
        const installmentsToApply: AdvanceDeduction[] = [];
        for (const e of empPays) {
          const empAdvances = advancesByEmp.get(e.id) ?? [];
          const advanceTotal = round2(empAdvances.reduce((s, x) => s + x.amount, 0));
          const payrollTax = round2(employeeTaxMap.get(e.id) ?? 0);
          const allDeductions = round2(e.unlinkedDeductions + e.linkedDeductions.reduce((s, x) => s + x.amount, 0) + advanceTotal + e.employeeInsurance + payrollTax);
          const net = round2(e.gross - allDeductions);
          if (net < -EPS) {
            throw new PayrollError(`الخصومات تتجاوز إجمالي الراتب للموظف ${e.nameAr}`);
          }
          runLines.push({
            employeeId: e.id,
            employeeName: e.nameAr,
            costCenterId: e.costCenterId,
            baseSalary: e.base,
            totalAllowances: e.allowances,
            totalDeductions: allDeductions,
            insuranceSalary: e.insuranceSalary,
            companyInsurance: e.companyInsurance,
            employeeInsurance: e.employeeInsurance,
            payrollTax,
            netPay: net,
          });
          totalGross = round2(totalGross + e.gross);
          totalNet = round2(totalNet + net);
          totalPayrollTax = round2(totalPayrollTax + payrollTax);
          totalAdvanceInstallments = round2(totalAdvanceInstallments + advanceTotal);
          for (const ad of empAdvances) {
            installmentsToApply.push(ad);
            const accId = ad.advance.advancesAccountId;
            advanceCreditByAccount.set(accId, round2((advanceCreditByAccount.get(accId) ?? 0) + ad.amount));
          }
        }
        const totalAllRegularDeductions = round2(totalUnlinkedDeductions + [...allLinkedByAccount.values()].reduce((s, v) => s + v, 0));
        const totalDeductions = round2(totalAllRegularDeductions + totalAdvanceInstallments + totalEmployeeInsurance + totalPayrollTax);

        // Advance accounts being credited must still be valid leaf accounts.
        const advAccErr = await validatePayrollAccounts([...advanceCreditByAccount.keys()], companyId);
        if (advAccErr) throw new PayrollError(advAccErr);
        // Linked component accounts must be valid leaf accounts too.
        const linkedAccErr = await validatePayrollAccounts([...allLinkedByAccount.keys()], companyId);
        if (linkedAccErr) throw new PayrollError(linkedAccErr);

        // Posting lines:
        // Dr  salary expense account           (total gross of all employees)
        // Dr  insurance expense account        (company insurance share, if any)
        // Cr  catch-all deductions account     (unlinked deductions)
        // Cr  per-component linked accounts    (deductions with own accounts)
        // Cr  insurance liability account      (employee + company insurance)
        // Cr  advance asset account(s)         (installments)
        // Cr  net payable account              (net salary)
        const postingLines: { accountId: string; description?: string | null; debit: number; credit: number }[] = [
          { accountId: salaryExpAccId, description: `رواتب ${period}`, debit: totalGross, credit: 0 },
        ];
        // Company insurance share (additional expense)
        if (totalCompanyInsurance > EPS && settings.insuranceExpenseAccountId) {
          postingLines.push({ accountId: settings.insuranceExpenseAccountId, description: `تأمينات اجتماعية — حصة الشركة ${period}`, debit: totalCompanyInsurance, credit: 0 });
        }
        // Catch-all unlinked deductions
        if (totalUnlinkedDeductions > EPS && settings.deductionsAccountId) {
          postingLines.push({ accountId: settings.deductionsAccountId, description: `خصومات رواتب ${period}`, debit: 0, credit: totalUnlinkedDeductions });
        }
        // Per-component linked deduction accounts
        for (const [accountId, amount] of allLinkedByAccount) {
          if (amount <= EPS) continue;
          postingLines.push({ accountId, description: `استقطاعات رواتب ${period}`, debit: 0, credit: amount });
        }
        // Insurance liability (employee + company portions both payable to authority)
        const totalInsuranceLiability = round2(totalEmployeeInsurance + totalCompanyInsurance);
        if (totalInsuranceLiability > EPS && settings.insuranceLiabilityAccountId) {
          postingLines.push({ accountId: settings.insuranceLiabilityAccountId, description: `تأمينات اجتماعية مستحقة ${period}`, debit: 0, credit: totalInsuranceLiability });
        }
        // Payroll income tax liability
        if (totalPayrollTax > EPS && settings.payrollTaxLiabilityAccountId) {
          postingLines.push({ accountId: settings.payrollTaxLiabilityAccountId, description: `ضريبة كسب العمل ${period}`, debit: 0, credit: totalPayrollTax });
        }
        // Advance installments lower the advances asset account(s).
        for (const [accountId, amount] of advanceCreditByAccount) {
          if (amount <= EPS) continue;
          postingLines.push({ accountId, description: `سداد أقساط سلف ${period}`, debit: 0, credit: amount });
        }
        postingLines.push({ accountId: netPayableAccId, description: `صافي رواتب ${period}`, debit: 0, credit: totalNet });

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
            salaryExpenseAccountId: salaryExpAccId,
            netPayableAccountId: netPayableAccId,
            deductionsAccountId: settings.deductionsAccountId ?? null,
            insuranceExpenseAccountId: settings.insuranceExpenseAccountId ?? null,
            insuranceLiabilityAccountId: settings.insuranceLiabilityAccountId ?? null,
            totalGross: String(totalGross),
            totalDeductions: String(totalDeductions),
            totalNet: String(totalNet),
            companyInsuranceTotal: String(totalCompanyInsurance),
            employeeInsuranceTotal: String(totalEmployeeInsurance),
            totalPayrollTax: String(totalPayrollTax),
            payrollTaxLiabilityAccountId: totalPayrollTax > EPS ? (settings.payrollTaxLiabilityAccountId ?? null) : null,
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
            costCenterId: l.costCenterId ?? null,
            baseSalary: String(l.baseSalary),
            totalAllowances: String(l.totalAllowances),
            totalDeductions: String(l.totalDeductions),
            insuranceSalary: String(l.insuranceSalary),
            companyInsurance: String(l.companyInsurance),
            employeeInsurance: String(l.employeeInsurance),
            payrollTax: String(l.payrollTax),
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
