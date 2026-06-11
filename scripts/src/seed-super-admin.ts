import { db, superAdminsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "./lib/hash";

const DEFAULT_SUPER_ADMIN = {
  email: "admin@hesabat.app",
  name: "Super Admin",
  password: "Hesabat@2026",
  role: "super_admin" as const,
};

async function seed() {
  const existing = await db
    .select({ id: superAdminsTable.id })
    .from(superAdminsTable)
    .where(eq(superAdminsTable.email, DEFAULT_SUPER_ADMIN.email))
    .limit(1);

  if (existing.length > 0) {
    console.log("Super admin already exists:", DEFAULT_SUPER_ADMIN.email);
    return;
  }

  const passwordHash = await hashPassword(DEFAULT_SUPER_ADMIN.password);
  const [admin] = await db
    .insert(superAdminsTable)
    .values({
      email: DEFAULT_SUPER_ADMIN.email,
      name: DEFAULT_SUPER_ADMIN.name,
      passwordHash,
      role: DEFAULT_SUPER_ADMIN.role,
    })
    .returning();

  console.log("Super admin created:", admin.email);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
