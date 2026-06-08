import { and, eq, lte, gte } from "drizzle-orm";
import { db, fiscalYearsTable } from "@workspace/db";

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
