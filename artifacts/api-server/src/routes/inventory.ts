import { Router } from "express";
import { and, eq, asc, desc, inArray, sql, count } from "drizzle-orm";
import { parsePagination, paginatedResponse } from "../lib/pagination";
import {
  db,
  inventoryItemsTable,
  inventoryMovementsTable,
  journalEntriesTable,
  accountsTable,
  costCentersTable,
  projectsTable,
  branchesTable,
  companiesTable,
  type InventoryItem,
} from "@workspace/db";
import {
  CreateInventoryItemBody,
  UpdateInventoryItemBody,
  CreateInventoryMovementBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import { createDraftJournalEntry } from "../lib/journal-posting";
import { generateEntityCode, todayDate } from "../lib/codes";
import { computeMovement, round2, round4, buildInventoryPostingLines } from "../lib/inventory-posting";
import { exportWorkbook, handleXlsxUpload, parseSheet } from "../lib/excel";

const router = Router();

const EPS = 0.00005;

function toItem(row: InventoryItem) {
  const qty = Number(row.quantityOnHand);
  const avg = Number(row.averageCost);
  return {
    id: row.id,
    code: row.code,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    unit: row.unit,
    category: row.category,
    isActive: row.isActive,
    quantityOnHand: round4(qty),
    averageCost: round4(avg),
    stockValue: round2(qty * avg),
    inventoryAccountId: row.inventoryAccountId,
    itemCodeType: row.itemCodeType,
    gs1Code: row.gs1Code,
    egsCode: row.egsCode,
    unitCode: row.unitCode,
    createdAt: row.createdAt.toISOString(),
  };
}

// Verifies every mapped account exists, belongs to the caller's company, and is
// a leaf (non-group) account. Returns an Arabic error message when invalid.
async function validateAccounts(
  accountIds: string[],
  companyId: string,
): Promise<string | null> {
  const ids = [...new Set(accountIds)];
  if (ids.length === 0) return null;
  const rows = await db
    .select({ id: accountsTable.id, isGroup: accountsTable.isGroup })
    .from(accountsTable)
    .where(
      and(
        eq(accountsTable.companyId, companyId),
        inArray(accountsTable.id, ids),
      ),
    );
  const map = new Map(rows.map((r) => [r.id, r]));
  for (const id of ids) {
    const acc = map.get(id);
    if (!acc) return "أحد الحسابات المحددة غير موجود";
    if (acc.isGroup) return "لا يمكن الترحيل إلى حساب رئيسي";
  }
  return null;
}

async function validateDimensions(
  ids: {
    costCenterId?: string | null;
    projectId?: string | null;
    branchId?: string | null;
  },
  companyId: string,
): Promise<string | null> {
  if (ids.costCenterId) {
    const [row] = await db
      .select({ id: costCentersTable.id })
      .from(costCentersTable)
      .where(
        and(
          eq(costCentersTable.id, ids.costCenterId),
          eq(costCentersTable.companyId, companyId),
        ),
      )
      .limit(1);
    if (!row) return "مركز التكلفة المحدد غير موجود";
  }
  if (ids.projectId) {
    const [row] = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(
        and(
          eq(projectsTable.id, ids.projectId),
          eq(projectsTable.companyId, companyId),
        ),
      )
      .limit(1);
    if (!row) return "المشروع المحدد غير موجود";
  }
  if (ids.branchId) {
    const [row] = await db
      .select({ id: branchesTable.id })
      .from(branchesTable)
      .where(
        and(
          eq(branchesTable.id, ids.branchId),
          eq(branchesTable.companyId, companyId),
        ),
      )
      .limit(1);
    if (!row) return "الفرع المحدد غير موجود";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

router.get(
  "/inventory/items",
  requireAuth,
  requireCapability("inventory:read"),
  async (req, res) => {
    try {
      const companyId = req.auth!.companyId;
      const pg = parsePagination(req.query as Record<string, unknown>);

      if (pg) {
        const [{ total }] = await db
          .select({ total: count() })
          .from(inventoryItemsTable)
          .where(eq(inventoryItemsTable.companyId, companyId));
        const rows = await db
          .select()
          .from(inventoryItemsTable)
          .where(eq(inventoryItemsTable.companyId, companyId))
          .orderBy(asc(inventoryItemsTable.code))
          .limit(pg.limit)
          .offset(pg.offset);
        res.json(paginatedResponse(rows.map(toItem), Number(total), pg.page, pg.limit));
        return;
      }

      const rows = await db
        .select()
        .from(inventoryItemsTable)
        .where(eq(inventoryItemsTable.companyId, companyId))
        .orderBy(asc(inventoryItemsTable.code));
      res.json(rows.map(toItem));
    } catch (err) {
      req.log.error({ err }, "Failed to list inventory items");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.post(
  "/inventory/items",
  requireAuth,
  requireCapability("inventory:create"),
  async (req, res) => {
    const parsed = CreateInventoryItemBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const d = parsed.data;
    try {
      const refErr = await validateAccounts([d.inventoryAccountId], companyId);
      if (refErr) {
        res.status(400).json({ error: refErr });
        return;
      }
      // Generate the code and insert the row in one tx so a failed insert
      // unwinds the sequence increment (no burned/gapped codes).
      const row = await db.transaction(async (tx) => {
        const code = await generateEntityCode(
          tx,
          companyId,
          "inventory_item",
          todayDate(),
        );
        const [r] = await tx
          .insert(inventoryItemsTable)
          .values({
            companyId,
            code,
            nameAr: d.nameAr,
            nameEn: d.nameEn ?? null,
            unit: d.unit,
            category: d.category ?? null,
            isActive: d.isActive ?? true,
            inventoryAccountId: d.inventoryAccountId,
          })
          .returning();
        return r;
      });
      res.status(201).json(toItem(row as InventoryItem));
    } catch (err) {
      req.log.error({ err }, "Failed to create inventory item");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.patch(
  "/inventory/items/:id",
  requireAuth,
  requireCapability("inventory:update"),
  async (req, res) => {
    const id = req.params["id"] as string;
    if (!id) {
      res.status(400).json({ error: "معرّف غير صحيح" });
      return;
    }
    const parsed = UpdateInventoryItemBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const d = parsed.data;
    const updates: Record<string, unknown> = {};
    if (d.nameAr !== undefined) updates["nameAr"] = d.nameAr;
    if (d.nameEn !== undefined) updates["nameEn"] = d.nameEn;
    if (d.unit !== undefined) updates["unit"] = d.unit;
    if (d.category !== undefined) updates["category"] = d.category;
    if (d.isActive !== undefined) updates["isActive"] = d.isActive;
    if (d.inventoryAccountId !== undefined)
      updates["inventoryAccountId"] = d.inventoryAccountId;
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "لا توجد بيانات للتحديث" });
      return;
    }
    try {
      if (updates["inventoryAccountId"]) {
        const refErr = await validateAccounts(
          [updates["inventoryAccountId"] as string],
          companyId,
        );
        if (refErr) {
          res.status(400).json({ error: refErr });
          return;
        }
      }
      if (updates["code"]) {
        const [dup] = await db
          .select({ id: inventoryItemsTable.id })
          .from(inventoryItemsTable)
          .where(
            and(
              eq(inventoryItemsTable.companyId, companyId),
              eq(inventoryItemsTable.code, updates["code"] as string),
            ),
          )
          .limit(1);
        if (dup && dup.id !== id) {
          res.status(409).json({ error: "كود الصنف مستخدم بالفعل" });
          return;
        }
      }
      const [row] = await db
        .update(inventoryItemsTable)
        .set(updates)
        .where(
          and(
            eq(inventoryItemsTable.id, id),
            eq(inventoryItemsTable.companyId, companyId),
          ),
        )
        .returning();
      if (!row) {
        res.status(404).json({ error: "الصنف غير موجود" });
        return;
      }
      res.json(toItem(row as InventoryItem));
    } catch (err) {
      req.log.error({ err }, "Failed to update inventory item");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.delete(
  "/inventory/items/:id",
  requireAuth,
  requireCapability("inventory:delete"),
  async (req, res) => {
    const id = req.params["id"] as string;
    if (!id) {
      res.status(400).json({ error: "معرّف غير صحيح" });
      return;
    }
    const companyId = req.auth!.companyId;
    try {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(inventoryMovementsTable)
        .where(
          and(
            eq(inventoryMovementsTable.itemId, id),
            eq(inventoryMovementsTable.companyId, companyId),
          ),
        );
      if (Number(count) > 0) {
        res
          .status(400)
          .json({ error: "لا يمكن حذف صنف له حركات مخزون مُسجّلة" });
        return;
      }
      const deleted = await db
        .delete(inventoryItemsTable)
        .where(
          and(
            eq(inventoryItemsTable.id, id),
            eq(inventoryItemsTable.companyId, companyId),
          ),
        )
        .returning({ id: inventoryItemsTable.id });
      if (deleted.length === 0) {
        res.status(404).json({ error: "الصنف غير موجود" });
        return;
      }
      res.json({ status: "ok" });
    } catch (err) {
      req.log.error({ err }, "Failed to delete inventory item");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Excel export / import -------------------------------------------------

// Streams all of the company's inventory items as an .xlsx workbook (round-trips
// the import format; quantity/value are informational extras, never imported).
router.get(
  "/inventory/items/export",
  requireAuth,
  requireCapability("inventory:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    try {
      const rows = await db
        .select({
          item: inventoryItemsTable,
          accountCode: accountsTable.code,
        })
        .from(inventoryItemsTable)
        .innerJoin(
          accountsTable,
          and(
            eq(accountsTable.id, inventoryItemsTable.inventoryAccountId),
            eq(accountsTable.companyId, companyId),
          ),
        )
        .where(eq(inventoryItemsTable.companyId, companyId))
        .orderBy(asc(inventoryItemsTable.code));
      await exportWorkbook(res, {
        sheetName: "Inventory",
        fileName: "inventory-items-export",
        columns: [
          { header: "code", value: (r) => r.item.code },
          { header: "nameAr", value: (r) => r.item.nameAr },
          { header: "nameEn", value: (r) => r.item.nameEn ?? "" },
          { header: "unit", value: (r) => r.item.unit },
          { header: "category", value: (r) => r.item.category ?? "" },
          {
            header: "inventoryAccountCode",
            value: (r) => r.accountCode ?? "",
          },
          { header: "isActive", value: (r) => (r.item.isActive ? "true" : "false") },
          { header: "quantityOnHand", value: (r) => round4(Number(r.item.quantityOnHand)) },
          { header: "averageCost", value: (r) => round4(Number(r.item.averageCost)) },
        ],
        rows,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to export inventory items");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// Bulk-creates inventory items from an .xlsx (round-trips the export format).
// Only the item master is imported (never stock quantities/movements).
// All-or-nothing: any invalid row aborts the whole import.
router.post(
  "/inventory/items/import",
  requireAuth,
  requireCapability("inventory:create"),
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
      if (!sheet.has("code") || !sheet.has("nameAr")) {
        res.status(400).json({
          error:
            "صيغة الملف غير صحيحة. الأعمدة المطلوبة: code, nameAr, unit, inventoryAccountCode",
        });
        return;
      }

      // Resolve inventory accounts by code (must be leaf, same company).
      const companyAccounts = await db
        .select({
          id: accountsTable.id,
          code: accountsTable.code,
          isGroup: accountsTable.isGroup,
        })
        .from(accountsTable)
        .where(eq(accountsTable.companyId, companyId));
      const accByCode = new Map(companyAccounts.map((a) => [a.code, a]));
      const existing = await db
        .select({ code: inventoryItemsTable.code })
        .from(inventoryItemsTable)
        .where(eq(inventoryItemsTable.companyId, companyId));
      const existingCodes = new Set(existing.map((e) => e.code));

      type Row = {
        code: string;
        nameAr: string;
        nameEn: string | null;
        unit: string;
        category: string | null;
        isActive: boolean;
        inventoryAccountId: string;
      };
      const parsed: Row[] = [];
      const seen = new Set<string>();
      for (const { rowNo, row } of sheet.rows) {
        const code = sheet.str(row, "code");
        const nameAr = sheet.str(row, "nameAr");
        const unit = sheet.str(row, "unit");
        if (!code && !nameAr && !unit) continue; // skip blank rows
        if (!code || !nameAr) {
          res
            .status(400)
            .json({ error: `السطر ${rowNo}: code و nameAr مطلوبان` });
          return;
        }
        if (!unit) {
          res.status(400).json({ error: `السطر ${rowNo}: unit مطلوب` });
          return;
        }
        if (seen.has(code) || existingCodes.has(code)) {
          res
            .status(400)
            .json({ error: `السطر ${rowNo}: كود الصنف ${code} مكرر` });
          return;
        }
        const accountCode = sheet.str(row, "inventoryAccountCode");
        if (!accountCode) {
          res.status(400).json({
            error: `السطر ${rowNo}: inventoryAccountCode مطلوب`,
          });
          return;
        }
        const account = accByCode.get(accountCode);
        if (!account) {
          res.status(400).json({
            error: `السطر ${rowNo}: الحساب ${accountCode} غير موجود`,
          });
          return;
        }
        if (account.isGroup) {
          res.status(400).json({
            error: `السطر ${rowNo}: ${accountCode} حساب رئيسي ولا يمكن الترحيل إليه`,
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
        seen.add(code);
        parsed.push({
          code,
          nameAr,
          nameEn: sheet.str(row, "nameEn") || null,
          unit,
          category: sheet.str(row, "category") || null,
          isActive,
          inventoryAccountId: account.id,
        });
      }
      if (parsed.length === 0) {
        res.status(400).json({ error: "الملف لا يحتوي على أصناف" });
        return;
      }

      await db.transaction(async (tx) => {
        for (const r of parsed) {
          await tx.insert(inventoryItemsTable).values({
            companyId,
            code: r.code,
            nameAr: r.nameAr,
            nameEn: r.nameEn,
            unit: r.unit,
            category: r.category,
            isActive: r.isActive,
            inventoryAccountId: r.inventoryAccountId,
          });
        }
      });
      res.json({ imported: parsed.length });
    } catch (err) {
      req.log.error({ err }, "Failed to import inventory items");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---------------------------------------------------------------------------
// Movements
// ---------------------------------------------------------------------------

router.get(
  "/inventory/movements",
  requireAuth,
  requireCapability("inventory:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const itemId =
      typeof req.query["itemId"] === "string"
        ? (req.query["itemId"] as string)
        : null;
    try {
      const where = itemId
        ? and(
            eq(inventoryMovementsTable.companyId, companyId),
            eq(inventoryMovementsTable.itemId, itemId),
          )
        : eq(inventoryMovementsTable.companyId, companyId);
      const rows = await db
        .select({
          m: inventoryMovementsTable,
          itemCode: inventoryItemsTable.code,
          itemNameAr: inventoryItemsTable.nameAr,
          itemNameEn: inventoryItemsTable.nameEn,
          unit: inventoryItemsTable.unit,
          entryNo: journalEntriesTable.entryNo,
        })
        .from(inventoryMovementsTable)
        .innerJoin(
          inventoryItemsTable,
          eq(inventoryMovementsTable.itemId, inventoryItemsTable.id),
        )
        .leftJoin(
          journalEntriesTable,
          eq(inventoryMovementsTable.journalEntryId, journalEntriesTable.id),
        )
        .where(where)
        .orderBy(desc(inventoryMovementsTable.createdAt));
      res.json(
        rows.map((r) => ({
          id: r.m.id,
          itemId: r.m.itemId,
          itemCode: r.itemCode,
          itemNameAr: r.itemNameAr,
          itemNameEn: r.itemNameEn,
          unit: r.unit,
          date: r.m.date,
          type: r.m.type,
          quantity: Number(r.m.quantity),
          unitCost: Number(r.m.unitCost),
          totalValue: Number(r.m.totalValue),
          inventoryAccountId: r.m.inventoryAccountId,
          counterpartAccountId: r.m.counterpartAccountId,
          costCenterId: r.m.costCenterId,
          projectId: r.m.projectId,
          branchId: r.m.branchId,
          notes: r.m.notes,
          journalEntryId: r.m.journalEntryId,
          journalEntryNo: r.entryNo ?? null,
          createdAt: r.m.createdAt.toISOString(),
        })),
      );
    } catch (err) {
      req.log.error({ err }, "Failed to list inventory movements");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.post(
  "/inventory/movements",
  requireAuth,
  requireCapability("inventory:create"),
  async (req, res) => {
    const parsed = CreateInventoryMovementBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const d = parsed.data;
    const qty = round4(d.quantity);

    // Per-type quantity sanity checks (sign rules differ by movement type).
    if (d.type === "adjustment") {
      if (Math.abs(qty) < EPS) {
        res.status(400).json({ error: "كمية التسوية يجب ألا تساوي صفر" });
        return;
      }
    } else if (qty <= 0) {
      res.status(400).json({ error: "الكمية يجب أن تكون أكبر من صفر" });
      return;
    }
    if (d.type === "receipt" && (d.unitCost == null || d.unitCost < 0)) {
      res.status(400).json({ error: "سعر التكلفة مطلوب للاستلام" });
      return;
    }

    try {
      const [company] = await db
        .select({ baseCurrency: companiesTable.baseCurrency })
        .from(companiesTable)
        .where(eq(companiesTable.id, companyId))
        .limit(1);
      const baseCurrency = (company?.baseCurrency || "EGP").toUpperCase();

      const result = await db.transaction(async (tx) => {
        // Lock the item row so concurrent movements serialize and the
        // quantity/average update is consistent.
        const [item] = await tx
          .select()
          .from(inventoryItemsTable)
          .where(
            and(
              eq(inventoryItemsTable.id, d.itemId),
              eq(inventoryItemsTable.companyId, companyId),
            ),
          )
          .limit(1)
          .for("update");
        if (!item) return { error: "notfound" as const };

        const inventoryAccountId =
          d.inventoryAccountId ?? item.inventoryAccountId;
        const refErr = await validateAccounts(
          [inventoryAccountId, d.counterpartAccountId],
          companyId,
        );
        if (refErr) return { error: "account" as const, message: refErr };
        const dimErr = await validateDimensions(
          {
            costCenterId: d.costCenterId ?? null,
            projectId: d.projectId ?? null,
            branchId: d.branchId ?? null,
          },
          companyId,
        );
        if (dimErr) return { error: "account" as const, message: dimErr };

        const curQty = round4(Number(item.quantityOnHand));
        const curAvg = round4(Number(item.averageCost));

        const computed = computeMovement(
          curQty,
          curAvg,
          d.type,
          qty,
          d.type === "receipt" ? (d.unitCost as number) : null,
        );
        if (computed === "negative") {
          return { error: "negative" as const };
        }
        const { newQty, newAvg, unitCost, totalValue, inventoryIsDebit } =
          computed;

        const postAmount = round2(Math.abs(totalValue));
        let journalEntryId: string | null = null;

        if (postAmount > 0.005) {
          const itemLabel = `${item.code} · ${item.nameAr}`;
          const typeLabel =
            d.type === "receipt"
              ? "استلام مخزون"
              : d.type === "issue"
                ? "صرف مخزون"
                : "تسوية مخزون";
          const [invLine, counterLine] = buildInventoryPostingLines({
            inventoryAccountId,
            counterpartAccountId: d.counterpartAccountId,
            typeLabel,
            itemLabel,
            postAmount,
            inventoryIsDebit,
            costCenterId: d.costCenterId,
            projectId: d.projectId,
            branchId: d.branchId,
          });
          const entry = await createDraftJournalEntry(tx, {
            companyId,
            baseCurrency,
            date: d.date,
            reference: `${typeLabel} ${item.code}`,
            notes: d.notes ?? null,
            createdBy: req.auth!.userId,
            lines: [invLine, counterLine],
          });
          journalEntryId = entry.id;
        }

        await tx
          .update(inventoryItemsTable)
          .set({
            quantityOnHand: String(newQty),
            averageCost: String(newAvg),
          })
          .where(eq(inventoryItemsTable.id, item.id));

        const [movement] = await tx
          .insert(inventoryMovementsTable)
          .values({
            companyId,
            itemId: item.id,
            date: d.date,
            type: d.type,
            quantity: String(qty),
            unitCost: String(unitCost),
            totalValue: String(totalValue),
            inventoryAccountId,
            counterpartAccountId: d.counterpartAccountId,
            costCenterId: d.costCenterId ?? null,
            projectId: d.projectId ?? null,
            branchId: d.branchId ?? null,
            notes: d.notes ?? null,
            journalEntryId,
            createdBy: req.auth!.userId,
          })
          .returning();

        return {
          movement: movement!,
          item,
          journalEntryId,
        };
      });

      if ("error" in result) {
        if (result.error === "notfound") {
          res.status(404).json({ error: "الصنف غير موجود" });
        } else if (result.error === "negative") {
          res
            .status(400)
            .json({ error: "الكمية المتاحة لا تكفي — لا يمكن أن يصبح الرصيد سالبًا" });
        } else {
          res.status(400).json({ error: result.message });
        }
        return;
      }

      let entryNo: number | null = null;
      if (result.journalEntryId) {
        const [e] = await db
          .select({ entryNo: journalEntriesTable.entryNo })
          .from(journalEntriesTable)
          .where(eq(journalEntriesTable.id, result.journalEntryId))
          .limit(1);
        entryNo = e?.entryNo ?? null;
      }

      const m = result.movement;
      res.status(201).json({
        id: m.id,
        itemId: m.itemId,
        itemCode: result.item.code,
        itemNameAr: result.item.nameAr,
        itemNameEn: result.item.nameEn,
        unit: result.item.unit,
        date: m.date,
        type: m.type,
        quantity: Number(m.quantity),
        unitCost: Number(m.unitCost),
        totalValue: Number(m.totalValue),
        inventoryAccountId: m.inventoryAccountId,
        counterpartAccountId: m.counterpartAccountId,
        costCenterId: m.costCenterId,
        projectId: m.projectId,
        branchId: m.branchId,
        notes: m.notes,
        journalEntryId: m.journalEntryId,
        journalEntryNo: entryNo,
        createdAt: m.createdAt.toISOString(),
      });
    } catch (err) {
      req.log.error({ err }, "Failed to create inventory movement");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
