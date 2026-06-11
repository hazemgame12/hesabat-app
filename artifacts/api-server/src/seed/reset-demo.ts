/**
 * Reset script: clears all demo data so a fresh seed:demo can run.
 * Run with: pnpm --filter @workspace/api-server run seed:reset
 *
 * Then run: pnpm --filter @workspace/api-server run seed:demo
 */
import { inArray } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { logger } from "../lib/logger";

const DEMO_EMAILS = ["demo-eg@hesabat.app", "demo-sa@hesabat.app", "demo-ae@hesabat.app"];

async function reset() {
  logger.info("Resetting demo data...");

  const demoUsers = await db
    .select({ id: usersTable.id, companyId: usersTable.companyId })
    .from(usersTable)
    .where(inArray(usersTable.email, DEMO_EMAILS));

  const companyIds = demoUsers.map((u) => u.companyId).filter(Boolean);

  if (companyIds.length === 0) {
    logger.info("No demo companies found. Nothing to reset.");
    return;
  }

  logger.info({ count: companyIds.length }, "Deleting demo users (cascades to all company data)...");

  await db.delete(usersTable).where(inArray(usersTable.email, DEMO_EMAILS));

  logger.info("Reset complete.");
  logger.info("Run `pnpm --filter @workspace/api-server run seed:demo` to re-seed.");
}

reset().catch((err) => {
  logger.error({ err }, "Reset failed");
  process.exit(1);
});
