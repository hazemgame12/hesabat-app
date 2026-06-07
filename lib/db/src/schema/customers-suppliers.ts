import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { accountsTable } from "./accounts";

// A customer (receivables party). Each customer is a SUBSIDIARY of a control
// (aggregate) account — by default receivables `112` (العملاء). On creation a
// dedicated leaf account is auto-created under the control account; the
// customer's running balance is DERIVED from posted journal activity on that
// subsidiary account (no stored balance), so the control-account balance in the
// trial balance always equals the sum of its subsidiaries.
export const customersTable = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en"),
    type: text("type").notNull().default("company"), // 'individual' | 'company'
    taxNumber: text("tax_number"),
    commercialRegistration: text("commercial_registration"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    // Transaction currency (code). Null → company base currency.
    currency: text("currency"),
    creditLimit: numeric("credit_limit", { precision: 18, scale: 2 }),
    creditPeriodDays: integer("credit_period_days"),
    // Parent control (group) account, e.g. 112 العملاء.
    controlAccountId: uuid("control_account_id")
      .notNull()
      .references(() => accountsTable.id, { onDelete: "restrict" }),
    // Dedicated subsidiary leaf account auto-created under the control account.
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
  },
  (t) => [unique().on(t.companyId, t.code), unique().on(t.accountId)],
);

// A supplier (payables party). Same model as customers but linked to a payables
// control account (default `211` الموردين) and without a credit limit.
export const suppliersTable = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en"),
    type: text("type").notNull().default("company"), // 'individual' | 'company'
    taxNumber: text("tax_number"),
    commercialRegistration: text("commercial_registration"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    currency: text("currency"),
    creditPeriodDays: integer("credit_period_days"),
    controlAccountId: uuid("control_account_id")
      .notNull()
      .references(() => accountsTable.id, { onDelete: "restrict" }),
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
  },
  (t) => [unique().on(t.companyId, t.code), unique().on(t.accountId)],
);

export const insertCustomerSchema = createInsertSchema(customersTable).omit({
  id: true,
  companyId: true,
  accountId: true,
  createdAt: true,
  updatedAt: true,
});
export const insertSupplierSchema = createInsertSchema(suppliersTable).omit({
  id: true,
  companyId: true,
  accountId: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type Customer = typeof customersTable.$inferSelect;
export type Supplier = typeof suppliersTable.$inferSelect;
