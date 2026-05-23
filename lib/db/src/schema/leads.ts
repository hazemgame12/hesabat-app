import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  message: text("message").notNull().default(""),
  service: text("service").notNull().default(""),
  source: text("source").notNull().default("website"),
  status: text("status").notNull().default("new"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertLeadSchema = createInsertSchema(leadsTable).omit({ id: true, createdAt: true });
export const updateLeadSchema = z.object({
  status: z.string().optional(),
  notes: z.string().optional(),
});
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type LeadRecord = typeof leadsTable.$inferSelect;
