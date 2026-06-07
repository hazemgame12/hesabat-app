import {
  pgTable,
  uuid,
  text,
  numeric,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

// Company-defined currencies and their exchange rate relative to the company's
// base currency. exchangeRate is the value of ONE unit of this currency in the
// base currency (e.g. base EGP, code USD, rate 49.5 ⇒ 1 USD = 49.5 EGP), so a
// journal line's base amount = amount * exchangeRate. This same rate table is the
// foundation for rendering reports in different currencies later.
export const currenciesTable = pgTable(
  "currencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en"),
    exchangeRate: numeric("exchange_rate", { precision: 18, scale: 6 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique("currencies_company_code_unique").on(t.companyId, t.code)],
);

export const insertCurrencySchema = createInsertSchema(currenciesTable).omit({
  id: true,
  companyId: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCurrency = z.infer<typeof insertCurrencySchema>;
export type Currency = typeof currenciesTable.$inferSelect;
