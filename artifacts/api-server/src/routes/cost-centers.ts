import { Router } from "express";
import { and, eq, asc } from "drizzle-orm";
import { db, costCentersTable, type CostCenter } from "@workspace/db";
import { CreateCostCenterBody, UpdateCostCenterBody } from "@workspace/api-zod";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";

const router = Router();

function toCostCenter(row: CostCenter) {
  return {
    id: row.id,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    type: row.type,
    budget: row.budget === null ? null : Number(row.budget),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get(
  "/cost-centers",
  requireAuth,
  requireCapability("costCenters:read"),
  async (req, res) => {
    try {
      const rows = await db
        .select()
        .from(costCentersTable)
        .where(eq(costCentersTable.companyId, req.auth!.companyId))
        .orderBy(asc(costCentersTable.createdAt));
      res.json(rows.map(toCostCenter));
    } catch (err) {
      req.log.error({ err }, "Failed to list cost centers");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.post(
  "/cost-centers",
  requireAuth,
  requireCapability("costCenters:create"),
  async (req, res) => {
    const parsed = CreateCostCenterBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    try {
      const [row] = await db
        .insert(costCentersTable)
        .values({
          companyId: req.auth!.companyId,
          nameAr: parsed.data.nameAr,
          nameEn: parsed.data.nameEn ?? null,
          type: parsed.data.type,
          budget:
            parsed.data.budget === undefined || parsed.data.budget === null
              ? null
              : String(parsed.data.budget),
          isActive: parsed.data.isActive ?? true,
        })
        .returning();
      res.status(201).json(toCostCenter(row as CostCenter));
    } catch (err) {
      req.log.error({ err }, "Failed to create cost center");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.patch(
  "/cost-centers/:id",
  requireAuth,
  requireCapability("costCenters:update"),
  async (req, res) => {
    const id = req.params["id"] as string;
    if (!id) {
      res.status(400).json({ error: "معرّف غير صحيح" });
      return;
    }
    const parsed = UpdateCostCenterBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const updates: Record<string, unknown> = {};
    if (parsed.data.nameAr !== undefined) updates["nameAr"] = parsed.data.nameAr;
    if (parsed.data.nameEn !== undefined) updates["nameEn"] = parsed.data.nameEn;
    if (parsed.data.type !== undefined) updates["type"] = parsed.data.type;
    if (parsed.data.budget !== undefined)
      updates["budget"] =
        parsed.data.budget === null ? null : String(parsed.data.budget);
    if (parsed.data.isActive !== undefined)
      updates["isActive"] = parsed.data.isActive;
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "لا توجد بيانات للتحديث" });
      return;
    }
    try {
      const [row] = await db
        .update(costCentersTable)
        .set(updates)
        .where(
          and(
            eq(costCentersTable.id, id),
            eq(costCentersTable.companyId, req.auth!.companyId),
          ),
        )
        .returning();
      if (!row) {
        res.status(404).json({ error: "مركز التكلفة غير موجود" });
        return;
      }
      res.json(toCostCenter(row as CostCenter));
    } catch (err) {
      req.log.error({ err }, "Failed to update cost center");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.delete(
  "/cost-centers/:id",
  requireAuth,
  requireCapability("costCenters:delete"),
  async (req, res) => {
    const id = req.params["id"] as string;
    if (!id) {
      res.status(400).json({ error: "معرّف غير صحيح" });
      return;
    }
    try {
      const deleted = await db
        .delete(costCentersTable)
        .where(
          and(
            eq(costCentersTable.id, id),
            eq(costCentersTable.companyId, req.auth!.companyId),
          ),
        )
        .returning({ id: costCentersTable.id });
      if (deleted.length === 0) {
        res.status(404).json({ error: "مركز التكلفة غير موجود" });
        return;
      }
      res.json({ status: "ok" });
    } catch (err) {
      req.log.error({ err }, "Failed to delete cost center");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
