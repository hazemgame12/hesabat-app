import { and, eq } from "drizzle-orm";
import { db, accountsTable } from "@workspace/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export type SeedAccount = {
  code: string;
  nameAr: string;
  nameEn: string;
  type: AccountType;
  isGroup: boolean;
  parentCode: string | null;
};

// Default Egyptian-style chart of accounts (bilingual). Codes follow the common
// 1=assets, 2=liabilities, 3=equity, 4=revenue, 5=expenses convention.
// Parents are referenced by `parentCode` and resolved to ids at insert time.
export const DEFAULT_CHART_OF_ACCOUNTS: SeedAccount[] = [
  // ---- Assets ----
  { code: "11", nameAr: "الأصول المتداولة", nameEn: "Current Assets", type: "asset", isGroup: true, parentCode: null },
  { code: "111", nameAr: "النقدية وما في حكمها", nameEn: "Cash & Cash Equivalents", type: "asset", isGroup: true, parentCode: "11" },
  { code: "1111", nameAr: "الخزينة الرئيسية", nameEn: "Main Cash", type: "asset", isGroup: false, parentCode: "111" },
  { code: "1112", nameAr: "البنك الأهلي المصري", nameEn: "National Bank of Egypt", type: "asset", isGroup: false, parentCode: "111" },
  { code: "1113", nameAr: "بنك مصر", nameEn: "Banque Misr", type: "asset", isGroup: false, parentCode: "111" },
  { code: "112", nameAr: "العملاء", nameEn: "Accounts Receivable", type: "asset", isGroup: true, parentCode: "11" },
  { code: "113", nameAr: "العهد والسلف", nameEn: "Advances & Custody", type: "asset", isGroup: true, parentCode: "11" },
  { code: "1131", nameAr: "عهد الموظفين", nameEn: "Employee Advances", type: "asset", isGroup: false, parentCode: "113" },
  { code: "1132", nameAr: "سلفة مستديمة", nameEn: "Petty Cash Advance", type: "asset", isGroup: false, parentCode: "113" },
  { code: "114", nameAr: "المخزون", nameEn: "Inventory", type: "asset", isGroup: false, parentCode: "11" },
  { code: "12", nameAr: "الأصول الثابتة", nameEn: "Fixed Assets", type: "asset", isGroup: true, parentCode: null },
  { code: "121", nameAr: "أجهزة ومعدات", nameEn: "Equipment & Machinery", type: "asset", isGroup: false, parentCode: "12" },
  { code: "122", nameAr: "سيارات", nameEn: "Vehicles", type: "asset", isGroup: false, parentCode: "12" },

  // ---- Liabilities ----
  { code: "21", nameAr: "الخصوم المتداولة", nameEn: "Current Liabilities", type: "liability", isGroup: true, parentCode: null },
  { code: "211", nameAr: "الموردين", nameEn: "Accounts Payable", type: "liability", isGroup: true, parentCode: "21" },
  { code: "212", nameAr: "ضريبة القيمة المضافة المستحقة", nameEn: "VAT Payable", type: "liability", isGroup: false, parentCode: "21" },
  { code: "213", nameAr: "قروض قصيرة الأجل", nameEn: "Short-term Loans", type: "liability", isGroup: false, parentCode: "21" },
  { code: "214", nameAr: "ضريبة الخصم من المنبع المستحقة", nameEn: "Withholding Tax Payable", type: "liability", isGroup: false, parentCode: "21" },
  { code: "215", nameAr: "ضريبة كسب العمل المستحقة", nameEn: "Payroll Tax Payable", type: "liability", isGroup: false, parentCode: "21" },
  { code: "216", nameAr: "ضريبة الدخل/الأرباح المستحقة", nameEn: "Income/Corporate Tax Payable", type: "liability", isGroup: false, parentCode: "21" },
  { code: "217", nameAr: "الزكاة المستحقة", nameEn: "Zakat Payable", type: "liability", isGroup: false, parentCode: "21" },
  { code: "22", nameAr: "الخصوم طويلة الأجل", nameEn: "Long-Term Liabilities", type: "liability", isGroup: true, parentCode: null },
  { code: "221", nameAr: "القروض طويلة الأجل", nameEn: "Long-Term Loans", type: "liability", isGroup: false, parentCode: "22" },

  // ---- Equity ----
  { code: "31", nameAr: "حقوق الملكية", nameEn: "Equity", type: "equity", isGroup: true, parentCode: null },
  { code: "311", nameAr: "رأس المال", nameEn: "Capital", type: "equity", isGroup: false, parentCode: "31" },
  { code: "312", nameAr: "الأرباح المحتجزة", nameEn: "Retained Earnings", type: "equity", isGroup: false, parentCode: "31" },
  { code: "313", nameAr: "رصيد افتتاحي", nameEn: "Opening Balance Equity", type: "equity", isGroup: false, parentCode: "31" },

  // ---- Revenue (4 / 41 / 42) ----
  { code: "4", nameAr: "الإيرادات", nameEn: "Revenue", type: "revenue", isGroup: true, parentCode: null },
  { code: "41", nameAr: "الإيرادات التشغيلية", nameEn: "Operating Revenue", type: "revenue", isGroup: true, parentCode: "4" },
  { code: "411", nameAr: "إيرادات المبيعات", nameEn: "Sales Revenue", type: "revenue", isGroup: false, parentCode: "41" },
  { code: "412", nameAr: "إيرادات الخدمات", nameEn: "Service Revenue", type: "revenue", isGroup: false, parentCode: "41" },
  { code: "413", nameAr: "إيرادات أخرى", nameEn: "Other Operating Revenue", type: "revenue", isGroup: false, parentCode: "41" },
  { code: "42", nameAr: "إيرادات أخرى", nameEn: "Other Revenue", type: "revenue", isGroup: true, parentCode: "4" },
  { code: "421", nameAr: "إيرادات متنوعة", nameEn: "Miscellaneous Income", type: "revenue", isGroup: false, parentCode: "42" },
  { code: "422", nameAr: "إيرادات غير تشغيلية", nameEn: "Non-operating Revenue", type: "revenue", isGroup: false, parentCode: "42" },
  { code: "423", nameAr: "أرباح فروق العملة", nameEn: "Foreign Exchange Gains", type: "revenue", isGroup: false, parentCode: "42" },

  // ---- Expenses (5 / 51 / 52 / 53 / 54 / 55) ----
  { code: "5", nameAr: "المصروفات", nameEn: "Expenses", type: "expense", isGroup: true, parentCode: null },
  { code: "51", nameAr: "تكلفة المبيعات", nameEn: "Cost of Sales", type: "expense", isGroup: true, parentCode: "5" },
  { code: "511", nameAr: "مواد أولية مباشرة", nameEn: "Direct Materials", type: "expense", isGroup: false, parentCode: "51" },
  { code: "512", nameAr: "أجور مباشرة", nameEn: "Direct Labor", type: "expense", isGroup: false, parentCode: "51" },
  { code: "513", nameAr: "تكاليف مشاريع", nameEn: "Project Costs", type: "expense", isGroup: false, parentCode: "51" },
  { code: "514", nameAr: "تكاليف تقديم الخدمات", nameEn: "Service Delivery Costs", type: "expense", isGroup: false, parentCode: "51" },
  { code: "515", nameAr: "تكاليف مقاولين من الباطن", nameEn: "Subcontractor Costs", type: "expense", isGroup: false, parentCode: "51" },
  { code: "52", nameAr: "المصروفات العمومية والإدارية", nameEn: "General & Administrative Expenses", type: "expense", isGroup: true, parentCode: "5" },
  { code: "521", nameAr: "رواتب وأجور", nameEn: "Salaries & Wages", type: "expense", isGroup: false, parentCode: "52" },
  { code: "522", nameAr: "إيجارات", nameEn: "Rent", type: "expense", isGroup: false, parentCode: "52" },
  { code: "523", nameAr: "مرافق", nameEn: "Utilities", type: "expense", isGroup: false, parentCode: "52" },
  { code: "524", nameAr: "مصروفات مكتبية", nameEn: "Office Expenses", type: "expense", isGroup: false, parentCode: "52" },
  { code: "525", nameAr: "أتعاب مهنية", nameEn: "Professional Fees", type: "expense", isGroup: false, parentCode: "52" },
  { code: "526", nameAr: "إهلاك", nameEn: "Depreciation", type: "expense", isGroup: false, parentCode: "52" },
  { code: "527", nameAr: "مصروفات بنكية", nameEn: "Bank Charges", type: "expense", isGroup: false, parentCode: "52" },
  { code: "53", nameAr: "مصروفات البيع والتسويق", nameEn: "Marketing Expenses", type: "expense", isGroup: true, parentCode: "5" },
  { code: "531", nameAr: "إعلان ودعاية", nameEn: "Advertising", type: "expense", isGroup: false, parentCode: "53" },
  { code: "532", nameAr: "عمولات تسويق", nameEn: "Marketing Commissions", type: "expense", isGroup: false, parentCode: "53" },
  { code: "533", nameAr: "نقل وشحن", nameEn: "Transportation & Shipping", type: "expense", isGroup: false, parentCode: "53" },
  { code: "54", nameAr: "المصروفات التمويلية", nameEn: "Financing Expenses", type: "expense", isGroup: true, parentCode: "5" },
  { code: "541", nameAr: "فوائد", nameEn: "Interest", type: "expense", isGroup: false, parentCode: "54" },
  { code: "542", nameAr: "عمولات تمويل", nameEn: "Financing Commissions", type: "expense", isGroup: false, parentCode: "54" },
  { code: "55", nameAr: "فروق العملة والخسائر", nameEn: "FX & Other Non-operating Expenses", type: "expense", isGroup: true, parentCode: "5" },
  { code: "551", nameAr: "خسائر فروق العملة", nameEn: "Foreign Exchange Losses", type: "expense", isGroup: false, parentCode: "55" },
];

// Codes for the foreign-exchange gain/loss accounts used by realized FX
// differences (payments) and unrealized revaluation. Both realized and unrealized
// differences post to the same pair.
export const FX_GAIN_CODE = "423";
export const FX_LOSS_CODE = "551";

// Inserts the default chart of accounts for a company, resolving parent codes to
// ids. Must run inside a transaction (pass the Drizzle `tx`).
export async function seedDefaultAccounts(
  tx: Tx,
  companyId: string,
): Promise<Map<string, string>> {
  const codeToId = new Map<string, string>();
  for (const acc of DEFAULT_CHART_OF_ACCOUNTS) {
    const parentId = acc.parentCode ? codeToId.get(acc.parentCode) ?? null : null;
    const [row] = await tx
      .insert(accountsTable)
      .values({
        companyId,
        code: acc.code,
        nameAr: acc.nameAr,
        nameEn: acc.nameEn,
        type: acc.type,
        parentId,
        isGroup: acc.isGroup,
      })
      .returning({ id: accountsTable.id });
    if (row) codeToId.set(acc.code, row.id);
  }
  return codeToId;
}

// Resolves (and lazily creates if missing) the FX gain (423) and FX loss (551)
// leaf accounts for a company. Used by realized FX differences on payments and by
// currency revaluation. Older charts that pre-date these accounts get them created
// under the Revenue (42) / Expenses (55) groups. Must run inside a transaction.
export async function ensureFxAccounts(
  tx: Tx,
  companyId: string,
): Promise<{ gainAccountId: string; lossAccountId: string }> {
  async function resolve(
    code: string,
    parentCode: string,
    type: AccountType,
    nameAr: string,
    nameEn: string,
  ): Promise<string> {
    const [existing] = await tx
      .select({ id: accountsTable.id })
      .from(accountsTable)
      .where(and(eq(accountsTable.companyId, companyId), eq(accountsTable.code, code)))
      .limit(1);
    if (existing) return existing.id;

    const [parent] = await tx
      .select({ id: accountsTable.id })
      .from(accountsTable)
      .where(
        and(eq(accountsTable.companyId, companyId), eq(accountsTable.code, parentCode)),
      )
      .limit(1);
    const [row] = await tx
      .insert(accountsTable)
      .values({
        companyId,
        code,
        nameAr,
        nameEn,
        type,
        parentId: parent?.id ?? null,
        isGroup: false,
      })
      .returning({ id: accountsTable.id });
    return row!.id;
  }

  const gainAccountId = await resolve(
    FX_GAIN_CODE,
    "42",
    "revenue",
    "أرباح فروق العملة",
    "Foreign Exchange Gains",
  );
  const lossAccountId = await resolve(
    FX_LOSS_CODE,
    "55",
    "expense",
    "خسائر فروق العملة",
    "Foreign Exchange Losses",
  );
  return { gainAccountId, lossAccountId };
}
