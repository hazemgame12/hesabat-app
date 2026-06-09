import {
  pgTable,
  uuid,
  text,
  numeric,
  date,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

// Historical exchange rates keyed by currency code AND date. Lets transactions,
// revaluation, and reports look up the rate that applied on a given date instead
// of only the single "current" rate stored on the currencies table. `rate` is the
// value of ONE unit of `currencyCode` in the company base currency (same
// convention as currencies.exchangeRate). `source` is 'manual' | 'auto'.
export const exchangeRatesTable = pgTable(
  "exchange_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    currencyCode: text("currency_code").notNull(),
    rateDate: date("rate_date").notNull(),
    rate: numeric("rate", { precision: 18, scale: 6 }).notNull(),
    source: text("source").notNull().default("manual"),
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
  },
  (t) => [
    unique("exchange_rates_company_currency_date_unique").on(
      t.companyId,
      t.currencyCode,
      t.rateDate,
    ),
  ],
);

export const insertExchangeRateSchema = createInsertSchema(
  exchangeRatesTable,
).omit({
  id: true,
  companyId: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertExchangeRate = z.infer<typeof insertExchangeRateSchema>;
export type ExchangeRate = typeof exchangeRatesTable.$inferSelect;
