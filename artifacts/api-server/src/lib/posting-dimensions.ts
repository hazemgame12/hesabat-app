export type PostingDimensions = {
  costCenterId?: string | null;
  projectId?: string | null;
  branchId?: string | null;
};

export type ResolvedPostingDimensions = {
  costCenterId: string | null;
  projectId: string | null;
  branchId: string | null;
};

export type PostingAmountBucket = ResolvedPostingDimensions & {
  amount: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function resolvePostingDimensions(
  primary?: PostingDimensions | null,
  fallback?: PostingDimensions | null,
): ResolvedPostingDimensions {
  return {
    costCenterId: primary?.costCenterId ?? fallback?.costCenterId ?? null,
    projectId: primary?.projectId ?? fallback?.projectId ?? null,
    branchId: primary?.branchId ?? fallback?.branchId ?? null,
  };
}

export function postingDimensionsKey(
  dims?: PostingDimensions | null,
): string {
  const resolved = resolvePostingDimensions(dims);
  return [
    resolved.costCenterId ?? "",
    resolved.projectId ?? "",
    resolved.branchId ?? "",
  ].join("::");
}

export function addAmountToPostingDimensionBuckets(
  buckets: Map<string, PostingAmountBucket>,
  amount: number,
  primary?: PostingDimensions | null,
  fallback?: PostingDimensions | null,
): void {
  const dims = resolvePostingDimensions(primary, fallback);
  const key = postingDimensionsKey(dims);
  const existing = buckets.get(key);
  if (existing) {
    existing.amount = round2(existing.amount + amount);
    return;
  }
  buckets.set(key, { ...dims, amount: round2(amount) });
}
