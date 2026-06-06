// Shared country + currency definitions for Hesabat. Single source of truth used
// by the API server (validation) and the frontend (dropdowns + formatting).

export type Lang = "ar" | "en";

export const CURRENCIES = ["EGP", "SAR", "AED", "USD"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export interface CurrencyInfo {
  code: CurrencyCode;
  nameAr: string;
  nameEn: string;
  symbol: string;
}

export const CURRENCY_INFO: Record<CurrencyCode, CurrencyInfo> = {
  EGP: { code: "EGP", nameAr: "جنيه مصري", nameEn: "Egyptian Pound", symbol: "ج.م" },
  SAR: { code: "SAR", nameAr: "ريال سعودي", nameEn: "Saudi Riyal", symbol: "ر.س" },
  AED: { code: "AED", nameAr: "درهم إماراتي", nameEn: "UAE Dirham", symbol: "د.إ" },
  USD: { code: "USD", nameAr: "دولار أمريكي", nameEn: "US Dollar", symbol: "$" },
};

export const COUNTRIES = ["EG", "SA", "AE"] as const;
export type CountryCode = (typeof COUNTRIES)[number];

export interface CountryInfo {
  code: CountryCode;
  nameAr: string;
  nameEn: string;
  defaultCurrency: CurrencyCode;
}

export const COUNTRY_INFO: Record<CountryCode, CountryInfo> = {
  EG: { code: "EG", nameAr: "مصر", nameEn: "Egypt", defaultCurrency: "EGP" },
  SA: { code: "SA", nameAr: "المملكة العربية السعودية", nameEn: "Saudi Arabia", defaultCurrency: "SAR" },
  AE: { code: "AE", nameAr: "الإمارات العربية المتحدة", nameEn: "United Arab Emirates", defaultCurrency: "AED" },
};

export function isCurrency(value: string): value is CurrencyCode {
  return (CURRENCIES as readonly string[]).includes(value);
}

export function isCountry(value: string): value is CountryCode {
  return (COUNTRIES as readonly string[]).includes(value);
}

export function currencyName(code: string, lang: Lang = "ar"): string {
  if (!isCurrency(code)) return code;
  return lang === "en" ? CURRENCY_INFO[code].nameEn : CURRENCY_INFO[code].nameAr;
}

export function countryName(code: string, lang: Lang = "ar"): string {
  if (!isCountry(code)) return code;
  return lang === "en" ? COUNTRY_INFO[code].nameEn : COUNTRY_INFO[code].nameAr;
}

export function currencyLabel(code: string, lang: Lang = "ar"): string {
  return isCurrency(code) ? `${currencyName(code, lang)} (${code})` : code;
}

export function countryLabel(code: string, lang: Lang = "ar"): string {
  return countryName(code, lang);
}

// Locale string for Intl, derived from the app language. Arabic uses the
// Egyptian locale (Western digits via options below); English uses en-US.
export function intlLocale(lang: Lang = "ar"): string {
  return lang === "en" ? "en-US" : "ar-EG";
}

// Formats a numeric amount in the given currency for the given app language.
// Falls back to a symbol-suffixed plain number if Intl rejects the code.
export function formatCurrency(
  amount: number,
  currency: string,
  lang: Lang = "ar",
): string {
  const locale = intlLocale(lang);
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
