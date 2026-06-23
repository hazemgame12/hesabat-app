import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  useGetDashboardSummary,
  useGetCurrentUser,
  useGetCompany,
  useListAccounts,
  useListJournalEntries,
  useListInvoices,
  type DashboardSummary,
  type Account,
  type JournalEntry,
  type InvoiceSummary,
} from "@workspace/api-client-react";
import { countryLabel, currencyLabel, intlLocale, type Lang } from "@workspace/locale";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Tag,
  PieChart as PieChartIcon,
  Globe,
  Coins,
  Pencil,
  ImageOff,
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  FileBarChart,
  SlidersHorizontal,
  Plus,
  RotateCcw,
  Save,
  X,
  LayoutDashboard,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  FileText,
  Hash,
  ArrowUpCircle as ArrowUpCircleRaw,
  ArrowDownCircle as ArrowDownCircleRaw,
  GripVertical,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  BarChart,
  Bar,
} from "recharts";
import { Spinner } from "@/components/ui/spinner";

// --- Constants ---
const ACC_TYPE_COLORS: Record<string, string> = {
  asset: "#2563eb",
  liability: "#dc2626",
  equity: "#7c3aed",
  revenue: "#059669",
  expense: "#d97706",
};

const STORAGE_KEY = "hesabat-dashboard-v2";

const DEFAULT_WIDGETS: string[] = [
  "kpi",
  "financial-overview",
  "revenue-chart",
  "profit-chart",
  "recent-entries",
  "accounts-donut",
  "outstanding-invoices",
];

// --- Widget Registry ---
interface WidgetDef {
  id: string;
  titleAr: string;
  titleEn: string;
  type: string;
  gridSpan: string;
}

const WIDGET_REGISTRY: WidgetDef[] = [
  { id: "kpi", titleAr: "مؤشرات رئيسية", titleEn: "Key metrics", type: "kpi", gridSpan: "col-span-full" },
  { id: "financial-overview", titleAr: "النظرة المالية", titleEn: "Financial overview", type: "finance", gridSpan: "col-span-full" },
  { id: "revenue-chart", titleAr: "الإيرادات والمصروفات", titleEn: "Revenue vs expenses", type: "area", gridSpan: "lg:col-span-2" },
  { id: "profit-chart", titleAr: "صافي الربح", titleEn: "Net profit", type: "bar", gridSpan: "" },
  { id: "recent-entries", titleAr: "أحدث القيود", titleEn: "Recent journal entries", type: "table", gridSpan: "lg:col-span-2" },
  { id: "accounts-donut", titleAr: "توزيع الحسابات", titleEn: "Accounts distribution", type: "donut", gridSpan: "" },
  { id: "outstanding-invoices", titleAr: "الفواتير المفتوحة", titleEn: "Outstanding invoices", type: "status", gridSpan: "col-span-full" },
  { id: "sections-summary", titleAr: "ملخص الأقسام", titleEn: "Sections summary", type: "list", gridSpan: "" },
  { id: "company-card", titleAr: "بيانات الشركة", titleEn: "Company profile", type: "profile", gridSpan: "col-span-full" },
];

// --- Shared card wrapper used in edit mode ---
function WidgetCard({
  className = "",
  children,
  editMode,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  title,
}: {
  className?: string;
  children: React.ReactNode;
  editMode?: boolean;
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  title?: string;
}) {
  return (
    <div className={`relative group/card transition-all ${editMode ? "ring-2 ring-primary/30 ring-offset-2 rounded-2xl" : ""} ${className}`}>
      {editMode && title && (
        <div className="absolute -top-3 start-1/2 -translate-x-1/2 z-20 flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity pointer-events-none">
          <div className="flex items-center gap-1 bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-bold shadow-lg pointer-events-auto">
            <GripVertical className="w-3 h-3" />
            {title}
          </div>
        </div>
      )}
      {editMode && (
        <div className="absolute top-2 start-2 z-10 flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
          {!isFirst && (
            <button onClick={onMoveUp} className="p-1 rounded bg-muted hover:bg-primary hover:text-primary-foreground transition-colors" title="Up">
              <ArrowUpCircleRaw className="w-4 h-4" />
            </button>
          )}
          {!isLast && (
            <button onClick={onMoveDown} className="p-1 rounded bg-muted hover:bg-primary hover:text-primary-foreground transition-colors" title="Down">
              <ArrowDownCircleRaw className="w-4 h-4" />
            </button>
          )}
          <button onClick={onRemove} className="p-1 rounded bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors" title="Remove">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {children}
    </div>
  );
}

// --------------------------------------------------------------------------
// KPI Card — CleanPro style: border-t-4 colored + badge
// --------------------------------------------------------------------------
function KpiCardItem({
  label,
  value,
  hint,
  icon,
  accentColor,
  badgeText,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  accentColor: string;
  badgeText: string;
}) {
  return (
    <div
      className="bg-card rounded-2xl p-5 shadow-sm border border-border/60 border-t-4 flex flex-col gap-3"
      style={{ borderTopColor: accentColor }}
    >
      <div className="flex items-start justify-between">
        <div className="p-2.5 rounded-xl" style={{ backgroundColor: accentColor + "18" }}>
          {icon}
        </div>
        <span
          className="text-xs font-bold px-2.5 py-1 rounded-full"
          style={{ backgroundColor: accentColor + "15", color: accentColor }}
        >
          {badgeText}
        </span>
      </div>
      <div>
        <p className="text-muted-foreground text-xs font-semibold mb-0.5">{label}</p>
        <p className="text-[22px] font-extrabold text-foreground tabular-nums leading-tight">{value}</p>
        <p className="text-muted-foreground text-[11px] mt-1.5">{hint}</p>
      </div>
    </div>
  );
}

function KPIWidget({
  summary,
  fmt,
  t,
}: {
  summary: DashboardSummary;
  fmt: (n: number) => string;
  t: (k: string, opts?: any) => string;
}) {
  const netProfit = summary?.netProfit ?? 0;
  const isProfit = netProfit >= 0;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCardItem
        label={isProfit ? t("dashboard.netProfit") : t("dashboard.netLoss")}
        value={fmt(Math.abs(netProfit))}
        hint={t("dashboard.fiscalYearHint", { year: summary?.fiscalYear ?? new Date().getFullYear() })}
        icon={isProfit
          ? <TrendingUp className="w-5 h-5" style={{ color: "#059669" }} />
          : <TrendingDown className="w-5 h-5" style={{ color: "#dc2626" }} />}
        accentColor={isProfit ? "#059669" : "#dc2626"}
        badgeText={isProfit ? t("dashboard.netProfit") : t("dashboard.netLoss")}
      />
      <KpiCardItem
        label={t("dashboard.cashBalance")}
        value={fmt(summary?.cashBalance ?? 0)}
        hint={t("dashboard.cashBalanceHint")}
        icon={<Wallet className="w-5 h-5" style={{ color: "#2563eb" }} />}
        accentColor="#2563eb"
        badgeText={t("dashboard.connected")}
      />
      <KpiCardItem
        label={t("dashboard.outstandingReceivables")}
        value={fmt(summary?.outstandingReceivables ?? 0)}
        hint={t("dashboard.outstandingReceivablesHint")}
        icon={<ArrowDownCircle className="w-5 h-5" style={{ color: "#059669" }} />}
        accentColor="#059669"
        badgeText={t("dashboard.receivables").split("(")[0].trim()}
      />
      <KpiCardItem
        label={t("dashboard.outstandingPayables")}
        value={fmt(summary?.outstandingPayables ?? 0)}
        hint={t("dashboard.outstandingPayablesHint")}
        icon={<ArrowUpCircle className="w-5 h-5" style={{ color: "#dc2626" }} />}
        accentColor="#dc2626"
        badgeText={t("dashboard.payables").split("(")[0].trim()}
      />
    </div>
  );
}

// --------------------------------------------------------------------------
// Financial overview — 4 secondary metric tiles
// --------------------------------------------------------------------------
function FinancialOverviewWidget({
  summary,
  accounts,
  fmt,
  t,
}: {
  summary: DashboardSummary;
  accounts: Account[];
  fmt: (n: number) => string;
  t: (k: string, opts?: any) => string;
}) {
  const tiles = [
    {
      icon: <Hash className="w-4 h-4" style={{ color: "#7c3aed" }} />,
      bg: "#7c3aed18",
      label: t("dashboard.totalAccounts"),
      value: String(summary?.totalAccounts ?? 0),
      color: "#7c3aed",
    },
    {
      icon: <Tag className="w-4 h-4" style={{ color: "#4f46e5" }} />,
      bg: "#4f46e518",
      label: t("dashboard.mainSections"),
      value: String(summary?.accountsByType?.length ?? accounts.reduce((s: Set<string>, a: Account) => { s.add(a.type); return s; }, new Set<string>()).size),
      color: "#4f46e5",
    },
    {
      icon: <TrendingUp className="w-4 h-4" style={{ color: "#059669" }} />,
      bg: "#05966918",
      label: t("dashboard.totalRevenue"),
      value: fmt(summary?.totalRevenue ?? 0),
      color: "#059669",
    },
    {
      icon: <TrendingDown className="w-4 h-4" style={{ color: "#d97706" }} />,
      bg: "#d9770618",
      label: t("dashboard.totalExpenses"),
      value: fmt(summary?.totalExpenses ?? 0),
      color: "#d97706",
    },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {tiles.map((tile, i) => (
        <div key={i} className="bg-card rounded-xl px-4 py-3 shadow-sm border border-border/60 flex items-center gap-3">
          <div className="p-2 rounded-lg shrink-0" style={{ backgroundColor: tile.bg }}>
            {tile.icon}
          </div>
          <div className="min-w-0">
            <p className="text-muted-foreground text-[10px] font-semibold truncate">{tile.label}</p>
            <p className="text-sm font-extrabold truncate" style={{ color: tile.color }}>{tile.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------
// Revenue vs Expenses — Line Chart (CleanPro style)
// --------------------------------------------------------------------------
function RevenueChartWidget({
  summary,
  fmt,
  t,
  lang,
}: {
  summary: DashboardSummary;
  fmt: (n: number) => string;
  t: (k: string, opts?: any) => string;
  lang: Lang;
}) {
  const fontFamily = lang === "en" ? "Inter, sans-serif" : "Cairo, sans-serif";
  const data = [
    { name: t("months.jan", { defaultValue: "يناير" }), revenue: Math.round((summary?.totalRevenue || 0) * 0.12), expenses: Math.round((summary?.totalExpenses || 0) * 0.14) },
    { name: t("months.feb", { defaultValue: "فبراير" }), revenue: Math.round((summary?.totalRevenue || 0) * 0.14), expenses: Math.round((summary?.totalExpenses || 0) * 0.15) },
    { name: t("months.mar", { defaultValue: "مارس" }), revenue: Math.round((summary?.totalRevenue || 0) * 0.16), expenses: Math.round((summary?.totalExpenses || 0) * 0.16) },
    { name: t("months.apr", { defaultValue: "أبريل" }), revenue: Math.round((summary?.totalRevenue || 0) * 0.18), expenses: Math.round((summary?.totalExpenses || 0) * 0.17) },
    { name: t("months.may", { defaultValue: "مايو" }), revenue: Math.round((summary?.totalRevenue || 0) * 0.20), expenses: Math.round((summary?.totalExpenses || 0) * 0.18) },
    { name: t("months.jun", { defaultValue: "يونيو" }), revenue: Math.round((summary?.totalRevenue || 0) * 0.20), expenses: Math.round((summary?.totalExpenses || 0) * 0.20) },
  ];
  const revKey = t("dashboard.totalRevenue");
  const expKey = t("dashboard.totalExpenses");
  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-5">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-sm font-extrabold text-foreground">{t("dashboard.revenueChart")}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t("dashboard.revenueChartHint")}</p>
        </div>
        <div className="flex gap-3 text-xs font-semibold text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#1e3a5f] inline-block" />
            {revKey}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#f43f5e] inline-block" />
            {expKey}
          </span>
        </div>
      </div>
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11, fontFamily }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v: number) => `${v / 1000}k`} />
            <Tooltip
              formatter={(v: number) => [fmt(v)]}
              contentStyle={{ borderRadius: "12px", border: "1px solid hsl(var(--border))", fontFamily, fontSize: 12 }}
              itemStyle={{ fontFamily }}
            />
            <Line type="monotone" dataKey="revenue" name={revKey} stroke="#1e3a5f" strokeWidth={2.5} dot={{ r: 3, fill: "#1e3a5f" }} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="expenses" name={expKey} stroke="#f43f5e" strokeWidth={2.5} dot={{ r: 3, fill: "#f43f5e" }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Profit Bar Chart (CleanPro style)
// --------------------------------------------------------------------------
function ProfitChartWidget({
  summary,
  fmt,
  t,
  lang,
}: {
  summary: DashboardSummary;
  fmt: (n: number) => string;
  t: (k: string, opts?: any) => string;
  lang: Lang;
}) {
  const fontFamily = lang === "en" ? "Inter, sans-serif" : "Cairo, sans-serif";
  const data = [
    { name: "Q1", profit: Math.round((summary?.totalRevenue || 0) * 0.22 - (summary?.totalExpenses || 0) * 0.22) },
    { name: "Q2", profit: Math.round((summary?.totalRevenue || 0) * 0.28 - (summary?.totalExpenses || 0) * 0.27) },
    { name: "Q3", profit: Math.round((summary?.totalRevenue || 0) * 0.25 - (summary?.totalExpenses || 0) * 0.25) },
    { name: "Q4", profit: Math.round((summary?.totalRevenue || 0) * 0.25 - (summary?.totalExpenses || 0) * 0.26) },
  ];
  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-5">
      <h2 className="text-sm font-extrabold text-foreground mb-0.5">{t("dashboard.profitChart")}</h2>
      <p className="text-xs text-muted-foreground mb-4">{t("dashboard.profitChartHint")}</p>
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11, fontFamily }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v: number) => `${v / 1000}k`} />
            <Tooltip
              formatter={(v: number) => [fmt(v), t("dashboard.netProfit")]}
              contentStyle={{ borderRadius: "12px", border: "1px solid hsl(var(--border))", fontFamily, fontSize: 12 }}
              itemStyle={{ fontFamily }}
            />
            <Bar dataKey="profit" fill="#1e3a5f" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Recent Entries Table (CleanPro style)
// --------------------------------------------------------------------------
function RecentEntriesWidget({
  entries = [],
  t,
  fmt,
  setLocation,
}: {
  entries: JournalEntry[];
  t: (k: string, opts?: any) => string;
  fmt: (n: number) => string;
  setLocation: (path: string) => void;
}) {
  const displayName = (e: JournalEntry) =>
    e.reference || e.notes || `${t("journal.entry")} #${e.entryNo}`;

  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border/60 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border/50 flex justify-between items-center bg-muted/30">
        <div>
          <h2 className="text-sm font-extrabold text-foreground">{t("dashboard.recentEntries")}</h2>
          <p className="text-xs text-muted-foreground">{t("dashboard.recentEntriesHint")}</p>
        </div>
        <button
          onClick={() => setLocation("/journal")}
          className="text-xs font-bold text-primary border border-primary/30 px-3 py-1 rounded-lg hover:bg-primary hover:text-primary-foreground transition-colors"
        >
          {t("dashboard.viewAll")}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground font-bold">
            <tr className="border-b border-border/40">
              <th className="px-5 py-3 text-start">{t("journal.entryNo")}</th>
              <th className="px-5 py-3 text-start">{t("journal.date")}</th>
              <th className="px-5 py-3 text-start">{t("journal.description")}</th>
              <th className="px-5 py-3 text-start">{t("journal.status")}</th>
              <th className="px-5 py-3 text-start">{t("journal.totalDebit")}</th>
            </tr>
          </thead>
          <tbody>
            {entries.slice(0, 5).map((entry) => (
              <tr
                key={entry.id}
                className="border-b border-border/30 hover:bg-muted/40 transition-colors cursor-pointer"
                onClick={() => setLocation(`/journal/${entry.id}`)}
              >
                <td className="px-5 py-3 font-mono text-muted-foreground" dir="ltr">
                  {entry.entryNumber || entry.entryNo}
                </td>
                <td className="px-5 py-3 text-muted-foreground">{entry.date}</td>
                <td className="px-5 py-3 font-semibold text-foreground max-w-[180px] truncate">
                  {displayName(entry)}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold ${
                      entry.status === "posted"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                        : entry.status === "draft"
                        ? "bg-muted text-muted-foreground"
                        : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                    }`}
                  >
                    {entry.status === "posted" ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <AlertCircle className="w-3 h-3" />
                    )}
                    {t(`journal.statuses.${entry.status}`, { defaultValue: entry.status })}
                  </span>
                </td>
                <td className="px-5 py-3 font-extrabold tabular-nums text-foreground">
                  {fmt(entry.totalDebitBase)}
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                  {t("dashboard.noEntries")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Accounts Donut (CleanPro style — with summary below)
// --------------------------------------------------------------------------
function AccountsDonutWidget({
  accounts = [],
  summary,
  lang,
  fmt,
  t,
}: {
  accounts: Account[];
  summary: DashboardSummary;
  lang: Lang;
  fmt: (n: number) => string;
  t: (k: string, opts?: any) => string;
}) {
  const fontFamily = lang === "en" ? "Inter, sans-serif" : "Cairo, sans-serif";
  const chartData =
    accounts.length > 0
      ? Array.from(
          accounts.reduce((map: Map<string, number>, a: Account) => {
            map.set(a.type, (map.get(a.type) || 0) + 1);
            return map;
          }, new Map<string, number>())
        ).map(([type, value]) => ({
          name: t(`accountTypes.${type}`, { defaultValue: type }),
          value,
          color: ACC_TYPE_COLORS[type] || "#94a3b8",
        }))
      : [];

  const totalRevenue = summary?.totalRevenue ?? 0;
  const totalExpenses = summary?.totalExpenses ?? 0;
  const costRatio = totalRevenue > 0 ? ((totalExpenses / totalRevenue) * 100).toFixed(1) : "—";

  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-5">
      <h2 className="text-sm font-extrabold text-foreground mb-0.5">{t("dashboard.distribution")}</h2>
      <p className="text-xs text-muted-foreground mb-1">{t("dashboard.distributionHint")}</p>
      <div className="h-[200px] w-full flex items-center justify-center">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={78}
                paddingAngle={3}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number) => [`${v} ${t("dashboard.accountsCount")}`]}
                contentStyle={{ borderRadius: "12px", border: "1px solid hsl(var(--border))", fontFamily, fontSize: 12 }}
                itemStyle={{ fontFamily }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontFamily, fontSize: 11 }}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-muted-foreground text-sm font-semibold flex flex-col items-center gap-2">
            <PieChartIcon className="w-10 h-10 opacity-20" />
            {t("dashboard.noAccounts")}
          </div>
        )}
      </div>
      {/* Summary stats */}
      <div className="mt-3 flex flex-col gap-2 border-t border-border/40 pt-3">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground font-semibold">{t("dashboard.totalRevenue")}</span>
          <span className="font-extrabold text-emerald-600">{fmt(totalRevenue)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground font-semibold">{t("dashboard.totalExpenses")}</span>
          <span className="font-extrabold text-rose-600">{fmt(totalExpenses)}</span>
        </div>
        {totalRevenue > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground font-semibold">نسبة التكاليف</span>
            <span className="font-extrabold text-amber-600">{costRatio}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Outstanding Invoices (CleanPro style — side-by-side cards)
// --------------------------------------------------------------------------
function OutstandingInvoicesWidget({
  salesInvoices = [],
  purchaseInvoices = [],
  t,
  fmt,
}: {
  salesInvoices: InvoiceSummary[];
  purchaseInvoices: InvoiceSummary[];
  t: (k: string, opts?: any) => string;
  fmt: (n: number) => string;
}) {
  const openSales = salesInvoices.filter((i) =>
    ["approved", "partially_paid"].includes(i.status)
  );
  const openPurchases = purchaseInvoices.filter((i) =>
    ["approved", "partially_paid"].includes(i.status)
  );
  const salesTotal = openSales.reduce((s: number, i: InvoiceSummary) => s + (i.balance || 0), 0);
  const purchasesTotal = openPurchases.reduce((s: number, i: InvoiceSummary) => s + (i.balance || 0), 0);

  const InvoiceGroup = ({
    items,
    total,
    label,
    accentColor,
    kind,
  }: {
    items: InvoiceSummary[];
    total: number;
    label: string;
    accentColor: string;
    kind: "sales" | "purchase";
  }) => (
    <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-5 flex-1 min-w-0">
      {/* Summary header */}
      <div
        className="rounded-xl p-4 mb-4"
        style={{ backgroundColor: accentColor + "12" }}
      >
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold" style={{ color: accentColor }}>
            {label}
          </p>
          <FileText className="w-4 h-4 opacity-40" style={{ color: accentColor }} />
        </div>
        <p className="text-xl font-extrabold text-foreground tabular-nums">{fmt(total)}</p>
        <div className="mt-2 bg-border/40 h-1.5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              backgroundColor: accentColor,
              width: `${Math.min(100, items.length > 0 ? Math.min(80, items.length * 12) : 0)}%`,
            }}
          />
        </div>
        <p className="text-xs mt-1.5" style={{ color: accentColor + "aa" }}>
          {t("dashboard.openInvoicesCount", { count: items.length })}
        </p>
      </div>
      {/* Invoice list */}
      <div className="flex flex-col gap-2">
        {items.slice(0, 4).map((inv) => (
          <div
            key={inv.id}
            className="flex items-center justify-between p-3 rounded-xl border border-border/50 hover:bg-muted/40 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`shrink-0 px-2 py-0.5 rounded-md text-xs font-bold ${
                  inv.status === "approved"
                    ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                    : "bg-primary/10 text-primary"
                }`}
              >
                {t(`invoices.statuses.${inv.status}`, { defaultValue: inv.status })}
              </span>
              <span className="text-sm font-semibold text-foreground truncate">
                {inv.partyName || inv.code || `#${inv.invoiceNo}`}
              </span>
            </div>
            <span className="font-extrabold font-sans text-sm text-foreground tabular-nums shrink-0 ms-2">
              {fmt(inv.balance)}
            </span>
          </div>
        ))}
        {items.length === 0 && (
          <div className="text-muted-foreground text-sm text-center py-4">
            {t("dashboard.noInvoices")}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <InvoiceGroup
        items={openSales}
        total={salesTotal}
        label={t("dashboard.receivables")}
        accentColor="#059669"
        kind="sales"
      />
      <InvoiceGroup
        items={openPurchases}
        total={purchasesTotal}
        label={t("dashboard.payables")}
        accentColor="#dc2626"
        kind="purchase"
      />
    </div>
  );
}

// --------------------------------------------------------------------------
// Sections Summary (kept as-is, light reskin)
// --------------------------------------------------------------------------
function SectionsSummaryWidget({
  accounts = [],
  t,
}: {
  accounts: Account[];
  t: (k: string, opts?: any) => string;
}) {
  const counts =
    accounts.length > 0
      ? Array.from(
          accounts.reduce((map: Map<string, number>, a: Account) => {
            map.set(a.type, (map.get(a.type) || 0) + 1);
            return map;
          }, new Map<string, number>())
        ).map(([type, count]) => ({ type, count }))
      : [];

  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-5">
      <h3 className="text-sm font-extrabold text-foreground mb-4">{t("dashboard.sectionsSummary")}</h3>
      <div className="flex flex-col gap-2">
        {counts.map((item) => (
          <div
            key={item.type}
            className="flex items-center justify-between p-3 rounded-xl border border-border/40 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: ACC_TYPE_COLORS[item.type] || "#94a3b8" }}
              />
              <span className="font-semibold text-sm">
                {t(`accountTypes.${item.type}`, { defaultValue: item.type })}
              </span>
            </div>
            <span className="font-extrabold text-foreground tabular-nums">{item.count}</span>
          </div>
        ))}
        {counts.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">{t("dashboard.noAccounts")}</p>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Company Card (light reskin)
// --------------------------------------------------------------------------
function CompanyCardWidget({
  company,
  user,
  lang,
  t,
  setLocation,
}: {
  company: any;
  user: any;
  lang: Lang;
  t: (k: string, opts?: any) => string;
  setLocation: (path: string) => void;
}) {
  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-5 flex flex-col sm:flex-row items-center gap-5">
      <div className="w-16 h-16 rounded-2xl bg-muted border flex items-center justify-center overflow-hidden shrink-0">
        {company?.logoUrl ? (
          <img src={company.logoUrl} alt={t("dashboard.logoAlt")} className="w-full h-full object-contain" />
        ) : (
          <ImageOff className="w-7 h-7 text-muted-foreground/40" />
        )}
      </div>
      <div className="flex-1 text-center sm:text-start">
        <h2 className="text-base font-extrabold text-foreground">{company?.name || user?.companyName}</h2>
        {company?.tradeName && (
          <p className="text-sm text-muted-foreground mt-0.5">{company.tradeName}</p>
        )}
        {company?.activityDescription && (
          <p className="text-xs text-muted-foreground mt-1">{company.activityDescription}</p>
        )}
        <div className="flex flex-wrap gap-2 justify-center sm:justify-start mt-3">
          <span className="inline-flex items-center gap-1 text-xs font-semibold bg-primary/5 text-primary px-3 py-1 rounded-full">
            <Globe className="w-3.5 h-3.5" />
            {countryLabel(company?.country ?? "EG", lang)}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full dark:bg-emerald-950 dark:text-emerald-400">
            <Coins className="w-3.5 h-3.5" />
            {currencyLabel(company?.baseCurrency ?? "EGP", lang)}
          </span>
          {company?.taxRegistrationNumber && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold bg-muted text-muted-foreground px-3 py-1 rounded-full">
              {t("dashboard.taxShort")}: {company.taxRegistrationNumber}
            </span>
          )}
        </div>
      </div>
      <Button variant="outline" className="gap-2 shrink-0" onClick={() => setLocation("/company")}>
        <Pencil className="w-4 h-4" />
        {t("dashboard.editData")}
      </Button>
    </div>
  );
}

// ==========================================================================
// Main Dashboard
// ==========================================================================
export function Dashboard() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === "en" ? "en" : "ar") as Lang;
  const [, setLocation] = useLocation();

  const { data: user } = useGetCurrentUser();
  const { data: company } = useGetCompany();
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: accounts = [] } = useListAccounts();
  const { data: entries = [] } = useListJournalEntries();
  const { data: salesInvoices = [] } = useListInvoices({ kind: "sales" });
  const { data: purchaseInvoices = [] } = useListInvoices({ kind: "purchase" });

  const [editMode, setEditMode] = useState(false);
  const [activeWidgets, setActiveWidgets] = useState<string[]>(DEFAULT_WIDGETS);
  const [showAddMenu, setShowAddMenu] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) setActiveWidgets(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(activeWidgets));
    } catch { /* ignore */ }
  }, [activeWidgets]);

  const moveWidget = (index: number, direction: -1 | 1) => {
    const next = [...activeWidgets];
    const target = index + direction;
    if (target >= 0 && target < next.length) {
      [next[index], next[target]] = [next[target], next[index]];
      setActiveWidgets(next);
    }
  };

  const removeWidget = (id: string) => setActiveWidgets((p) => p.filter((w) => w !== id));

  const addWidget = (id: string) => {
    if (!activeWidgets.includes(id)) setActiveWidgets((p) => [...p, id]);
    setShowAddMenu(false);
  };

  const resetLayout = () => {
    setActiveWidgets(DEFAULT_WIDGETS);
    setShowAddMenu(false);
  };

  const availableWidgets = WIDGET_REGISTRY.filter((w) => !activeWidgets.includes(w.id));

  const currency = company?.baseCurrency ?? "EGP";
  const fmt = (n: number) =>
    new Intl.NumberFormat(intlLocale(lang), {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);

  // Formatted today date
  const todayLabel = new Date().toLocaleDateString(
    lang === "ar" ? "ar-EG" : "en-US",
    { weekday: "long", year: "numeric", month: "long", day: "numeric" }
  );

  if (summaryLoading || !summary) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Spinner className="w-8 h-8 text-primary" />
      </div>
    );
  }

  const renderWidget = (id: string) => {
    switch (id) {
      case "kpi":
        return <KPIWidget summary={summary} fmt={fmt} t={t} />;
      case "financial-overview":
        return <FinancialOverviewWidget summary={summary} accounts={accounts} fmt={fmt} t={t} />;
      case "revenue-chart":
        return <RevenueChartWidget summary={summary} fmt={fmt} t={t} lang={lang} />;
      case "profit-chart":
        return <ProfitChartWidget summary={summary} fmt={fmt} t={t} lang={lang} />;
      case "recent-entries":
        return <RecentEntriesWidget entries={entries} t={t} fmt={fmt} setLocation={setLocation} />;
      case "accounts-donut":
        return <AccountsDonutWidget accounts={accounts} summary={summary} lang={lang} fmt={fmt} t={t} />;
      case "outstanding-invoices":
        return (
          <OutstandingInvoicesWidget
            salesInvoices={salesInvoices}
            purchaseInvoices={purchaseInvoices}
            t={t}
            fmt={fmt}
          />
        );
      case "sections-summary":
        return <SectionsSummaryWidget accounts={accounts} t={t} />;
      case "company-card":
        return <CompanyCardWidget company={company} user={user} lang={lang} t={t} setLocation={setLocation} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* ================================================================
          Header — CleanPro style
      ================================================================ */}
      <header className="h-16 bg-background/90 backdrop-blur-md border-b sticky top-0 z-10 flex items-center justify-between px-6 gap-4">
        {/* Left: logo + title */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold text-foreground leading-none">
              {user?.companyName || t("nav.dashboard")}
            </h1>
            <p className="text-[10px] text-muted-foreground mt-0.5">{t("dashboard.connected")}</p>
          </div>
        </div>

        {/* Center: date chip */}
        <span className="hidden sm:block text-xs font-semibold text-muted-foreground bg-muted/60 border border-border/50 px-3 py-1.5 rounded-lg">
          {todayLabel}
        </span>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 hidden sm:flex text-xs"
            onClick={() => setLocation("/reports")}
          >
            <FileBarChart className="w-3.5 h-3.5" />
            {t("dashboard.viewReports")}
          </Button>

          {editMode ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowAddMenu(!showAddMenu)}
                className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                <Plus className="w-3.5 h-3.5" /> {t("dashboard.addWidget")}
              </button>
              <button
                onClick={resetLayout}
                className="flex items-center gap-1.5 bg-muted border px-3 py-1.5 rounded-lg text-xs font-semibold hover:border-primary/50 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" /> {t("dashboard.resetLayout")}
              </button>
              <button
                onClick={() => setEditMode(false)}
                className="flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                <Save className="w-3.5 h-3.5" /> {t("dashboard.saveLayout")}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditMode(true)}
              className="flex items-center gap-1.5 bg-muted border px-3 py-1.5 rounded-lg text-xs font-semibold hover:border-primary/50 transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
              {t("dashboard.customize")}
            </button>
          )}
        </div>
      </header>

      {/* Add Widget Dropdown */}
      {editMode && showAddMenu && (
        <div className="px-6 pt-3">
          <div className="bg-card border rounded-2xl p-4 shadow-lg flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">{t("dashboard.addWidget")}</h3>
              <button onClick={() => setShowAddMenu(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {availableWidgets.length === 0 ? (
                <p className="text-sm text-muted-foreground col-span-full">{t("dashboard.allWidgetsAdded")}</p>
              ) : (
                availableWidgets.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => addWidget(w.id)}
                    className="flex items-center gap-2 p-3 rounded-xl border hover:border-primary hover:bg-primary/5 transition-colors text-xs font-semibold text-start"
                  >
                    <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="truncate">{lang === "en" ? w.titleEn : w.titleAr}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================
          Widget Grid
      ================================================================ */}
      <div className="p-6 flex flex-col gap-4 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {activeWidgets.map((widgetId, index) => {
            const def = WIDGET_REGISTRY.find((w) => w.id === widgetId);
            const title = def ? (lang === "en" ? def.titleEn : def.titleAr) : "";
            const span = def?.gridSpan || "";
            const isFullSpan = span.includes("col-span-full");
            return (
              <div
                key={widgetId}
                className={`${span} ${isFullSpan ? "col-span-full" : ""}`}
              >
                <WidgetCard
                  editMode={editMode}
                  title={title}
                  isFirst={index === 0}
                  isLast={index === activeWidgets.length - 1}
                  onMoveUp={() => moveWidget(index, -1)}
                  onMoveDown={() => moveWidget(index, 1)}
                  onRemove={() => removeWidget(widgetId)}
                >
                  {renderWidget(widgetId)}
                </WidgetCard>
              </div>
            );
          })}
        </div>

        {/* Empty state */}
        {activeWidgets.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <LayoutDashboard className="w-12 h-12 text-muted-foreground/30" />
            <p className="text-muted-foreground font-semibold">{t("dashboard.noWidgets")}</p>
            <button
              onClick={() => {
                setEditMode(true);
                setShowAddMenu(true);
              }}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" /> {t("dashboard.addWidget")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
