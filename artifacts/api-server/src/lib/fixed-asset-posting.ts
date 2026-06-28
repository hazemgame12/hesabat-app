// Pure helpers for fixed-asset depreciation posting. No DB access.
import { round2 } from "./inventory-posting";

export type AssetDepreciationOpts = {
  expenseAccountId: string;
  accumulatedAccountId: string;
  label: string;
  period: string; // YYYY-MM
  amount: number;
  costCenterId?: string | null;
  projectId?: string | null;
  branchId?: string | null;
};

export type DepreciationLine = {
  accountId: string;
  description: string;
  debit: number;
  credit: number;
  costCenterId: string | null;
  projectId: string | null;
  branchId: string | null;
};

/**
 * Builds the two balanced posting lines for a single asset's monthly
 * depreciation run (DR depreciation expense / CR accumulated depreciation).
 * Dimensions from the asset are stamped on both lines. Pure function — no DB
 * access.
 */
export function buildDepreciationLines(
  opts: AssetDepreciationOpts,
): [DepreciationLine, DepreciationLine] {
  const {
    expenseAccountId,
    accumulatedAccountId,
    label,
    period,
    amount,
    costCenterId = null,
    projectId = null,
    branchId = null,
  } = opts;
  const dims = {
    costCenterId: costCenterId ?? null,
    projectId: projectId ?? null,
    branchId: branchId ?? null,
  };
  const rounded = round2(amount);
  return [
    {
      accountId: expenseAccountId,
      description: `إهلاك ${label} - ${period}`,
      debit: rounded,
      credit: 0,
      ...dims,
    },
    {
      accountId: accumulatedAccountId,
      description: `مجمع إهلاك ${label} - ${period}`,
      debit: 0,
      credit: rounded,
      ...dims,
    },
  ];
}
