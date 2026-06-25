import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

export const documentsTable = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  originalName: text("original_name").notNull(),
  filePath: text("file_path").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  source: text("source").notNull().default("manual"),
  senderName: text("sender_name"),
  senderEmail: text("sender_email"),
  emailSubject: text("email_subject"),
  fileHash: text("file_hash"),
  uploadedBy: uuid("uploaded_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  invoiceId: uuid("invoice_id"),
  journalEntryId: uuid("journal_entry_id"),
  bankMovementId: uuid("bank_movement_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documentsTable.$inferSelect;
