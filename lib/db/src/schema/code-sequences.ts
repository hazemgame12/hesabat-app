import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

// Per-company, per-entity, per-fiscal-year counters that back the auto-generated
// document/record codes (e.g. SI-2026-0001). The unique (company, entity,
// fiscalKey) row is incremented atomically via an upsert so concurrent creates
// never collide. Chart-of-accounts codes are intentionally NOT driven by this
// table (they stay manual).
export const codeSequencesTable = pgTable(
  "code_sequences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    // Logical entity key, e.g. 'sales_invoice' | 'fixed_asset' | 'employee'.
    entity: text("entity").notNull(),
    // Identifies the fiscal-year bucket the sequence resets in: the fiscal year
    // row id when one covers the date, else `CY<year>` (calendar-year fallback).
    fiscalKey: text("fiscal_key").notNull(),
    lastNo: integer("last_no").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique().on(t.companyId, t.entity, t.fiscalKey),
    index("code_sequences_company_idx").on(t.companyId),
  ],
);

export type CodeSequence = typeof codeSequencesTable.$inferSelect;
