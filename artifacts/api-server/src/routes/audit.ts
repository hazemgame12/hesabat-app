import { Router } from "express";
import { and, eq, gte, lte, desc } from "drizzle-orm";
import { db, auditLogTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";

const router = Router();

// Read-only audit trail. There is intentionally NO create/update/delete route —
// rows are written only by the server via the writeAudit helper, and the log is
// append-only.
router.get(
  "/audit",
  requireAuth,
  requireCapability("audit:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const entity = (req.query["entity"] as string | undefined) || null;
    const userId = (req.query["userId"] as string | undefined) || null;
    const from = (req.query["from"] as string | undefined) || null;
    const to = (req.query["to"] as string | undefined) || null;
    const limitRaw = Number(req.query["limit"]);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 200;
    let fromDate: Date | null = null;
    let toDate: Date | null = null;
    if (from) {
      fromDate = new Date(from);
      if (Number.isNaN(fromDate.getTime())) {
        res.status(400).json({ error: "تاريخ البداية غير صحيح" });
        return;
      }
    }
    if (to) {
      toDate = new Date(to);
      if (Number.isNaN(toDate.getTime())) {
        res.status(400).json({ error: "تاريخ النهاية غير صحيح" });
        return;
      }
      toDate.setHours(23, 59, 59, 999);
    }
    try {
      const conds = [eq(auditLogTable.companyId, companyId)];
      if (entity) conds.push(eq(auditLogTable.entity, entity));
      if (userId) conds.push(eq(auditLogTable.userId, userId));
      if (fromDate) conds.push(gte(auditLogTable.createdAt, fromDate));
      if (toDate) conds.push(lte(auditLogTable.createdAt, toDate));
      const rows = await db
        .select({
          id: auditLogTable.id,
          action: auditLogTable.action,
          entity: auditLogTable.entity,
          entityId: auditLogTable.entityId,
          oldValue: auditLogTable.oldValue,
          newValue: auditLogTable.newValue,
          createdAt: auditLogTable.createdAt,
          userId: auditLogTable.userId,
          userName: usersTable.name,
        })
        .from(auditLogTable)
        .leftJoin(usersTable, eq(usersTable.id, auditLogTable.userId))
        .where(and(...conds))
        .orderBy(desc(auditLogTable.createdAt))
        .limit(limit);
      res.json(
        rows.map((r) => ({
          id: r.id,
          action: r.action,
          entity: r.entity,
          entityId: r.entityId,
          oldValue: r.oldValue ?? null,
          newValue: r.newValue ?? null,
          createdAt:
            r.createdAt instanceof Date
              ? r.createdAt.toISOString()
              : r.createdAt,
          userId: r.userId,
          userName: r.userName ?? null,
        })),
      );
    } catch (err) {
      req.log.error({ err }, "Failed to list audit log");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
