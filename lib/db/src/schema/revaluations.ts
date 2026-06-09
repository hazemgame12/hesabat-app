import {
  pgTable,
  uuid,
  numeric,
  integer,
  date,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { journalEntriesTable } from "./journal-entries";
import { usersTable } from "./users";

// Records each foreign-currency revaluation run (month/year-end). A run revalues
// every foreign-currency account's book value to the period-end rate and posts a
// single balanced journal entry of the unrealized gain/loss to the FX gain/loss
// accounts. `asOfDate` is unique per company so a period can only be revalued
// once (idempotency guard); `journalEntryId` is null when nothing needed
// adjusting. `totalGain`/`totalLoss` are the base-currency amounts recognized.
export const revaluationsTable = pgTable(
  "revaluations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    asOfDate: date("as_of_date").notNull(),
    journalEntryId: uuid("journal_entry_id").references(
      () => journalEntriesTable.id,
      { onDelete: "set null" },
    ),
    totalGain: numeric("total_gain", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    totalLoss: numeric("total_loss", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    linesCount: integer("lines_count").notNull().default(0),
    createdBy: uuid("created_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("revaluations_company_as_of_date_unique").on(
      t.companyId,
      t.asOfDate,
    ),
  ],
);

export const insertRevaluationSchema = createInsertSchema(
  revaluationsTable,
).omit({
  id: true,
  companyId: true,
  createdBy: true,
  createdAt: true,
});
export type InsertRevaluation = z.infer<typeof insertRevaluationSchema>;
export type Revaluation = typeof revaluationsTable.$inferSelect;
