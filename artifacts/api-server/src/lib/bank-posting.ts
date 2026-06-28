import type { DraftPostingLine } from "./journal-posting";

// All movement kinds tracked by the Banks & Cash module. A `transfer` is special:
// it moves money between two of the company's own bank/cash accounts and is posted
// as two linked rows (an 'out' on the source + an 'in' on the destination).
export type BankMovementType =
  | "deposit"
  | "withdrawal"
  | "transfer"
  | "bank_charge"
  | "interest_income"
  | "interest_expense"
  | "customer_collection"
  | "supplier_payment"
  | "loan_installment"
  | "cash_expense";

// Effect of each non-transfer movement on the bank account balance. 'in' raises
// the balance (Dr the bank chart account / Cr the counterpart); 'out' lowers it
// (Cr the bank chart account / Dr the counterpart).
export const MOVEMENT_DIRECTION: Record<
  Exclude<BankMovementType, "transfer">,
  "in" | "out"
> = {
  deposit: "in",
  interest_income: "in",
  customer_collection: "in",
  withdrawal: "out",
  bank_charge: "out",
  interest_expense: "out",
  supplier_payment: "out",
  loan_installment: "out",
  cash_expense: "out",
};

// Builds the two balanced JE lines (base currency) for a single non-transfer
// movement against the bank account's linked chart account + its counterpart.
export function buildMovementLines(opts: {
  direction: "in" | "out";
  bankChartAccountId: string;
  counterpartAccountId: string;
  amountBase: number;
  description?: string | null;
  // Optional cost-center tag, applied to the counterpart (P&L) line only.
  costCenterId?: string | null;
  projectId?: string | null;
  branchId?: string | null;
}): DraftPostingLine[] {
  const { direction, bankChartAccountId, counterpartAccountId, amountBase } =
    opts;
  const desc = opts.description ?? null;
  const bankLine: DraftPostingLine = {
    accountId: bankChartAccountId,
    description: desc,
    debit: direction === "in" ? amountBase : 0,
    credit: direction === "in" ? 0 : amountBase,
  };
  const counterLine: DraftPostingLine = {
    accountId: counterpartAccountId,
    description: desc,
    debit: direction === "in" ? 0 : amountBase,
    credit: direction === "in" ? amountBase : 0,
    costCenterId: opts.costCenterId ?? null,
    projectId: opts.projectId ?? null,
    branchId: opts.branchId ?? null,
  };
  return [bankLine, counterLine];
}

// Builds the balanced JE lines (base currency) for a transfer between two of the
// company's own bank/cash accounts.
//
// Same-currency transfer (simple):
//   DR destBankAccount / CR srcBankAccount  (both at amountBase)
//
// Multi-currency transfer:
//   DR destBankAccount  (destAmountBase)
//   DR bankFees expense (feesBase, if any)
//   CR srcBankAccount   (srcAmountBase + feesBase)
//   DR/CR FX gain/loss  (= destAmountBase − srcAmountBase)
//     positive diff → CR gainAccountId (FX gain)
//     negative diff → DR lossAccountId (FX loss)
//
// The caller must supply gainAccountId / lossAccountId whenever
// destAmountBase ≠ srcAmountBase (use ensureFxAccounts for auto-creation).
// feesAccountId is required when feesBase > 0.
export function buildTransferLines(opts: {
  srcBankChartAccountId: string;
  destBankChartAccountId: string;
  srcAmountBase: number;
  destAmountBase: number;
  feesBase?: number;
  feesAccountId?: string | null;
  gainAccountId?: string | null;
  lossAccountId?: string | null;
  description?: string | null;
}): DraftPostingLine[] {
  const {
    srcBankChartAccountId,
    destBankChartAccountId,
    srcAmountBase,
    destAmountBase,
    feesBase = 0,
    feesAccountId,
    gainAccountId,
    lossAccountId,
  } = opts;
  const desc = opts.description ?? null;

  const lines: DraftPostingLine[] = [
    // DR destination bank account
    {
      accountId: destBankChartAccountId,
      description: desc,
      debit: destAmountBase,
      credit: 0,
    },
    // CR source bank account (transfer amount + fees)
    {
      accountId: srcBankChartAccountId,
      description: desc,
      debit: 0,
      credit: srcAmountBase + feesBase,
    },
  ];

  // Bank fees expense line
  if (feesBase > 0.005 && feesAccountId) {
    lines.push({
      accountId: feesAccountId,
      description: "رسوم تحويل",
      debit: feesBase,
      credit: 0,
    });
  }

  // FX gain/loss line — only when amounts differ
  const fxDiff = Math.round((destAmountBase - srcAmountBase) * 100) / 100;
  if (Math.abs(fxDiff) > 0.005) {
    if (fxDiff > 0 && gainAccountId) {
      // Destination received more than source sent (in base) → FX gain
      lines.push({
        accountId: gainAccountId,
        description: "أرباح فروق العملة",
        debit: 0,
        credit: fxDiff,
      });
    } else if (fxDiff < 0 && lossAccountId) {
      // Destination received less than source sent (in base) → FX loss
      lines.push({
        accountId: lossAccountId,
        description: "خسائر فروق العملة",
        debit: -fxDiff,
        credit: 0,
      });
    }
  }

  return lines;
}
