import { Router } from "express";
import { and, eq, asc } from "drizzle-orm";
import { db, currenciesTable, companiesTable, type Currency } from "@workspace/db";
import { CreateCurrencyBody, UpdateCurrencyBody } from "@workspace/api-zod";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import {
  exportWorkbook,
  handleXlsxUpload,
  parseSheet,
} from "../lib/excel";
import { recordDatedRate, getRateForDate } from "../lib/currency";

const router = Router();

const RATE_SOURCE_URL = "https://open.er-api.com/v6/latest";

// Today's date in YYYY-MM-DD (server local), used to stamp dated rate rows.
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Loads the company base currency (defaults to EGP).
async function loadBase(companyId: string): Promise<string> {
  const [company] = await db
    .select({ baseCurrency: companiesTable.baseCurrency })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);
  return (company?.baseCurrency || "EGP").toUpperCase();
}

function toCurrency(row: Currency) {
  return {
    id: row.id,
    code: row.code,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    exchangeRate: Number(row.exchangeRate),
    isActive: row.isActive,
    rateUpdatedAt: row.rateUpdatedAt ? row.rateUpdatedAt.toISOString() : null,
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
      const code = parsed.data.code.trim().toUpperCase();
      const [row] = await db
        .insert(currenciesTable)
        .values({
          companyId: req.auth!.companyId,
          code,
          nameAr: parsed.data.nameAr,
          nameEn: parsed.data.nameEn ?? null,
          exchangeRate: String(parsed.data.exchangeRate),
          isActive: parsed.data.isActive ?? true,
        })
        .returning();
      const base = await loadBase(req.auth!.companyId);
      await recordDatedRate(
        db,
        req.auth!.companyId,
        code,
        today(),
        parsed.data.exchangeRate,
        "manual",
        base,
        req.auth!.userId,
      );
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

router.post(
  "/currencies/refresh-rates",
  requireAuth,
  requireCapability("currencies:update"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    try {
      const [company] = await db
        .select({ baseCurrency: companiesTable.baseCurrency })
        .from(companiesTable)
        .where(eq(companiesTable.id, companyId));
      const base = (company?.baseCurrency || "EGP").toUpperCase();

      const rows = await db
        .select()
        .from(currenciesTable)
        .where(eq(currenciesTable.companyId, companyId));
      if (rows.length === 0) {
        res.json({ updated: 0, skipped: [], ratesAsOf: null });
        return;
      }

      let payload: {
        result?: string;
        rates?: Record<string, number>;
        time_last_update_utc?: string;
      };
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
          const resp = await fetch(
            `${RATE_SOURCE_URL}/${encodeURIComponent(base)}`,
            { signal: controller.signal },
          );
          if (!resp.ok) {
            res
              .status(502)
              .json({ error: "تعذّر جلب أسعار الصرف من المصدر الخارجي" });
            return;
          }
          payload = (await resp.json()) as typeof payload;
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        req.log.error({ err }, "Failed to fetch exchange rates");
        res.status(502).json({ error: "تعذّر الاتصال بمصدر أسعار الصرف" });
        return;
      }
      if (payload.result !== "success" || !payload.rates) {
        res.status(502).json({ error: "تعذّر جلب أسعار الصرف من المصدر الخارجي" });
        return;
      }

      const rates = payload.rates;
      const now = new Date();
      const skipped: string[] = [];
      let updated = 0;
      await db.transaction(async (tx) => {
        for (const row of rows) {
          const perBase = rates[row.code.toUpperCase()];
          if (!perBase || perBase <= 0) {
            skipped.push(row.code);
            continue;
          }
          const rate = 1 / perBase;
          await tx
            .update(currenciesTable)
            .set({ exchangeRate: rate.toFixed(6), rateUpdatedAt: now })
            .where(
              and(
                eq(currenciesTable.id, row.id),
                eq(currenciesTable.companyId, companyId),
              ),
            );
          await recordDatedRate(
            tx,
            companyId,
            row.code.toUpperCase(),
            today(),
            Number(rate.toFixed(6)),
            "auto",
            base,
            req.auth!.userId,
          );
          updated++;
        }
      });

      res.json({
        updated,
        skipped,
        ratesAsOf: payload.time_last_update_utc ?? now.toISOString(),
      });
    } catch (err) {
      req.log.error({ err }, "Failed to refresh exchange rates");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// Returns the exchange rate (value of 1 unit of `code` in base) that applied on
// a given date — the newest dated row with rateDate <= date, else the current
// rate. Used to auto-suggest a rate by transaction date in the UI.
router.get(
  "/currencies/rate",
  requireAuth,
  requireCapability("currencies:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const code = String(req.query["code"] ?? "").trim().toUpperCase();
    const date = String(req.query["date"] ?? "").trim();
    if (!code || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    try {
      const base = await loadBase(companyId);
      const rate = await getRateForDate(db, companyId, code, date, base);
      if (rate === null) {
        res.status(404).json({ error: "العملة غير موجودة" });
        return;
      }
      res.json({ code, date, rate, baseCurrency: base });
    } catch (err) {
      req.log.error({ err }, "Failed to look up dated rate");
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
      if (parsed.data.exchangeRate !== undefined) {
        const base = await loadBase(req.auth!.companyId);
        await recordDatedRate(
          db,
          req.auth!.companyId,
          row.code.toUpperCase(),
          today(),
          parsed.data.exchangeRate,
          "manual",
          base,
          req.auth!.userId,
        );
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

// ---- Excel export / import -------------------------------------------------

// Streams all of the company's currencies as an .xlsx workbook (round-trips the
// import format).
router.get(
  "/currencies/export",
  requireAuth,
  requireCapability("currencies:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    try {
      const rows = await db
        .select()
        .from(currenciesTable)
        .where(eq(currenciesTable.companyId, companyId))
        .orderBy(asc(currenciesTable.code));
      await exportWorkbook(res, {
        sheetName: "Currencies",
        fileName: "currencies-export",
        columns: [
          { header: "code", value: (r) => r.code },
          { header: "nameAr", value: (r) => r.nameAr },
          { header: "nameEn", value: (r) => r.nameEn ?? "" },
          { header: "exchangeRate", value: (r) => Number(r.exchangeRate) },
          { header: "isActive", value: (r) => (r.isActive ? "true" : "false") },
        ],
        rows,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to export currencies");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// Bulk-creates currencies from an .xlsx (round-trips the export format). All-or-
// nothing: any invalid row aborts the whole import.
router.post(
  "/currencies/import",
  requireAuth,
  requireCapability("currencies:create"),
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
      if (!sheet.has("code") || !sheet.has("nameAr") || !sheet.has("exchangeRate")) {
        res.status(400).json({
          error: "صيغة الملف غير صحيحة. الأعمدة المطلوبة: code, nameAr, exchangeRate",
        });
        return;
      }

      const existing = await db
        .select({ code: currenciesTable.code })
        .from(currenciesTable)
        .where(eq(currenciesTable.companyId, companyId));
      const existingCodes = new Set(existing.map((e) => e.code));

      type Row = {
        code: string;
        nameAr: string;
        nameEn: string | null;
        exchangeRate: number;
        isActive: boolean;
      };
      const parsed: Row[] = [];
      const seen = new Set<string>();
      for (const { rowNo, row } of sheet.rows) {
        const codeRaw = sheet.str(row, "code");
        const nameAr = sheet.str(row, "nameAr");
        const rateRaw = sheet.str(row, "exchangeRate");
        if (!codeRaw && !nameAr && !rateRaw) continue; // skip blank rows
        const code = codeRaw.trim().toUpperCase();
        if (!code || !nameAr) {
          res.status(400).json({ error: `السطر ${rowNo}: code و nameAr مطلوبان` });
          return;
        }
        if (seen.has(code) || existingCodes.has(code)) {
          res.status(400).json({ error: `السطر ${rowNo}: رمز العملة ${code} مكرر` });
          return;
        }
        if (!rateRaw) {
          res.status(400).json({ error: `السطر ${rowNo}: exchangeRate مطلوب` });
          return;
        }
        const exchangeRate = sheet.num(row, "exchangeRate");
        if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
          res.status(400).json({ error: `السطر ${rowNo}: exchangeRate غير صحيح` });
          return;
        }
        const activeStr = sheet.str(row, "isActive").toLowerCase();
        seen.add(code);
        parsed.push({
          code,
          nameAr,
          nameEn: sheet.str(row, "nameEn") || null,
          exchangeRate,
          isActive: activeStr === "" ? true : activeStr !== "false" && activeStr !== "0",
        });
      }
      if (parsed.length === 0) {
        res.status(400).json({ error: "الملف لا يحتوي على عملات" });
        return;
      }

      await db.transaction(async (tx) => {
        for (const r of parsed) {
          await tx.insert(currenciesTable).values({
            companyId,
            code: r.code,
            nameAr: r.nameAr,
            nameEn: r.nameEn,
            exchangeRate: String(r.exchangeRate),
            isActive: r.isActive,
          });
        }
      });
      res.json({ imported: parsed.length });
    } catch (err: unknown) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code?: string }).code === "23505"
      ) {
        res.status(409).json({ error: "يوجد رمز عملة مكرر في الملف" });
        return;
      }
      req.log.error({ err }, "Failed to import currencies");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
