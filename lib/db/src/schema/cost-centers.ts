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

export const costCentersTable = pgTable(
  "cost_centers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    code: text("code"),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en"),
    type: text("type").notNull(), // 'project' | 'cost_center' | 'branch'
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
    uniqueIndex("cost_centers_company_id_code_idx")
      .on(t.companyId, t.code)
      .where(sql`${t.code} IS NOT NULL`),
  ],
);

export const insertCostCenterSchema = createInsertSchema(costCentersTable).omit({
  id: true,
  companyId: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCostCenter = z.infer<typeof insertCostCenterSchema>;
export type CostCenter = typeof costCentersTable.$inferSelect;
