import {
  pgTable,
  uuid,
  text,
  numeric,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const PROJECT_STATUSES = [
  "active",
  "completed",
  "on_hold",
  "cancelled",
] as const;

export const projectsTable = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    code: text("code"),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en"),
    status: text("status", { enum: PROJECT_STATUSES }).notNull().default("active"),
    budget: numeric("budget", { precision: 16, scale: 2 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("projects_company_id_code_idx")
      .on(t.companyId, t.code)
      .where(sql`${t.code} IS NOT NULL`),
  ],
);

export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  id: true,
  companyId: true,
  createdAt: true,
  updatedAt: true,
});

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
