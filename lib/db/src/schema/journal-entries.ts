import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  timestamp,
  date,
  boolean,
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

export const journalEntriesTable = pgTable(
  "journal_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    entryNo: integer("entry_no").notNull(),
    date: date("date").notNull(),
    reference: text("reference"),
    notes: text("notes"),
    // 'draft' | 'pending_approval' | 'approved' | 'posted'
    status: text("status").notNull().default("draft"),
    // 'normal' | 'reversal' | 'adjustment'
    entryType: text("entry_type").notNull().default("normal"),
    // For reversal/adjustment entries: the original entry they relate to.
    reversedEntryId: uuid("reversed_entry_id").references(
      (): AnyPgColumn => journalEntriesTable.id,
      { onDelete: "set null" },
    ),
    isOpeningBalance: boolean("is_opening_balance").notNull().default(false),
    createdBy: uuid("created_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    submittedBy: uuid("submitted_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // At most one opening-balance entry per company (DB-level guard against
    // concurrent saves creating duplicates).
    uniqueIndex("journal_entries_one_opening_per_company")
      .on(table.companyId)
      .where(sql`${table.isOpeningBalance} = true`),
    // At most one reversal per source entry (DB-level guard against concurrent
    // reverse requests creating duplicate reversal entries).
    uniqueIndex("journal_entries_one_reversal_per_source")
      .on(table.companyId, table.reversedEntryId)
      .where(sql`${table.entryType} = 'reversal'`),
  ],
);

export const journalEntryLinesTable = pgTable("journal_entry_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  entryId: uuid("entry_id")
    .notNull()
    .references(() => journalEntriesTable.id, { onDelete: "cascade" }),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  lineNo: integer("line_no").notNull(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accountsTable.id, { onDelete: "restrict" }),
  description: text("description"),
  currency: text("currency").notNull(),
  exchangeRate: numeric("exchange_rate", { precision: 18, scale: 6 })
    .notNull()
    .default("1"),
  debit: numeric("debit", { precision: 18, scale: 2 }).notNull().default("0"),
  credit: numeric("credit", { precision: 18, scale: 2 }).notNull().default("0"),
  debitBase: numeric("debit_base", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  creditBase: numeric("credit_base", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  taxId: uuid("tax_id").references(() => taxesTable.id, {
    onDelete: "set null",
  }),
  costCenterId: uuid("cost_center_id").references(() => costCentersTable.id, {
    onDelete: "set null",
  }),
  // ✨ NEW: Accounting dimensions
  projectId: uuid("project_id"),
  branchId: uuid("branch_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const journalEntryAttachmentsTable = pgTable(
  "journal_entry_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => journalEntriesTable.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    objectKey: text("object_key").notNull(),
    contentType: text("content_type"),
    size: integer("size"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const insertJournalEntrySchema = createInsertSchema(
  journalEntriesTable,
).omit({
  id: true,
  companyId: true,
  entryNo: true,
  status: true,
  entryType: true,
  reversedEntryId: true,
  isOpeningBalance: true,
  createdBy: true,
  submittedBy: true,
  submittedAt: true,
  approvedBy: true,
  approvedAt: true,
  postedAt: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;
export type JournalEntry = typeof journalEntriesTable.$inferSelect;
export type JournalEntryLine = typeof journalEntryLinesTable.$inferSelect;
export type JournalEntryAttachment =
  typeof journalEntryAttachmentsTable.$inferSelect;
