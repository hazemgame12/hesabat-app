import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

// Append-only audit trail. Rows are only ever inserted — never updated or
// deleted — so the log is a tamper-evident history of who did what and when.
export const auditLogTable = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    // Nullable so the row survives if the acting user is later removed.
    userId: uuid("user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    // e.g. "create" | "update" | "submit" | "approve" | "post" | "reverse" | "delete"
    action: text("action").notNull(),
    // The business entity affected, e.g. "journal_entry".
    entity: text("entity").notNull(),
    // The affected row id (kept as text so non-uuid ids are also supported).
    entityId: text("entity_id"),
    // Human-readable label for the affected row, e.g. "JV-2026-000001" or a
    // customer/invoice number — shown in the UI so the reviewer knows exactly
    // which document changed without resolving the raw id.
    entityLabel: text("entity_label"),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_log_company_created_idx").on(t.companyId, t.createdAt),
    index("audit_log_company_entity_idx").on(t.companyId, t.entity),
    index("audit_log_company_user_idx").on(t.companyId, t.userId),
  ],
);

export type AuditLog = typeof auditLogTable.$inferSelect;
export type InsertAuditLog = typeof auditLogTable.$inferInsert;
