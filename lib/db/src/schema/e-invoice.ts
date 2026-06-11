import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

// E-Invoice provider registry. Adapters for each country/e-invoice authority.
// E.g. Egypt (ETA), Saudi Arabia (ZATCA), UAE (FTA).
export const eInvoiceProvidersTable = pgTable("e_invoice_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(), // 'eta' | 'zatca' | 'fta'
  name: text("name").notNull(),
  country: text("country").notNull(), // ISO country code
  adapter: text("adapter").notNull(), // Adapter class name
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Per-company e-invoice configuration (the bridge table).
// One row per company. Credentials stored as JSON blob.
export const eInvoiceConfigsTable = pgTable(
  "e_invoice_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id").references(
      () => eInvoiceProvidersTable.id,
      { onDelete: "set null" },
    ),
    // E-Invoice: provider credentials (JSON blob, encrypted at rest).
    credentials: text("credentials"),
    // E-Invoice: mode and behaviour flags.
    isEnabled: boolean("is_enabled").notNull().default(false),
    sandboxMode: boolean("sandbox_mode").notNull().default(true),
    autoSubmit: boolean("auto_submit").notNull().default(false),
    // E-Invoice: ETA-specific credentials (split out for convenience).
    etaClientId: text("eta_client_id"),
    etaClientSecret: text("eta_client_secret"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique().on(t.companyId)],
);

export const insertEInvoiceProviderSchema = createInsertSchema(
  eInvoiceProvidersTable,
).omit({
  id: true,
  createdAt: true,
});

export const insertEInvoiceConfigSchema = createInsertSchema(
  eInvoiceConfigsTable,
).omit({
  id: true,
  companyId: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEInvoiceProvider = z.infer<
  typeof insertEInvoiceProviderSchema
>;
export type InsertEInvoiceConfig = z.infer<typeof insertEInvoiceConfigSchema>;
export type EInvoiceProvider = typeof eInvoiceProvidersTable.$inferSelect;
export type EInvoiceConfig = typeof eInvoiceConfigsTable.$inferSelect;
