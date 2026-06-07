import { Router } from "express";
import { and, eq, asc, inArray, sql } from "drizzle-orm";
import {
  db,
  fixedAssetsTable,
  assetDepreciationEntriesTable,
  accountsTable,
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

const router = Router();

const round2 = (n: number) => Math.round(n * 100) / 100;
const EPS = 0.005;

function toAsset(row: FixedAsset, accumulated: number) {
  const cost = Number(row.cost);
  const acc = round2(accumulated);
  return {
    id: row.id,
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
      const [row] = await db
        .insert(fixedAssetsTable)
        .values({
          companyId,
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
        })
        .returning();
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

export default router;
