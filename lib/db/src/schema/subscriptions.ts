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
    countryCode: text("country_code").default("EG"),
    countryName: text("country_name"),
    currencyCode: text("currency_code"),
    monthlyPrice: decimal("monthly_price", { precision: 12, scale: 2 }),
    yearlyPrice: decimal("yearly_price", { precision: 12, scale: 2 }),
    trialDays: integer("trial_days").notNull().default(14),
    maxCompaniesOrBranches: integer("max_companies_or_branches"),
    storageLimit: integer("storage_limit"),
    featureLimits: json("feature_limits").$type<Record<string, unknown>>().default({}),
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
    showOnLanding: boolean("show_on_landing").notNull().default(true),
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
    index("subscription_plans_show_idx").on(t.showOnLanding),
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
    status: text("status", { enum: ["trial", "pending_payment", "active", "expired", "cancelled", "suspended"] })
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

export const manualPaymentRequestsTable = pgTable(
  "manual_payment_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    packageId: uuid("package_id"),
    billingPeriod: text("billing_period", { enum: ["monthly", "yearly", "custom"] })
      .notNull()
      .default("monthly"),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("EGP"),
    status: text("status", { enum: ["pending", "approved", "rejected", "cancelled"] })
      .notNull()
      .default("pending"),
    paymentMethod: text("payment_method", { enum: ["manual", "bank_transfer", "cash", "other"] })
      .notNull()
      .default("manual"),
    notes: text("notes"),
    proofAttachment: text("proof_attachment"),
    internalNotes: text("internal_notes"),
    requestedBy: uuid("requested_by"),
    approvedBy: uuid("approved_by"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("manual_payment_requests_company_idx").on(t.companyId),
    index("manual_payment_requests_status_idx").on(t.status),
  ],
);

export const countryPaymentMethodsTable = pgTable(
  "country_payment_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countryCode: text("country_code").notNull(),
    currency: text("currency").notNull(),
    methodName: text("method_name").notNull(),
    type: text("type", { enum: ["manual", "bank_transfer", "cash", "payment_gateway"] })
      .notNull()
      .default("manual"),
    enabled: boolean("enabled").notNull().default(true),
    instructionsAr: text("instructions_ar"),
    instructionsEn: text("instructions_en"),
    accountDetails: json("account_details").$type<Record<string, unknown> | null>().default(null),
    gatewayProvider: text("gateway_provider"),
    isPublic: boolean("is_public").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("country_payment_methods_country_idx").on(t.countryCode),
    index("country_payment_methods_enabled_idx").on(t.enabled),
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
export const insertManualPaymentRequestSchema = createInsertSchema(manualPaymentRequestsTable).omit({
  id: true,
  approvedBy: true,
  approvedAt: true,
  createdAt: true,
  updatedAt: true,
});
export const insertCountryPaymentMethodSchema = createInsertSchema(countryPaymentMethodsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type SubscriptionPlan = typeof subscriptionPlansTable.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptionsTable.$inferSelect;
export type InsertManualPaymentRequest = z.infer<typeof insertManualPaymentRequestSchema>;
export type ManualPaymentRequest = typeof manualPaymentRequestsTable.$inferSelect;
export type InsertCountryPaymentMethod = z.infer<typeof insertCountryPaymentMethodSchema>;
export type CountryPaymentMethod = typeof countryPaymentMethodsTable.$inferSelect;
