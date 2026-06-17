import { and, eq, lte, gte } from "drizzle-orm";
import { db, fiscalYearsTable, companiesTable } from "@workspace/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

/**
 * Thrown when an operation would create or modify a posted/dated journal entry
 * whose date falls inside a CLOSED fiscal year. Callers should translate this
 * into a 400 response. Used as a safety net inside createDraftJournalEntry so no
 * posting module can write into a locked period.
 */
export class FiscalPeriodClosedError extends Error {
  constructor() {
    super("FISCAL_PERIOD_CLOSED");
    this.name = "FiscalPeriodClosedError";
  }
}

// ── Period Lock ──────────────────────────────────────────────────────────────

export type WriteBlockReason = "fiscal_closed" | "period_locked";

/**
 * Human-readable Arabic error messages for write-blocked dates.
 */
export const WRITE_BLOCK_MSG: Record<WriteBlockReason, string> = {
  fiscal_closed:
    "لا يمكن إجراء العملية: التاريخ يقع داخل سنة مالية مقفلة",
  period_locked:
    "لا يمكن إجراء العملية: الفترة مقفلة — يمكن فتحها من إعدادات الشركة",
};

/**
 * Returns true if `date` falls on or before the company's `lockedThrough`
 * soft period lock. Returns false when no lock is set.
 */
export async function isPeriodLocked(
  executor: Executor,
  companyId: string,
  date: string,
): Promise<boolean> {
  const [row] = await executor
    .select({ lockedThrough: companiesTable.lockedThrough })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);
  if (!row?.lockedThrough) return false;
  return date <= row.lockedThrough;
}

/**
 * Combined check: period_locked takes priority over fiscal_closed.
 * Returns the reason string or false if the date is writable.
 */
export async function isWriteBlocked(
  executor: Executor,
  companyId: string,
  date: string,
): Promise<WriteBlockReason | false> {
  if (await isPeriodLocked(executor, companyId, date)) return "period_locked";
  if (await isPeriodClosed(executor, companyId, date)) return "fiscal_closed";
  return false;
}

/**
 * Returns true if `date` (YYYY-MM-DD) falls within a CLOSED fiscal year for the
 * company. An open year (or no defined year) never blocks.
 */
export async function isPeriodClosed(
  executor: Executor,
  companyId: string,
  date: string,
): Promise<boolean> {
  const [row] = await executor
    .select({ id: fiscalYearsTable.id })
    .from(fiscalYearsTable)
    .where(
      and(
        eq(fiscalYearsTable.companyId, companyId),
        eq(fiscalYearsTable.status, "closed"),
        lte(fiscalYearsTable.startDate, date),
        gte(fiscalYearsTable.endDate, date),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Throws FiscalPeriodClosedError if `date` falls in a closed fiscal year.
 */
export async function assertOpenPeriod(
  executor: Executor,
  companyId: string,
  date: string,
): Promise<void> {
  if (await isPeriodClosed(executor, companyId, date)) {
    throw new FiscalPeriodClosedError();
  }
}
