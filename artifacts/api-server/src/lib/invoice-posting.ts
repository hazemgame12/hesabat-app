import type { PostingAmountBucket } from "./posting-dimensions";

export type InvoiceEntryLine = {
  accountId: string;
  description: string | null;
  debit: number;
  credit: number;
  taxId?: string | null;
  costCenterId?: string | null;
  projectId?: string | null;
  branchId?: string | null;
};

/**
 * Appends AR (sales) or AP (purchase) party lines to `entryLines`, with one
 * line per distinct effective dimension set bucket. For sales the lines are
 * prepended (AR is the first debit); for purchases they are appended (AP is the
 * last credit). The total across all generated lines always equals the sum of
 * the bucket amounts.
 */
export function pushPartyLines(
  entryLines: InvoiceEntryLine[],
  opts: {
    side: "sales" | "purchase";
    accountId: string;
    description: string;
    amounts: Map<string, PostingAmountBucket>;
  },
): void {
  const partyLines = [...opts.amounts.values()].map((bucket) => ({
    accountId: opts.accountId,
    description: opts.description,
    debit: opts.side === "sales" ? bucket.amount : 0,
    credit: opts.side === "sales" ? 0 : bucket.amount,
    costCenterId: bucket.costCenterId,
    projectId: bucket.projectId,
    branchId: bucket.branchId,
  }));
  if (opts.side === "sales") {
    entryLines.unshift(...partyLines);
    return;
  }
  entryLines.push(...partyLines);
}
