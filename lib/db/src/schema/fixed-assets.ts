import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  date,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { accountsTable } from "./accounts";
import { journalEntriesTable } from "./journal-entries";
import { costCentersTable } from "./cost-centers";
import { projectsTable } from "./projects";
import { branchesTable } from "./branches";

export const fixedAssetsTable = pgTable("fixed_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  // Auto-generated fiscal-year-scoped code, e.g. FA-2026-0001. Nullable for
  // rows created before this feature.
  code: text("code"),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en"),
  category: text("category"),
  acquisitionDate: date("acquisition_date").notNull(),
  cost: numeric("cost", { precision: 18, scale: 2 }).notNull(),
  salvageValue: numeric("salvage_value", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  usefulLifeMonths: integer("useful_life_months").notNull(),
  method: text("method").notNull().default("straight_line"), // 'straight_line'
  status: text("status").notNull().default("active"), // 'active' | 'disposed'
  // The three chart-of-accounts links used for postings. onDelete restrict so a
  // referenced account cannot be removed while an asset still maps to it.
  assetAccountId: uuid("asset_account_id")
    .notNull()
    .references(() => accountsTable.id, { onDelete: "restrict" }),
  accumulatedAccountId: uuid("accumulated_account_id")
    .notNull()
    .references(() => accountsTable.id, { onDelete: "restrict" }),
  expenseAccountId: uuid("expense_account_id")
    .notNull()
    .references(() => accountsTable.id, { onDelete: "restrict" }),
  // ✨ Accounting dimensions with explicit foreign keys
  costCenterId: uuid("cost_center_id").references(() => costCentersTable.id, {
    onDelete: "set null",
  }),
  projectId: uuid("project_id").references(() => projectsTable.id, {
    onDelete: "set null",
  }),
  branchId: uuid("branch_id").references(() => branchesTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (t) => [
  // Auto-generated codes must be unique per company. Partial so pre-feature
  // rows (code IS NULL) are exempt; the sequence is the source of truth but
  // this is the integrity backstop against any desync.
  uniqueIndex("fixed_assets_company_id_code_unique")
    .on(t.companyId, t.code)
    .where(sql`${t.code} IS NOT NULL`),
]);

// One row per asset per depreciated month. The unique (asset, period) constraint
// prevents double-posting the same month for the same asset.
export const assetDepreciationEntriesTable = pgTable(
  "asset_depreciation_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => fixedAssetsTable.id, { onDelete: "cascade" }),
    period: text("period").notNull(), // 'YYYY-MM'
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    // ✨ Accounting dimensions with explicit foreign keys
    costCenterId: uuid("cost_center_id").references(() => costCentersTable.id, {
      onDelete: "set null",
    }),
    projectId: uuid("project_id").references(() => projectsTable.id, {
      onDelete: "set null",
    }),
    branchId: uuid("branch_id").references(() => branchesTable.id, {
      onDelete: "set null",
    }),
    journalEntryId: uuid("journal_entry_id").references(
      () => journalEntriesTable.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.assetId, t.period)],
);

export const insertFixedAssetSchema = createInsertSchema(fixedAssetsTable).omit({
  id: true,
  companyId: true,
  code: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertFixedAsset = z.infer<typeof insertFixedAssetSchema>;
export type FixedAsset = typeof fixedAssetsTable.$inferSelect;
export type AssetDepreciationEntry =
  typeof assetDepreciationEntriesTable.$inferSelect;
