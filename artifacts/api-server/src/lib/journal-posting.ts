import { eq, sql } from "drizzle-orm";
import {
  db,
  journalEntriesTable,
  journalEntryLinesTable,
} from "@workspace/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Serializes per-company journal entry-number allocation by taking a Postgres
 * transaction-scoped advisory lock keyed on the company id. Entry numbers are
 * allocated as `max(entry_no)+1`, which races under concurrent posting (e.g. two
 * inventory movements on different items whose row locks don't conflict) and can
 * mint duplicate numbers. Every code path that allocates an entry number for a
 * company MUST call this first, inside the same transaction; the lock auto-releases
 * on commit/rollback. Collisions across companies (hashtext is int4) are harmless —
 * at worst two companies briefly serialize.
 */
export async function lockCompanyEntryNo(
  tx: Tx,
  companyId: string,
): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${companyId}))`);
}

// Money values use 2 decimals; treat sub-cent differences as balanced. Kept in
// sync with the conventions in routes/journal.ts.
const BALANCE_TOLERANCE = 0.005;
const round2 = (n: number) => Math.round(n * 100) / 100;

export type DraftPostingLine = {
  accountId: string;
  description?: string | null;
  // Amounts are already expressed in the company base currency.
  debit: number;
  credit: number;
  // Optional cost-center/project tag (caller must validate company ownership).
  costCenterId?: string | null;
};

export type CreateDraftEntryOptions = {
  companyId: string;
  baseCurrency: string;
  date: string; // YYYY-MM-DD
  reference?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  // Defaults to 'draft' to preserve existing callers. The Invoicing/Payments
  // module passes 'posted' because party (AR/AP) balances are derived from
  // POSTED journal activity only.
  status?: "draft" | "posted";
  lines: DraftPostingLine[];
};

/**
 * Creates a journal entry + lines in the company base currency (rate 1)
 * inside the given transaction, reusing the journal's per-company numbering and
 * base-amount conventions. Defaults to a DRAFT entry; pass `status: "posted"`
 * to post immediately (sets `postedAt`). Throws if the lines don't balance or
 * are empty.
 *
 * Callers are responsible for validating that every `accountId` belongs to the
 * company and is a leaf (non-group) account before calling this helper. Shared
 * by the Fixed Assets, Payroll, Inventory, and Invoicing modules.
 */
export async function createDraftJournalEntry(
  tx: Tx,
  opts: CreateDraftEntryOptions,
): Promise<{ id: string; entryNo: number }> {
  if (opts.lines.length === 0) {
    throw new Error("DRAFT_ENTRY_NO_LINES");
  }

  let totalDebit = 0;
  let totalCredit = 0;
  const computed = opts.lines.map((l) => {
    const debit = round2(l.debit);
    const credit = round2(l.credit);
    if (debit > 0 && credit > 0) throw new Error("DRAFT_ENTRY_LINE_BOTH_SIDES");
    if (debit <= 0 && credit <= 0) throw new Error("DRAFT_ENTRY_LINE_NO_AMOUNT");
    totalDebit += debit;
    totalCredit += credit;
    return { debit, credit };
  });
  if (Math.abs(totalDebit - totalCredit) > BALANCE_TOLERANCE) {
    throw new Error("DRAFT_ENTRY_UNBALANCED");
  }

  await lockCompanyEntryNo(tx, opts.companyId);
  const [{ maxNo }] = await tx
    .select({
      maxNo: sql<number>`coalesce(max(${journalEntriesTable.entryNo}), 0)`,
    })
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.companyId, opts.companyId));

  const status = opts.status ?? "draft";
  const [entry] = await tx
    .insert(journalEntriesTable)
    .values({
      companyId: opts.companyId,
      entryNo: Number(maxNo) + 1,
      date: opts.date,
      reference: opts.reference ?? null,
      notes: opts.notes ?? null,
      status,
      postedAt: status === "posted" ? new Date() : null,
      createdBy: opts.createdBy ?? null,
    })
    .returning();

  await tx.insert(journalEntryLinesTable).values(
    opts.lines.map((l, i) => ({
      entryId: entry!.id,
      companyId: opts.companyId,
      lineNo: i + 1,
      accountId: l.accountId,
      description: l.description ?? null,
      currency: opts.baseCurrency,
      exchangeRate: "1",
      debit: String(computed[i]!.debit),
      credit: String(computed[i]!.credit),
      debitBase: String(computed[i]!.debit),
      creditBase: String(computed[i]!.credit),
      costCenterId: l.costCenterId ?? null,
    })),
  );

  return { id: entry!.id, entryNo: entry!.entryNo };
}
