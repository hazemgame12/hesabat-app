// Export your models here. Add one export per file
// export * from "./posts";
//
// Each model/table should ideally be split into different files.
// Each model/table should define a Drizzle table, insert schema, and types:
//
//   import { pgTable, text, serial } from "drizzle-orm/pg-core";
//   import { createInsertSchema } from "drizzle-zod";
//   import { z } from "zod/v4";
//
//   export const postsTable = pgTable("posts", {
//     id: serial("id").primaryKey(),
//     title: text("title").notNull(),
//   });
//
//   export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true });
//   export type InsertPost = z.infer<typeof insertPostSchema>;
//   export type Post = typeof postsTable.$inferSelect;

export * from "./articles";
export * from "./site-settings";
export * from "./services";
export * from "./packages";
export * from "./leads";
export * from "./case-studies";
export * from "./social-posts";
export * from "./social-credentials";
export * from "./companies";
export * from "./users";
export * from "./sessions";
export * from "./accounts";
export * from "./invitations";
export * from "./taxes";
export * from "./cost-centers";
export * from "./currencies";
export * from "./journal-entries";
export * from "./fixed-assets";
export * from "./inventory";