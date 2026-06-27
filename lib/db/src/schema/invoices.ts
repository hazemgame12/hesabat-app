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
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { usersTable } from "./users";
import { accountsTable } from "./accounts";
import { taxesTable } from "./taxes";
import { costCentersTable } from "./cost-centers";
import { customersTable, suppliersTable } from "./customers-suppliers";
import { inventoryItemsTable } from "./inventory";
import { fixedAssetsTable } from "./fixed-assets";
import { journalEntriesTable } from "./journal-entries";
import { bankMovementsTable } from "./bank";
import { projectsTable } from "./projects";
import { branchesTable } from "./branches";

// A sales (customer) or purchase (supplier) invoice. A single table with a
// `kind` discriminator backs both flows because they share the same line model
// and posting machinery; the only structural difference is which party (and
// control account) the document points to. `invoiceNo` is allocated per company
// AND per kind (so sales and purchases each have their own sequence).
export const invoicesTable = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // 'sales' | 'purchase'
    invoiceNo: integer("invoice_no").notNull(),
    // Human-facing fiscal-year-scoped code, e.g. SI-2026-0001 / PI-2026-0001.
    // Auto-generated on create; nullable for rows created before this feature.
    code: text("code"),
    // For credit/debit notes (kind 'sales_return' / 'purchase_return'): the
    // original posted invoice this note reverses. Null for normal invoices.
    relatedInvoiceId: uuid("related_invoice_id").references(
      (): AnyPgColumn => invoicesTable.id,
      { onDelete: "set null" },
    ),
    // For invoices converted FROM a quotation or purchase_order: the source
    // document id. Null for invoices created directly.
    sourceDocumentId: uuid("source_document_id").references(
      (): AnyPgColumn => invoicesTable.id,
      { onDelete: "set null" },
    ),
    date: date("date").notNull(),
    dueDate: date("due_date"),
    // Exactly one of these is set, per `kind`.
    customerId: uuid("customer_id").references(() => customersTable.id, {
      onDelete: "restrict",
    }),
    supplierId: uuid("supplier_id").references(() => suppliersTable.id, {
      onDelete: "restrict",
    }),
    costCenterId: uuid("cost_center_id").references(() => costCentersTable.id, {
      onDelete: "set null",
    }),
    // Transaction currency (code). Null → company base currency.
    currency: text("currency"),
    exchangeRate: numeric("exchange_rate", { precision: 18, scale: 6 })
      .notNull()
      .default("1"),
    // 'draft' | 'approved' | 'partially_paid' | 'paid' | 'cancelled'.
    // `overdue` is DERIVED on read (approved/partially_paid + dueDate < today).
    status: text("status").notNull().default("draft"),
    notes: text("notes"),
    // Document totals in the transaction currency.
    subtotal: numeric("subtotal", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    discountTotal: numeric("discount_total", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    taxTotal: numeric("tax_total", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    // Sum of WHT amounts across all lines. WHT reduces the total amount due.
    whtTotal: numeric("wht_total", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    total: numeric("total", { precision: 18, scale: 2 }).notNull().default("0"),
    // Running total of collections/payments allocated to this invoice
    // (transaction currency). Drives status transitions.
    amountPaid: numeric("amount_paid", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    // The posted journal entry created on approval.
    journalEntryId: uuid("journal_entry_id").references(
      () => journalEntriesTable.id,
      { onDelete: "set null" },
    ),
    createdBy: uuid("created_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    // E-Invoice: tracking fields for electronic submission.
    eInvoiceRequired: boolean("e_invoice_required").notNull().default(false),
    eInvoiceStatus: text("e_invoice_status"), // 'pending' | 'submitted' | 'accepted' | 'rejected' | null
    eInvoiceUuid: text("e_invoice_uuid"),
    eInvoiceSubmissionDate: timestamp("e_invoice_submission_date", {
      withTimezone: true,
    }),
    eInvoiceError: text("e_invoice_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique().on(t.companyId, t.kind, t.invoiceNo),
    // Auto-generated codes must be unique per company. Partial so pre-feature
    // rows (code IS NULL) are exempt; the sequence is the source of truth but
    // this is the integrity backstop against any desync.
    uniqueIndex("invoices_company_id_code_unique")
      .on(t.companyId, t.code)
      .where(sql`${t.code} IS NOT NULL`),
  ],
);

// One line of an invoice. `lineType` decides how the line posts and whether it
// touches inventory / fixed assets:
//   'service'     → posts only to `accountId` (revenue on sales, expense on purchase).
//   'inventory'   → links `itemId`; supplier invoice ↑stock at unitPrice (cost),
//                   customer invoice ↓stock + posts COGS (weighted-avg) to
//                   `cogsAccountId`. `accountId` is the revenue/inventory account.
//   'fixed_asset' → on a purchase, registers a fixed asset (asset* fields);
//                   `accountId` is the fixed-asset (asset) account.
export const invoiceLinesTable = pgTable("invoice_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoicesTable.id, { onDelete: "cascade" }),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  lineNo: integer("line_no").notNull(),
  lineType: text("line_type").notNull(), // 'service' | 'inventory' | 'fixed_asset'
  description: text("description"),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accountsTable.id, { onDelete: "restrict" }),
  // Inventory line links.
  itemId: uuid("item_id").references(() => inventoryItemsTable.id, {
    onDelete: "restrict",
  }),
  warehouse: text("warehouse"),
  cogsAccountId: uuid("cogs_account_id").references(() => accountsTable.id, {
    onDelete: "restrict",
  }),
  quantity: numeric("quantity", { precision: 18, scale: 4 })
    .notNull()
    .default("1"),
  unitPrice: numeric("unit_price", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  discount: numeric("discount", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  taxId: uuid("tax_id").references(() => taxesTable.id, {
    onDelete: "set null",
  }),
  taxAmount: numeric("tax_amount", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  // Withholding tax (separate from VAT). WHT reduces the net amount due.
  whtTaxId: uuid("wht_tax_id").references(() => taxesTable.id, {
    onDelete: "set null",
  }),
  whtAmount: numeric("wht_amount", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  // Net of discount, before tax: quantity*unitPrice - discount.
  lineTotal: numeric("line_total", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  costCenterId: uuid("cost_center_id").references(() => costCentersTable.id, {
    onDelete: "set null",
  }),
  // ✨ NEW: Accounting dimensions
  projectId: uuid("project_id").references(() => projectsTable.id, {
    onDelete: "set null",
  }),
  branchId: uuid("branch_id").references(() => branchesTable.id, {
    onDelete: "set null",
  }),
  // Fixed-asset registration fields (used when lineType = 'fixed_asset').
  assetNameAr: text("asset_name_ar"),
  assetNameEn: text("asset_name_en"),
  assetUsefulLifeMonths: integer("asset_useful_life_months"),
  assetSalvageValue: numeric("asset_salvage_value", {
    precision: 18,
    scale: 2,
  }),
  assetAccumulatedAccountId: uuid("asset_accumulated_account_id").references(
    () => accountsTable.id,
    { onDelete: "restrict" },
  ),
  assetExpenseAccountId: uuid("asset_expense_account_id").references(
    () => accountsTable.id,
    { onDelete: "restrict" },
  ),
  // The fixed asset created from this line (purchase fixed-asset lines).
  fixedAssetId: uuid("fixed_asset_id").references(() => fixedAssetsTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// A collection (from a customer) or a payment (to a supplier). Picks a cash/bank
// account from the chart (no banks module yet). Allocated to one or more invoices
// via `payment_allocations`.
export const paymentsTable = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // 'collection' | 'payment'
    paymentNo: integer("payment_no").notNull(),
    date: date("date").notNull(),
    customerId: uuid("customer_id").references(() => customersTable.id, {
      onDelete: "restrict",
    }),
    supplierId: uuid("supplier_id").references(() => suppliersTable.id, {
      onDelete: "restrict",
    }),
    method: text("method").notNull(), // 'cash' | 'bank' | 'cheque' | 'card'
    cashAccountId: uuid("cash_account_id")
      .notNull()
      .references(() => accountsTable.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    currency: text("currency"),
    exchangeRate: numeric("exchange_rate", { precision: 18, scale: 6 })
      .notNull()
      .default("1"),
    notes: text("notes"),
    bankMovementId: uuid("bank_movement_id").references(
      () => bankMovementsTable.id,
      { onDelete: "set null" },
    ),
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
  (t) => [unique().on(t.companyId, t.kind, t.paymentNo)],
);

export const paymentAllocationsTable = pgTable("payment_allocations", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentId: uuid("payment_id")
    .notNull()
    .references(() => paymentsTable.id, { onDelete: "cascade" }),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoicesTable.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  allocatedCurrency: text("allocated_currency"),
  baseCurrencyAmount: numeric("base_currency_amount", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  exchangeRate: numeric("exchange_rate", { precision: 18, scale: 6 })
    .notNull()
    .default("1"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({
  id: true,
  companyId: true,
  invoiceNo: true,
  code: true,
  status: true,
  amountPaid: true,
  journalEntryId: true,
  createdBy: true,
  approvedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoicesTable.$inferSelect;
export type InvoiceLine = typeof invoiceLinesTable.$inferSelect;
export type Payment = typeof paymentsTable.$inferSelect;
export type PaymentAllocation = typeof paymentAllocationsTable.$inferSelect;
