import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  unique,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const accountsTable = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en"),
    type: text("type").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => accountsTable.id, {
      onDelete: "set null",
    }),
    isGroup: boolean("is_group").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique("accounts_company_code_unique").on(t.companyId, t.code)],
);

export const insertAccountSchema = createInsertSchema(accountsTable).omit({
  id: true,
  companyId: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accountsTable.$inferSelect;
