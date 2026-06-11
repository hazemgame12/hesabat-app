import { db, subscriptionPlansTable } from "@workspace/db";
import { count } from "drizzle-orm";

async function seedPlans() {
  const existing = await db.select({ count: count() }).from(subscriptionPlansTable);
  const existingCount = existing[0]?.count ?? 0;
  if (existingCount > 0) {
    console.log("Plans already exist:", existingCount);
    return;
  }

  const plans = [
    {
      nameAr: "\u0623\u0633\u0627\u0633\u064a",
      nameEn: "Basic",
      country: "EG",
      maxUsers: 3,
      maxTransactions: 1000,
      price: "199",
      currency: "EGP",
      billingCycle: "monthly" as const,
      features: ["1 user", "1000 transactions", "Basic support"],
      order: 1,
    },
    {
      nameAr: "\u0627\u062d\u062a\u0631\u0627\u0641\u064a",
      nameEn: "Pro",
      country: "EG",
      maxUsers: 10,
      maxTransactions: 10000,
      price: "499",
      currency: "EGP",
      billingCycle: "monthly" as const,
      features: ["10 users", "10000 transactions", "Priority support", "Advanced reports"],
      order: 2,
    },
    {
      nameAr: "\u0645\u0624\u0633\u0633\u064a",
      nameEn: "Enterprise",
      country: "EG",
      maxUsers: 50,
      maxTransactions: 100000,
      price: "1999",
      currency: "EGP",
      billingCycle: "monthly" as const,
      features: ["Unlimited users", "Unlimited transactions", "24/7 support", "Custom integrations"],
      order: 3,
    },
  ];

  await db.insert(subscriptionPlansTable).values(plans);
  console.log("Default Egypt plans seeded successfully");
}

seedPlans().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
