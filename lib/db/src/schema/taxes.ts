import {
  pgTable,
  uuid,
  text,
  numeric,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { accountsTable } from "./accounts";

export const taxesTable = pgTable("taxes", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en"),
  kind: text("kind").notNull(), // 'vat' | 'wht'
  rate: numeric("rate", { precision: 6, scale: 3 }).notNull(),
  serviceNature: text("service_nature"),
  // For VAT: the tax payable/receivable account.
  // For WHT: the credit (payable) account used on purchase invoices.
  linkedAccountId: uuid("linked_account_id").references(
    () => accountsTable.id,
    { onDelete: "set null" },
  ),
  // WHT only: the debit (receivable) account used on sales invoices.
  // When the customer withholds tax from you, you Dr this account (asset).
  whtDebitAccountId: uuid("wht_debit_account_id").references(
    () => accountsTable.id,
    { onDelete: "set null" },
  ),
  // E-Invoice: tax type classification for tax-authority submission.
  // 'vat_standard' | 'vat_zero' | 'exempt' | 'wht' | 'schedule'
  taxType: text("tax_type"),
  // E-Invoice: tax category for tax-authority classification.
  // 'taxable' | 'zero_rated' | 'exempt' | 'not_subject'
  taxCategory: text("tax_category"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertTaxSchema = createInsertSchema(taxesTable).omit({
  id: true,
  companyId: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTax = z.infer<typeof insertTaxSchema>;
export type Tax = typeof taxesTable.$inferSelect;
