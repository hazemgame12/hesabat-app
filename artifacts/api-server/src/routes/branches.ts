import { Router } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db, branchesTable, type Branch } from "@workspace/db";
import { CreateBranchBody, UpdateBranchBody } from "@workspace/api-zod";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";

const router = Router();

function toBranch(row: Branch) {
  return {
    id: row.id,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    budget: row.budget === null ? null : Number(row.budget),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get(
  "/branches",
  requireAuth,
  requireCapability("branches:read"),
  async (req, res) => {
    try {
      const rows = await db
        .select()
        .from(branchesTable)
        .where(eq(branchesTable.companyId, req.auth!.companyId))
        .orderBy(asc(branchesTable.createdAt));
      res.json(rows.map(toBranch));
    } catch (err) {
      req.log.error({ err }, "Failed to list branches");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.post(
  "/branches",
  requireAuth,
  requireCapability("branches:create"),
  async (req, res) => {
    const parsed = CreateBranchBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    try {
      const [row] = await db
        .insert(branchesTable)
        .values({
          companyId: req.auth!.companyId,
          nameAr: parsed.data.nameAr,
          nameEn: parsed.data.nameEn ?? null,
          budget:
            parsed.data.budget === undefined || parsed.data.budget === null
              ? null
              : String(parsed.data.budget),
          isActive: parsed.data.isActive ?? true,
        })
        .returning();
      res.status(201).json(toBranch(row as Branch));
    } catch (err) {
      req.log.error({ err }, "Failed to create branch");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.patch(
  "/branches/:id",
  requireAuth,
  requireCapability("branches:update"),
  async (req, res) => {
    const id = req.params["id"] as string;
    if (!id) {
      res.status(400).json({ error: "معرّف غير صحيح" });
      return;
    }
    const parsed = UpdateBranchBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const updates: Record<string, unknown> = {};
    if (parsed.data.nameAr !== undefined) updates["nameAr"] = parsed.data.nameAr;
    if (parsed.data.nameEn !== undefined) updates["nameEn"] = parsed.data.nameEn;
    if (parsed.data.budget !== undefined) {
      updates["budget"] =
        parsed.data.budget === null ? null : String(parsed.data.budget);
    }
    if (parsed.data.isActive !== undefined) {
      updates["isActive"] = parsed.data.isActive;
    }
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "لا توجد بيانات للتحديث" });
      return;
    }
    try {
      const [row] = await db
        .update(branchesTable)
        .set(updates)
        .where(
          and(
            eq(branchesTable.id, id),
            eq(branchesTable.companyId, req.auth!.companyId),
          ),
        )
        .returning();
      if (!row) {
        res.status(404).json({ error: "الفرع غير موجود" });
        return;
      }
      res.json(toBranch(row as Branch));
    } catch (err) {
      req.log.error({ err }, "Failed to update branch");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.delete(
  "/branches/:id",
  requireAuth,
  requireCapability("branches:delete"),
  async (req, res) => {
    const id = req.params["id"] as string;
    if (!id) {
      res.status(400).json({ error: "معرّف غير صحيح" });
      return;
    }
    try {
      const [row] = await db
        .update(branchesTable)
        .set({ isActive: false })
        .where(
          and(
            eq(branchesTable.id, id),
            eq(branchesTable.companyId, req.auth!.companyId),
          ),
        )
        .returning({ id: branchesTable.id });
      if (!row) {
        res.status(404).json({ error: "الفرع غير موجود" });
        return;
      }
      res.json({ status: "ok" });
    } catch (err) {
      req.log.error({ err }, "Failed to delete branch");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
