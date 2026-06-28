import {
  pgTable,
  uuid,
  text,
  numeric,
  boolean,
  date,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { accountsTable } from "./accounts";
import { journalEntriesTable } from "./journal-entries";
import { costCentersTable } from "./cost-centers";
import { projectsTable } from "./projects";
import { branchesTable } from "./branches";

// A stock item in the single warehouse. quantityOnHand and averageCost are
// maintained server-side on every movement (weighted-average valuation).
export const inventoryItemsTable = pgTable(
  "inventory_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en"),
    unit: text("unit").notNull(), // unit of measure: piece, kg, ...
    category: text("category"),
    isActive: boolean("is_active").notNull().default(true),
    quantityOnHand: numeric("quantity_on_hand", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    averageCost: numeric("average_cost", { precision: 18, scale: 4 })
      .notNull()
      .default("0"),
    // Default inventory (asset) account for this item's postings; editable per
    // movement. onDelete restrict so a referenced account can't be removed.
    inventoryAccountId: uuid("inventory_account_id")
      .notNull()
      .references(() => accountsTable.id, { onDelete: "restrict" }),
    // E-Invoice: item identification codes for tax-authority submission.
    itemCodeType: text("item_code_type"), // 'gs1' | 'egs' | 'internal' | null
    gs1Code: text("gs1_code"), // GS1 Global Trade Item Number
    egsCode: text("egs_code"), // Egyptian GS1 (ETA-specific)
    unitCode: text("unit_code"), // UN/CEFACT unit code: C62, KGM, LTR, etc.
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique().on(t.companyId, t.code)],
);

// One row per stock movement. quantity is signed for adjustments (positive =
// increase, negative = decrease); always positive for receipt/issue. totalValue
// is the movement's base-currency value (signed for adjustments).
export const inventoryMovementsTable = pgTable("inventory_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
  itemId: uuid("item_id")
    .notNull()
    .references(() => inventoryItemsTable.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  type: text("type").notNull(), // 'receipt' | 'issue' | 'adjustment'
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
  unitCost: numeric("unit_cost", { precision: 18, scale: 4 }).notNull(),
  totalValue: numeric("total_value", { precision: 18, scale: 2 }).notNull(),
  inventoryAccountId: uuid("inventory_account_id")
    .notNull()
    .references(() => accountsTable.id, { onDelete: "restrict" }),
  counterpartAccountId: uuid("counterpart_account_id")
    .notNull()
    .references(() => accountsTable.id, { onDelete: "restrict" }),
  notes: text("notes"),
  journalEntryId: uuid("journal_entry_id").references(
    () => journalEntriesTable.id,
    { onDelete: "set null" },
  ),
  costCenterId: uuid("cost_center_id").references(() => costCentersTable.id, {
    onDelete: "set null",
  }),
  projectId: uuid("project_id").references(() => projectsTable.id, {
    onDelete: "set null",
  }),
  branchId: uuid("branch_id").references(() => branchesTable.id, {
    onDelete: "set null",
  }),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertInventoryItemSchema = createInsertSchema(
  inventoryItemsTable,
).omit({
  id: true,
  companyId: true,
  quantityOnHand: true,
  averageCost: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type InventoryItem = typeof inventoryItemsTable.$inferSelect;
export type InventoryMovement = typeof inventoryMovementsTable.$inferSelect;
