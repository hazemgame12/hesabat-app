import { and, desc, eq, lte, sql } from "drizzle-orm";
import { db, currenciesTable, exchangeRatesTable } from "@workspace/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

/**
 * Thrown when a journal/posting line uses a currency the target account does not
 * accept (base account fed a foreign currency, or a fixed account fed the wrong
 * currency). Callers translate this into a 400 response.
 */
export class CurrencyMismatchError extends Error {
  constructor(
    public readonly accountCode: string,
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super("CURRENCY_MISMATCH");
    this.name = "CurrencyMismatchError";
  }
}

type AccountCurrencyInfo = {
  code: string;
  currencyType: string | null;
  currency: string | null;
};

/**
 * Enforces the account's currency rules for a posting line:
 *   - base  → line currency must equal the company base currency.
 *   - fixed → line currency must equal the account's assigned currency.
 *   - multi → any currency is allowed.
 * Group accounts never post directly so this is only called for leaf accounts.
 */
export function assertAccountAcceptsCurrency(
  account: AccountCurrencyInfo,
  lineCurrency: string,
  baseCurrency: string,
): void {
  const type = account.currencyType ?? "base";
  if (type === "multi") return;
  if (type === "fixed") {
    const expected = account.currency ?? baseCurrency;
    if (lineCurrency !== expected) {
      throw new CurrencyMismatchError(account.code, expected, lineCurrency);
    }
    return;
  }
  // 'base' (and any unknown value) → base currency only.
  if (lineCurrency !== baseCurrency) {
    throw new CurrencyMismatchError(account.code, baseCurrency, lineCurrency);
  }
}

/**
 * Returns the exchange rate (value of 1 unit of `code` in the base currency) that
 * applied on `asOfDate` (YYYY-MM-DD). Resolution order:
 *   1. base currency → 1.
 *   2. newest dated row in exchange_rates with rateDate <= asOfDate.
 *   3. the currency's current rate on the currencies table (fallback).
 *   4. null when the currency is unknown.
 */
export async function getRateForDate(
  executor: Executor,
  companyId: string,
  code: string,
  asOfDate: string,
  baseCurrency: string,
): Promise<number | null> {
  if (code === baseCurrency) return 1;

  const [dated] = await executor
    .select({ rate: exchangeRatesTable.rate })
    .from(exchangeRatesTable)
    .where(
      and(
        eq(exchangeRatesTable.companyId, companyId),
        eq(exchangeRatesTable.currencyCode, code),
        lte(exchangeRatesTable.rateDate, asOfDate),
      ),
    )
    .orderBy(desc(exchangeRatesTable.rateDate))
    .limit(1);
  if (dated) return Number(dated.rate);

  const [current] = await executor
    .select({ rate: currenciesTable.exchangeRate })
    .from(currenciesTable)
    .where(
      and(
        eq(currenciesTable.companyId, companyId),
        eq(currenciesTable.code, code),
      ),
    )
    .limit(1);
  if (current) return Number(current.rate);

  return null;
}

/**
 * Records a dated exchange rate (upserting on company+currency+date). Called when
 * a user edits a rate manually or the auto-refresh runs, so historical lookups by
 * date stay accurate. Base-currency rows are ignored.
 */
export async function recordDatedRate(
  executor: Executor,
  companyId: string,
  code: string,
  rateDate: string,
  rate: number,
  source: "manual" | "auto",
  baseCurrency: string,
  createdBy?: string | null,
): Promise<void> {
  if (code === baseCurrency) return;
  await executor
    .insert(exchangeRatesTable)
    .values({
      companyId,
      currencyCode: code,
      rateDate,
      rate: String(rate),
      source,
      createdBy: createdBy ?? null,
    })
    .onConflictDoUpdate({
      target: [
        exchangeRatesTable.companyId,
        exchangeRatesTable.currencyCode,
        exchangeRatesTable.rateDate,
      ],
      set: { rate: String(rate), source, updatedAt: sql`now()` },
    });
}
