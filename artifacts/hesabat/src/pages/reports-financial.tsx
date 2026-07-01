import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import {
  useGetIncomeStatement,
  useGetCompany,
  useListCurrencies,
  useListAccounts,
  type Account,
  type Currency,
} from "@workspace/api-client-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Percent,
  FileBarChart2,
} from "lucide-react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import {
  type CurrencyControls,
  reportCurrencyParam,
} from "./reports-utils";
import {
  ReportCurrencySelect,
  TrialBalanceTab,
  IncomeStatementTab,
  BalanceSheetTab,
  GeneralLedgerTab,
  CashFlowTab,
  CashForecastTab,
  RevaluationTab,
} from "./reports";
import {
  DimensionFilters,
  type DimensionFilterQuery,
  type DimensionFilterValues,
} from "@/components/reports/DimensionFilters";

type PeriodPreset = "month" | "quarter" | "year";
type TabKey =
  | "trialBalance"
  | "incomeStatement"
  | "balanceSheet"
  | "generalLedger"
  | "cashFlow"
  | "cashForecast"
  | "revaluation";

const TABS: TabKey[] = [
  "trialBalance",
  "incomeStatement",
  "balanceSheet",
  "generalLedger",
  "cashFlow",
  "cashForecast",
  "revaluation",
];

function readFinancialTab(location: string): TabKey | null {
  const params = new URLSearchParams(location.split("?")[1] || "");
  const tab = params.get("tab");
  return tab && TABS.includes(tab as TabKey) ? (tab as TabKey) : null;
}

function periodRange(preset: PeriodPreset): { from: string; to: string } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (preset === "month") {
    return {
      from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  }
  if (preset === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    return {
      from: iso(new Date(now.getFullYear(), q * 3, 1)),
      to: iso(new Date(now.getFullYear(), q * 3 + 3, 0)),
    };
  }
  return {
    from: `${now.getFullYear()}-01-01`,
    to: `${now.getFullYear()}-12-31`,
  };
}

function fmtK(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}م`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}ك`;
  return n.toLocaleString("ar-EG", { maximumFractionDigits: 0 });
}

function KpiCard({
  label,
  value,
  sub,
  color,
  Icon,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  color: "green" | "red" | "blue" | "purple";
  Icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
}) {
  const bg = {
    green: "bg-emerald-50 border-emerald-200 text-emerald-800",
    red: "bg-rose-50 border-rose-200 text-rose-800",
    blue: "bg-blue-50 border-blue-200 text-blue-800",
    purple: "bg-violet-50 border-violet-200 text-violet-800",
  }[color];
  const iconBg = {
    green: "bg-emerald-100 text-emerald-600",
    red: "bg-rose-100 text-rose-600",
    blue: "bg-blue-100 text-blue-600",
    purple: "bg-violet-100 text-violet-600",
  }[color];

  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-2 ${bg}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold opacity-70 uppercase tracking-wide">
          {label}
        </span>
        <div
          className={`w-8 h-8 rounded-xl flex items-center justify-center ${iconBg}`}
        >
          <Icon className="w-4 h-4" />
        </div>
      </div>
      {loading ? (
        <div className="h-8 rounded-lg bg-current opacity-10 animate-pulse" />
      ) : (
        <>
          <div className="text-2xl font-bold tabular-nums">{value}</div>
          {sub && <div className="text-xs opacity-60">{sub}</div>}
        </>
      )}
    </div>
  );
}

export function ReportsFinancial() {
  const { t, i18n } = useTranslation();
  const [location] = useLocation();
  const lang = i18n.language;
  const [tab, setTab] = useState<TabKey>(() => readFinancialTab(window.location.pathname + window.location.search) ?? "trialBalance");
  const [dimensionFilters, setDimensionFilters] = useState<DimensionFilterValues>({
    costCenterId: "",
    projectId: "",
    branchId: "",
  });
  const [preset, setPreset] = useState<PeriodPreset>("year");

  const [drillGL, setDrillGL] = useState<{
    accountId: string;
    from: string;
    to: string;
  } | null>(null);

  function drillToGL(accountId: string, from: string, to: string) {
    setDrillGL({ accountId, from, to });
    setTab("generalLedger");
  }

  useEffect(() => {
    const nextTab = readFinancialTab(location);
    if (nextTab && nextTab !== tab) setTab(nextTab);
  }, [location, tab]);

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    qs.set("tab", tab);
    window.history.replaceState(null, "", `${window.location.pathname}?${qs.toString()}`);
  }, [tab]);

  const dimensionQuery: DimensionFilterQuery = useMemo(
    () => ({
      costCenterId: dimensionFilters.costCenterId || undefined,
      projectId: dimensionFilters.projectId || undefined,
      branchId: dimensionFilters.branchId || undefined,
    }),
    [dimensionFilters],
  );

  const period = periodRange(preset);

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const { data: kpi, isLoading: kpiLoading } = useGetIncomeStatement({
    from: period.from,
    to: period.to,
    ...dimensionQuery,
  });

  const revenue = kpi?.totalRevenue ?? 0;
  const expenses = kpi?.totalExpenses ?? 0;
  const profit = kpi?.netProfit ?? 0;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

  const chartData = [
    {
      name: t("financialReports.chart.revenue"),
      value: revenue,
      fill: "#059669",
    },
    {
      name: t("financialReports.chart.expenses"),
      value: expenses,
      fill: "#e11d48",
    },
    {
      name: t("financialReports.chart.profit"),
      value: Math.abs(profit),
      fill: profit >= 0 ? "#2563eb" : "#f97316",
    },
  ];

  const { data: company } = useGetCompany();
  const baseCurrency = (company?.baseCurrency ?? "EGP").toUpperCase();
  const { data: currencies = [] } = useListCurrencies();
  const [reportCurrency, setReportCurrency] = useState("");
  const cc: CurrencyControls = {
    reportCurrency,
    setReportCurrency,
    baseCurrency,
    currencies: currencies as Currency[],
  };

  const { data: allAccounts = [] } = useListAccounts();
  const leafAccounts = useMemo(
    () => (allAccounts as Account[]).filter((a) => !a.isGroup),
    [allAccounts],
  );

  const presets: { key: PeriodPreset; label: string }[] = [
    { key: "month", label: t("financialReports.period.month") },
    { key: "quarter", label: t("financialReports.period.quarter") },
    { key: "year", label: t("financialReports.period.year") },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <FileBarChart2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t("financialReports.title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("financialReports.subtitle")}
            </p>
          </div>
        </div>

        {/* Period presets */}
        <div className="flex rounded-xl border border-border bg-muted/40 p-1 gap-1">
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPreset(p.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                preset === p.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI summary row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard
          label={t("financialReports.kpi.revenue")}
          value={fmtK(revenue)}
          sub={`${period.from.slice(0, 7)} — ${period.to.slice(0, 7)}`}
          color="green"
          Icon={TrendingUp}
          loading={kpiLoading}
        />
        <KpiCard
          label={t("financialReports.kpi.expenses")}
          value={fmtK(expenses)}
          color="red"
          Icon={TrendingDown}
          loading={kpiLoading}
        />
        <KpiCard
          label={t("financialReports.kpi.profit")}
          value={fmtK(profit)}
          color={profit >= 0 ? "blue" : "red"}
          Icon={DollarSign}
          loading={kpiLoading}
        />
        <KpiCard
          label={t("financialReports.kpi.margin")}
          value={`${margin.toFixed(1)}%`}
          sub={t("financialReports.kpi.marginNote")}
          color="purple"
          Icon={Percent}
          loading={kpiLoading}
        />
      </div>

      {/* ── Mini bar chart ── */}
      <div className="rounded-2xl border border-border bg-card p-4 mb-6">
        <p className="text-sm font-semibold text-muted-foreground mb-3">
          {t("financialReports.chart.title")} —{" "}
          <span className="text-foreground">
            {preset === "year"
              ? new Date().getFullYear()
              : preset === "quarter"
                ? t("financialReports.period.quarter")
                : t("financialReports.period.month")}
          </span>
        </p>
        {kpiLoading ? (
          <div className="flex items-center justify-center h-20">
            <Spinner />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={90}>
            <BarChart data={chartData} barCategoryGap="35%">
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide />
              <Tooltip
                formatter={(v) => [fmt(v as number), ""]}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <DimensionFilters value={dimensionFilters} onChange={setDimensionFilters} />

      {/* ── Report tabs ── */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="flex flex-nowrap h-auto w-max gap-1">
            {TABS.map((k) => (
              <TabsTrigger key={k} value={k} className="whitespace-nowrap text-xs sm:text-sm">
                {t(`reportsPage.tabs.${k}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="mt-6">
          <TabsContent value="trialBalance">
            <TrialBalanceTab fmt={fmt} lang={lang} cc={cc} onDrillAccount={drillToGL} dimensionFilters={dimensionQuery} />
          </TabsContent>
          <TabsContent value="incomeStatement">
            <IncomeStatementTab fmt={fmt} lang={lang} cc={cc} onDrillAccount={drillToGL} dimensionFilters={dimensionQuery} />
          </TabsContent>
          <TabsContent value="balanceSheet">
            <BalanceSheetTab fmt={fmt} lang={lang} cc={cc} onDrillAccount={drillToGL} dimensionFilters={dimensionQuery} />
          </TabsContent>
          <TabsContent value="generalLedger">
            <GeneralLedgerTab
              fmt={fmt}
              lang={lang}
              leafAccounts={leafAccounts}
              cc={cc}
              initialAccountId={drillGL?.accountId}
              initialFrom={drillGL?.from}
              initialTo={drillGL?.to}
              dimensionFilters={dimensionQuery}
            />
          </TabsContent>
          <TabsContent value="cashFlow">
            <CashFlowTab fmt={fmt} lang={lang} onDrillAccount={drillToGL} />
          </TabsContent>
          <TabsContent value="cashForecast">
            <CashForecastTab fmt={fmt} />
          </TabsContent>
          <TabsContent value="revaluation">
            <RevaluationTab fmt={fmt} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
