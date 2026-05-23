import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const articlesTable = pgTable("articles", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  categoryAr: text("category_ar").notNull().default(""),
  categoryEn: text("category_en").notNull().default(""),
  date: text("date").notNull(),
  readTimeAr: text("read_time_ar").notNull().default(""),
  readTimeEn: text("read_time_en").notNull().default(""),
  titleAr: text("title_ar").notNull(),
  titleEn: text("title_en").notNull(),
  excerptAr: text("excerpt_ar").notNull().default(""),
  excerptEn: text("excerpt_en").notNull().default(""),
  contentAr: text("content_ar").notNull().default(""),
  contentEn: text("content_en").notNull().default(""),
  image: text("image").notNull().default(""),
  published: boolean("published").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertArticleSchema = createInsertSchema(articlesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const updateArticleSchema = insertArticleSchema.partial();
export type InsertArticle = z.infer<typeof insertArticleSchema>;
export type ArticleRecord = typeof articlesTable.$inferSelect;
