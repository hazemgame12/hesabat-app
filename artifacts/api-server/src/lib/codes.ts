import { and, eq, lte, gte, sql } from "drizzle-orm";
import { db, codeSequencesTable, fiscalYearsTable } from "@workspace/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

// Logical entities that get an auto-generated, fiscal-year-scoped code.
// Chart-of-accounts and currency ISO codes are intentionally NOT here.
export type CodeEntity =
  | "sales_invoice"
  | "purchase_invoice"
  | "sales_return"
  | "purchase_return"
  | "fixed_asset"
  | "employee"
  | "customer"
  | "supplier"
  | "inventory_item";

const PREFIX: Record<CodeEntity, string> = {
  sales_invoice: "SI",
  purchase_invoice: "PI",
  // Credit note (customer return) / debit note (supplier return).
  sales_return: "CN",
  purchase_return: "DN",
  fixed_asset: "FA",
  employee: "EMP",
  customer: "CUS",
  supplier: "SUP",
  inventory_item: "ITM",
};

const PAD = 4;

export function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// Resolves the fiscal-year bucket for a date: returns the 4-digit `label` shown
// in the code. The counter `key` is the label itself so the visible code stays
// unique per displayed year — even when two fiscal_years rows render the same
// 4-digit label, or some dates fall back to the calendar year. Using the row id
// as the key would let those cases each restart at 0001 and emit duplicate
// visible codes.
async function resolveFiscalYear(
  exec: Executor,
  companyId: string,
  date: string,
): Promise<{ key: string; label: string }> {
  const [row] = await exec
    .select({
      name: fiscalYearsTable.name,
      startDate: fiscalYearsTable.startDate,
    })
    .from(fiscalYearsTable)
    .where(
      and(
        eq(fiscalYearsTable.companyId, companyId),
        lte(fiscalYearsTable.startDate, date),
        gte(fiscalYearsTable.endDate, date),
      ),
    )
    .limit(1);
  if (row) {
    const m = row.name.match(/\d{4}/);
    const label = m ? m[0] : String(row.startDate).slice(0, 4);
    return { key: label, label };
  }
  const year = String(date).slice(0, 4);
  return { key: year, label: year };
}

/**
 * Allocates the next sequential, fiscal-year-scoped code for an entity, e.g.
 * `SI-2026-0001`. The counter is incremented with a single atomic upsert
 * (insert .. on conflict do update) so concurrent creates never collide; the
 * unique (company, entity, fiscalKey) row is locked for the duration.
 *
 * Pass a transaction `exec` when the code must commit together with the row it
 * labels (gaps are acceptable but a rolled-back insert should not consume a
 * number).
 */
export async function generateEntityCode(
  exec: Executor,
  companyId: string,
  entity: CodeEntity,
  date: string,
): Promise<string> {
  const { key, label } = await resolveFiscalYear(exec, companyId, date);
  const [seq] = await exec
    .insert(codeSequencesTable)
    .values({ companyId, entity, fiscalKey: key, lastNo: 1 })
    .onConflictDoUpdate({
      target: [
        codeSequencesTable.companyId,
        codeSequencesTable.entity,
        codeSequencesTable.fiscalKey,
      ],
      set: { lastNo: sql`${codeSequencesTable.lastNo} + 1` },
    })
    .returning({ lastNo: codeSequencesTable.lastNo });
  const no = seq!.lastNo;
  return `${PREFIX[entity]}-${label}-${String(no).padStart(PAD, "0")}`;
}
