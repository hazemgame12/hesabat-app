import {
  pgTable,
  uuid,
  text,
  date,
  timestamp,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { usersTable } from "./users";
import { journalEntriesTable } from "./journal-entries";

export const fiscalYearsTable = pgTable(
  "fiscal_years",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    // 'open' | 'closed'
    status: text("status").notNull().default("open"),
    // The year-end closing entry created when the year is closed (carry-forward
    // of net profit/loss into retained earnings). Null while the year is open.
    closingEntryId: uuid("closing_entry_id").references(
      (): AnyPgColumn => journalEntriesTable.id,
      { onDelete: "set null" },
    ),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: uuid("closed_by").references(() => usersTable.id, {
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
  (table) => [index("fiscal_years_company_idx").on(table.companyId)],
);

export const insertFiscalYearSchema = createInsertSchema(fiscalYearsTable).omit({
  id: true,
  companyId: true,
  status: true,
  closingEntryId: true,
  closedAt: true,
  closedBy: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertFiscalYear = z.infer<typeof insertFiscalYearSchema>;
export type FiscalYear = typeof fiscalYearsTable.$inferSelect;
