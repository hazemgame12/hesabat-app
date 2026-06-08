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

  // ---- Equity ----
  { code: "31", nameAr: "حقوق الملكية", nameEn: "Equity", type: "equity", isGroup: true, parentCode: null },
  { code: "311", nameAr: "رأس المال", nameEn: "Capital", type: "equity", isGroup: false, parentCode: "31" },
  { code: "312", nameAr: "الأرباح المحتجزة", nameEn: "Retained Earnings", type: "equity", isGroup: false, parentCode: "31" },
  { code: "313", nameAr: "رصيد افتتاحي", nameEn: "Opening Balance Equity", type: "equity", isGroup: false, parentCode: "31" },

  // ---- Revenue ----
  { code: "41", nameAr: "الإيرادات", nameEn: "Revenue", type: "revenue", isGroup: true, parentCode: null },
  { code: "411", nameAr: "إيرادات المبيعات", nameEn: "Sales Revenue", type: "revenue", isGroup: false, parentCode: "41" },
  { code: "412", nameAr: "إيرادات أخرى", nameEn: "Other Revenue", type: "revenue", isGroup: false, parentCode: "41" },

  // ---- Expenses ----
  { code: "51", nameAr: "المصروفات", nameEn: "Expenses", type: "expense", isGroup: true, parentCode: null },
  { code: "511", nameAr: "رواتب وأجور", nameEn: "Salaries & Wages", type: "expense", isGroup: false, parentCode: "51" },
  { code: "512", nameAr: "إيجارات", nameEn: "Rent", type: "expense", isGroup: false, parentCode: "51" },
  { code: "513", nameAr: "مصروفات تشغيل", nameEn: "Operating Expenses", type: "expense", isGroup: false, parentCode: "51" },
  { code: "514", nameAr: "تكلفة المبيعات", nameEn: "Cost of Sales", type: "expense", isGroup: false, parentCode: "51" },
  { code: "515", nameAr: "مصروفات وعمولات بنكية", nameEn: "Bank Charges & Commissions", type: "expense", isGroup: false, parentCode: "51" },
];

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
