import { Router } from "express";
import { and, eq, asc } from "drizzle-orm";
import { db, costCentersTable, type CostCenter } from "@workspace/db";
import { CreateCostCenterBody, UpdateCostCenterBody } from "@workspace/api-zod";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import { exportWorkbook, handleXlsxUpload, parseSheet } from "../lib/excel";

const router = Router();

const CENTER_TYPES = ["project", "cost_center", "branch"] as const;

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

// ---- Excel export / import -------------------------------------------------

// Streams all of the company's cost centers as an .xlsx workbook (round-trips
// the import format).
router.get(
  "/cost-centers/export",
  requireAuth,
  requireCapability("costCenters:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    try {
      const rows = await db
        .select()
        .from(costCentersTable)
        .where(eq(costCentersTable.companyId, companyId))
        .orderBy(asc(costCentersTable.createdAt));
      await exportWorkbook(res, {
        sheetName: "CostCenters",
        fileName: "cost-centers-export",
        columns: [
          { header: "nameAr", value: (r) => r.nameAr },
          { header: "nameEn", value: (r) => r.nameEn ?? "" },
          { header: "type", value: (r) => r.type },
          {
            header: "budget",
            value: (r) => (r.budget === null ? "" : Number(r.budget)),
          },
          { header: "isActive", value: (r) => (r.isActive ? "true" : "false") },
        ],
        rows,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to export cost centers");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// Bulk-creates cost centers from an .xlsx (round-trips the export format).
// All-or-nothing: any invalid row aborts the whole import.
router.post(
  "/cost-centers/import",
  requireAuth,
  requireCapability("costCenters:create"),
  handleXlsxUpload,
  async (req, res) => {
    const companyId = req.auth!.companyId;
    if (!req.file) {
      res.status(400).json({ error: "لم يتم رفع أي ملف" });
      return;
    }
    try {
      const sheet = await parseSheet(req.file.buffer);
      if (!sheet) {
        res.status(400).json({ error: "الملف لا يحتوي على بيانات" });
        return;
      }
      if (!sheet.has("nameAr")) {
        res.status(400).json({
          error: "صيغة الملف غير صحيحة. الأعمدة المطلوبة: nameAr, type",
        });
        return;
      }

      type Row = {
        nameAr: string;
        nameEn: string | null;
        type: (typeof CENTER_TYPES)[number];
        budget: string | null;
        isActive: boolean;
      };
      const parsed: Row[] = [];
      for (const { rowNo, row } of sheet.rows) {
        const nameAr = sheet.str(row, "nameAr");
        const typeRaw = sheet.str(row, "type");
        const budgetRaw = sheet.has("budget") ? sheet.str(row, "budget") : "";
        const nameEn = sheet.str(row, "nameEn");
        if (!nameAr && !typeRaw && !budgetRaw && !nameEn) continue; // skip blank rows
        if (!nameAr) {
          res.status(400).json({ error: `السطر ${rowNo}: nameAr مطلوب` });
          return;
        }
        const type = (typeRaw || "cost_center") as (typeof CENTER_TYPES)[number];
        if (!CENTER_TYPES.includes(type)) {
          res.status(400).json({
            error: `السطر ${rowNo}: نوع مركز التكلفة ${typeRaw} غير صحيح`,
          });
          return;
        }
        const activeRaw = sheet.has("isActive")
          ? sheet.str(row, "isActive").toLowerCase()
          : "";
        const isActive = !(
          activeRaw === "false" ||
          activeRaw === "0" ||
          activeRaw === "no" ||
          activeRaw === "غير نشط"
        );
        parsed.push({
          nameAr,
          nameEn: nameEn || null,
          type,
          budget: budgetRaw ? String(sheet.num(row, "budget")) : null,
          isActive,
        });
      }
      if (parsed.length === 0) {
        res.status(400).json({ error: "الملف لا يحتوي على مراكز تكلفة" });
        return;
      }

      await db.transaction(async (tx) => {
        for (const r of parsed) {
          await tx.insert(costCentersTable).values({
            companyId,
            nameAr: r.nameAr,
            nameEn: r.nameEn,
            type: r.type,
            budget: r.budget,
            isActive: r.isActive,
          });
        }
      });
      res.json({ imported: parsed.length });
    } catch (err) {
      req.log.error({ err }, "Failed to import cost centers");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
