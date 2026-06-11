import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companiesTable = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  tradeName: text("trade_name"),
  taxRegistrationNumber: text("tax_registration_number"),
  activityDescription: text("activity_description"),
  logoUrl: text("logo_url"),
  country: text("country").notNull().default("EG"),
  baseCurrency: text("base_currency").notNull().default("EGP"),
  address: text("address"),
  phone: text("phone"),
  // E-Invoice: company registration identifiers for tax-authority submission.
  commercialRegistrationNumber: text("commercial_registration_number"),
  branchCode: text("branch_code"),
  eInvoiceEnabled: boolean("e_invoice_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertCompanySchema = createInsertSchema(companiesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
