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
      nameEn: "Starter",
      country: "EG",
      maxUsers: 3,
      maxTransactions: 1000,
      price: "799",
      currency: "EGP",
      billingCycle: "yearly" as const,
      features: ["3 \u0645\u0633\u062a\u062e\u062f\u0645\u064a\u0646", "1,000 \u0639\u0645\u0644\u064a\u0629", "\u062f\u0639\u0645 \u0628\u0627\u0644\u0628\u0631\u064a\u062f", "\u0641\u0648\u0627\u062a\u064a\u0631 \u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a\u0629", "\u062a\u0642\u0627\u0631\u064a\u0631 \u0623\u0633\u0627\u0633\u064a\u0629"],
      order: 1,
    },
    {
      nameAr: "\u0627\u062d\u062a\u0631\u0627\u0641\u064a",
      nameEn: "Professional",
      country: "EG",
      maxUsers: 10,
      maxTransactions: 10000,
      price: "2499",
      currency: "EGP",
      billingCycle: "yearly" as const,
      features: ["10 \u0645\u0633\u062a\u062e\u062f\u0645\u064a\u0646", "10,000 \u0639\u0645\u0644\u064a\u0629", "\u062f\u0639\u0645 \u0623\u0648\u0644\u0648\u064a\u0629", "\u0641\u0648\u0627\u062a\u064a\u0631 \u0648\u0645\u062e\u0632\u0648\u0646", "\u062a\u0642\u0627\u0631\u064a\u0631 \u0645\u0627\u0644\u064a\u0629", "\u0636\u0631\u0627\u0626\u0628 \u0648\u062a\u0635\u0627\u0631\u064a\u062d \u0639\u0645\u0644\u0627\u062a"],
      order: 2,
    },
    {
      nameAr: "\u0645\u0624\u0633\u0633\u064a",
      nameEn: "Enterprise",
      country: "EG",
      maxUsers: 50,
      maxTransactions: 100000,
      price: "7999",
      currency: "EGP",
      billingCycle: "yearly" as const,
      features: ["50 \u0645\u0633\u062a\u062e\u062f\u0645", "100,000 \u0639\u0645\u0644\u064a\u0629", "\u062f\u0639\u0645 \u062a\u0641\u0648\u0642\u064a \u0645\u062a\u064a\u0646", "\u0643\u0644 \u0627\u0644\u0645\u064a\u0632\u0627\u062a + \u0635\u0644\u0627\u062d\u064a\u0627\u062a", "\u062a\u0643\u0627\u0645\u0644 \u0645\u062e\u0635\u0635\u0629", "\u0646\u0642\u0644 \u0628\u064a\u0627\u0646\u0627\u062a \u0645\u062c\u0627\u0646\u064a"],
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
