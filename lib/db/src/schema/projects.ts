import {
  pgTable,
  uuid,
  text,
  date,
  numeric,
  boolean,
  timestamp,
  unique,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { customersTable } from "./customers-suppliers";

export const projectsTable = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en"),
    description: text("description"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    // 'active' | 'completed' | 'on_hold' | 'cancelled'
    status: text("status").notNull().default("active"),
    budget: numeric("budget", { precision: 18, scale: 2 }),
    customerId: uuid("customer_id").references(
      (): AnyPgColumn => customersTable.id,
      { onDelete: "set null" },
    ),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [unique().on(table.companyId, table.code)],
);

export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  id: true,
  companyId: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
