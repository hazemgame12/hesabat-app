import { Router } from "express";
import { and, eq, sql, desc, lte, gte } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  fiscalYearsTable,
  journalEntriesTable,
  journalEntryLinesTable,
  accountsTable,
  companiesTable,
} from "@workspace/db";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import { createDraftJournalEntry } from "../lib/journal-posting";
import { safeAudit } from "../lib/audit";

const router = Router();

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const MONEY_EPS = 0.005;
const round2 = (n: number) => Math.round(n * 100) / 100;

// Retained earnings (carry-forward) equity account, created on demand under the
// equity parent group (code "31"), mirroring the opening-balance equity helper.
const RETAINED_EARNINGS_CODE = "319";
const EQUITY_PARENT_CODE = "31";

async function findOrCreateRetainedEarnings(
  tx: Tx,
  companyId: string,
): Promise<string> {
  const [existing] = await tx
    .select({
      id: accountsTable.id,
      type: accountsTable.type,
      isGroup: accountsTable.isGroup,
    })
    .from(accountsTable)
    .where(
      and(
        eq(accountsTable.companyId, companyId),
        eq(accountsTable.code, RETAINED_EARNINGS_CODE),
      ),
    )
    .limit(1);
  if (existing) {
    // The carry-forward target must be a postable equity leaf. If code "319" is
    // already used for something else (a group, or a non-equity account), fail
    // loudly rather than posting the year's net result to the wrong account.
    if (existing.isGroup || existing.type !== "equity") {
      throw new Error("RETAINED_EARNINGS_INVALID");
    }
    return existing.id;
  }

  const [parent] = await tx
    .select({ id: accountsTable.id })
    .from(accountsTable)
    .where(
      and(
        eq(accountsTable.companyId, companyId),
        eq(accountsTable.code, EQUITY_PARENT_CODE),
      ),
    )
    .limit(1);

  const [created] = await tx
    .insert(accountsTable)
    .values({
      companyId,
      code: RETAINED_EARNINGS_CODE,
      nameAr: "أرباح (خسائر) مرحّلة",
      nameEn: "Retained Earnings",
      type: "equity",
      isGroup: false,
      parentId: parent?.id ?? null,
    })
    .returning({ id: accountsTable.id });
  return created!.id;
}

function formatEntryNumber(entryNo: number, date: string): string {
  const year = date.slice(0, 4);
  return `JV-${year}-${String(entryNo).padStart(6, "0")}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const CreateBody = z.object({
  name: z.string().trim().min(1).max(120),
  startDate: z.string().regex(DATE_RE),
  endDate: z.string().regex(DATE_RE),
});

// ---- List ------------------------------------------------------------------
router.get(
  "/fiscal-years",
  requireAuth,
  requireCapability("fiscalyear:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    try {
      const rows = await db
        .select({
          id: fiscalYearsTable.id,
          name: fiscalYearsTable.name,
          startDate: fiscalYearsTable.startDate,
          endDate: fiscalYearsTable.endDate,
          status: fiscalYearsTable.status,
          closingEntryId: fiscalYearsTable.closingEntryId,
          closedAt: fiscalYearsTable.closedAt,
          closingEntryNo: journalEntriesTable.entryNo,
          closingEntryDate: journalEntriesTable.date,
        })
        .from(fiscalYearsTable)
        .leftJoin(
          journalEntriesTable,
          eq(journalEntriesTable.id, fiscalYearsTable.closingEntryId),
        )
        .where(eq(fiscalYearsTable.companyId, companyId))
        .orderBy(desc(fiscalYearsTable.startDate));
      res.json(
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          startDate: r.startDate,
          endDate: r.endDate,
          status: r.status,
          closingEntryId: r.closingEntryId,
          closingEntryNumber:
            r.closingEntryNo != null && r.closingEntryDate != null
              ? formatEntryNumber(r.closingEntryNo, r.closingEntryDate)
              : null,
          closedAt:
            r.closedAt instanceof Date ? r.closedAt.toISOString() : r.closedAt,
        })),
      );
    } catch (err) {
      req.log.error({ err }, "Failed to list fiscal years");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Create ----------------------------------------------------------------
router.post(
  "/fiscal-years",
  requireAuth,
  requireCapability("fiscalyear:manage"),
  async (req, res) => {
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const { name, startDate, endDate } = parsed.data;
    if (startDate >= endDate) {
      res
        .status(400)
        .json({ error: "تاريخ البداية يجب أن يكون قبل تاريخ النهاية" });
      return;
    }
    try {
      // Reject any overlap with an existing year: start <= newEnd AND end >= newStart.
      const [overlap] = await db
        .select({ id: fiscalYearsTable.id })
        .from(fiscalYearsTable)
        .where(
          and(
            eq(fiscalYearsTable.companyId, companyId),
            lte(fiscalYearsTable.startDate, endDate),
            gte(fiscalYearsTable.endDate, startDate),
          ),
        )
        .limit(1);
      if (overlap) {
        res
          .status(400)
          .json({ error: "الفترة متداخلة مع سنة مالية موجودة بالفعل" });
        return;
      }
      const [row] = await db
        .insert(fiscalYearsTable)
        .values({ companyId, name, startDate, endDate })
        .returning();
      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "create",
          entity: "fiscal_year",
          entityId: row!.id,
          newValue: { name, startDate, endDate },
        },
        req.log,
      );
      res.status(201).json({
        id: row!.id,
        name: row!.name,
        startDate: row!.startDate,
        endDate: row!.endDate,
        status: row!.status,
        closingEntryId: null,
        closingEntryNumber: null,
        closedAt: null,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to create fiscal year");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Close (year-end carry-forward) ----------------------------------------
// Closing a year locks its period and posts a closing entry that zeroes the
// revenue/expense accounts (cumulative up to endDate) into retained earnings.
// Because reports are cumulative-from-genesis, this consolidates the period's
// net profit/loss into equity WITHOUT double-counting (an opening entry in the
// next year would double-count). Subsequent closes only consolidate their own
// incremental P&L, since prior closing entries already zeroed earlier activity.
router.post(
  "/fiscal-years/:id/close",
  requireAuth,
  requireCapability("fiscalyear:manage"),
  async (req, res) => {
    const id = req.params["id"] as string;
    const companyId = req.auth!.companyId;
    try {
      const result = await db.transaction(async (tx) => {
        // Lock the fiscal-year row to serialize concurrent close requests and
        // re-read status under the lock (avoids a TOCTOU that could post two
        // closing entries / corrupt retained earnings).
        const [year] = await tx
          .select()
          .from(fiscalYearsTable)
          .where(
            and(
              eq(fiscalYearsTable.id, id),
              eq(fiscalYearsTable.companyId, companyId),
            ),
          )
          .for("update")
          .limit(1);
        if (!year) return { kind: "not_found" as const };
        if (year.status !== "open") return { kind: "already_closed" as const };

        const [company] = await tx
          .select({ baseCurrency: companiesTable.baseCurrency })
          .from(companiesTable)
          .where(eq(companiesTable.id, companyId))
          .limit(1);
        const baseCurrency = company?.baseCurrency ?? "EGP";

        // Cumulative posted revenue/expense per leaf account up to the year end.
        const totals = await tx
          .select({
            accountId: journalEntryLinesTable.accountId,
            type: accountsTable.type,
            debit: sql<string>`sum(${journalEntryLinesTable.debitBase})`,
            credit: sql<string>`sum(${journalEntryLinesTable.creditBase})`,
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
              eq(journalEntriesTable.companyId, companyId),
              eq(journalEntriesTable.status, "posted"),
              lte(journalEntriesTable.date, year.endDate),
              eq(accountsTable.isGroup, false),
              sql`${accountsTable.type} in ('revenue','expense')`,
            ),
          )
          .groupBy(journalEntryLinesTable.accountId, accountsTable.type);

        const closingLines: {
          accountId: string;
          debit: number;
          credit: number;
        }[] = [];
        let netDebit = 0;
        let netCredit = 0;
        for (const t of totals) {
          const d = Number(t.debit) || 0;
          const c = Number(t.credit) || 0;
          // Reverse each P&L account's net balance to bring it to zero.
          // Revenue: net credit (c - d) -> debit it. Expense: net debit (d - c) -> credit it.
          const amount = round2(t.type === "revenue" ? c - d : d - c);
          if (Math.abs(amount) < MONEY_EPS) continue;
          if (t.type === "revenue") {
            // amount = net credit balance; close by debiting
            if (amount >= 0) {
              closingLines.push({ accountId: t.accountId, debit: amount, credit: 0 });
              netDebit = round2(netDebit + amount);
            } else {
              closingLines.push({ accountId: t.accountId, debit: 0, credit: -amount });
              netCredit = round2(netCredit + -amount);
            }
          } else {
            // expense: amount = net debit balance; close by crediting
            if (amount >= 0) {
              closingLines.push({ accountId: t.accountId, debit: 0, credit: amount });
              netCredit = round2(netCredit + amount);
            } else {
              closingLines.push({ accountId: t.accountId, debit: -amount, credit: 0 });
              netDebit = round2(netDebit + -amount);
            }
          }
        }

        let closingEntryId: string | null = null;
        if (closingLines.length > 0) {
          const reId = await findOrCreateRetainedEarnings(tx, companyId);
          const diff = round2(netDebit - netCredit);
          // Balancing retained-earnings line: profit (diff>0) -> credit equity;
          // loss (diff<0) -> debit equity.
          if (Math.abs(diff) >= MONEY_EPS) {
            if (diff > 0) {
              closingLines.push({ accountId: reId, debit: 0, credit: diff });
            } else {
              closingLines.push({ accountId: reId, debit: -diff, credit: 0 });
            }
          }
          const entry = await createDraftJournalEntry(tx, {
            companyId,
            baseCurrency,
            date: year.endDate,
            reference: `إقفال السنة المالية - ${year.name}`,
            notes: `قيد إقفال الإيرادات والمصروفات وترحيل صافي النتيجة للأرباح المرحّلة`,
            createdBy: req.auth!.userId,
            status: "posted",
            lines: closingLines,
          });
          closingEntryId = entry.id;
        }
        await tx
          .update(fiscalYearsTable)
          .set({
            status: "closed",
            closingEntryId,
            closedAt: new Date(),
            closedBy: req.auth!.userId,
          })
          .where(
            and(
              eq(fiscalYearsTable.id, id),
              eq(fiscalYearsTable.companyId, companyId),
              eq(fiscalYearsTable.status, "open"),
            ),
          );
        return { kind: "closed" as const, closingEntryId };
      });

      if (result.kind === "not_found") {
        res.status(404).json({ error: "السنة المالية غير موجودة" });
        return;
      }
      if (result.kind === "already_closed") {
        res.status(400).json({ error: "السنة المالية مقفلة بالفعل" });
        return;
      }

      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "close",
          entity: "fiscal_year",
          entityId: id,
          oldValue: { status: "open" },
          newValue: {
            status: "closed",
            closingEntryId: result.closingEntryId,
          },
        },
        req.log,
      );
      res.json({ status: "ok", closingEntryId: result.closingEntryId });
    } catch (err) {
      if (err instanceof Error && err.message === "RETAINED_EARNINGS_INVALID") {
        res.status(400).json({
          error:
            'الحساب رقم "319" مستخدم لغرض آخر؛ يجب أن يكون حساب حقوق ملكية فرعياً لترحيل الأرباح',
        });
        return;
      }
      req.log.error({ err }, "Failed to close fiscal year");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Reopen ----------------------------------------------------------------
// Reverses a close: deletes the closing entry (if any) and unlocks the period.
router.post(
  "/fiscal-years/:id/reopen",
  requireAuth,
  requireCapability("fiscalyear:manage"),
  async (req, res) => {
    const id = req.params["id"] as string;
    const companyId = req.auth!.companyId;
    try {
      const [year] = await db
        .select()
        .from(fiscalYearsTable)
        .where(
          and(
            eq(fiscalYearsTable.id, id),
            eq(fiscalYearsTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!year) {
        res.status(404).json({ error: "السنة المالية غير موجودة" });
        return;
      }
      if (year.status !== "closed") {
        res.status(400).json({ error: "السنة المالية مفتوحة بالفعل" });
        return;
      }
      // If the closing entry was reversed/adjusted, deleting just the original
      // would leave a dangling reversal that distorts the books. Require the
      // dependent entries be removed first.
      if (year.closingEntryId) {
        const [dependent] = await db
          .select({ id: journalEntriesTable.id })
          .from(journalEntriesTable)
          .where(
            and(
              eq(journalEntriesTable.companyId, companyId),
              eq(journalEntriesTable.reversedEntryId, year.closingEntryId),
            ),
          )
          .limit(1);
        if (dependent) {
          res.status(400).json({
            error:
              "لا يمكن إعادة الفتح لوجود قيد عكسي مرتبط بقيد الإقفال؛ احذف القيد العكسي أولاً",
          });
          return;
        }
      }
      await db.transaction(async (tx) => {
        await tx
          .update(fiscalYearsTable)
          .set({
            status: "open",
            closingEntryId: null,
            closedAt: null,
            closedBy: null,
          })
          .where(
            and(
              eq(fiscalYearsTable.id, id),
              eq(fiscalYearsTable.companyId, companyId),
            ),
          );
        if (year.closingEntryId) {
          await tx
            .delete(journalEntriesTable)
            .where(
              and(
                eq(journalEntriesTable.id, year.closingEntryId),
                eq(journalEntriesTable.companyId, companyId),
              ),
            );
        }
      });
      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "reopen",
          entity: "fiscal_year",
          entityId: id,
          oldValue: { status: "closed" },
          newValue: { status: "open" },
        },
        req.log,
      );
      res.json({ status: "ok" });
    } catch (err) {
      req.log.error({ err }, "Failed to reopen fiscal year");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Delete (open years only) ----------------------------------------------
router.delete(
  "/fiscal-years/:id",
  requireAuth,
  requireCapability("fiscalyear:manage"),
  async (req, res) => {
    const id = req.params["id"] as string;
    const companyId = req.auth!.companyId;
    try {
      const [year] = await db
        .select({ status: fiscalYearsTable.status })
        .from(fiscalYearsTable)
        .where(
          and(
            eq(fiscalYearsTable.id, id),
            eq(fiscalYearsTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!year) {
        res.status(404).json({ error: "السنة المالية غير موجودة" });
        return;
      }
      if (year.status !== "open") {
        res
          .status(400)
          .json({ error: "لا يمكن حذف سنة مالية مقفلة، أعد فتحها أولاً" });
        return;
      }
      await db
        .delete(fiscalYearsTable)
        .where(
          and(
            eq(fiscalYearsTable.id, id),
            eq(fiscalYearsTable.companyId, companyId),
          ),
        );
      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "delete",
          entity: "fiscal_year",
          entityId: id,
        },
        req.log,
      );
      res.json({ status: "ok" });
    } catch (err) {
      req.log.error({ err }, "Failed to delete fiscal year");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
