import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  boolean,
  date,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { usersTable } from "./users";
import { accountsTable } from "./accounts";
import { journalEntriesTable } from "./journal-entries";
import { costCentersTable } from "./cost-centers";

// An employee belongs to exactly one company. `code` is the human-facing
// employee number, unique within the company. `baseSalary` is the monthly base;
// recurring allowances/deductions live in `employee_pay_components`.
export const employeesTable = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en"),
    jobTitle: text("job_title"),
    hireDate: date("hire_date").notNull(),
    status: text("status").notNull().default("active"), // 'active' | 'terminated'
    employeeType: text("employee_type").notNull().default("permanent"), // 'permanent' | 'temporary'
    nationalId: text("national_id"),
    costCenterId: uuid("cost_center_id").references(() => costCentersTable.id, {
      onDelete: "set null",
    }),
    baseSalary: numeric("base_salary", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    // Egyptian social insurance: المرتب التأميني (insurance wage base).
    // For EG companies, employee share = 11%, company share = 18.75%.
    // null = use baseSalary as insurance salary.
    insuranceSalary: numeric("insurance_salary", { precision: 18, scale: 2 }),
    includeInsurance: boolean("include_insurance").notNull().default(true),
    // Default monthly income tax (ضريبة كسب العمل) — pre-filled in the payroll run.
    payrollTax: numeric("payroll_tax", { precision: 18, scale: 2 }).default("0"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique().on(t.companyId, t.code)],
);

// Recurring monthly pay components for an employee. `kind` is 'allowance'
// (added to gross) or 'deduction' (subtracted to reach net).
// `linkedAccountId` — when set, this component gets its OWN Cr line in the
// payroll journal entry instead of going to the run-level catch-all deductions
// account. Useful for union dues, specific tax withholdings, etc.
export const employeePayComponentsTable = pgTable("employee_pay_components", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // 'allowance' | 'deduction'
  nameAr: text("name_ar").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  // Optional COA account: when set and kind='deduction', Cr this account in JE.
  linkedAccountId: uuid("linked_account_id").references(
    () => accountsTable.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// One monthly payroll run per company per period. Running it emits ONE
// consolidated draft journal entry and snapshots a line per included employee.
// unique(company, period) prevents running the same month twice.
export const payrollRunsTable = pgTable(
  "payroll_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    period: text("period").notNull(), // 'YYYY-MM'
    status: text("status").notNull().default("posted"), // 'posted'
    // Accounts used for the posting (re-validated leaf+company on run).
    salaryExpenseAccountId: uuid("salary_expense_account_id")
      .notNull()
      .references(() => accountsTable.id, { onDelete: "restrict" }),
    netPayableAccountId: uuid("net_payable_account_id")
      .notNull()
      .references(() => accountsTable.id, { onDelete: "restrict" }),
    // Catch-all Cr for deductions WITHOUT their own linkedAccountId.
    deductionsAccountId: uuid("deductions_account_id").references(
      () => accountsTable.id,
      { onDelete: "restrict" },
    ),
    // Social insurance accounts (required when companyInsuranceTotal > 0).
    insuranceExpenseAccountId: uuid("insurance_expense_account_id").references(
      () => accountsTable.id,
      { onDelete: "restrict" },
    ),
    insuranceLiabilityAccountId: uuid(
      "insurance_liability_account_id",
    ).references(() => accountsTable.id, { onDelete: "restrict" }),
    totalGross: numeric("total_gross", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    totalDeductions: numeric("total_deductions", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    totalNet: numeric("total_net", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    companyInsuranceTotal: numeric("company_insurance_total", {
      precision: 18,
      scale: 2,
    })
      .notNull()
      .default("0"),
    employeeInsuranceTotal: numeric("employee_insurance_total", {
      precision: 18,
      scale: 2,
    })
      .notNull()
      .default("0"),
    totalPayrollTax: numeric("total_payroll_tax", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    payrollTaxLiabilityAccountId: uuid(
      "payroll_tax_liability_account_id",
    ).references(() => accountsTable.id, { onDelete: "restrict" }),
    employeeCount: integer("employee_count").notNull().default(0),
    notes: text("notes"),
    journalEntryId: uuid("journal_entry_id").references(
      () => journalEntriesTable.id,
      { onDelete: "set null" },
    ),
    createdBy: uuid("created_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.companyId, t.period)],
);

// A per-employee snapshot inside a payroll run. `employeeId` is restrict so an
// employee with payroll history cannot be deleted; `employeeName` snapshots the
// name at run time so historic payslips render even if the employee is renamed.
export const payrollRunLinesTable = pgTable("payroll_run_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  runId: uuid("run_id")
    .notNull()
    .references(() => payrollRunsTable.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "restrict" }),
  employeeName: text("employee_name").notNull(),
  baseSalary: numeric("base_salary", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  totalAllowances: numeric("total_allowances", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  totalDeductions: numeric("total_deductions", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  // Social insurance snapshot per employee
  insuranceSalary: numeric("insurance_salary", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  companyInsurance: numeric("company_insurance", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  employeeInsurance: numeric("employee_insurance", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  payrollTax: numeric("payroll_tax", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  costCenterId: uuid("cost_center_id").references(() => costCentersTable.id, {
    onDelete: "set null",
  }),
  netPay: numeric("net_pay", { precision: 18, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// An employee advance (سلفة): a lump sum given to an employee, repaid as fixed
// monthly installments deducted automatically inside each payroll run. The
// installment is added as a deduction (Cr the linked advances asset account)
// until the advance is fully repaid (`totalRepaid` >= `amount`), at which point
// the status flips to 'finished'. Remaining balance = amount − totalRepaid.
export const advancesTable = pgTable("advances", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  date: date("date").notNull(), // advance grant date
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull().default("0"),
  repaymentMonths: integer("repayment_months").notNull().default(1),
  monthlyInstallment: numeric("monthly_installment", {
    precision: 18,
    scale: 2,
  })
    .notNull()
    .default("0"),
  startDate: date("start_date").notNull(), // first deduction month
  endDate: date("end_date"), // informational; deduction is balance-driven
  status: text("status").notNull().default("active"), // active|finished|suspended
  // Linked advances asset account (re-validated leaf+company on write).
  advancesAccountId: uuid("advances_account_id")
    .notNull()
    .references(() => accountsTable.id, { onDelete: "restrict" }),
  totalRepaid: numeric("total_repaid", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// A single installment deducted from one advance during a payroll run. The
// unique(advanceId, period) constraint guarantees a month is never deducted
// twice for the same advance even under concurrent posting.
export const advanceInstallmentsTable = pgTable(
  "advance_installments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    advanceId: uuid("advance_id")
      .notNull()
      .references(() => advancesTable.id, { onDelete: "cascade" }),
    payrollRunId: uuid("payroll_run_id").references(() => payrollRunsTable.id, {
      onDelete: "set null",
    }),
    period: text("period").notNull(), // 'YYYY-MM'
    amount: numeric("amount", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.advanceId, t.period)],
);

// A custody (عهدة) entrusted to an employee — cash, tools, devices, documents,
// or other. Unlike advances, custodies are NOT auto-deducted from salary; they
// only raise an alert at payroll time and are cleared via an Excel-uploaded
// settlement journal entry (linked through `settlementJournalEntryId`).
export const custodiesTable = pgTable("custodies", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("cash"), // cash|tools|devices|documents|other
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull().default("0"),
  receiptDate: date("receipt_date").notNull(),
  description: text("description"),
  status: text("status").notNull().default("open"), // open|settled|closed
  settlementJournalEntryId: uuid("settlement_journal_entry_id").references(
    () => journalEntriesTable.id,
    { onDelete: "set null" },
  ),
  createdBy: uuid("created_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Supporting documents attached to a custody (forced-download, like journal
// attachments). `objectKey` is the on-disk filename under the uploads dir.
export const custodyAttachmentsTable = pgTable("custody_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  custodyId: uuid("custody_id")
    .notNull()
    .references(() => custodiesTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type"),
  size: integer("size").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Per-company payroll account settings — stored once, used on every run.
// All account references are nullable so companies can save partial configs.
export const payrollSettingsTable = pgTable("payroll_settings", {
  companyId: uuid("company_id")
    .primaryKey()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  salaryExpenseAccountId: uuid("salary_expense_account_id").references(
    () => accountsTable.id,
    { onDelete: "restrict" },
  ),
  netPayableAccountId: uuid("net_payable_account_id").references(
    () => accountsTable.id,
    { onDelete: "restrict" },
  ),
  deductionsAccountId: uuid("deductions_account_id").references(
    () => accountsTable.id,
    { onDelete: "restrict" },
  ),
  insuranceExpenseAccountId: uuid("insurance_expense_account_id").references(
    () => accountsTable.id,
    { onDelete: "restrict" },
  ),
  insuranceLiabilityAccountId: uuid(
    "insurance_liability_account_id",
  ).references(() => accountsTable.id, { onDelete: "restrict" }),
  payrollTaxLiabilityAccountId: uuid(
    "payroll_tax_liability_account_id",
  ).references(() => accountsTable.id, { onDelete: "restrict" }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type PayrollSettings = typeof payrollSettingsTable.$inferSelect;

export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({
  id: true,
  companyId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employeesTable.$inferSelect;
export type EmployeePayComponent =
  typeof employeePayComponentsTable.$inferSelect;
export type PayrollRun = typeof payrollRunsTable.$inferSelect;
export type PayrollRunLine = typeof payrollRunLinesTable.$inferSelect;
export type Advance = typeof advancesTable.$inferSelect;
export type AdvanceInstallment = typeof advanceInstallmentsTable.$inferSelect;
export type Custody = typeof custodiesTable.$inferSelect;
export type CustodyAttachment = typeof custodyAttachmentsTable.$inferSelect;
