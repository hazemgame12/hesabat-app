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
  };
  return [bankLine, counterLine];
}

// Builds the two balanced JE lines (base currency) for a transfer between two of
// the company's own bank/cash accounts: Dr the destination chart account / Cr the
// source chart account.
export function buildTransferLines(opts: {
  srcBankChartAccountId: string;
  destBankChartAccountId: string;
  amountBase: number;
  description?: string | null;
}): DraftPostingLine[] {
  const { srcBankChartAccountId, destBankChartAccountId, amountBase } = opts;
  const desc = opts.description ?? null;
  return [
    {
      accountId: destBankChartAccountId,
      description: desc,
      debit: amountBase,
      credit: 0,
    },
    {
      accountId: srcBankChartAccountId,
      description: desc,
      debit: 0,
      credit: amountBase,
    },
  ];
}
