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
  dialCode: string;
}

export const COUNTRY_INFO: Record<CountryCode, CountryInfo> = {
  EG: { code: "EG", nameAr: "مصر", nameEn: "Egypt", defaultCurrency: "EGP", dialCode: "+20" },
  SA: { code: "SA", nameAr: "المملكة العربية السعودية", nameEn: "Saudi Arabia", defaultCurrency: "SAR", dialCode: "+966" },
  AE: { code: "AE", nameAr: "الإمارات العربية المتحدة", nameEn: "United Arab Emirates", defaultCurrency: "AED", dialCode: "+971" },
  KW: { code: "KW", nameAr: "الكويت", nameEn: "Kuwait", defaultCurrency: "KWD", dialCode: "+965" },
  QA: { code: "QA", nameAr: "قطر", nameEn: "Qatar", defaultCurrency: "QAR", dialCode: "+974" },
  BH: { code: "BH", nameAr: "البحرين", nameEn: "Bahrain", defaultCurrency: "BHD", dialCode: "+973" },
  OM: { code: "OM", nameAr: "عُمان", nameEn: "Oman", defaultCurrency: "OMR", dialCode: "+968" },
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

// ---- Tax reports (country-aware) ------------------------------------------
// Which official tax returns/reports a company can produce is driven by its
// country. Each definition points at one of the implemented backend datasets
// (the figures are computed from the ledger/invoices); the definition only
// shapes the labelling/official-form framing on top of that data.
//
// `dataset` MUST be one of the datasets the reports API can compute:
//   vat     → output vs input VAT (sales/purchase invoice lines, kind 'vat')
//   wht     → withholding tax withheld on purchases (invoice lines, kind 'wht')
//   payroll → payroll-tax (كسب العمل) summary from payroll runs
//
// Egypt is fully specified to its official forms (نموذج 10 / نموذج 41 / كسب
// العمل). Other countries are derived generically from their TAX_TEMPLATES so
// the framework already powers them; their official-form layouts (ZATCA, FTA
// VAT 201, …) are layered on later without touching call sites.
export const TAX_REPORT_DATASETS = ["vat", "wht", "payroll"] as const;
export type TaxReportDataset = (typeof TAX_REPORT_DATASETS)[number];

export interface TaxReportDef {
  // Stable, country-scoped id (used as the report selector key in the UI).
  id: string;
  kind: TaxKind;
  dataset: TaxReportDataset;
  nameAr: string;
  nameEn: string;
  descriptionAr?: string;
  descriptionEn?: string;
  // Official form reference shown to the user (e.g. "نموذج 10"); optional for
  // countries whose official layout has not been mapped yet.
  formRefAr?: string;
}

// Egypt — mapped to the Egyptian Tax Authority (ETA) official forms.
const EG_TAX_REPORTS: TaxReportDef[] = [
  {
    id: "eg-vat-form10",
    kind: "vat",
    dataset: "vat",
    nameAr: "الإقرار الشهري لضريبة القيمة المضافة",
    nameEn: "Monthly VAT Return",
    descriptionAr: "ضريبة المخرجات على المبيعات مقابل ضريبة المدخلات على المشتريات وصافي الضريبة المستحقة، بتقسيم نموذج 10.",
    formRefAr: "نموذج 10",
  },
  {
    id: "eg-wht-form41",
    kind: "wht",
    dataset: "wht",
    nameAr: "إقرار الخصم والتحصيل من المنبع",
    nameEn: "Withholding Tax Return",
    descriptionAr: "المبالغ المخصومة من الموردين مجمّعة حسب الفئة والنسبة (توريدات/مقاولات، خدمات، عمولات ومهن حرة) على صافي القيمة بدون ض.ق.م، بحد ٣٠٠ جنيه.",
    formRefAr: "نموذج 41",
  },
  {
    id: "eg-payroll-tax",
    kind: "payroll",
    dataset: "payroll",
    nameAr: "ملخص ضريبة كسب العمل (المرتبات)",
    nameEn: "Payroll Tax Summary",
    descriptionAr: "إجمالي الأجور والاستقطاعات وصافي المرتبات عن الفترة من مسيّرات الرواتب.",
    formRefAr: "كسب العمل",
  },
];

// Generic (non-Egypt) reports derived from a country's tax templates. Only the
// datasets that the reports API can already compute are surfaced (vat, wht);
// other kinds (income/zakat) get official mappings in a later phase.
function genericTaxReports(country: CountryCode): TaxReportDef[] {
  const out: TaxReportDef[] = [];
  for (const tpl of TAX_TEMPLATES[country]) {
    if (tpl.kind === "vat") {
      out.push({
        id: `${country.toLowerCase()}-vat-return`,
        kind: "vat",
        dataset: "vat",
        nameAr: "إقرار ضريبة القيمة المضافة",
        nameEn: "VAT Return",
        descriptionAr: "ضريبة المخرجات على المبيعات مقابل ضريبة المدخلات على المشتريات وصافي الضريبة المستحقة.",
      });
    } else if (tpl.kind === "wht") {
      out.push({
        id: `${country.toLowerCase()}-wht`,
        kind: "wht",
        dataset: "wht",
        nameAr: "تقرير الخصم من المنبع",
        nameEn: "Withholding Tax Report",
        descriptionAr: "المبالغ المخصومة من الموردين مجمّعة حسب النسبة.",
      });
    }
  }
  return out;
}

export const TAX_REPORTS: Record<CountryCode, TaxReportDef[]> = {
  EG: EG_TAX_REPORTS,
  SA: genericTaxReports("SA"),
  AE: genericTaxReports("AE"),
  KW: genericTaxReports("KW"),
  QA: genericTaxReports("QA"),
  BH: genericTaxReports("BH"),
  OM: genericTaxReports("OM"),
};

export function taxReportsFor(country: string): TaxReportDef[] {
  return isCountry(country) ? TAX_REPORTS[country] : TAX_REPORTS.EG;
}
