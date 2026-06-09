import { Router } from "express";
import { and, eq, lte, desc, sql } from "drizzle-orm";
import {
  db,
  revaluationsTable,
  journalEntriesTable,
  journalEntryLinesTable,
  accountsTable,
  companiesTable,
  type Revaluation,
} from "@workspace/db";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import { safeAudit } from "../lib/audit";
import { allocateEntryNo } from "../lib/journal-posting";
import { isPeriodClosed } from "../lib/fiscal-year";
import { getRateForDate } from "../lib/currency";
import { ensureFxAccounts } from "../lib/seed-accounts";
import { exportWorkbook } from "../lib/excel";

const router = Router();

const MONEY_EPS = 0.005;
const round2 = (n: number) => Math.round(n * 100) / 100;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toRevaluation(row: Revaluation) {
  return {
    id: row.id,
    asOfDate: row.asOfDate,
    journalEntryId: row.journalEntryId,
    totalGain: Number(row.totalGain),
    totalLoss: Number(row.totalLoss),
    linesCount: row.linesCount,
    createdAt: row.createdAt.toISOString(),
  };
}

// Lists previous revaluation runs (newest first).
router.get(
  "/revaluations",
  requireAuth,
  requireCapability("revaluation:read"),
  async (req, res) => {
    try {
      const rows = await db
        .select()
        .from(revaluationsTable)
        .where(eq(revaluationsTable.companyId, req.auth!.companyId))
        .orderBy(desc(revaluationsTable.asOfDate));
      res.json(rows.map((r) => toRevaluation(r as Revaluation)));
    } catch (err) {
      req.log.error({ err }, "Failed to list revaluations");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// Previews the unrealized FX gain/loss per foreign-currency account+currency as
// of a date WITHOUT posting anything. Used to show the user what a run will do.
router.get(
  "/revaluations/preview",
  requireAuth,
  requireCapability("revaluation:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const asOfDate = String(req.query["asOfDate"] ?? "").trim();
    if (!DATE_RE.test(asOfDate)) {
      res.status(400).json({ error: "تاريخ غير صحيح" });
      return;
    }
    try {
      const base = await loadBase(companyId);
      const result = await computeRevaluation(companyId, asOfDate, base);
      res.json({
        asOfDate,
        baseCurrency: base,
        lines: result.preview,
        totalGain: result.totalGain,
        totalLoss: result.totalLoss,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to preview revaluation");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// Excel export of the as-of revaluation preview (same data as the preview GET).
router.get(
  "/revaluations/preview/export",
  requireAuth,
  requireCapability("revaluation:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const asOfDate = String(req.query["asOfDate"] ?? "").trim();
    if (!DATE_RE.test(asOfDate)) {
      res.status(400).json({ error: "تاريخ غير صحيح" });
      return;
    }
    try {
      const base = await loadBase(companyId);
      const result = await computeRevaluation(companyId, asOfDate, base);
      await exportWorkbook(res, {
        sheetName: "Revaluation",
        fileName: `revaluation-${asOfDate}`,
        columns: [
          { header: "كود الحساب", value: (x: RevalLine) => x.accountCode, width: 14 },
          { header: "الحساب", value: (x: RevalLine) => x.accountName, width: 28 },
          { header: "العملة", value: (x: RevalLine) => x.currency, width: 10 },
          { header: "الرصيد بالعملة الأجنبية", value: (x: RevalLine) => x.foreignBalance, width: 20 },
          { header: "القيمة الدفترية", value: (x: RevalLine) => x.baseBook, width: 16 },
          { header: "سعر الصرف", value: (x: RevalLine) => x.rate, width: 12 },
          { header: "القيمة بعد التقييم", value: (x: RevalLine) => x.revaluedBase, width: 18 },
          { header: "ربح/خسارة غير محققة", value: (x: RevalLine) => x.unrealized, width: 20 },
        ],
        rows: result.preview,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to export revaluation preview");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// Runs a revaluation as of a date: revalues every foreign-currency account's base
// book to the period-end rate and posts ONE balanced journal entry of the
// unrealized gain/loss to the FX gain/loss accounts. Idempotent per date.
router.post(
  "/revaluations/run",
  requireAuth,
  requireCapability("revaluation:run"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const asOfDate = String(
      (req.body as { asOfDate?: unknown })?.asOfDate ?? "",
    ).trim();
    if (!DATE_RE.test(asOfDate)) {
      res.status(400).json({ error: "تاريخ غير صحيح" });
      return;
    }
    try {
      // Idempotency guard: a period may only be revalued once.
      const [existing] = await db
        .select({ id: revaluationsTable.id })
        .from(revaluationsTable)
        .where(
          and(
            eq(revaluationsTable.companyId, companyId),
            eq(revaluationsTable.asOfDate, asOfDate),
          ),
        )
        .limit(1);
      if (existing) {
        res.status(409).json({ error: "تمت إعادة التقييم لهذا التاريخ من قبل" });
        return;
      }
      if (await isPeriodClosed(db, companyId, asOfDate)) {
        res
          .status(400)
          .json({ error: "لا يمكن إعادة التقييم داخل سنة مالية مقفلة" });
        return;
      }

      const base = await loadBase(companyId);
      const computed = await computeRevaluation(companyId, asOfDate, base);

      const created = await db.transaction(async (tx) => {
        let journalEntryId: string | null = null;
        if (computed.lines.length > 0) {
          const netFx = round2(
            computed.lines.reduce((s, l) => s + l.unrealized, 0),
          );
          const { gainAccountId, lossAccountId } = await ensureFxAccounts(
            tx,
            companyId,
          );
          const entryNo = await allocateEntryNo(tx, companyId, asOfDate);
          const [entry] = await tx
            .insert(journalEntriesTable)
            .values({
              companyId,
              entryNo,
              date: asOfDate,
              reference: `إعادة تقييم العملات حتى ${asOfDate}`,
              notes: null,
              status: "posted",
              postedAt: new Date(),
              createdBy: req.auth!.userId,
            })
            .returning();

          // Account adjustment lines carry the foreign currency + period-end rate
          // but ZERO foreign amount: revaluation changes only the base book, never
          // the foreign balance. So debit/credit (foreign) = 0 while
          // debitBase/creditBase = the unrealized adjustment. Including these in
          // future base-book sums (grouped by account+currency) is what makes the
          // next period's run incremental rather than double-counting.
          const lineValues = computed.lines.map((l, i) => {
            const dr = l.unrealized > 0 ? l.unrealized : 0;
            const cr = l.unrealized < 0 ? -l.unrealized : 0;
            return {
              entryId: entry!.id,
              companyId,
              lineNo: i + 1,
              accountId: l.accountId,
              description: `إعادة تقييم ${l.currency}`,
              currency: l.currency,
              exchangeRate: String(l.rate),
              debit: "0",
              credit: "0",
              debitBase: String(dr),
              creditBase: String(cr),
            };
          });
          // Net FX offset line keeps the entry balanced.
          if (Math.abs(netFx) > MONEY_EPS) {
            lineValues.push({
              entryId: entry!.id,
              companyId,
              lineNo: lineValues.length + 1,
              accountId: netFx > 0 ? gainAccountId : lossAccountId,
              description:
                netFx > 0 ? "أرباح فروق العملة" : "خسائر فروق العملة",
              currency: base,
              exchangeRate: "1",
              debit: "0",
              credit: "0",
              debitBase: String(netFx > 0 ? 0 : -netFx),
              creditBase: String(netFx > 0 ? netFx : 0),
            });
          }
          await tx.insert(journalEntryLinesTable).values(lineValues);
          journalEntryId = entry!.id;
        }

        const [run] = await tx
          .insert(revaluationsTable)
          .values({
            companyId,
            asOfDate,
            journalEntryId,
            totalGain: String(computed.totalGain),
            totalLoss: String(computed.totalLoss),
            linesCount: computed.lines.length,
            createdBy: req.auth!.userId,
          })
          .returning();
        return run!;
      });

      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "create",
          entity: "revaluation",
          entityId: created.id,
          entityLabel: `إعادة تقييم العملات حتى ${asOfDate}`,
          newValue: {
            asOfDate,
            totalGain: computed.totalGain,
            totalLoss: computed.totalLoss,
          },
        },
        req.log,
      );
      res.status(201).json(toRevaluation(created as Revaluation));
    } catch (err) {
      // Concurrent runs for the same date race past the precheck and collide on
      // the unique(companyId, asOfDate) index — map that to the idempotent 409.
      if ((err as { code?: string })?.code === "23505") {
        res.status(409).json({ error: "تمت إعادة التقييم لهذا التاريخ من قبل" });
        return;
      }
      req.log.error({ err }, "Failed to run revaluation");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// Loads the company base currency (defaults to EGP).
async function loadBase(companyId: string): Promise<string> {
  const [company] = await db
    .select({ baseCurrency: companiesTable.baseCurrency })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);
  return (company?.baseCurrency || "EGP").toUpperCase();
}

type RevalLine = {
  accountId: string;
  accountCode: string;
  accountName: string;
  currency: string;
  foreignBalance: number;
  baseBook: number;
  rate: number;
  revaluedBase: number;
  unrealized: number;
};

// Computes the unrealized FX adjustment per (account, currency) group from POSTED
// journal lines up to `asOfDate`. Only foreign-currency lines on accounts whose
// currencyType is 'fixed' or 'multi' are considered. `unrealized` is signed so a
// positive value raises the account's debit balance (gain for assets); the JE
// builder turns it into the correct Dr/Cr.
async function computeRevaluation(
  companyId: string,
  asOfDate: string,
  base: string,
): Promise<{
  lines: RevalLine[];
  preview: RevalLine[];
  totalGain: number;
  totalLoss: number;
}> {
  const rows = await db
    .select({
      accountId: journalEntryLinesTable.accountId,
      accountCode: accountsTable.code,
      accountName: accountsTable.nameAr,
      currency: journalEntryLinesTable.currency,
      foreign: sql<string>`coalesce(sum(${journalEntryLinesTable.debit} - ${journalEntryLinesTable.credit}), 0)`,
      baseBook: sql<string>`coalesce(sum(${journalEntryLinesTable.debitBase} - ${journalEntryLinesTable.creditBase}), 0)`,
    })
    .from(journalEntryLinesTable)
    .innerJoin(
      journalEntriesTable,
      eq(journalEntriesTable.id, journalEntryLinesTable.entryId),
    )
    .innerJoin(
      accountsTable,
      eq(accountsTable.id, journalEntryLinesTable.accountId),
    )
    .where(
      and(
        eq(journalEntryLinesTable.companyId, companyId),
        eq(journalEntriesTable.status, "posted"),
        lte(journalEntriesTable.date, asOfDate),
        sql`${accountsTable.currencyType} in ('fixed', 'multi')`,
        sql`${journalEntryLinesTable.currency} <> ${base}`,
      ),
    )
    .groupBy(
      journalEntryLinesTable.accountId,
      accountsTable.code,
      accountsTable.nameAr,
      journalEntryLinesTable.currency,
    );

  const lines: RevalLine[] = [];
  const preview: RevalLine[] = [];
  let totalGain = 0;
  let totalLoss = 0;
  for (const r of rows) {
    const foreignBalance = round2(Number(r.foreign));
    const baseBook = round2(Number(r.baseBook));
    const rate =
      (await getRateForDate(db, companyId, r.currency, asOfDate, base)) ?? 0;
    const revaluedBase = round2(foreignBalance * rate);
    const unrealized = round2(revaluedBase - baseBook);
    const line: RevalLine = {
      accountId: r.accountId,
      accountCode: r.accountCode,
      accountName: r.accountName,
      currency: r.currency,
      foreignBalance,
      baseBook,
      rate,
      revaluedBase,
      unrealized,
    };
    preview.push(line);
    if (Math.abs(unrealized) > MONEY_EPS && rate > 0) {
      lines.push(line);
      if (unrealized > 0) totalGain = round2(totalGain + unrealized);
      else totalLoss = round2(totalLoss - unrealized);
    }
  }
  return { lines, preview, totalGain, totalLoss };
}

export default router;
