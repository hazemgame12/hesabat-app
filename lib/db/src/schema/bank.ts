import {
  pgTable,
  uuid,
  text,
  numeric,
  boolean,
  date,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { usersTable } from "./users";
import { accountsTable } from "./accounts";
import { journalEntriesTable } from "./journal-entries";
import { costCentersTable } from "./cost-centers";

// A cash drawer or bank/credit-card/loan account. Each is linked to an existing
// leaf chart-of-accounts account (re-validated to the company on write). The
// running balance is computed as `openingBalance + Σ posted movement effects`
// in the account's own currency.
export const bankAccountsTable = pgTable("bank_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en"),
  // 'bank' | 'cash' | 'credit_card' | 'loan'
  type: text("type").notNull().default("bank"),
  bankName: text("bank_name"),
  accountNumber: text("account_number"),
  currency: text("currency").notNull(),
  openingBalance: numeric("opening_balance", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  openingBalanceDate: date("opening_balance_date"),
  // Linked leaf chart account (e.g. 1112 a bank, 1111 main cash).
  accountId: uuid("account_id")
    .notNull()
    .references(() => accountsTable.id, { onDelete: "restrict" }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// One row per cash/bank movement. `direction` ('in' | 'out') is the effect on the
// bank account balance and is derived from `type` (a transfer creates two linked
// rows: an 'out' on the source account + an 'in' on the destination, sharing one
// journalEntryId and transferGroupId). Every movement posts ONE balanced posted
// journal entry via the shared helper.
export const bankMovementsTable = pgTable("bank_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  bankAccountId: uuid("bank_account_id")
    .notNull()
    .references(() => bankAccountsTable.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  // deposit | withdrawal | transfer | bank_charge | interest_income |
  // interest_expense | customer_collection | supplier_payment |
  // loan_installment | cash_expense
  type: text("type").notNull(),
  direction: text("direction").notNull(), // 'in' | 'out'
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  exchangeRate: numeric("exchange_rate", { precision: 18, scale: 6 })
    .notNull()
    .default("1"),
  // The other side of the entry (revenue/expense/AR/AP/loan...). Null for
  // transfers (the counterpart is the other bank account).
  counterpartAccountId: uuid("counterpart_account_id").references(
    () => accountsTable.id,
    { onDelete: "restrict" },
  ),
  // Optional cost-center/project tag chosen when the movement is classified.
  // Applied to the counterpart line of the posted journal entry.
  costCenterId: uuid("cost_center_id").references(() => costCentersTable.id, {
    onDelete: "set null",
  }),
  // ✨ NEW: Accounting dimensions
  projectId: uuid("project_id"),
  branchId: uuid("branch_id"),
  // The other bank account for transfers.
  transferAccountId: uuid("transfer_account_id").references(
    () => bankAccountsTable.id,
    { onDelete: "restrict" },
  ),
  // Links the two rows of a single transfer so they delete together.
  transferGroupId: uuid("transfer_group_id"),
  // ── Multi-currency transfer fields (set on the 'out' row) ──────────────────
  // For same-currency transfers these are null.
  // destinationAmount: the actual amount received in the destination account.
  // bankFees: bank wire-fee deducted from the source account (in source currency).
  // realizedGainLoss: (destAmount * destRate) − (srcAmount * srcRate) in base
  //   currency; positive = FX gain, negative = FX loss.
  destinationAmount: numeric("destination_amount", { precision: 18, scale: 2 }),
  bankFees: numeric("bank_fees", { precision: 18, scale: 2 }),
  realizedGainLoss: numeric("realized_gain_loss", { precision: 18, scale: 2 }),
  description: text("description"),
  // Original bank-statement text captured on Excel import (the bank's own
  // wording). Distinct from `description` (the user's in-app البيان written
  // when classifying the movement).
  notes: text("notes"),
  reference: text("reference"),
  journalEntryId: uuid("journal_entry_id").references(
    () => journalEntriesTable.id,
    { onDelete: "set null" },
  ),
  // Set when the movement is matched during a reconciliation.
  reconciliationId: uuid("reconciliation_id").references(
    () => bankReconciliationsTable.id,
    { onDelete: "set null" },
  ),
  isCleared: boolean("is_cleared").notNull().default(false),
  // True when the movement was created by the reconciliation "adjust" action
  // (a bank charge/interest/etc. recorded while reconciling). Used to surface
  // "entries created" in the reconciliation report.
  isAdjustment: boolean("is_adjustment").notNull().default(false),
  createdBy: uuid("created_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// A bank reconciliation for one account over a period. bookBalance/difference are
// snapshots captured at creation (and refreshed on complete).
export const bankReconciliationsTable = pgTable("bank_reconciliations", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  bankAccountId: uuid("bank_account_id")
    .notNull()
    .references(() => bankAccountsTable.id, { onDelete: "cascade" }),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  statementBalance: numeric("statement_balance", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  bookBalance: numeric("book_balance", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  difference: numeric("difference", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  status: text("status").notNull().default("draft"), // 'draft' | 'completed'
  notes: text("notes"),
  adjustingEntryId: uuid("adjusting_entry_id").references(
    () => journalEntriesTable.id,
    { onDelete: "set null" },
  ),
  createdBy: uuid("created_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// A parsed bank-statement line (from the uploaded Excel) belonging to a
// reconciliation, optionally matched to a system movement.
export const bankStatementLinesTable = pgTable("bank_statement_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  reconciliationId: uuid("reconciliation_id")
    .notNull()
    .references(() => bankReconciliationsTable.id, { onDelete: "cascade" }),
  date: date("date"),
  description: text("description"),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  direction: text("direction").notNull(), // 'in' | 'out'
  matchedMovementId: uuid("matched_movement_id").references(
    () => bankMovementsTable.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertBankAccountSchema = createInsertSchema(bankAccountsTable).omit(
  {
    id: true,
    companyId: true,
    createdAt: true,
    updatedAt: true,
  },
);
export const insertBankMovementSchema = createInsertSchema(
  bankMovementsTable,
).omit({
  id: true,
  companyId: true,
  journalEntryId: true,
  reconciliationId: true,
  isCleared: true,
  createdBy: true,
  createdAt: true,
});

export type InsertBankAccount = z.infer<typeof insertBankAccountSchema>;
export type InsertBankMovement = z.infer<typeof insertBankMovementSchema>;
export type BankAccount = typeof bankAccountsTable.$inferSelect;
export type BankMovement = typeof bankMovementsTable.$inferSelect;
export type BankReconciliation = typeof bankReconciliationsTable.$inferSelect;
export type BankStatementLine = typeof bankStatementLinesTable.$inferSelect;
