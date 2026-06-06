// Shared country + currency definitions for Hesabat. Single source of truth used
// by the API server (validation) and the frontend (dropdowns + formatting).

export const CURRENCIES = ["EGP", "SAR", "AED", "USD"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export interface CurrencyInfo {
  code: CurrencyCode;
  nameAr: string;
  symbol: string;
}

export const CURRENCY_INFO: Record<CurrencyCode, CurrencyInfo> = {
  EGP: { code: "EGP", nameAr: "جنيه مصري", symbol: "ج.م" },
  SAR: { code: "SAR", nameAr: "ريال سعودي", symbol: "ر.س" },
  AED: { code: "AED", nameAr: "درهم إماراتي", symbol: "د.إ" },
  USD: { code: "USD", nameAr: "دولار أمريكي", symbol: "$" },
};

export const COUNTRIES = ["EG", "SA", "AE"] as const;
export type CountryCode = (typeof COUNTRIES)[number];

export interface CountryInfo {
  code: CountryCode;
  nameAr: string;
  defaultCurrency: CurrencyCode;
}

export const COUNTRY_INFO: Record<CountryCode, CountryInfo> = {
  EG: { code: "EG", nameAr: "مصر", defaultCurrency: "EGP" },
  SA: { code: "SA", nameAr: "المملكة العربية السعودية", defaultCurrency: "SAR" },
  AE: { code: "AE", nameAr: "الإمارات العربية المتحدة", defaultCurrency: "AED" },
};

export function isCurrency(value: string): value is CurrencyCode {
  return (CURRENCIES as readonly string[]).includes(value);
}

export function isCountry(value: string): value is CountryCode {
  return (COUNTRIES as readonly string[]).includes(value);
}

export function currencyLabel(code: string): string {
  return isCurrency(code) ? `${CURRENCY_INFO[code].nameAr} (${code})` : code;
}

export function countryLabel(code: string): string {
  return isCountry(code) ? COUNTRY_INFO[code].nameAr : code;
}

// Formats a numeric amount in the given currency, Arabic (Egypt) locale by
// default. Falls back to a symbol-suffixed plain number if Intl rejects the code.
export function formatCurrency(
  amount: number,
  currency: string,
  locale = "ar-EG",
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    const symbol = isCurrency(currency) ? CURRENCY_INFO[currency].symbol : currency;
    return `${amount.toLocaleString(locale)} ${symbol}`;
  }
}
