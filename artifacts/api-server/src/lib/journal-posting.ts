import { eq, sql } from "drizzle-orm";
import {
  db,
  journalEntriesTable,
  journalEntryLinesTable,
} from "@workspace/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
};

export type CreateDraftEntryOptions = {
  companyId: string;
  baseCurrency: string;
  date: string; // YYYY-MM-DD
  reference?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  lines: DraftPostingLine[];
};

/**
 * Creates a DRAFT journal entry + lines in the company base currency (rate 1)
 * inside the given transaction, reusing the journal's per-company numbering and
 * base-amount conventions. Throws if the lines don't balance or are empty.
 *
 * Callers are responsible for validating that every `accountId` belongs to the
 * company and is a leaf (non-group) account before calling this helper. Shared
 * by the Fixed Assets, Payroll, and Inventory modules.
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

  const [{ maxNo }] = await tx
    .select({
      maxNo: sql<number>`coalesce(max(${journalEntriesTable.entryNo}), 0)`,
    })
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.companyId, opts.companyId));

  const [entry] = await tx
    .insert(journalEntriesTable)
    .values({
      companyId: opts.companyId,
      entryNo: Number(maxNo) + 1,
      date: opts.date,
      reference: opts.reference ?? null,
      notes: opts.notes ?? null,
      status: "draft",
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
    })),
  );

  return { id: entry!.id, entryNo: entry!.entryNo };
}
