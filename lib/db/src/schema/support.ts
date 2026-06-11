import { pgTable, uuid, text, timestamp, serial, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

export const supportTicketsTable = pgTable(
  "support_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["issue", "feature_request"] }).notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: text("status", { enum: ["open", "in_progress", "resolved", "closed"] })
      .notNull()
      .default("open"),
    priority: text("priority", { enum: ["low", "medium", "high", "critical"] })
      .notNull()
      .default("medium"),
    assignedTo: uuid("assigned_to"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("support_tickets_company_idx").on(t.companyId),
    index("support_tickets_status_idx").on(t.status),
    index("support_tickets_user_idx").on(t.userId),
  ],
);

export const ticketCommentsTable = pgTable(
  "ticket_comments",
  {
    id: serial("id").primaryKey(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTicketsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    isInternal: boolean("is_internal").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ticket_comments_ticket_idx").on(t.ticketId)],
);

export const featureVotesTable = pgTable(
  "feature_votes",
  {
    id: serial("id").primaryKey(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTicketsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("feature_votes_ticket_idx").on(t.ticketId),
    index("feature_votes_user_idx").on(t.userId),
  ],
);

export const insertSupportTicketSchema = createInsertSchema(supportTicketsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  assignedTo: true,
});

export const insertTicketCommentSchema = createInsertSchema(ticketCommentsTable).omit({
  id: true,
  createdAt: true,
});

export const insertFeatureVoteSchema = createInsertSchema(featureVotesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
export type SupportTicket = typeof supportTicketsTable.$inferSelect;
export type InsertTicketComment = z.infer<typeof insertTicketCommentSchema>;
export type TicketComment = typeof ticketCommentsTable.$inferSelect;
export type InsertFeatureVote = z.infer<typeof insertFeatureVoteSchema>;
export type FeatureVote = typeof featureVotesTable.$inferSelect;
