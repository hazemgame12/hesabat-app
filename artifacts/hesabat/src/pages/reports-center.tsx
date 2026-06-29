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
  | "payroll";

type ReportItem = {
  id: string;
  category: CategoryKey;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  href: string;
  icon: LucideIcon;
  comingSoon?: boolean;
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
];

const REPORTS: ReportItem[] = [
  {
    id: "trial-balance",
    category: "financial",
    titleAr: "ميزان المراجعة",
    titleEn: "Trial Balance",
    descriptionAr: "مراجعة الأرصدة الافتتاحية والحركة والختامية لكل حساب.",
    descriptionEn: "Review opening, movement, and closing balances by account.",
    href: "/reports/financial/trial-balance",
    icon: Scale,
  },
  {
    id: "general-ledger",
    category: "financial",
    titleAr: "دفتر الأستاذ",
    titleEn: "General Ledger",
    descriptionAr: "متابعة الحركات التفصيلية والرصيد الجاري لكل حساب.",
    descriptionEn: "Inspect detailed movements and running balances for each account.",
    href: "/reports/financial/general-ledger",
    icon: BookMarked,
  },
  {
    id: "account-statement",
    category: "financial",
    titleAr: "كشف حساب",
    titleEn: "Account Statement",
    descriptionAr: "استخراج كشف حساب تفصيلي لفترة محددة.",
    descriptionEn: "Generate a detailed account statement for a selected period.",
    href: "/reports/financial/account-statement",
    icon: FileSpreadsheet,
  },
  {
    id: "income-statement",
    category: "financial",
    titleAr: "قائمة الدخل",
    titleEn: "Income Statement",
    descriptionAr: "تحليل الإيرادات والمصروفات وصافي الربح.",
    descriptionEn: "Analyze revenue, expenses, and net profit.",
    href: "/reports/financial/income-statement",
    icon: TrendingUp,
  },
  {
    id: "balance-sheet",
    category: "financial",
    titleAr: "قائمة المركز المالي",
    titleEn: "Balance Sheet",
    descriptionAr: "عرض الأصول والالتزامات وحقوق الملكية حتى تاريخ معين.",
    descriptionEn: "View assets, liabilities, and equity as of a specific date.",
    href: "/reports/financial/balance-sheet",
    icon: ShieldCheck,
  },
  {
    id: "owners-equity",
    category: "financial",
    titleAr: "حقوق الملكية",
    titleEn: "Owners' Equity",
    descriptionAr: "متابعة رصيد حقوق الملكية ونتيجة الفترة.",
    descriptionEn: "Track owner equity balances and current period result.",
    href: "/reports/financial/balance-sheet",
    icon: Gem,
  },
  {
    id: "cash-flow",
    category: "financial",
    titleAr: "التدفقات النقدية",
    titleEn: "Cash Flow",
    descriptionAr: "مراقبة التدفقات الداخلة والخارجة وصافي النقدية.",
    descriptionEn: "Monitor inflows, outflows, and net cash position.",
    href: "/reports/financial/cash-flow",
    icon: Wallet,
  },
  {
    id: "cash-forecast",
    category: "financial",
    titleAr: "التوقعات النقدية",
    titleEn: "Cash Forecast",
    descriptionAr: "توقع السيولة المستقبلية عبر الفترات القادمة.",
    descriptionEn: "Forecast future liquidity across upcoming periods.",
    href: "/reports/financial/cash-flow",
    icon: FileClock,
  },
  {
    id: "currency-revaluation",
    category: "financial",
    titleAr: "إعادة تقييم العملات",
    titleEn: "Currency Revaluation",
    descriptionAr: "حساب فروق إعادة تقييم الأرصدة متعددة العملات.",
    descriptionEn: "Calculate revaluation differences for foreign currency balances.",
    href: "/reports/financial",
    icon: ArrowRightLeft,
  },
  {
    id: "customer-statement",
    category: "sales",
    titleAr: "كشف عميل",
    titleEn: "Customer Statement",
    descriptionAr: "انتقل إلى العملاء ثم اختر العميل المطلوب لاستخراج كشف الحساب.",
    descriptionEn: "Go to Customers and select the desired customer to open the statement.",
    href: "/sales",
    icon: Users,
  },
  {
    id: "customer-aging",
    category: "sales",
    titleAr: "تقادم العملاء",
    titleEn: "Customer Aging",
    descriptionAr: "تحليل أعمار الذمم المدينة للعملاء.",
    descriptionEn: "Analyze customer receivables aging buckets.",
    href: "/reports?tab=aging&partyType=customer",
    icon: Activity,
  },
  {
    id: "sales-by-item",
    category: "sales",
    titleAr: "مبيعات حسب المنتج",
    titleEn: "Sales by Item",
    descriptionAr: "قياس أداء المبيعات حسب المنتج أو الخدمة.",
    descriptionEn: "Measure sales performance by product or service.",
    href: "/reports?tab=salesByItem",
    icon: Package,
  },
  {
    id: "supplier-statement",
    category: "purchases",
    titleAr: "كشف مورد",
    titleEn: "Supplier Statement",
    descriptionAr: "انتقل إلى الموردين ثم اختر المورد المطلوب لعرض كشف الحساب.",
    descriptionEn: "Go to Suppliers and select the desired supplier to view the statement.",
    href: "/purchases",
    icon: BriefcaseBusiness,
  },
  {
    id: "supplier-aging",
    category: "purchases",
    titleAr: "تقادم الموردين",
    titleEn: "Supplier Aging",
    descriptionAr: "متابعة أعمار الذمم الدائنة للموردين.",
    descriptionEn: "Track supplier payables aging buckets.",
    href: "/reports?tab=aging&partyType=supplier",
    icon: Building2,
  },
  {
    id: "purchases-by-item",
    category: "purchases",
    titleAr: "مشتريات حسب المنتج",
    titleEn: "Purchases by Item",
    descriptionAr: "تحليل المشتريات حسب المنتج أو الخدمة.",
    descriptionEn: "Analyze purchases by product or service.",
    href: "/reports?tab=purchasesByItem",
    icon: Calculator,
  },
  {
    id: "bank-movements",
    category: "cashBank",
    titleAr: "حركات البنك",
    titleEn: "Bank Movements",
    descriptionAr: "استعراض العمليات البنكية والإيداعات والتحويلات.",
    descriptionEn: "Review bank transactions, deposits, and transfers.",
    href: "/bank",
    icon: Landmark,
  },
  {
    id: "bank-reconciliation",
    category: "cashBank",
    titleAr: "مطابقة بنكية",
    titleEn: "Bank Reconciliation",
    descriptionAr: "الوصول إلى مركز البنوك لمتابعة المطابقات البنكية.",
    descriptionEn: "Open the banking center to manage reconciliations.",
    href: "/bank",
    icon: ShieldCheck,
  },
  {
    id: "inventory-summary",
    category: "inventory",
    titleAr: "ملخص المخزون",
    titleEn: "Inventory Summary",
    descriptionAr: "عرض كميات وقيم المخزون الحالية بسرعة.",
    descriptionEn: "Quickly view current inventory quantities and values.",
    href: "/inventory",
    icon: Package,
  },
  {
    id: "inventory-movement",
    category: "inventory",
    titleAr: "حركات المخزون",
    titleEn: "Inventory Movement",
    descriptionAr: "تحليل ملخص الحركات المخزنية خلال الفترة.",
    descriptionEn: "Analyze summarized inventory movement for the period.",
    href: "/reports?tab=inventorySummary",
    icon: ArrowRightLeft,
  },
  {
    id: "asset-register",
    category: "fixedAssets",
    titleAr: "سجل الأصول",
    titleEn: "Asset Register",
    descriptionAr: "الوصول إلى سجل الأصول الثابتة ومتابعة تفاصيلها.",
    descriptionEn: "Access the fixed assets register and its details.",
    href: "/assets",
    icon: Gem,
  },
  {
    id: "depreciation-report",
    category: "fixedAssets",
    titleAr: "تقرير الاستهلاك",
    titleEn: "Depreciation Report",
    descriptionAr: "واجهة مخصصة لتقرير الاستهلاك ستتوفر قريباً.",
    descriptionEn: "A dedicated depreciation report experience is coming soon.",
    href: "/assets",
    icon: FileBarChart2,
    comingSoon: true,
  },
  {
    id: "payroll-report",
    category: "payroll",
    titleAr: "تقرير الرواتب",
    titleEn: "Payroll Report",
    descriptionAr: "الوصول إلى مركز الرواتب وتقارير الموظفين.",
    descriptionEn: "Open payroll operations and employee reporting.",
    href: "/payroll",
    icon: Wallet,
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
                {lang === "ar" ? report.titleAr : report.titleEn}
              </div>
              <div className="text-sm text-muted-foreground">
                {lang === "ar" ? report.titleEn : report.titleAr}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {report.comingSoon && (
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                {t("reportsCenter.comingSoon")}
              </Badge>
            )}
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
              مركز التقارير / Reports Center
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
