import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const caseStudiesTable = pgTable("case_studies", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  titleAr: text("title_ar").notNull(),
  titleEn: text("title_en").notNull(),
  clientName: text("client_name").notNull().default(""),
  industryAr: text("industry_ar").notNull().default(""),
  industryEn: text("industry_en").notNull().default(""),
  summaryAr: text("summary_ar").notNull().default(""),
  summaryEn: text("summary_en").notNull().default(""),
  challengeAr: text("challenge_ar").notNull().default(""),
  challengeEn: text("challenge_en").notNull().default(""),
  solutionAr: text("solution_ar").notNull().default(""),
  solutionEn: text("solution_en").notNull().default(""),
  resultsAr: text("results_ar").notNull().default(""),
  resultsEn: text("results_en").notNull().default(""),
  image: text("image").notNull().default(""),
  order: integer("order").notNull().default(0),
  published: boolean("published").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCaseStudySchema = createInsertSchema(caseStudiesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const updateCaseStudySchema = insertCaseStudySchema.partial();
export type InsertCaseStudy = z.infer<typeof insertCaseStudySchema>;
export type CaseStudyRecord = typeof caseStudiesTable.$inferSelect;
