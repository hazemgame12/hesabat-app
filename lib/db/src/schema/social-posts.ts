import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const socialPostsTable = pgTable("social_posts", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  captionAr: text("caption_ar").notNull().default(""),
  captionEn: text("caption_en").notNull().default(""),
  image: text("image").notNull().default(""),
  link: text("link").notNull().default(""),
  status: text("status").notNull().default("draft"),
  scheduledAt: timestamp("scheduled_at"),
  releasedAt: timestamp("released_at"),
  articleId: integer("article_id"),
  // External auto-publishing tracking (Facebook/Instagram/LinkedIn)
  publishResult: text("publish_result"), // null (not attempted) | "published" | "failed"
  publishError: text("publish_error").notNull().default(""),
  platformPostId: text("platform_post_id").notNull().default(""),
  publishedAt: timestamp("published_at"),
  publishAttempts: integer("publish_attempts").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSocialPostSchema = createInsertSchema(socialPostsTable, {
  platform: z.enum(["facebook", "instagram", "linkedin"]),
  status: z.enum(["draft", "scheduled", "released"]).optional(),
  scheduledAt: z.coerce.date().nullish(),
  releasedAt: z.coerce.date().nullish(),
  articleId: z.number().int().nullish(),
  publishResult: z.enum(["published", "failed"]).nullish(),
  publishedAt: z.coerce.date().nullish(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  publishResult: true,
  publishError: true,
  platformPostId: true,
  publishedAt: true,
  publishAttempts: true,
});
export const updateSocialPostSchema = insertSocialPostSchema.partial();
export type InsertSocialPost = z.infer<typeof insertSocialPostSchema>;
export type SocialPostRecord = typeof socialPostsTable.$inferSelect;
