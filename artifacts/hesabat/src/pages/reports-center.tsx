import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowRightLeft,
  BookMarked,
  BriefcaseBusiness,
  Building2,
  Calculator,
  FileBarChart2,
  FileClock,
  FileSpreadsheet,
  Gem,
  Landmark,
  LayoutGrid,
  Package,
  Scale,
  Search,
  ShieldCheck,
  Star,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type CategoryKey =
  | "financial"
  | "sales"
  | "purchases"
  | "cashBank"
  | "inventory"
  | "fixedAssets"
  | "payroll"
  | "tax";

type ReportStatus = "ready" | "linked" | "comingSoon";

type ReportItem = {
  id: string;
  category: CategoryKey;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  href: string;
  icon: LucideIcon;
  status: ReportStatus;
};

const FAVORITES_KEY = "reports-center-favorites";

const CATEGORIES: Array<{ key: CategoryKey; letter: string }> = [
  { key: "financial", letter: "A" },
  { key: "sales", letter: "B" },
  { key: "purchases", letter: "C" },
  { key: "cashBank", letter: "D" },
  { key: "inventory", letter: "E" },
  { key: "fixedAssets", letter: "F" },
  { key: "payroll", letter: "G" },
  { key: "tax", letter: "H" },
];

const REPORTS: ReportItem[] = [
  {
    id: "trial-balance",
    category: "financial",
    titleAr: "ميزان المراجعة",
    titleEn: "Trial Balance",
    descriptionAr: "صفحة تفصيلية حديثة لميزان المراجعة مع نفس منطق التقرير الحالي.",
    descriptionEn: "Modern detail page for Trial Balance with existing report logic preserved.",
    href: "/reports/financial/trial-balance",
    icon: Scale,
    status: "ready",
  },
  {
    id: "general-ledger",
    category: "financial",
    titleAr: "دفتر الأستاذ",
    titleEn: "General Ledger",
    descriptionAr: "صفحة تفصيلية حديثة لدفتر الأستاذ مع نفس الفلاتر والتصدير.",
    descriptionEn: "Modern detail page for General Ledger with existing filters and export.",
    href: "/reports/financial/general-ledger",
    icon: BookMarked,
    status: "ready",
  },
  {
    id: "account-statement",
    category: "financial",
    titleAr: "كشف حساب",
    titleEn: "Account Statement",
    descriptionAr: "صفحة حديثة لكشف الحساب مبنية على منطق التقرير الحالي.",
    descriptionEn: "Modern Account Statement page built on top of existing report logic.",
    href: "/reports/financial/account-statement",
    icon: FileSpreadsheet,
    status: "ready",
  },
  {
    id: "income-statement",
    category: "financial",
    titleAr: "قائمة الدخل",
    titleEn: "Income Statement",
    descriptionAr: "صفحة تفصيلية حديثة لقائمة الدخل مع نفس حسابات الإيراد والمصروف.",
    descriptionEn: "Modern Income Statement detail page with unchanged revenue/expense calculations.",
    href: "/reports/financial/income-statement",
    icon: TrendingUp,
    status: "ready",
  },
  {
    id: "balance-sheet",
    category: "financial",
    titleAr: "قائمة المركز المالي",
    titleEn: "Statement of Financial Position",
    descriptionAr: "صفحة حديثة لقائمة المركز المالي مع الحفاظ على نفس المنطق.",
    descriptionEn: "Modern balance sheet page preserving current accounting logic.",
    href: "/reports/financial/balance-sheet",
    icon: ShieldCheck,
    status: "ready",
  },
  {
    id: "owners-equity",
    category: "financial",
    titleAr: "قائمة حقوق الملكية",
    titleEn: "Statement of Owners’ Equity",
    descriptionAr: "سيتم إطلاق تقرير مستقل قريباً، ويمكن مراجعة قسم حقوق الملكية في المركز المالي حالياً.",
    descriptionEn: "Standalone report is coming soon; use the equity section in Balance Sheet for now.",
    href: "/reports/financial/balance-sheet",
    icon: Gem,
    status: "comingSoon",
  },
  {
    id: "cash-flow",
    category: "financial",
    titleAr: "قائمة التدفقات النقدية",
    titleEn: "Cash Flow Statement",
    descriptionAr: "صفحة حديثة للتدفقات النقدية مع نفس بيانات التقرير الحالي.",
    descriptionEn: "Modern Cash Flow Statement page powered by the existing report data.",
    href: "/reports/financial/cash-flow",
    icon: Wallet,
    status: "ready",
  },
  {
    id: "cash-forecast",
    category: "financial",
    titleAr: "التوقعات النقدية",
    titleEn: "Cash Flow Forecast",
    descriptionAr: "مرتبط بالتقرير الحالي ضمن التقارير المالية.",
    descriptionEn: "Linked to the current financial report implementation.",
    href: "/reports/financial?tab=cashForecast",
    icon: FileClock,
    status: "linked",
  },
  {
    id: "currency-revaluation",
    category: "financial",
    titleAr: "إعادة تقييم العملات",
    titleEn: "Currency Revaluation",
    descriptionAr: "مرتبط بالتقرير الحالي لإعادة تقييم العملات.",
    descriptionEn: "Linked to the existing currency revaluation report.",
    href: "/reports/financial?tab=revaluation",
    icon: ArrowRightLeft,
    status: "linked",
  },

  {
    id: "customer-statement",
    category: "sales",
    titleAr: "كشف عميل",
    titleEn: "Customer Statement",
    descriptionAr: "مرتبط بصفحة كشف حساب العميل الحالية.",
    descriptionEn: "Linked to the current customer statement page.",
    href: "/sales",
    icon: Users,
    status: "linked",
  },
  {
    id: "customer-aging",
    category: "sales",
    titleAr: "تقادم العملاء",
    titleEn: "Customer Aging",
    descriptionAr: "مرتبط بالتقرير الحالي لتقادم العملاء.",
    descriptionEn: "Linked to the current customer aging report.",
    href: "/reports?tab=aging&partyType=customer",
    icon: Activity,
    status: "linked",
  },
  {
    id: "sales-invoices-report",
    category: "sales",
    titleAr: "تقرير فواتير المبيعات",
    titleEn: "Sales Invoices Report",
    descriptionAr: "مرتبط بواجهة فواتير المبيعات الحالية.",
    descriptionEn: "Linked to the existing sales invoices experience.",
    href: "/invoices/sales",
    icon: FileSpreadsheet,
    status: "linked",
  },
  {
    id: "sales-by-customer",
    category: "sales",
    titleAr: "مبيعات حسب العميل",
    titleEn: "Sales by Customer",
    descriptionAr: "ستتوفر صفحة مخصصة قريباً.",
    descriptionEn: "Dedicated page is coming soon.",
    href: "/reports/center",
    icon: Users,
    status: "comingSoon",
  },
  {
    id: "sales-by-item",
    category: "sales",
    titleAr: "مبيعات حسب المنتج",
    titleEn: "Sales by Item / Product",
    descriptionAr: "مرتبط بالتقرير الحالي للمبيعات حسب المنتج.",
    descriptionEn: "Linked to the existing sales-by-item report.",
    href: "/reports?tab=salesByItem",
    icon: Package,
    status: "linked",
  },
  {
    id: "sales-by-project",
    category: "sales",
    titleAr: "مبيعات حسب المشروع",
    titleEn: "Sales by Project",
    descriptionAr: "ستتوفر صفحة مخصصة قريباً.",
    descriptionEn: "Dedicated page is coming soon.",
    href: "/reports/center",
    icon: BriefcaseBusiness,
    status: "comingSoon",
  },
  {
    id: "sales-by-branch",
    category: "sales",
    titleAr: "مبيعات حسب الفرع",
    titleEn: "Sales by Branch",
    descriptionAr: "ستتوفر صفحة مخصصة قريباً.",
    descriptionEn: "Dedicated page is coming soon.",
    href: "/reports/center",
    icon: Building2,
    status: "comingSoon",
  },
  {
    id: "sales-by-cost-center",
    category: "sales",
    titleAr: "مبيعات حسب مركز التكلفة",
    titleEn: "Sales by Cost Center",
    descriptionAr: "ستتوفر صفحة مخصصة قريباً.",
    descriptionEn: "Dedicated page is coming soon.",
    href: "/reports/center",
    icon: Calculator,
    status: "comingSoon",
  },
  {
    id: "collections-by-customer",
    category: "sales",
    titleAr: "التحصيلات حسب العميل",
    titleEn: "Collections by Customer",
    descriptionAr: "مرتبط بواجهة التحصيلات الحالية.",
    descriptionEn: "Linked to the current collections module.",
    href: "/collections",
    icon: Wallet,
    status: "linked",
  },

  {
    id: "supplier-statement",
    category: "purchases",
    titleAr: "كشف مورد",
    titleEn: "Supplier Statement",
    descriptionAr: "مرتبط بصفحة كشف حساب المورد الحالية.",
    descriptionEn: "Linked to the current supplier statement page.",
    href: "/purchases",
    icon: BriefcaseBusiness,
    status: "linked",
  },
  {
    id: "supplier-aging",
    category: "purchases",
    titleAr: "تقادم الموردين",
    titleEn: "Supplier Aging",
    descriptionAr: "مرتبط بالتقرير الحالي لتقادم الموردين.",
    descriptionEn: "Linked to the current supplier aging report.",
    href: "/reports?tab=aging&partyType=supplier",
    icon: Building2,
    status: "linked",
  },
  {
    id: "purchase-invoices-report",
    category: "purchases",
    titleAr: "تقرير فواتير المشتريات",
    titleEn: "Purchase Invoices Report",
    descriptionAr: "مرتبط بواجهة فواتير المشتريات الحالية.",
    descriptionEn: "Linked to the current purchase invoices module.",
    href: "/invoices/purchases",
    icon: FileSpreadsheet,
    status: "linked",
  },
  {
    id: "purchases-by-supplier",
    category: "purchases",
    titleAr: "مشتريات حسب المورد",
    titleEn: "Purchases by Supplier",
    descriptionAr: "ستتوفر صفحة مخصصة قريباً.",
    descriptionEn: "Dedicated page is coming soon.",
    href: "/reports/center",
    icon: Users,
    status: "comingSoon",
  },
  {
    id: "purchases-by-item",
    category: "purchases",
    titleAr: "مشتريات حسب المنتج",
    titleEn: "Purchases by Item / Product",
    descriptionAr: "مرتبط بالتقرير الحالي للمشتريات حسب المنتج.",
    descriptionEn: "Linked to the existing purchases-by-item report.",
    href: "/reports?tab=purchasesByItem",
    icon: Package,
    status: "linked",
  },
  {
    id: "purchases-by-project",
    category: "purchases",
    titleAr: "مشتريات حسب المشروع",
    titleEn: "Purchases by Project",
    descriptionAr: "ستتوفر صفحة مخصصة قريباً.",
    descriptionEn: "Dedicated page is coming soon.",
    href: "/reports/center",
    icon: BriefcaseBusiness,
    status: "comingSoon",
  },
  {
    id: "purchases-by-branch",
    category: "purchases",
    titleAr: "مشتريات حسب الفرع",
    titleEn: "Purchases by Branch",
    descriptionAr: "ستتوفر صفحة مخصصة قريباً.",
    descriptionEn: "Dedicated page is coming soon.",
    href: "/reports/center",
    icon: Building2,
    status: "comingSoon",
  },
  {
    id: "purchases-by-cost-center",
    category: "purchases",
    titleAr: "مشتريات حسب مركز التكلفة",
    titleEn: "Purchases by Cost Center",
    descriptionAr: "ستتوفر صفحة مخصصة قريباً.",
    descriptionEn: "Dedicated page is coming soon.",
    href: "/reports/center",
    icon: Calculator,
    status: "comingSoon",
  },
  {
    id: "expenses-by-project",
    category: "purchases",
    titleAr: "مصروفات حسب المشروع",
    titleEn: "Expenses by Project",
    descriptionAr: "ستتوفر صفحة مخصصة قريباً.",
    descriptionEn: "Dedicated page is coming soon.",
    href: "/reports/center",
    icon: BriefcaseBusiness,
    status: "comingSoon",
  },
  {
    id: "expenses-by-branch",
    category: "purchases",
    titleAr: "مصروفات حسب الفرع",
    titleEn: "Expenses by Branch",
    descriptionAr: "ستتوفر صفحة مخصصة قريباً.",
    descriptionEn: "Dedicated page is coming soon.",
    href: "/reports/center",
    icon: Building2,
    status: "comingSoon",
  },
  {
    id: "expenses-by-cost-center",
    category: "purchases",
    titleAr: "مصروفات حسب مركز التكلفة",
    titleEn: "Expenses by Cost Center",
    descriptionAr: "ستتوفر صفحة مخصصة قريباً.",
    descriptionEn: "Dedicated page is coming soon.",
    href: "/reports/center",
    icon: Calculator,
    status: "comingSoon",
  },
  {
    id: "payments-by-supplier",
    category: "purchases",
    titleAr: "مدفوعات حسب المورد",
    titleEn: "Payments by Supplier",
    descriptionAr: "مرتبط بواجهة مدفوعات الموردين الحالية.",
    descriptionEn: "Linked to the current vendor payments module.",
    href: "/vendor-payments",
    icon: Wallet,
    status: "linked",
  },

  {
    id: "bank-movements",
    category: "cashBank",
    titleAr: "حركات البنك",
    titleEn: "Bank Movements",
    descriptionAr: "مرتبط بمركز البنوك الحالي.",
    descriptionEn: "Linked to the current banking center.",
    href: "/bank",
    icon: Landmark,
    status: "linked",
  },
  {
    id: "cash-bank-balances",
    category: "cashBank",
    titleAr: "أرصدة النقدية والبنوك",
    titleEn: "Cash / Bank Balances",
    descriptionAr: "مرتبط بمركز البنوك الحالي.",
    descriptionEn: "Linked to the current banking center.",
    href: "/bank",
    icon: Wallet,
    status: "linked",
  },
  {
    id: "bank-reconciliation",
    category: "cashBank",
    titleAr: "تقرير المطابقة البنكية",
    titleEn: "Bank Reconciliation Report",
    descriptionAr: "مرتبط بواجهة المطابقة البنكية الحالية.",
    descriptionEn: "Linked to the existing bank reconciliation report.",
    href: "/bank",
    icon: ShieldCheck,
    status: "linked",
  },
  {
    id: "cash-flow-actual",
    category: "cashBank",
    titleAr: "التدفق النقدي الفعلي",
    titleEn: "Cash Flow Actual",
    descriptionAr: "مرتبط بصفحة التدفقات النقدية الحالية.",
    descriptionEn: "Linked to the current cash flow report.",
    href: "/reports/financial/cash-flow",
    icon: Activity,
    status: "linked",
  },
  {
    id: "cash-flow-forecast-cash",
    category: "cashBank",
    titleAr: "التوقعات النقدية",
    titleEn: "Cash Flow Forecast",
    descriptionAr: "مرتبط بالتقرير الحالي للتوقعات النقدية.",
    descriptionEn: "Linked to the current cash forecast report.",
    href: "/reports/financial?tab=cashForecast",
    icon: FileClock,
    status: "linked",
  },

  {
    id: "inventory-movement",
    category: "inventory",
    titleAr: "حركة المخزون",
    titleEn: "Inventory Movement",
    descriptionAr: "مرتبط بالتقرير الحالي لحركة المخزون.",
    descriptionEn: "Linked to the current inventory movement report.",
    href: "/reports?tab=inventorySummary",
    icon: ArrowRightLeft,
    status: "linked",
  },
  {
    id: "item-balances",
    category: "inventory",
    titleAr: "أرصدة الأصناف",
    titleEn: "Item Balances",
    descriptionAr: "مرتبط بصفحة المخزون الحالية.",
    descriptionEn: "Linked to the current inventory page.",
    href: "/inventory",
    icon: Package,
    status: "linked",
  },
  {
    id: "inventory-valuation",
    category: "inventory",
    titleAr: "تقييم المخزون",
    titleEn: "Inventory Valuation",
    descriptionAr: "ستتوفر صفحة تقييم المخزون قريباً.",
    descriptionEn: "Inventory valuation page is coming soon.",
    href: "/reports/center",
    icon: FileBarChart2,
    status: "comingSoon",
  },
  {
    id: "inventory-by-warehouse",
    category: "inventory",
    titleAr: "المخزون حسب المستودع",
    titleEn: "Inventory by Warehouse / Store",
    descriptionAr: "ستتوفر صفحة مخصصة قريباً.",
    descriptionEn: "Dedicated page is coming soon.",
    href: "/reports/center",
    icon: Building2,
    status: "comingSoon",
  },
  {
    id: "purchases-by-item-inventory",
    category: "inventory",
    titleAr: "مشتريات حسب الصنف",
    titleEn: "Purchases by Item",
    descriptionAr: "مرتبط بالتقرير الحالي للمشتريات حسب المنتج.",
    descriptionEn: "Linked to the current purchases-by-item report.",
    href: "/reports?tab=purchasesByItem",
    icon: FileSpreadsheet,
    status: "linked",
  },
  {
    id: "sales-by-item-inventory",
    category: "inventory",
    titleAr: "مبيعات حسب الصنف",
    titleEn: "Sales by Item",
    descriptionAr: "مرتبط بالتقرير الحالي للمبيعات حسب المنتج.",
    descriptionEn: "Linked to the current sales-by-item report.",
    href: "/reports?tab=salesByItem",
    icon: TrendingUp,
    status: "linked",
  },

  {
    id: "asset-register",
    category: "fixedAssets",
    titleAr: "سجل الأصول",
    titleEn: "Asset Register",
    descriptionAr: "مرتبط بسجل الأصول الحالي.",
    descriptionEn: "Linked to the current fixed assets register.",
    href: "/assets",
    icon: Gem,
    status: "linked",
  },
  {
    id: "depreciation-report",
    category: "fixedAssets",
    titleAr: "تقرير الإهلاك",
    titleEn: "Depreciation Report",
    descriptionAr: "قيد التطوير وسيتوفر قريباً.",
    descriptionEn: "Under development and coming soon.",
    href: "/assets",
    icon: FileBarChart2,
    status: "comingSoon",
  },
  {
    id: "nbv-report",
    category: "fixedAssets",
    titleAr: "صافي القيمة الدفترية",
    titleEn: "Net Book Value Report",
    descriptionAr: "قيد التطوير وسيتوفر قريباً.",
    descriptionEn: "Under development and coming soon.",
    href: "/assets",
    icon: Scale,
    status: "comingSoon",
  },
  {
    id: "asset-movement-report",
    category: "fixedAssets",
    titleAr: "تقرير حركة الأصول",
    titleEn: "Asset Movement Report",
    descriptionAr: "قيد التطوير وسيتوفر قريباً.",
    descriptionEn: "Under development and coming soon.",
    href: "/assets",
    icon: ArrowRightLeft,
    status: "comingSoon",
  },

  {
    id: "employee-account-statement",
    category: "payroll",
    titleAr: "كشف حساب الموظف",
    titleEn: "Employee Account Statement",
    descriptionAr: "مرتبط بمركز الرواتب الحالي.",
    descriptionEn: "Linked to the current payroll center.",
    href: "/payroll",
    icon: Users,
    status: "linked",
  },
  {
    id: "payroll-report",
    category: "payroll",
    titleAr: "تقرير الرواتب",
    titleEn: "Payroll Report",
    descriptionAr: "مرتبط بواجهة الرواتب الحالية.",
    descriptionEn: "Linked to the current payroll module.",
    href: "/payroll",
    icon: Wallet,
    status: "linked",
  },
  {
    id: "custody-report",
    category: "payroll",
    titleAr: "تقرير العهد",
    titleEn: "Custody Report",
    descriptionAr: "مرتبط بواجهة السلف والعهد الحالية.",
    descriptionEn: "Linked to the current custody module.",
    href: "/advances",
    icon: BriefcaseBusiness,
    status: "linked",
  },
  {
    id: "employee-advances-report",
    category: "payroll",
    titleAr: "تقرير سلف الموظفين",
    titleEn: "Employee Advances Report",
    descriptionAr: "مرتبط بواجهة السلف الحالية.",
    descriptionEn: "Linked to the current advances page.",
    href: "/advances",
    icon: TrendingDown,
    status: "linked",
  },
  {
    id: "custody-settlements-report",
    category: "payroll",
    titleAr: "تقرير تسويات العهد",
    titleEn: "Custody Settlements Report",
    descriptionAr: "مرتبط بواجهة العهد الحالية.",
    descriptionEn: "Linked to the current custody settlements experience.",
    href: "/advances",
    icon: FileClock,
    status: "linked",
  },

  {
    id: "vat-report",
    category: "tax",
    titleAr: "تقرير ضريبة القيمة المضافة",
    titleEn: "VAT Report",
    descriptionAr: "مرتبط بالتقرير الضريبي الحالي عند توفر البيانات.",
    descriptionEn: "Linked to the existing VAT report where data is available.",
    href: "/reports/tax",
    icon: Calculator,
    status: "linked",
  },
  {
    id: "withholding-tax-report",
    category: "tax",
    titleAr: "تقرير ضريبة الاستقطاع",
    titleEn: "Withholding Tax Report",
    descriptionAr: "مرتبط بالتقرير الضريبي الحالي عند توفر البيانات.",
    descriptionEn: "Linked to the existing withholding tax report where data is available.",
    href: "/reports/tax",
    icon: ShieldCheck,
    status: "linked",
  },
  {
    id: "sales-tax-summary",
    category: "tax",
    titleAr: "ملخص ضريبة المبيعات",
    titleEn: "Sales Tax Summary",
    descriptionAr: "مرتبط بالتقرير الضريبي الحالي.",
    descriptionEn: "Linked to the current tax report.",
    href: "/reports/tax",
    icon: TrendingUp,
    status: "linked",
  },
  {
    id: "purchase-tax-summary",
    category: "tax",
    titleAr: "ملخص ضريبة المشتريات",
    titleEn: "Purchase Tax Summary",
    descriptionAr: "مرتبط بالتقرير الضريبي الحالي.",
    descriptionEn: "Linked to the current tax report.",
    href: "/reports/tax",
    icon: TrendingDown,
    status: "linked",
  },
];

export function ReportsCenter() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(FAVORITES_KEY);
      if (stored) setFavorites(JSON.parse(stored));
    } catch {
      setFavorites([]);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch {
      // ignore persistence errors
    }
  }, [favorites]);

  const query = search.trim().toLowerCase();
  const filteredReports = useMemo(() => {
    if (!query) return REPORTS;
    return REPORTS.filter((report) =>
      [
        report.titleAr,
        report.titleEn,
        report.descriptionAr,
        report.descriptionEn,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [query]);

  const favoriteReports = filteredReports.filter((report) =>
    favorites.includes(report.id),
  );

  const toggleFavorite = (reportId: string) => {
    setFavorites((current) =>
      current.includes(reportId)
        ? current.filter((id) => id !== reportId)
        : [...current, reportId],
    );
  };

  const renderCard = (report: ReportItem) => {
    const favorited = favorites.includes(report.id);
    const Icon = report.icon;
    const statusClass =
      report.status === "ready"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : report.status === "linked"
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-amber-200 bg-amber-50 text-amber-700";
    return (
      <div
        key={report.id}
        role="button"
        tabIndex={0}
        onClick={() => setLocation(report.href)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setLocation(report.href);
          }
        }}
        className="group flex h-full cursor-pointer flex-col rounded-3xl border border-border bg-card p-5 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary/10 p-3 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-base font-bold text-foreground">
                {lang.startsWith("ar") ? report.titleAr : report.titleEn}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={statusClass}>
              {t(`reportsCenter.status.${report.status}`)}
            </Badge>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                toggleFavorite(report.id);
              }}
              className={`rounded-full p-2 transition-colors ${
                favorited
                  ? "bg-amber-100 text-amber-600"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              aria-label={favorited ? "Remove favorite" : "Add favorite"}
            >
              <Star className={`h-4 w-4 ${favorited ? "fill-current" : ""}`} />
            </button>
          </div>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          {lang.startsWith("ar") ? report.descriptionAr : report.descriptionEn}
        </p>
      </div>
    );
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6 lg:p-8">
      <section className="rounded-[2rem] border border-border bg-gradient-to-br from-primary/10 via-background to-background p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <LayoutGrid className="h-3.5 w-3.5" />
              {t("nav.reportsCenter")}
            </div>
            <h1 className="text-3xl font-black tracking-tight text-foreground">
              {t("reportsCenter.title")}
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("reportsCenter.subtitle")}
            </p>
          </div>
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("reportsCenter.search")}
              className="h-12 rounded-2xl bg-background ps-10"
            />
          </div>
        </div>
      </section>

      {favoriteReports.length > 0 && (
        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
            <h2 className="text-lg font-bold text-foreground">
              {t("reportsCenter.favorites")}
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {favoriteReports.map(renderCard)}
          </div>
        </section>
      )}

      {!filteredReports.length ? (
        <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
          {t("reportsCenter.noResults")}
        </div>
      ) : (
        CATEGORIES.map((category) => {
          const reports = filteredReports.filter(
            (report) => report.category === category.key,
          );
          if (!reports.length) return null;
          return (
            <section key={category.key} className="rounded-3xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-sm font-black text-primary-foreground">
                  {category.letter}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">
                    {t(`reportsCenter.categories.${category.key}`)}
                  </h2>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {reports.map(renderCard)}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
