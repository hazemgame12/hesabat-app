import { pgTable, uuid, text, timestamp, boolean, integer, json, decimal, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const subscriptionPlansTable = pgTable(
  "subscription_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en").notNull(),
    descriptionAr: text("description_ar").default(""),
    descriptionEn: text("description_en").default(""),
    country: text("country").notNull().default("EG"),
    maxUsers: integer("max_users").notNull().default(1),
    maxTransactions: integer("max_transactions").notNull().default(1000),
    price: decimal("price", { precision: 12, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("EGP"),
    billingCycle: text("billing_cycle", { enum: ["monthly", "quarterly", "yearly"] })
      .notNull()
      .default("monthly"),
    features: json("features").$type<string[]>().notNull().default([]),
    isActive: boolean("is_active").notNull().default(true),
    order: integer("order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("subscription_plans_country_idx").on(t.country),
    index("subscription_plans_active_idx").on(t.isActive),
  ],
);

export const subscriptionsTable = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").notNull(),
    status: text("status", { enum: ["trial", "active", "expired", "cancelled", "suspended"] })
      .notNull()
      .default("trial"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    paymentProvider: text("payment_provider"),
    providerSubscriptionId: text("provider_subscription_id"),
    amount: decimal("amount", { precision: 12, scale: 2 }),
    currency: text("currency"),
    billingCycle: text("billing_cycle", { enum: ["monthly", "quarterly", "yearly"] }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("subscriptions_company_idx").on(t.companyId),
    index("subscriptions_status_idx").on(t.status),
  ],
);

export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlansTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertSubscriptionSchema = createInsertSchema(subscriptionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type SubscriptionPlan = typeof subscriptionPlansTable.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptionsTable.$inferSelect;
