// Pure weighted-average inventory math shared by the Inventory module and the
// Invoicing module. No DB access — callers lock the item row, pass the current
// quantity/average, and persist the returned values inside their own
// transaction. Quantities are rounded to 4dp, money to 2dp.

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const round4 = (n: number) => Math.round(n * 10000) / 10000;
export const QTY_EPS = 0.00005;

export type MovementType = "receipt" | "issue" | "adjustment";

export type ComputedMovement = {
  newQty: number;
  newAvg: number;
  unitCost: number;
  // Absolute value of the inventory movement in money.
  totalValue: number;
  // Whether the inventory account is debited (stock increase) or credited.
  inventoryIsDebit: boolean;
};

// Computes the new on-hand quantity, weighted-average cost, per-unit cost, and
// money value of a single stock movement. Returns the string `"negative"` when
// the movement would drive on-hand stock below zero (issue larger than on hand,
// or an adjustment that overshoots). Receipts blend the average; issues and
// adjustments value at the current average.
export function computeMovement(
  curQty: number,
  curAvg: number,
  type: MovementType,
  qty: number,
  unitCost?: number | null,
): ComputedMovement | "negative" {
  const cq = round4(curQty);
  const ca = round4(curAvg);

  if (type === "receipt") {
    const uc = round4(unitCost ?? 0);
    const newQty = round4(cq + qty);
    const newAvg =
      newQty > QTY_EPS ? round4((cq * ca + qty * uc) / newQty) : 0;
    return {
      newQty,
      newAvg,
      unitCost: uc,
      totalValue: round2(qty * uc),
      inventoryIsDebit: true,
    };
  }

  if (type === "issue") {
    if (qty > cq + QTY_EPS) return "negative";
    return {
      newQty: round4(cq - qty),
      newAvg: ca,
      unitCost: ca,
      totalValue: round2(qty * ca),
      inventoryIsDebit: false,
    };
  }

  // adjustment: signed qty, valued at current average cost
  const newQty = round4(cq + qty);
  if (newQty < -QTY_EPS) return "negative";
  return {
    newQty,
    newAvg: ca,
    unitCost: ca,
    totalValue: round2(qty * ca),
    inventoryIsDebit: qty > 0,
  };
}

export type InventoryPostingLineOpts = {
  inventoryAccountId: string;
  counterpartAccountId: string;
  typeLabel: string;
  itemLabel: string;
  postAmount: number;
  inventoryIsDebit: boolean;
  costCenterId?: string | null;
  projectId?: string | null;
  branchId?: string | null;
};

export type InventoryPostingPair = {
  accountId: string;
  description: string;
  debit: number;
  credit: number;
  costCenterId: string | null;
  projectId: string | null;
  branchId: string | null;
}[];

/**
 * Builds the two balanced posting lines for a single inventory movement (an
 * inventory account line + its counterpart). Dimensions are stamped on both
 * lines from the movement. Pure function — no DB access.
 */
export function buildInventoryPostingLines(
  opts: InventoryPostingLineOpts,
): InventoryPostingPair {
  const {
    inventoryAccountId,
    counterpartAccountId,
    typeLabel,
    itemLabel,
    postAmount,
    inventoryIsDebit,
    costCenterId = null,
    projectId = null,
    branchId = null,
  } = opts;
  const description = `${typeLabel} - ${itemLabel}`;
  return [
    {
      accountId: inventoryAccountId,
      description,
      debit: inventoryIsDebit ? postAmount : 0,
      credit: inventoryIsDebit ? 0 : postAmount,
      costCenterId,
      projectId,
      branchId,
    },
    {
      accountId: counterpartAccountId,
      description,
      debit: inventoryIsDebit ? 0 : postAmount,
      credit: inventoryIsDebit ? postAmount : 0,
      costCenterId,
      projectId,
      branchId,
    },
  ];
}
