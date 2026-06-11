import { pgTable, uuid, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const SUPER_ADMIN_ROLES = ["super_admin", "billing", "support"] as const;
export type SuperAdminRole = (typeof SUPER_ADMIN_ROLES)[number];

export const superAdminsTable = pgTable(
  "super_admins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["super_admin", "billing", "support"] })
      .notNull()
      .default("super_admin"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("super_admins_email_idx").on(t.email)],
);

export const superAdminSessionsTable = pgTable(
  "super_admin_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    superAdminId: uuid("super_admin_id")
      .notNull()
      .references(() => superAdminsTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("super_admin_sessions_token_hash_idx").on(t.tokenHash)],
);

export const insertSuperAdminSchema = createInsertSchema(superAdminsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertSuperAdminSessionSchema = createInsertSchema(superAdminSessionsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertSuperAdmin = z.infer<typeof insertSuperAdminSchema>;
export type SuperAdmin = typeof superAdminsTable.$inferSelect;
export type InsertSuperAdminSession = z.infer<typeof insertSuperAdminSessionSchema>;
export type SuperAdminSession = typeof superAdminSessionsTable.$inferSelect;
