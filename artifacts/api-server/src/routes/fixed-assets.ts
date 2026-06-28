import { Router } from "express";
import { and, eq, asc, inArray, sql, count } from "drizzle-orm";
import { parsePagination, paginatedResponse } from "../lib/pagination";
import {
  db,
  fixedAssetsTable,
  assetDepreciationEntriesTable,
  accountsTable,
  costCentersTable,
  projectsTable,
  branchesTable,
  companiesTable,
  type FixedAsset,
} from "@workspace/db";
import {
  CreateAssetBody,
  UpdateAssetBody,
  RunDepreciationBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import { createDraftJournalEntry } from "../lib/journal-posting";
import { isWriteBlocked, WRITE_BLOCK_MSG } from "../lib/fiscal-year";
import { generateEntityCode } from "../lib/codes";
import {
  exportWorkbook,
  handleXlsxUpload,
  parseSheet,
} from "../lib/excel";

const router = Router();

const round2 = (n: number) => Math.round(n * 100) / 100;
const EPS = 0.005;

// Thrown while validating an import row to surface a row-specific 400.
class ImportRowError extends Error {}

function toAsset(row: FixedAsset, accumulated: number) {
  const cost = Number(row.cost);
  const acc = round2(accumulated);
  return {
    id: row.id,
    code: row.code,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    category: row.category,
    acquisitionDate: row.acquisitionDate,
    cost,
    salvageValue: Number(row.salvageValue),
    usefulLifeMonths: row.usefulLifeMonths,
    method: row.method,
    status: row.status,
    assetAccountId: row.assetAccountId,
    accumulatedAccountId: row.accumulatedAccountId,
    expenseAccountId: row.expenseAccountId,
    costCenterId: row.costCenterId,
    projectId: row.projectId,
    branchId: row.branchId,
    accumulatedDepreciation: acc,
    netBookValue: round2(cost - acc),
    createdAt: row.createdAt.toISOString(),
  };
}

// Verifies every mapped account exists, belongs to the caller's company, and is
// a leaf (non-group) account. Returns an Arabic error message when invalid.
async function validateAssetAccounts(
  accountIds: string[],
  companyId: string,
): Promise<string | null> {
  const ids = [...new Set(accountIds)];
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
  return null;
}

// Sums depreciation taken per asset for the given asset ids (company-scoped).
async function accumulatedByAsset(
  assetIds: string[],
  companyId: string,
): Promise<Map<string, number>> {
  if (assetIds.length === 0) return new Map();
  const rows = await db
    .select({
      assetId: assetDepreciationEntriesTable.assetId,
      total: sql<string>`coalesce(sum(${assetDepreciationEntriesTable.amount}), 0)`,
    })
    .from(assetDepreciationEntriesTable)
    .where(
      and(
        eq(assetDepreciationEntriesTable.companyId, companyId),
        inArray(assetDepreciationEntriesTable.assetId, assetIds),
      ),
    )
    .groupBy(assetDepreciationEntriesTable.assetId);
  return new Map(rows.map((r) => [r.assetId, Number(r.total)]));
}

router.get(
  "/assets",
  requireAuth,
  requireCapability("assets:read"),
  async (req, res) => {
    try {
      const companyId = req.auth!.companyId;
      const pg = parsePagination(req.query as Record<string, unknown>);

      if (pg) {
        const [{ total }] = await db
          .select({ total: count() })
          .from(fixedAssetsTable)
          .where(eq(fixedAssetsTable.companyId, companyId));
        const rows = await db
          .select()
          .from(fixedAssetsTable)
          .where(eq(fixedAssetsTable.companyId, companyId))
          .orderBy(asc(fixedAssetsTable.createdAt))
          .limit(pg.limit)
          .offset(pg.offset);
        const accMap = await accumulatedByAsset(rows.map((r) => r.id), companyId);
        res.json(
          paginatedResponse(
            rows.map((r) => toAsset(r, accMap.get(r.id) ?? 0)),
            Number(total),
            pg.page,
            pg.limit,
          ),
        );
        return;
      }

      const rows = await db
        .select()
        .from(fixedAssetsTable)
        .where(eq(fixedAssetsTable.companyId, companyId))
        .orderBy(asc(fixedAssetsTable.createdAt));
      const accMap = await accumulatedByAsset(
        rows.map((r) => r.id),
        companyId,
      );
      res.json(rows.map((r) => toAsset(r, accMap.get(r.id) ?? 0)));
    } catch (err) {
      req.log.error({ err }, "Failed to list fixed assets");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.post(
  "/assets",
  requireAuth,
  requireCapability("assets:create"),
  async (req, res) => {
    const parsed = CreateAssetBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const d = parsed.data;
    if (d.salvageValue != null && d.salvageValue >= d.cost) {
      res.status(400).json({ error: "قيمة الخردة يجب أن تكون أقل من التكلفة" });
      return;
    }
    try {
      const refErr = await validateAssetAccounts(
        [d.assetAccountId, d.accumulatedAccountId, d.expenseAccountId],
        companyId,
      );
      if (refErr) {
        res.status(400).json({ error: refErr });
        return;
      }
      const dimErr = await validateDimensions(
        {
          costCenterId: d.costCenterId ?? null,
          projectId: d.projectId ?? null,
          branchId: d.branchId ?? null,
        },
        companyId,
      );
      if (dimErr) {
        res.status(400).json({ error: dimErr });
        return;
      }
      // Generate the code and insert the row in one tx so a failed insert
      // unwinds the sequence increment (no burned/gapped codes).
      const row = await db.transaction(async (tx) => {
        const code = await generateEntityCode(
          tx,
          companyId,
          "fixed_asset",
          d.acquisitionDate,
        );
        const [r] = await tx
          .insert(fixedAssetsTable)
          .values({
            companyId,
            code,
            nameAr: d.nameAr,
            nameEn: d.nameEn ?? null,
            category: d.category ?? null,
            acquisitionDate: d.acquisitionDate,
            cost: String(d.cost),
            salvageValue: String(d.salvageValue ?? 0),
            usefulLifeMonths: d.usefulLifeMonths,
            method: d.method ?? "straight_line",
            assetAccountId: d.assetAccountId,
            accumulatedAccountId: d.accumulatedAccountId,
            expenseAccountId: d.expenseAccountId,
            costCenterId: d.costCenterId ?? null,
            projectId: d.projectId ?? null,
            branchId: d.branchId ?? null,
          })
          .returning();
        return r;
      });
      res.status(201).json(toAsset(row as FixedAsset, 0));
    } catch (err) {
      req.log.error({ err }, "Failed to create fixed asset");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.patch(
  "/assets/:id",
  requireAuth,
  requireCapability("assets:update"),
  async (req, res) => {
    const id = req.params["id"] as string;
    if (!id) {
      res.status(400).json({ error: "معرّف غير صحيح" });
      return;
    }
    const parsed = UpdateAssetBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const d = parsed.data;
    const updates: Record<string, unknown> = {};
    if (d.nameAr !== undefined) updates["nameAr"] = d.nameAr;
    if (d.nameEn !== undefined) updates["nameEn"] = d.nameEn;
    if (d.category !== undefined) updates["category"] = d.category;
    if (d.acquisitionDate !== undefined)
      updates["acquisitionDate"] = d.acquisitionDate;
    if (d.cost !== undefined) updates["cost"] = String(d.cost);
    if (d.salvageValue !== undefined)
      updates["salvageValue"] = String(d.salvageValue);
    if (d.usefulLifeMonths !== undefined)
      updates["usefulLifeMonths"] = d.usefulLifeMonths;
    if (d.method !== undefined) updates["method"] = d.method;
    if (d.status !== undefined) updates["status"] = d.status;
    if (d.assetAccountId !== undefined)
      updates["assetAccountId"] = d.assetAccountId;
    if (d.accumulatedAccountId !== undefined)
      updates["accumulatedAccountId"] = d.accumulatedAccountId;
    if (d.expenseAccountId !== undefined)
      updates["expenseAccountId"] = d.expenseAccountId;
    if (d.costCenterId !== undefined) updates["costCenterId"] = d.costCenterId;
    if (d.projectId !== undefined) updates["projectId"] = d.projectId;
    if (d.branchId !== undefined) updates["branchId"] = d.branchId;
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "لا توجد بيانات للتحديث" });
      return;
    }
    try {
      const [existing] = await db
        .select()
        .from(fixedAssetsTable)
        .where(
          and(
            eq(fixedAssetsTable.id, id),
            eq(fixedAssetsTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "الأصل غير موجود" });
        return;
      }
      const nextCost = Number(updates["cost"] ?? existing.cost);
      const nextSalvage = Number(updates["salvageValue"] ?? existing.salvageValue);
      if (nextSalvage >= nextCost) {
        res.status(400).json({ error: "قيمة الخردة يجب أن تكون أقل من التكلفة" });
        return;
      }
      const accountIds = [
        (updates["assetAccountId"] as string) ?? existing.assetAccountId,
        (updates["accumulatedAccountId"] as string) ??
          existing.accumulatedAccountId,
        (updates["expenseAccountId"] as string) ?? existing.expenseAccountId,
      ];
      const refErr = await validateAssetAccounts(accountIds, companyId);
      if (refErr) {
        res.status(400).json({ error: refErr });
        return;
      }
      const dimErr = await validateDimensions(
        {
          costCenterId: (updates["costCenterId"] as string | null | undefined) ?? existing.costCenterId,
          projectId: (updates["projectId"] as string | null | undefined) ?? existing.projectId,
          branchId: (updates["branchId"] as string | null | undefined) ?? existing.branchId,
        },
        companyId,
      );
      if (dimErr) {
        res.status(400).json({ error: dimErr });
        return;
      }
      const [row] = await db
        .update(fixedAssetsTable)
        .set(updates)
        .where(
          and(
            eq(fixedAssetsTable.id, id),
            eq(fixedAssetsTable.companyId, companyId),
          ),
        )
        .returning();
      const accMap = await accumulatedByAsset([id], companyId);
      res.json(toAsset(row as FixedAsset, accMap.get(id) ?? 0));
    } catch (err) {
      req.log.error({ err }, "Failed to update fixed asset");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.delete(
  "/assets/:id",
  requireAuth,
  requireCapability("assets:delete"),
  async (req, res) => {
    const id = req.params["id"] as string;
    if (!id) {
      res.status(400).json({ error: "معرّف غير صحيح" });
      return;
    }
    const companyId = req.auth!.companyId;
    try {
      const [{ count }] = await db
        .select({
          count: sql<number>`count(*)`,
        })
        .from(assetDepreciationEntriesTable)
        .where(
          and(
            eq(assetDepreciationEntriesTable.assetId, id),
            eq(assetDepreciationEntriesTable.companyId, companyId),
          ),
        );
      if (Number(count) > 0) {
        res.status(400).json({
          error: "لا يمكن حذف أصل له إهلاك مُسجّل",
        });
        return;
      }
      const deleted = await db
        .delete(fixedAssetsTable)
        .where(
          and(
            eq(fixedAssetsTable.id, id),
            eq(fixedAssetsTable.companyId, companyId),
          ),
        )
        .returning({ id: fixedAssetsTable.id });
      if (deleted.length === 0) {
        res.status(404).json({ error: "الأصل غير موجود" });
        return;
      }
      res.json({ status: "ok" });
    } catch (err) {
      req.log.error({ err }, "Failed to delete fixed asset");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// Runs straight-line depreciation for one month. For every active asset with
// remaining depreciable value (and acquired on/before the month) that has not
// already been depreciated for that month, computes monthly depreciation,
// records a per-asset depreciation entry, and emits ONE consolidated draft
// journal entry (Dr expense / Cr accumulated per asset) in the base currency.
router.post(
  "/assets/depreciation/run",
  requireAuth,
  requireCapability("assets:create"),
  async (req, res) => {
    const parsed = RunDepreciationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const period = parsed.data.period; // YYYY-MM
    const month = Number(period.slice(5, 7));
    if (month < 1 || month > 12) {
      res.status(400).json({ error: "الشهر غير صحيح" });
      return;
    }
    try {
      const wbDepr = await isWriteBlocked(db, companyId, period + "-01");
      if (wbDepr) {
        res.status(wbDepr === "period_locked" ? 423 : 400).json({ error: WRITE_BLOCK_MSG[wbDepr] });
        return;
      }
      const [company] = await db
        .select({ baseCurrency: companiesTable.baseCurrency })
        .from(companiesTable)
        .where(eq(companiesTable.id, companyId))
        .limit(1);
      const baseCurrency = (company?.baseCurrency || "EGP").toUpperCase();

      const assets = await db
        .select()
        .from(fixedAssetsTable)
        .where(
          and(
            eq(fixedAssetsTable.companyId, companyId),
            eq(fixedAssetsTable.status, "active"),
          ),
        )
        .orderBy(asc(fixedAssetsTable.createdAt));

      const accMap = await accumulatedByAsset(
        assets.map((a) => a.id),
        companyId,
      );

      // Periods already depreciated this month (skip to avoid double-posting).
      const alreadyRows = await db
        .select({ assetId: assetDepreciationEntriesTable.assetId })
        .from(assetDepreciationEntriesTable)
        .where(
          and(
            eq(assetDepreciationEntriesTable.companyId, companyId),
            eq(assetDepreciationEntriesTable.period, period),
          ),
        );
      const alreadyDone = new Set(alreadyRows.map((r) => r.assetId));

      const lines: {
        accountId: string;
        description?: string | null;
        debit: number;
        credit: number;
      }[] = [];
      const depRecords: { assetId: string; amount: number }[] = [];
      let skipped = 0;
      let totalAmount = 0;

      for (const a of assets) {
        if (alreadyDone.has(a.id)) {
          skipped++;
          continue;
        }
        // Don't depreciate before the month of acquisition.
        if (a.acquisitionDate.slice(0, 7) > period) {
          skipped++;
          continue;
        }
        const cost = Number(a.cost);
        const salvage = Number(a.salvageValue);
        const depreciable = round2(cost - salvage);
        const accumulated = round2(accMap.get(a.id) ?? 0);
        const remaining = round2(depreciable - accumulated);
        if (remaining <= EPS || a.usefulLifeMonths <= 0) {
          skipped++;
          continue;
        }
        const monthly = round2(depreciable / a.usefulLifeMonths);
        const amount = round2(Math.min(monthly, remaining));
        if (amount <= EPS) {
          skipped++;
          continue;
        }
        const label =
          (a.nameAr || a.nameEn || "").slice(0, 120) || "أصل ثابت";
        lines.push({
          accountId: a.expenseAccountId,
          description: `إهلاك ${label} - ${period}`,
          debit: amount,
          credit: 0,
        });
        lines.push({
          accountId: a.accumulatedAccountId,
          description: `مجمع إهلاك ${label} - ${period}`,
          debit: 0,
          credit: amount,
        });
        depRecords.push({ assetId: a.id, amount });
        totalAmount = round2(totalAmount + amount);
      }

      if (depRecords.length === 0) {
        res.json({
          period,
          assetsDepreciated: 0,
          totalAmount: 0,
          journalEntryId: null,
          journalEntryNo: null,
          skipped,
        });
        return;
      }

      // Re-validate the accounts we are about to post to: a mapped account may
      // have been turned into a group (or otherwise changed) since the asset was
      // created, which would make the posting invalid.
      const refErr = await validateAssetAccounts(
        lines.map((l) => l.accountId),
        companyId,
      );
      if (refErr) {
        res.status(400).json({ error: refErr });
        return;
      }

      // Post the consolidated draft entry dated the last day of the period.
      const [y, m] = period.split("-").map(Number);
      const lastDay = new Date(y!, m!, 0).getDate();
      const entryDate = `${period}-${String(lastDay).padStart(2, "0")}`;

      const result = await db.transaction(async (tx) => {
        const entry = await createDraftJournalEntry(tx, {
          companyId,
          baseCurrency,
          date: entryDate,
          reference: `إهلاك ${period}`,
          notes: `إهلاك شهر ${period} (${depRecords.length} أصل)`,
          createdBy: req.auth!.userId,
          lines,
        });
        await tx.insert(assetDepreciationEntriesTable).values(
          depRecords.map((r) => ({
            companyId,
            assetId: r.assetId,
            period,
            amount: String(r.amount),
            journalEntryId: entry.id,
          })),
        );
        return entry;
      });

      res.json({
        period,
        assetsDepreciated: depRecords.length,
        totalAmount,
        journalEntryId: result.id,
        journalEntryNo: result.entryNo,
        skipped,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to run depreciation");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Excel export / import -------------------------------------------------

// Streams all of the company's fixed assets as an .xlsx workbook (round-trips
// the import format; accumulatedDepreciation/netBookValue are informational).
router.get(
  "/assets/export",
  requireAuth,
  requireCapability("assets:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    try {
      const rows = await db
        .select()
        .from(fixedAssetsTable)
        .where(eq(fixedAssetsTable.companyId, companyId))
        .orderBy(asc(fixedAssetsTable.createdAt));
      const accMap = await accumulatedByAsset(
        rows.map((r) => r.id),
        companyId,
      );
      const accounts = await db
        .select({ id: accountsTable.id, code: accountsTable.code })
        .from(accountsTable)
        .where(eq(accountsTable.companyId, companyId));
      const codeById = new Map(accounts.map((a) => [a.id, a.code]));
      await exportWorkbook(res, {
        sheetName: "Assets",
        fileName: "assets-export",
        columns: [
          { header: "nameAr", value: (r) => r.nameAr },
          { header: "nameEn", value: (r) => r.nameEn ?? "" },
          { header: "category", value: (r) => r.category ?? "" },
          { header: "acquisitionDate", value: (r) => r.acquisitionDate },
          { header: "cost", value: (r) => Number(r.cost) },
          { header: "salvageValue", value: (r) => Number(r.salvageValue) },
          { header: "usefulLifeMonths", value: (r) => r.usefulLifeMonths },
          { header: "method", value: (r) => r.method },
          { header: "status", value: (r) => r.status },
          {
            header: "assetAccountCode",
            value: (r) => codeById.get(r.assetAccountId) ?? "",
          },
          {
            header: "accumulatedAccountCode",
            value: (r) => codeById.get(r.accumulatedAccountId) ?? "",
          },
          {
            header: "expenseAccountCode",
            value: (r) => codeById.get(r.expenseAccountId) ?? "",
          },
          { header: "costCenterId", value: (r) => r.costCenterId ?? "" },
          { header: "projectId", value: (r) => r.projectId ?? "" },
          { header: "branchId", value: (r) => r.branchId ?? "" },
          {
            header: "accumulatedDepreciation",
            value: (r) => round2(accMap.get(r.id) ?? 0),
          },
          {
            header: "netBookValue",
            value: (r) => round2(Number(r.cost) - (accMap.get(r.id) ?? 0)),
          },
        ],
        rows,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to export fixed assets");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// Bulk-creates fixed assets from an .xlsx (round-trips the export format). Each
// row's account columns are resolved by code (must be leaf accounts in the same
// company). All-or-nothing: any invalid row aborts the whole import.
router.post(
  "/assets/import",
  requireAuth,
  requireCapability("assets:create"),
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
      if (!sheet.has("nameAr") || !sheet.has("assetAccountCode")) {
        res.status(400).json({
          error:
            "صيغة الملف غير صحيحة. الأعمدة المطلوبة: nameAr, acquisitionDate, cost, usefulLifeMonths, assetAccountCode, accumulatedAccountCode, expenseAccountCode",
        });
        return;
      }

      // Resolve account codes → leaf accounts in this company.
      const accounts = await db
        .select({
          id: accountsTable.id,
          code: accountsTable.code,
          isGroup: accountsTable.isGroup,
        })
        .from(accountsTable)
        .where(eq(accountsTable.companyId, companyId));
      const accByCode = new Map(accounts.map((a) => [a.code, a]));

      const resolveAccount = (
        rowNo: number,
        code: string,
        label: string,
      ): string => {
        const acc = accByCode.get(code);
        if (!acc) {
          throw new ImportRowError(
            `السطر ${rowNo}: الحساب ${label} (${code}) غير موجود`,
          );
        }
        if (acc.isGroup) {
          throw new ImportRowError(
            `السطر ${rowNo}: الحساب ${label} (${code}) حساب رئيسي ولا يقبل الترحيل`,
          );
        }
        return acc.id;
      };

      type Row = {
        nameAr: string;
        nameEn: string | null;
        category: string | null;
        acquisitionDate: string;
        cost: number;
        salvageValue: number;
        usefulLifeMonths: number;
        method: string;
        status: string;
        assetAccountId: string;
        accumulatedAccountId: string;
        expenseAccountId: string;
        costCenterId: string | null;
        projectId: string | null;
        branchId: string | null;
      };
      const parsed: Row[] = [];
      for (const { rowNo, row } of sheet.rows) {
        const nameAr = sheet.str(row, "nameAr");
        const acquisitionDate = sheet.str(row, "acquisitionDate");
        const costStr = sheet.str(row, "cost");
        const assetCode = sheet.str(row, "assetAccountCode");
        // Skip fully-blank rows.
        if (!nameAr && !acquisitionDate && !costStr && !assetCode) continue;
        if (!nameAr) {
          res.status(400).json({ error: `السطر ${rowNo}: nameAr مطلوب` });
          return;
        }
        if (!acquisitionDate) {
          res
            .status(400)
            .json({ error: `السطر ${rowNo}: acquisitionDate مطلوب` });
          return;
        }
        const cost = sheet.num(row, "cost");
        if (!(cost > 0)) {
          res
            .status(400)
            .json({ error: `السطر ${rowNo}: التكلفة يجب أن تكون أكبر من صفر` });
          return;
        }
        const usefulLifeMonths = sheet.num(row, "usefulLifeMonths");
        if (!Number.isInteger(usefulLifeMonths) || usefulLifeMonths <= 0) {
          res.status(400).json({
            error: `السطر ${rowNo}: العمر الإنتاجي (بالأشهر) يجب أن يكون عددًا صحيحًا موجبًا`,
          });
          return;
        }
        const salvageStr = sheet.has("salvageValue")
          ? sheet.str(row, "salvageValue")
          : "";
        const salvageValue = salvageStr ? sheet.num(row, "salvageValue") : 0;
        if (salvageValue < 0) {
          res
            .status(400)
            .json({ error: `السطر ${rowNo}: قيمة الخردة غير صحيحة` });
          return;
        }
        if (salvageValue >= cost) {
          res.status(400).json({
            error: `السطر ${rowNo}: قيمة الخردة يجب أن تكون أقل من التكلفة`,
          });
          return;
        }
        const methodRaw = sheet.has("method") ? sheet.str(row, "method") : "";
        if (methodRaw && methodRaw !== "straight_line") {
          res.status(400).json({
            error: `السطر ${rowNo}: طريقة الإهلاك ${methodRaw} غير مدعومة`,
          });
          return;
        }
        const statusRaw = sheet.has("status") ? sheet.str(row, "status") : "";
        const status = statusRaw === "disposed" ? "disposed" : "active";
        const accumulatedCode = sheet.str(row, "accumulatedAccountCode");
        const expenseCode = sheet.str(row, "expenseAccountCode");
        if (!accumulatedCode || !expenseCode || !assetCode) {
          res.status(400).json({
            error: `السطر ${rowNo}: أكواد الحسابات (assetAccountCode, accumulatedAccountCode, expenseAccountCode) مطلوبة`,
          });
          return;
        }
        try {
          parsed.push({
            nameAr,
            nameEn: sheet.str(row, "nameEn") || null,
            category: sheet.str(row, "category") || null,
            acquisitionDate,
            cost,
            salvageValue,
            usefulLifeMonths,
            method: "straight_line",
            status,
            assetAccountId: resolveAccount(rowNo, assetCode, "الأصل"),
            accumulatedAccountId: resolveAccount(
              rowNo,
              accumulatedCode,
              "مجمع الإهلاك",
            ),
            expenseAccountId: resolveAccount(rowNo, expenseCode, "المصروف"),
            costCenterId: sheet.has("costCenterId")
              ? sheet.str(row, "costCenterId") || null
              : null,
            projectId: sheet.has("projectId")
              ? sheet.str(row, "projectId") || null
              : null,
            branchId: sheet.has("branchId")
              ? sheet.str(row, "branchId") || null
              : null,
          });
        } catch (e) {
          if (e instanceof ImportRowError) {
            res.status(400).json({ error: e.message });
            return;
          }
          throw e;
        }
      }
      if (parsed.length === 0) {
        res.status(400).json({ error: "الملف لا يحتوي على أصول" });
        return;
      }

      await db.transaction(async (tx) => {
        for (const r of parsed) {
          const dimErr = await validateDimensions(
            {
              costCenterId: r.costCenterId,
              projectId: r.projectId,
              branchId: r.branchId,
            },
            companyId,
          );
          if (dimErr) {
            throw new ImportRowError(dimErr);
          }
          await tx.insert(fixedAssetsTable).values({
            companyId,
            nameAr: r.nameAr,
            nameEn: r.nameEn,
            category: r.category,
            acquisitionDate: r.acquisitionDate,
            cost: String(r.cost),
            salvageValue: String(r.salvageValue),
            usefulLifeMonths: r.usefulLifeMonths,
            method: r.method,
            status: r.status,
            assetAccountId: r.assetAccountId,
            accumulatedAccountId: r.accumulatedAccountId,
            expenseAccountId: r.expenseAccountId,
            costCenterId: r.costCenterId,
            projectId: r.projectId,
            branchId: r.branchId,
          });
        }
      });
      res.json({ imported: parsed.length });
    } catch (err) {
      if (err instanceof ImportRowError) {
        res.status(400).json({ error: err.message });
        return;
      }
      req.log.error({ err }, "Failed to import fixed assets");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
