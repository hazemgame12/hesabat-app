import { pgTable, serial, text, boolean, integer, timestamp, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const packagesTable = pgTable("packages", {
  id: serial("id").primaryKey(),
  titleAr: text("title_ar").notNull(),
  titleEn: text("title_en").notNull(),
  descriptionAr: text("description_ar").notNull().default(""),
  descriptionEn: text("description_en").notNull().default(""),
  featuresAr: json("features_ar").$type<string[]>().notNull().default([]),
  featuresEn: json("features_en").$type<string[]>().notNull().default([]),
  highlighted: boolean("highlighted").notNull().default(false),
  order: integer("order").notNull().default(0),
  published: boolean("published").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPackageSchema = createInsertSchema(packagesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const updatePackageSchema = insertPackageSchema.partial();
export type InsertPackage = z.infer<typeof insertPackageSchema>;
export type PackageRecord = typeof packagesTable.$inferSelect;
