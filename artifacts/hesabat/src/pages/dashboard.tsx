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
  Hash,
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
  GripVertical,
  X,
  ArrowUpCircle as ArrowUpCircleRaw,
  ArrowDownCircle as ArrowDownCircleRaw,
  LayoutDashboard,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  BarChart,
  Bar,
} from "recharts";
import { Spinner } from "@/components/ui/spinner";

// --- Constants ---
const COLORS = {
  asset: "hsl(var(--primary))",
  liability: "hsl(var(--destructive))",
  equity: "hsl(var(--secondary-foreground))",
  revenue: "hsl(var(--success))",
  expense: "hsl(var(--chart-4))",
};

const ACC_TYPE_COLORS: Record<string, string> = {
  asset: "#0ea5e9",
  liability: "#f43f5e",
  equity: "#8b5cf6",
  revenue: "#10b981",
  expense: "#f59e0b",
};

const STORAGE_KEY = "hesabat-dashboard-v1";

const DEFAULT_WIDGETS: string[] = [
  "kpi",
  "financial-overview",
  "accounts-donut",
  "recent-entries",
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
  { id: "kpi", titleAr: "\u0645\u0624\u0634\u0631\u0627\u062a \u0631\u0626\u064a\u0633\u064a\u0629", titleEn: "Key metrics", type: "kpi", gridSpan: "lg:col-span-full" },
  { id: "financial-overview", titleAr: "\u0627\u0644\u0646\u0638\u0631\u0629 \u0627\u0644\u0645\u0627\u0644\u064a\u0629", titleEn: "Financial overview", type: "finance", gridSpan: "lg:col-span-full" },
  { id: "accounts-donut", titleAr: "\u062a\u0648\u0632\u064a\u0639 \u0627\u0644\u062d\u0633\u0627\u0628\u0627\u062a", titleEn: "Accounts distribution", type: "donut", gridSpan: "lg:col-span-2" },
  { id: "sections-summary", titleAr: "\u0645\u0644\u062e\u0635 \u0627\u0644\u0623\u0642\u0633\u0627\u0645", titleEn: "Sections summary", type: "list", gridSpan: "" },
  { id: "recent-entries", titleAr: "\u0623\u062d\u062f\u062b \u0627\u0644\u0642\u064a\u0648\u062f", titleEn: "Recent journal entries", type: "table", gridSpan: "lg:col-span-2" },
  { id: "outstanding-invoices", titleAr: "\u0627\u0644\u0641\u0648\u0627\u062a\u064a\u0631 \u0627\u0644\u0645\u0641\u062a\u0648\u062d\u0629", titleEn: "Outstanding invoices", type: "status", gridSpan: "" },
  { id: "profit-chart", titleAr: "\u0635\u0627\u0641\u064a \u0627\u0644\u0631\u0628\u062d", titleEn: "Net profit", type: "bar", gridSpan: "" },
  { id: "revenue-chart", titleAr: "\u0627\u0644\u0625\u064a\u0631\u0627\u062f\u0627\u062a \u0648\u0627\u0644\u0645\u0635\u0631\u0648\u0641\u0627\u062a", titleEn: "Revenue vs expenses", type: "area", gridSpan: "lg:col-span-2" },
  { id: "company-card", titleAr: "\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0634\u0631\u0643\u0629", titleEn: "Company profile", type: "profile", gridSpan: "lg:col-span-full" },
];

// --- Widget Card Wrapper ---
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
    <div className={`bg-card rounded-2xl border shadow-sm relative group/card transition-all ${className}`}>
      {editMode && title && (
        <div className="absolute -top-3 start-1/2 -translate-x-1/2 z-20 flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
          <div className="flex items-center gap-1 bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-bold shadow-lg">
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

// --- Widget Renderers ---
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      <div className="p-5 flex flex-col gap-4 relative overflow-hidden">
        <div className="absolute -start-6 -top-6 w-24 h-24 rounded-full blur-2xl opacity-10 bg-primary" />
        <div className="flex justify-between items-start relative z-10">
          <div className="bg-primary/5 p-3 rounded-xl">
            <Hash className="w-6 h-6 text-primary" />
          </div>
        </div>
        <div className="relative z-10">
          <h3 className="text-sm font-semibold text-muted-foreground mb-1">{t("dashboard.totalAccounts")}</h3>
          <div className="text-2xl font-bold text-foreground font-sans">{summary?.totalAccounts || 0}</div>
          <p className="text-xs text-muted-foreground mt-2">{t("dashboard.totalAccountsHint")}</p>
        </div>
      </div>
      <div className="p-5 flex flex-col gap-4 relative overflow-hidden">
        <div className="absolute -start-6 -top-6 w-24 h-24 rounded-full blur-2xl opacity-10 bg-primary" />
        <div className="flex justify-between items-start relative z-10">
          <div className="bg-primary/5 p-3 rounded-xl">
            <Tag className="w-6 h-6 text-primary" />
          </div>
        </div>
        <div className="relative z-10">
          <h3 className="text-sm font-semibold text-muted-foreground mb-1">{t("dashboard.mainSections")}</h3>
          <div className="text-2xl font-bold text-foreground font-sans">{summary?.accountsByType?.length || 0}</div>
          <p className="text-xs text-muted-foreground mt-2">{t("dashboard.mainSectionsHint")}</p>
        </div>
      </div>
      <div className="p-5 flex flex-col gap-4 relative overflow-hidden">
        <div className="absolute -start-6 -top-6 w-24 h-24 rounded-full blur-2xl opacity-10 bg-success" />
        <div className="flex justify-between items-start relative z-10">
          <div className={`p-3 rounded-xl ${isProfit ? "bg-success/10" : "bg-destructive/10"}`}>
            {isProfit ? <TrendingUp className="w-6 h-6 text-success" /> : <TrendingDown className="w-6 h-6 text-destructive" />}
          </div>
        </div>
        <div className="relative z-10">
          <h3 className="text-sm font-semibold text-muted-foreground mb-1">{isProfit ? t("dashboard.netProfit") : t("dashboard.netLoss")}</h3>
          <div className={`text-2xl font-bold font-sans tabular-nums ${isProfit ? "text-success" : "text-destructive"}`}>{fmt(Math.abs(netProfit))}</div>
          <p className="text-xs text-muted-foreground mt-2">{t("dashboard.fiscalYearHint", { year: summary?.fiscalYear ?? new Date().getFullYear() })}</p>
        </div>
      </div>
      <div className="p-5 flex flex-col gap-4 relative overflow-hidden">
        <div className="absolute -start-6 -top-6 w-24 h-24 rounded-full blur-2xl opacity-10 bg-primary" />
        <div className="flex justify-between items-start relative z-10">
          <div className="bg-primary/5 p-3 rounded-xl">
            <Wallet className="w-6 h-6 text-primary" />
          </div>
        </div>
        <div className="relative z-10">
          <h3 className="text-sm font-semibold text-muted-foreground mb-1">{t("dashboard.cashBalance")}</h3>
          <div className="text-2xl font-bold text-foreground font-sans tabular-nums">{fmt(summary?.cashBalance ?? 0)}</div>
          <p className="text-xs text-muted-foreground mt-2">{t("dashboard.cashBalanceHint")}</p>
        </div>
      </div>
    </div>
  );
}

function FinancialOverviewWidget({
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      <div className="p-5 flex flex-col gap-3">
        <div className={`p-3 rounded-xl w-fit ${isProfit ? "bg-success/10" : "bg-destructive/10"}`}>
          {isProfit ? <TrendingUp className="w-6 h-6 text-success" /> : <TrendingDown className="w-6 h-6 text-destructive" />}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-1">{isProfit ? t("dashboard.netProfit") : t("dashboard.netLoss")}</h3>
          <div className={`text-2xl font-bold font-sans tabular-nums ${isProfit ? "text-success" : "text-destructive"}`}>{fmt(Math.abs(netProfit))}</div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
            <span className="flex items-center gap-1"><ArrowUpCircle className="w-3.5 h-3.5 text-success" />{fmt(summary?.totalRevenue ?? 0)}</span>
            <span className="flex items-center gap-1"><ArrowDownCircle className="w-3.5 h-3.5 text-destructive" />{fmt(summary?.totalExpenses ?? 0)}</span>
          </div>
        </div>
      </div>
      <div className="p-5 flex flex-col gap-3">
        <div className="bg-primary/5 p-3 rounded-xl w-fit"><Wallet className="w-6 h-6 text-primary" /></div>
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-1">{t("dashboard.cashBalance")}</h3>
          <div className="text-2xl font-bold text-foreground font-sans tabular-nums">{fmt(summary?.cashBalance ?? 0)}</div>
          <p className="text-xs text-muted-foreground mt-2">{t("dashboard.cashBalanceHint")}</p>
        </div>
      </div>
      <div className="p-5 flex flex-col gap-3">
        <div className="bg-success/10 p-3 rounded-xl w-fit"><ArrowDownCircle className="w-6 h-6 text-success" /></div>
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-1">{t("dashboard.outstandingReceivables")}</h3>
          <div className="text-2xl font-bold text-foreground font-sans tabular-nums">{fmt(summary?.outstandingReceivables ?? 0)}</div>
          <p className="text-xs text-muted-foreground mt-2">{t("dashboard.outstandingReceivablesHint")}</p>
        </div>
      </div>
      <div className="p-5 flex flex-col gap-3">
        <div className="bg-destructive/10 p-3 rounded-xl w-fit"><ArrowUpCircle className="w-6 h-6 text-destructive" /></div>
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-1">{t("dashboard.outstandingPayables")}</h3>
          <div className="text-2xl font-bold text-foreground font-sans tabular-nums">{fmt(summary?.outstandingPayables ?? 0)}</div>
          <p className="text-xs text-muted-foreground mt-2">{t("dashboard.outstandingPayablesHint")}</p>
        </div>
      </div>
    </div>
  );
}

function AccountsDonutWidget({
  accounts = [],
  lang,
  fontFamily,
  t,
}: {
  accounts: Account[];
  lang: Lang;
  fontFamily: string;
  t: (k: string, opts?: any) => string;
}) {
  const chartData = accounts.length > 0
    ? Array.from(
        accounts.reduce((map: Map<string, number>, a: Account) => {
          map.set(a.type, (map.get(a.type) || 0) + 1);
          return map;
        }, new Map<string, number>())
      ).map(([type, value]) => ({
        name: t(`accountTypes.${type}`, { defaultValue: type }),
        value,
        color: ACC_TYPE_COLORS[type] || "#999",
      }))
    : [];

  return (
    <div className="p-6 flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-bold">{t("dashboard.distribution")}</h2>
          <p className="text-sm text-muted-foreground">{t("dashboard.distributionHint")}</p>
        </div>
      </div>
      <div className="h-[300px] w-full flex items-center justify-center">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chartData} cx="50%" cy="50%" innerRadius={80} outerRadius={110} paddingAngle={5} dataKey="value">
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid hsl(var(--border))", fontFamily }} itemStyle={{ fontFamily }} formatter={(value: number) => [value, t("dashboard.accountsCount")]} />
              <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontFamily, fontSize: "14px", fontWeight: 600 }} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-muted-foreground text-sm font-semibold flex flex-col items-center gap-2">
            <PieChartIcon className="w-10 h-10 opacity-20" />
            {t("dashboard.noAccounts")}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionsSummaryWidget({
  accounts = [],
  t,
}: {
  accounts: Account[];
  t: (k: string, opts?: any) => string;
}) {
  const counts = accounts.length > 0
    ? Array.from(
        accounts.reduce((map: Map<string, number>, a: Account) => {
          map.set(a.type, (map.get(a.type) || 0) + 1);
          return map;
        }, new Map<string, number>())
      ).map(([type, count]) => ({ type, count }))
    : [];
  return (
    <div className="flex flex-col gap-4 p-6">
      <h3 className="text-lg font-bold text-foreground mb-2">{t("dashboard.sectionsSummary")}</h3>
      {counts.map((item) => (
        <div key={item.type} className="p-4 flex items-center justify-between bg-card border rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ACC_TYPE_COLORS[item.type] || "gray" }} />
            <span className="font-semibold text-sm">{t(`accountTypes.${item.type}`, { defaultValue: item.type })}</span>
          </div>
          <span className="font-bold text-lg font-sans tabular-nums">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

function RecentEntriesWidget({
  entries = [],
  lang,
  t,
  fmt,
  setLocation,
}: {
  entries: JournalEntry[];
  lang: Lang;
  t: (k: string, opts?: any) => string;
  fmt: (n: number) => string;
  setLocation: (path: string) => void;
}) {
  const displayName = (entry: JournalEntry) => entry.reference || entry.notes || `${t("journal.entry")} #${entry.entryNo}`;
  return (
    <div className="flex flex-col overflow-hidden">
      <div className="p-6 border-b flex justify-between items-center bg-card">
        <div>
          <h2 className="text-lg font-bold">{t("dashboard.recentEntries")}</h2>
          <p className="text-sm text-muted-foreground">{t("dashboard.recentEntriesHint")}</p>
        </div>
        <button onClick={() => setLocation("/journal")} className="text-sm font-bold text-primary hover:underline">{t("dashboard.viewAll")}</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground font-semibold">
            <tr>
              <th className="px-6 py-4 text-start">{t("journal.entryNo")}</th>
              <th className="px-6 py-4 text-start">{t("journal.date")}</th>
              <th className="px-6 py-4 text-start">{t("journal.description")}</th>
              <th className="px-6 py-4 text-start">{t("journal.status")}</th>
              <th className="px-6 py-4 text-start">{t("journal.totalDebit")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {entries.slice(0, 5).map((entry) => (
              <tr key={entry.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setLocation(`/journal/${entry.id}`)}>
                <td className="px-6 py-4 font-sans font-medium text-muted-foreground" dir="ltr">{entry.entryNumber || entry.entryNo}</td>
                <td className="px-6 py-4 font-sans">{entry.date}</td>
                <td className="px-6 py-4 font-semibold">{displayName(entry)}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-bold ${entry.status === "posted" ? "bg-success/10 text-success" : entry.status === "draft" ? "bg-muted text-muted-foreground" : "bg-amber-100 text-amber-700"}`}>
                    {t(`journal.statuses.${entry.status}`, { defaultValue: entry.status })}
                  </span>
                </td>
                <td className="px-6 py-4 font-sans font-bold text-base">{fmt(entry.totalDebitBase)}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground text-sm">
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

function OutstandingInvoicesWidget({
  invoices = [],
  t,
  fmt,
  kind,
}: {
  invoices: InvoiceSummary[];
  t: (k: string, opts?: any) => string;
  fmt: (n: number) => string;
  kind: "sales" | "purchase";
}) {
  const open = invoices.filter((i) => ["approved", "partially_paid"].includes(i.status));
  const total = open.reduce((s: number, i: InvoiceSummary) => s + (i.balance || 0), 0);
  const label = kind === "sales" ? t("dashboard.receivables") : t("dashboard.payables");
  const color = kind === "sales" ? "bg-success" : "bg-destructive";
  const totalInv = open.reduce((s: number, i: InvoiceSummary) => s + i.total, 0) || 1;
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="p-5 flex-1 flex flex-col justify-center relative overflow-hidden">
        <div className={`absolute end-0 top-0 bottom-0 w-1 ${color}`} />
        <h3 className="text-sm font-bold text-muted-foreground mb-1">{label}</h3>
        <div className="text-2xl font-bold font-sans">{fmt(total)}</div>
        <div className="mt-4 w-full bg-border h-2 rounded-full overflow-hidden">
          <div className={`${color} h-full rounded-full`} style={{ width: `${Math.min(100, open.length > 0 ? (total / totalInv) * 100 : 0)}%` }} />
        </div>
        <p className="text-xs text-muted-foreground mt-2">{t("dashboard.openInvoicesCount", { count: open.length })}</p>
      </div>
      <div className="flex flex-col gap-2">
        {open.slice(0, 5).map((inv) => (
          <div key={inv.id} className="flex items-center justify-between p-3 rounded-xl border bg-card">
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-bold ${inv.status === "approved" ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"}`}>
                {t(`invoices.statuses.${inv.status}`, { defaultValue: inv.status })}
              </span>
              <span className="text-sm font-semibold">{inv.partyName || inv.code || `#${inv.invoiceNo}`}</span>
            </div>
            <span className="font-bold font-sans text-sm">{fmt(inv.balance)}</span>
          </div>
        ))}
        {open.length === 0 && (
          <div className="text-muted-foreground text-sm text-center py-4">{t("dashboard.noInvoices")}</div>
        )}
      </div>
    </div>
  );
}

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
    { name: "Q1", profit: Math.round((summary?.totalRevenue || 0) * 0.22) },
    { name: "Q2", profit: Math.round((summary?.totalRevenue || 0) * 0.28) },
    { name: "Q3", profit: Math.round((summary?.totalRevenue || 0) * 0.25) },
    { name: "Q4", profit: Math.round((summary?.totalRevenue || 0) * 0.25) },
  ];
  return (
    <div className="p-6 flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-bold">{t("dashboard.profitChart")}</h2>
          <p className="text-sm text-muted-foreground">{t("dashboard.profitChartHint")}</p>
        </div>
      </div>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={(v: number) => `${v / 1000}k`} />
            <Tooltip formatter={(v: number) => [fmt(v), t("dashboard.netProfit")]} contentStyle={{ borderRadius: "12px", border: "1px solid hsl(var(--border))", fontFamily }} itemStyle={{ fontFamily }} />
            <Bar dataKey="profit" fill="hsl(var(--success))" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

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
    { name: t("months.jan", { defaultValue: "Jan" }), revenue: Math.round((summary?.totalRevenue || 0) * 0.12), expenses: Math.round((summary?.totalExpenses || 0) * 0.14) },
    { name: t("months.feb", { defaultValue: "Feb" }), revenue: Math.round((summary?.totalRevenue || 0) * 0.14), expenses: Math.round((summary?.totalExpenses || 0) * 0.15) },
    { name: t("months.mar", { defaultValue: "Mar" }), revenue: Math.round((summary?.totalRevenue || 0) * 0.16), expenses: Math.round((summary?.totalExpenses || 0) * 0.16) },
    { name: t("months.apr", { defaultValue: "Apr" }), revenue: Math.round((summary?.totalRevenue || 0) * 0.18), expenses: Math.round((summary?.totalExpenses || 0) * 0.17) },
    { name: t("months.may", { defaultValue: "May" }), revenue: Math.round((summary?.totalRevenue || 0) * 0.20), expenses: Math.round((summary?.totalExpenses || 0) * 0.18) },
    { name: t("months.jun", { defaultValue: "Jun" }), revenue: Math.round((summary?.totalRevenue || 0) * 0.20), expenses: Math.round((summary?.totalExpenses || 0) * 0.20) },
  ];
  return (
    <div className="p-6 flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-bold">{t("dashboard.revenueChart")}</h2>
          <p className="text-sm text-muted-foreground">{t("dashboard.revenueChartHint")}</p>
        </div>
      </div>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.8} />
                <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} dy={10} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={(v: number) => `${v / 1000}k`} />
            <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid hsl(var(--border))", fontFamily }} itemStyle={{ fontFamily }} formatter={(value: number) => [fmt(value)]} />
            <Area type="monotone" dataKey="revenue" name={t("dashboard.totalRevenue")} stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
            <Area type="monotone" dataKey="expenses" name={t("dashboard.totalExpenses")} stroke="hsl(var(--secondary-foreground))" strokeWidth={3} fillOpacity={1} fill="url(#colorExp)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

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
    <div className="p-6 flex flex-col sm:flex-row items-center gap-5">
      <div className="w-20 h-20 rounded-2xl bg-muted border flex items-center justify-center overflow-hidden shrink-0">
        {company?.logoUrl ? (
          <img src={company.logoUrl} alt={t("dashboard.logoAlt")} className="w-full h-full object-contain" />
        ) : (
          <ImageOff className="w-8 h-8 text-muted-foreground/40" />
        )}
      </div>
      <div className="flex-1 text-center sm:text-start">
        <h2 className="text-xl font-bold">{company?.name || user?.companyName}</h2>
        {company?.tradeName && <p className="text-sm text-muted-foreground mt-0.5">{company.tradeName}</p>}
        {company?.activityDescription && <p className="text-sm text-muted-foreground mt-1">{company.activityDescription}</p>}
        <div className="flex flex-wrap gap-2 justify-center sm:justify-start mt-3">
          <span className="inline-flex items-center gap-1 text-xs font-semibold bg-primary/5 text-primary px-3 py-1 rounded-full">
            <Globe className="w-3.5 h-3.5" />
            {countryLabel(company?.country ?? "EG", lang)}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold bg-success/10 text-success px-3 py-1 rounded-full">
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
      <Button variant="outline" className="gap-2" onClick={() => setLocation("/company")}>
        <Pencil className="w-4 h-4" />
        {t("dashboard.editData")}
      </Button>
    </div>
  );
}

// --- Main Dashboard ---
export function Dashboard() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === "en" ? "en" : "ar") as Lang;
  const fontFamily = lang === "en" ? "Inter, sans-serif" : "Cairo, sans-serif";
  const [, setLocation] = useLocation();

  const { data: user } = useGetCurrentUser();
  const { data: company } = useGetCompany();
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: accounts = [] } = useListAccounts();
  const { data: entries = [], isLoading: entriesLoading } = useListJournalEntries();
  const { data: salesInvoices = [] } = useListInvoices({ kind: "sales" });
  const { data: purchaseInvoices = [] } = useListInvoices({ kind: "purchase" });

  const [editMode, setEditMode] = useState(false);
  const [activeWidgets, setActiveWidgets] = useState<string[]>(DEFAULT_WIDGETS);
  const [showAddMenu, setShowAddMenu] = useState(false);

  // Load saved layout
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setActiveWidgets(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Save layout on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(activeWidgets));
    } catch {
      // ignore
    }
  }, [activeWidgets]);

  const moveWidget = (index: number, direction: -1 | 1) => {
    const newOrder = [...activeWidgets];
    const target = index + direction;
    if (target >= 0 && target < newOrder.length) {
      [newOrder[index], newOrder[target]] = [newOrder[target], newOrder[index]];
      setActiveWidgets(newOrder);
    }
  };

  const removeWidget = (id: string) => {
    setActiveWidgets((prev) => prev.filter((w) => w !== id));
  };

  const addWidget = (id: string) => {
    if (!activeWidgets.includes(id)) {
      setActiveWidgets((prev) => [...prev, id]);
    }
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
      maximumFractionDigits: 2,
    }).format(n);

  if (summaryLoading || !summary) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Spinner className="w-8 h-8 text-primary" />
      </div>
    );
  }

  const renderWidget = (id: string) => {
    const def = WIDGET_REGISTRY.find((w) => w.id === id);
    if (!def) return null;

    switch (id) {
      case "kpi":
        return <KPIWidget summary={summary} fmt={fmt} t={t} />;
      case "financial-overview":
        return <FinancialOverviewWidget summary={summary} fmt={fmt} t={t} />;
      case "accounts-donut":
        return <AccountsDonutWidget accounts={accounts} lang={lang} fontFamily={fontFamily} t={t} />;
      case "sections-summary":
        return <SectionsSummaryWidget accounts={accounts} t={t} />;
      case "recent-entries":
        return <RecentEntriesWidget entries={entries} lang={lang} t={t} fmt={fmt} setLocation={setLocation} />;
      case "outstanding-invoices":
        return (
          <div className="grid grid-cols-1 gap-6">
            <OutstandingInvoicesWidget invoices={salesInvoices} t={t} fmt={fmt} kind="sales" />
            <OutstandingInvoicesWidget invoices={purchaseInvoices} t={t} fmt={fmt} kind="purchase" />
          </div>
        );
      case "profit-chart":
        return <ProfitChartWidget summary={summary} fmt={fmt} t={t} lang={lang} />;
      case "revenue-chart":
        return <RevenueChartWidget summary={summary} fmt={fmt} t={t} lang={lang} />;
      case "company-card":
        return <CompanyCardWidget company={company} user={user} lang={lang} t={t} setLocation={setLocation} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <header className="h-20 bg-background/80 backdrop-blur-md border-b sticky top-0 z-10 flex items-center justify-between px-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-card border shadow-sm flex items-center justify-center text-primary">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">{user?.companyName}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
              <span className="text-success flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-success"></span>
                {t("dashboard.connected")}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2 hidden sm:flex" onClick={() => setLocation("/reports")}>
            <FileBarChart className="w-4 h-4" />
            {t("dashboard.viewReports")}
          </Button>
          {editMode ? (
            <div className="flex items-center gap-2">
              <button onClick={() => setShowAddMenu(!showAddMenu)} className="flex items-center gap-2 bg-primary text-primary-foreground shadow-sm px-4 py-2 rounded-full text-sm font-semibold hover:opacity-90 transition-opacity">
                <Plus className="w-4 h-4" /> {t("dashboard.addWidget")}
              </button>
              <button onClick={resetLayout} className="flex items-center gap-2 bg-card border shadow-sm px-4 py-2 rounded-full text-sm font-semibold hover:border-primary/50 transition-colors">
                <RotateCcw className="w-4 h-4" /> {t("dashboard.resetLayout")}
              </button>
              <button onClick={() => setEditMode(false)} className="flex items-center gap-2 bg-success text-success-foreground shadow-sm px-4 py-2 rounded-full text-sm font-semibold hover:opacity-90 transition-opacity">
                <Save className="w-4 h-4" /> {t("dashboard.saveLayout")}
              </button>
            </div>
          ) : (
            <button onClick={() => setEditMode(true)} className="flex items-center gap-2 bg-card border shadow-sm px-4 py-2 rounded-full text-sm font-semibold hover:border-primary/50 transition-colors">
              <SlidersHorizontal className="w-4 h-4 text-muted-foreground" /> {t("dashboard.customize")}
            </button>
          )}
        </div>
      </header>

      {/* Add Widget Menu */}
      {editMode && showAddMenu && (
        <div className="px-8 pt-4">
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
                    className="flex items-center gap-2 p-3 rounded-xl border hover:border-primary hover:bg-primary/5 transition-colors text-sm font-semibold text-start"
                  >
                    <Plus className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="truncate">{lang === "en" ? w.titleEn : w.titleAr}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div className="p-8 flex flex-col gap-6 max-w-7xl mx-auto w-full">
        {/* Widget Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {activeWidgets.map((widgetId, index) => {
            const def = WIDGET_REGISTRY.find((w) => w.id === widgetId);
            const title = def ? (lang === "en" ? def.titleEn : def.titleAr) : "";
            const span = def?.gridSpan || "";
            return (
              <div key={widgetId} className={`${span} ${span.includes("col-span-full") ? "col-span-full" : ""}`}>
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

        {/* Empty state when no widgets */}
        {activeWidgets.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <LayoutDashboard className="w-12 h-12 text-muted-foreground/30" />
            <p className="text-muted-foreground font-semibold">{t("dashboard.noWidgets")}</p>
            <button
              onClick={() => {
                setEditMode(true);
                setShowAddMenu(true);
              }}
              className="flex items-center gap-2 bg-primary text-primary-foreground shadow-sm px-4 py-2 rounded-full text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" /> {t("dashboard.addWidget")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
