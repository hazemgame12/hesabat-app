import { Router } from "express";
import { eq, count } from "drizzle-orm";
import { db, accountsTable } from "@workspace/db";
import { requireAuth } from "../middleware/require-auth";

const router = Router();

router.get("/dashboard/summary", requireAuth, async (req, res) => {
  try {
    const grouped = await db
      .select({ type: accountsTable.type, count: count() })
      .from(accountsTable)
      .where(eq(accountsTable.companyId, req.auth!.companyId))
      .groupBy(accountsTable.type);

    const accountsByType = grouped.map((g) => ({
      type: g.type,
      count: Number(g.count),
    }));
    const totalAccounts = accountsByType.reduce((sum, g) => sum + g.count, 0);

    res.json({ totalAccounts, accountsByType });
  } catch (err) {
    req.log.error({ err }, "Failed to build dashboard summary");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

export default router;
