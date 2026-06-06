import { Router } from "express";
import { and, eq, asc } from "drizzle-orm";
import { db, taxesTable, accountsTable, type Tax } from "@workspace/db";
import { CreateTaxBody, UpdateTaxBody } from "@workspace/api-zod";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";

const router = Router();

function toTax(row: Tax) {
  return {
    id: row.id,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    kind: row.kind,
    rate: Number(row.rate),
    serviceNature: row.serviceNature,
    linkedAccountId: row.linkedAccountId,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

// Re-validates a linked account belongs to the caller's company to prevent
// cross-tenant linkage and existence-oracle leaks.
async function accountBelongsToCompany(
  accountId: string,
  companyId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: accountsTable.id })
    .from(accountsTable)
    .where(
      and(eq(accountsTable.id, accountId), eq(accountsTable.companyId, companyId)),
    )
    .limit(1);
  return rows.length > 0;
}

router.get("/taxes", requireAuth, requireCapability("taxes:read"), async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(taxesTable)
      .where(eq(taxesTable.companyId, req.auth!.companyId))
      .orderBy(asc(taxesTable.createdAt));
    res.json(rows.map(toTax));
  } catch (err) {
    req.log.error({ err }, "Failed to list taxes");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

router.post("/taxes", requireAuth, requireCapability("taxes:create"), async (req, res) => {
  const parsed = CreateTaxBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
    return;
  }
  const linkedAccountId = parsed.data.linkedAccountId ?? null;
  try {
    if (
      linkedAccountId &&
      !(await accountBelongsToCompany(linkedAccountId, req.auth!.companyId))
    ) {
      res.status(400).json({ error: "الحساب المرتبط غير موجود" });
      return;
    }
    const [row] = await db
      .insert(taxesTable)
      .values({
        companyId: req.auth!.companyId,
        nameAr: parsed.data.nameAr,
        nameEn: parsed.data.nameEn ?? null,
        kind: parsed.data.kind,
        rate: String(parsed.data.rate),
        serviceNature: parsed.data.serviceNature ?? null,
        linkedAccountId,
        isActive: parsed.data.isActive ?? true,
      })
      .returning();
    res.status(201).json(toTax(row as Tax));
  } catch (err) {
    req.log.error({ err }, "Failed to create tax");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

router.patch("/taxes/:id", requireAuth, requireCapability("taxes:update"), async (req, res) => {
  const id = req.params["id"] as string;
  if (!id) {
    res.status(400).json({ error: "معرّف غير صحيح" });
    return;
  }
  const parsed = UpdateTaxBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
    return;
  }
  const updates: Record<string, unknown> = {};
  if (parsed.data.nameAr !== undefined) updates["nameAr"] = parsed.data.nameAr;
  if (parsed.data.nameEn !== undefined) updates["nameEn"] = parsed.data.nameEn;
  if (parsed.data.kind !== undefined) updates["kind"] = parsed.data.kind;
  if (parsed.data.rate !== undefined) updates["rate"] = String(parsed.data.rate);
  if (parsed.data.serviceNature !== undefined)
    updates["serviceNature"] = parsed.data.serviceNature;
  if (parsed.data.linkedAccountId !== undefined)
    updates["linkedAccountId"] = parsed.data.linkedAccountId;
  if (parsed.data.isActive !== undefined)
    updates["isActive"] = parsed.data.isActive;
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "لا توجد بيانات للتحديث" });
    return;
  }
  try {
    const nextLinked = updates["linkedAccountId"] as string | null | undefined;
    if (
      nextLinked &&
      !(await accountBelongsToCompany(nextLinked, req.auth!.companyId))
    ) {
      res.status(400).json({ error: "الحساب المرتبط غير موجود" });
      return;
    }
    const [row] = await db
      .update(taxesTable)
      .set(updates)
      .where(
        and(eq(taxesTable.id, id), eq(taxesTable.companyId, req.auth!.companyId)),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "الضريبة غير موجودة" });
      return;
    }
    res.json(toTax(row as Tax));
  } catch (err) {
    req.log.error({ err }, "Failed to update tax");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

router.delete("/taxes/:id", requireAuth, requireCapability("taxes:delete"), async (req, res) => {
  const id = req.params["id"] as string;
  if (!id) {
    res.status(400).json({ error: "معرّف غير صحيح" });
    return;
  }
  try {
    const deleted = await db
      .delete(taxesTable)
      .where(
        and(eq(taxesTable.id, id), eq(taxesTable.companyId, req.auth!.companyId)),
      )
      .returning({ id: taxesTable.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: "الضريبة غير موجودة" });
      return;
    }
    res.json({ status: "ok" });
  } catch (err) {
    req.log.error({ err }, "Failed to delete tax");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

export default router;
