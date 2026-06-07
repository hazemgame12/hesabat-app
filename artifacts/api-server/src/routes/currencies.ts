import { Router } from "express";
import { and, eq, asc } from "drizzle-orm";
import { db, currenciesTable, type Currency } from "@workspace/db";
import { CreateCurrencyBody, UpdateCurrencyBody } from "@workspace/api-zod";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";

const router = Router();

function toCurrency(row: Currency) {
  return {
    id: row.id,
    code: row.code,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    exchangeRate: Number(row.exchangeRate),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get(
  "/currencies",
  requireAuth,
  requireCapability("currencies:read"),
  async (req, res) => {
    try {
      const rows = await db
        .select()
        .from(currenciesTable)
        .where(eq(currenciesTable.companyId, req.auth!.companyId))
        .orderBy(asc(currenciesTable.code));
      res.json(rows.map(toCurrency));
    } catch (err) {
      req.log.error({ err }, "Failed to list currencies");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.post(
  "/currencies",
  requireAuth,
  requireCapability("currencies:create"),
  async (req, res) => {
    const parsed = CreateCurrencyBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    try {
      const [row] = await db
        .insert(currenciesTable)
        .values({
          companyId: req.auth!.companyId,
          code: parsed.data.code.trim().toUpperCase(),
          nameAr: parsed.data.nameAr,
          nameEn: parsed.data.nameEn ?? null,
          exchangeRate: String(parsed.data.exchangeRate),
          isActive: parsed.data.isActive ?? true,
        })
        .returning();
      res.status(201).json(toCurrency(row as Currency));
    } catch (err: unknown) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code?: string }).code === "23505"
      ) {
        res.status(409).json({ error: "رمز العملة مستخدم بالفعل" });
        return;
      }
      req.log.error({ err }, "Failed to create currency");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.patch(
  "/currencies/:id",
  requireAuth,
  requireCapability("currencies:update"),
  async (req, res) => {
    const id = req.params["id"] as string;
    if (!id) {
      res.status(400).json({ error: "معرّف غير صحيح" });
      return;
    }
    const parsed = UpdateCurrencyBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const updates: Record<string, unknown> = {};
    if (parsed.data.code !== undefined)
      updates["code"] = parsed.data.code.trim().toUpperCase();
    if (parsed.data.nameAr !== undefined) updates["nameAr"] = parsed.data.nameAr;
    if (parsed.data.nameEn !== undefined) updates["nameEn"] = parsed.data.nameEn;
    if (parsed.data.exchangeRate !== undefined)
      updates["exchangeRate"] = String(parsed.data.exchangeRate);
    if (parsed.data.isActive !== undefined)
      updates["isActive"] = parsed.data.isActive;
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "لا توجد بيانات للتحديث" });
      return;
    }
    try {
      const [row] = await db
        .update(currenciesTable)
        .set(updates)
        .where(
          and(
            eq(currenciesTable.id, id),
            eq(currenciesTable.companyId, req.auth!.companyId),
          ),
        )
        .returning();
      if (!row) {
        res.status(404).json({ error: "العملة غير موجودة" });
        return;
      }
      res.json(toCurrency(row as Currency));
    } catch (err: unknown) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code?: string }).code === "23505"
      ) {
        res.status(409).json({ error: "رمز العملة مستخدم بالفعل" });
        return;
      }
      req.log.error({ err }, "Failed to update currency");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.delete(
  "/currencies/:id",
  requireAuth,
  requireCapability("currencies:delete"),
  async (req, res) => {
    const id = req.params["id"] as string;
    if (!id) {
      res.status(400).json({ error: "معرّف غير صحيح" });
      return;
    }
    try {
      const deleted = await db
        .delete(currenciesTable)
        .where(
          and(
            eq(currenciesTable.id, id),
            eq(currenciesTable.companyId, req.auth!.companyId),
          ),
        )
        .returning({ id: currenciesTable.id });
      if (deleted.length === 0) {
        res.status(404).json({ error: "العملة غير موجودة" });
        return;
      }
      res.json({ status: "ok" });
    } catch (err) {
      req.log.error({ err }, "Failed to delete currency");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
