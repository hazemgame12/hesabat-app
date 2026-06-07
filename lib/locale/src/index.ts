// Shared country + currency definitions for Hesabat. Single source of truth used
// by the API server (validation) and the frontend (dropdowns + formatting).

export type Lang = "ar" | "en";

export const CURRENCIES = [
  "EGP",
  "SAR",
  "AED",
  "KWD",
  "QAR",
  "BHD",
  "OMR",
  "USD",
] as const;
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
  KWD: { code: "KWD", nameAr: "دينار كويتي", nameEn: "Kuwaiti Dinar", symbol: "د.ك" },
  QAR: { code: "QAR", nameAr: "ريال قطري", nameEn: "Qatari Riyal", symbol: "ر.ق" },
  BHD: { code: "BHD", nameAr: "دينار بحريني", nameEn: "Bahraini Dinar", symbol: "د.ب" },
  OMR: { code: "OMR", nameAr: "ريال عماني", nameEn: "Omani Rial", symbol: "ر.ع" },
  USD: { code: "USD", nameAr: "دولار أمريكي", nameEn: "US Dollar", symbol: "$" },
};

export const COUNTRIES = ["EG", "SA", "AE", "KW", "QA", "BH", "OM"] as const;
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
  KW: { code: "KW", nameAr: "الكويت", nameEn: "Kuwait", defaultCurrency: "KWD" },
  QA: { code: "QA", nameAr: "قطر", nameEn: "Qatar", defaultCurrency: "QAR" },
  BH: { code: "BH", nameAr: "البحرين", nameEn: "Bahrain", defaultCurrency: "BHD" },
  OM: { code: "OM", nameAr: "عُمان", nameEn: "Oman", defaultCurrency: "OMR" },
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

// ---- Taxes ----------------------------------------------------------------
// Tax kinds supported across the Arab/Gulf region. Kept as plain strings (the DB
// `taxes.kind` column is text, not a pg enum) so adding a kind needs no migration.
//   vat     = ضريبة القيمة المضافة
//   wht     = ضريبة الخصم/الاستقطاع من المنبع
//   income  = ضريبة الدخل/أرباح الشركات (corporate / non-resident income tax)
//   payroll = ضريبة كسب العمل على المرتبات
//   zakat   = الزكاة
export const TAX_KINDS = ["vat", "wht", "income", "payroll", "zakat"] as const;
export type TaxKind = (typeof TAX_KINDS)[number];

export function isTaxKind(value: string): value is TaxKind {
  return (TAX_KINDS as readonly string[]).includes(value);
}

export interface TaxTemplate {
  kind: TaxKind;
  nameAr: string;
  nameEn: string;
  rate: number;
  serviceNatureAr?: string;
  // Chart-of-accounts code this tax links to (resolved to an account id at seed
  // time). Must exist in DEFAULT_TAX_ACCOUNT_CODES so seeding can create it.
  accountCode: string;
}

// Liability account codes (under parent "21" current liabilities) that the tax
// templates link to. The default chart of accounts seeds these, and the taxes
// seed-defaults endpoint ensures they exist for pre-existing companies.
export const DEFAULT_TAX_ACCOUNT_CODES: Record<
  TaxKind,
  { code: string; nameAr: string; nameEn: string }
> = {
  vat: { code: "212", nameAr: "ضريبة القيمة المضافة المستحقة", nameEn: "VAT Payable" },
  wht: { code: "214", nameAr: "ضريبة الخصم من المنبع المستحقة", nameEn: "Withholding Tax Payable" },
  payroll: { code: "215", nameAr: "ضريبة كسب العمل المستحقة", nameEn: "Payroll Tax Payable" },
  income: { code: "216", nameAr: "ضريبة الدخل/الأرباح المستحقة", nameEn: "Income/Corporate Tax Payable" },
  zakat: { code: "217", nameAr: "الزكاة المستحقة", nameEn: "Zakat Payable" },
};

// Default tax types per country. Selecting a country at signup auto-seeds these
// (each linked to its account). Rates are representative defaults the user can
// edit; progressive/bracketed taxes are seeded at 0% with a note to compute
// manually until a dedicated calculator ships.
export const TAX_TEMPLATES: Record<CountryCode, TaxTemplate[]> = {
  EG: [
    { kind: "vat", nameAr: "ضريبة القيمة المضافة", nameEn: "Value Added Tax", rate: 14, accountCode: "212" },
    { kind: "wht", nameAr: "ضريبة الخصم من المنبع", nameEn: "Withholding Tax", rate: 1, serviceNatureAr: "تتراوح 1% - 5% حسب طبيعة النشاط", accountCode: "214" },
    { kind: "payroll", nameAr: "ضريبة كسب العمل (المرتبات)", nameEn: "Payroll Tax", rate: 0, serviceNatureAr: "شرائح تصاعدية تُحتسب يدويًا حسب الراتب", accountCode: "215" },
  ],
  SA: [
    { kind: "vat", nameAr: "ضريبة القيمة المضافة", nameEn: "Value Added Tax", rate: 15, accountCode: "212" },
    { kind: "zakat", nameAr: "الزكاة", nameEn: "Zakat", rate: 2.5, serviceNatureAr: "على القاعدة الزكوية للمنشآت المملوكة لسعوديين/خليجيين", accountCode: "217" },
    { kind: "income", nameAr: "ضريبة الدخل (غير المقيمين/الأجانب)", nameEn: "Income Tax (Non-residents)", rate: 20, accountCode: "216" },
    { kind: "wht", nameAr: "ضريبة الاستقطاع", nameEn: "Withholding Tax", rate: 5, serviceNatureAr: "تتراوح 5% - 20% حسب نوع الدفعة", accountCode: "214" },
  ],
  AE: [
    { kind: "vat", nameAr: "ضريبة القيمة المضافة", nameEn: "Value Added Tax", rate: 5, accountCode: "212" },
    { kind: "income", nameAr: "ضريبة الشركات", nameEn: "Corporate Tax", rate: 9, serviceNatureAr: "تُطبّق على الأرباح التي تتجاوز 375 ألف درهم", accountCode: "216" },
  ],
  KW: [
    { kind: "income", nameAr: "ضريبة دخل الشركات الأجنبية", nameEn: "Foreign Corporate Income Tax", rate: 15, accountCode: "216" },
  ],
  QA: [
    { kind: "income", nameAr: "ضريبة دخل الشركات", nameEn: "Corporate Income Tax", rate: 10, accountCode: "216" },
    { kind: "wht", nameAr: "ضريبة الاستقطاع", nameEn: "Withholding Tax", rate: 5, accountCode: "214" },
  ],
  BH: [
    { kind: "vat", nameAr: "ضريبة القيمة المضافة", nameEn: "Value Added Tax", rate: 10, accountCode: "212" },
  ],
  OM: [
    { kind: "vat", nameAr: "ضريبة القيمة المضافة", nameEn: "Value Added Tax", rate: 5, accountCode: "212" },
    { kind: "income", nameAr: "ضريبة دخل الشركات", nameEn: "Corporate Income Tax", rate: 15, accountCode: "216" },
    { kind: "wht", nameAr: "ضريبة الاستقطاع", nameEn: "Withholding Tax", rate: 10, accountCode: "214" },
  ],
};

export function taxTemplatesFor(country: string): TaxTemplate[] {
  return isCountry(country) ? TAX_TEMPLATES[country] : TAX_TEMPLATES.EG;
}
