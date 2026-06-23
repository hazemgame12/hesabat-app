import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useGetIncomeStatement,
  useGetBalanceSheet,
} from "@workspace/api-client-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Info,
  Scale,
  Target,
  Lightbulb,
  BarChart2,
} from "lucide-react";

// ─── helpers ─────────────────────────────────────────────────────────────────
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function startOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}

type RatioStatus = "good" | "warn" | "bad" | "neutral";

function ratioStatus(
  value: number,
  good: [number, number],
  direction: "higher" | "lower",
): RatioStatus {
  if (direction === "higher") {
    if (value >= good[1]) return "good";
    if (value >= good[0]) return "warn";
    return "bad";
  } else {
    if (value <= good[0]) return "good";
    if (value <= good[1]) return "warn";
    return "bad";
  }
}

const statusStyles: Record<RatioStatus, string> = {
  good: "text-emerald-700 bg-emerald-50 border-emerald-200",
  warn: "text-amber-700 bg-amber-50 border-amber-200",
  bad: "text-rose-700 bg-rose-50 border-rose-200",
  neutral: "text-blue-700 bg-blue-50 border-blue-200",
};

const statusIcon: Record<RatioStatus, React.ReactNode> = {
  good: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
  warn: <AlertTriangle className="w-4 h-4 text-amber-500" />,
  bad: <AlertTriangle className="w-4 h-4 text-rose-600" />,
  neutral: <Info className="w-4 h-4 text-blue-500" />,
};

// ─── Health score gauge ───────────────────────────────────────────────────────
function HealthGauge({ score }: { score: number }) {
  const { t } = useTranslation();
  const clamped = Math.max(0, Math.min(100, score));
  const color =
    clamped >= 70 ? "#059669" : clamped >= 40 ? "#f59e0b" : "#e11d48";
  const label =
    clamped >= 70
      ? t("analysis.health.good")
      : clamped >= 40
        ? t("analysis.health.moderate")
        : t("analysis.health.weak");

  // SVG circle gauge
  const r = 44;
  const circ = 2 * Math.PI * r;
  const dash = (clamped / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={120} height={120} viewBox="0 0 120 120">
        <circle
          cx={60}
          cy={60}
          r={r}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={10}
        />
        <circle
          cx={60}
          cy={60}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
        <text
          x={60}
          y={55}
          textAnchor="middle"
          fontSize={22}
          fontWeight={700}
          fill={color}
        >
          {Math.round(clamped)}
        </text>
        <text
          x={60}
          y={72}
          textAnchor="middle"
          fontSize={11}
          fill="#6b7280"
        >
          / 100
        </text>
      </svg>
      <span
        className="text-sm font-semibold px-3 py-1 rounded-full"
        style={{ color, background: `${color}18` }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── Ratio card ───────────────────────────────────────────────────────────────
function RatioCard({
  label,
  value,
  benchmark,
  status,
  note,
}: {
  label: string;
  value: string;
  benchmark: string;
  status: RatioStatus;
  note?: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${statusStyles[status]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide opacity-70">
          {label}
        </span>
        {statusIcon[status]}
      </div>
      <div className="text-2xl font-bold tabular-nums mb-1">{value}</div>
      <div className="text-xs opacity-60">{benchmark}</div>
      {note && <div className="text-xs mt-2 opacity-80 italic">{note}</div>}
    </div>
  );
}

// ─── Guidance card ────────────────────────────────────────────────────────────
function GuidanceCard({
  icon: Icon,
  title,
  points,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  points: string[];
  color: "blue" | "green" | "amber";
}) {
  const styles = {
    blue: "bg-blue-50 border-blue-200",
    green: "bg-emerald-50 border-emerald-200",
    amber: "bg-amber-50 border-amber-200",
  }[color];
  const iconColor = {
    blue: "text-blue-600",
    green: "text-emerald-600",
    amber: "text-amber-600",
  }[color];
  return (
    <div className={`rounded-2xl border p-5 ${styles}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-5 h-5 ${iconColor}`} />
        <span className="font-bold text-sm">{title}</span>
      </div>
      <ul className="space-y-1.5">
        {points.map((p, i) => (
          <li key={i} className="text-sm flex gap-2">
            <span className="opacity-50 mt-0.5">•</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ReportsAnalysis() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const fmtK = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}م`;
    if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}ك`;
    return n.toLocaleString("ar-EG", { maximumFractionDigits: 0 });
  };

  const [from] = useState(startOfYear());
  const [to] = useState(today());

  const { data: income, isLoading: incLoading } = useGetIncomeStatement({
    from,
    to,
  });
  const { data: bs, isLoading: bsLoading } = useGetBalanceSheet({
    asOf: to,
  });

  const isLoading = incLoading || bsLoading;

  const revenue = income?.totalRevenue ?? 0;
  const expenses = income?.totalExpenses ?? 0;
  const profit = income?.netProfit ?? 0;
  const totalAssets = bs?.totalAssets ?? 0;
  const totalLiabilities = bs?.totalLiabilities ?? 0;
  const totalEquity = bs?.totalEquity ?? 0;

  // ── Ratios ──────────────────────────────────────────────────────────────────
  const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const debtToEquity = totalEquity !== 0 ? totalLiabilities / totalEquity : 0;
  const roa = totalAssets > 0 ? (profit / totalAssets) * 100 : 0;
  const equityRatio = totalAssets > 0 ? (totalEquity / totalAssets) * 100 : 0;
  const expenseRatio = revenue > 0 ? (expenses / revenue) * 100 : 0;

  // ── Health score (0–100) ────────────────────────────────────────────────────
  const healthScore = useMemo(() => {
    let score = 0;
    if (profitMargin >= 15) score += 30;
    else if (profitMargin >= 5) score += 18;
    else if (profitMargin >= 0) score += 8;

    if (debtToEquity >= 0 && debtToEquity <= 1) score += 25;
    else if (debtToEquity <= 2) score += 15;
    else if (debtToEquity > 0) score += 5;

    if (roa >= 8) score += 25;
    else if (roa >= 3) score += 15;
    else if (roa >= 0) score += 7;

    if (equityRatio >= 40) score += 20;
    else if (equityRatio >= 20) score += 12;
    else if (equityRatio >= 0) score += 5;

    return score;
  }, [profitMargin, debtToEquity, roa, equityRatio]);

  // ── Chart data ──────────────────────────────────────────────────────────────
  const incomeChartData = [
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
  ];

  const bsChartData = [
    {
      name: t("analysis.chart.assets"),
      value: totalAssets,
      fill: "#2563eb",
    },
    {
      name: t("analysis.chart.liabilities"),
      value: totalLiabilities,
      fill: "#e11d48",
    },
    {
      name: t("analysis.chart.equity"),
      value: Math.max(0, totalEquity),
      fill: "#059669",
    },
  ];

  // ── Guidance based on ratios ─────────────────────────────────────────────────
  const strengths: string[] = [];
  const warnings: string[] = [];
  const actions: string[] = [];

  if (profitMargin >= 10) strengths.push(t("analysis.guidance.goodMargin"));
  else if (profitMargin > 0) warnings.push(t("analysis.guidance.lowMargin"));
  else warnings.push(t("analysis.guidance.loss"));

  if (debtToEquity <= 1) strengths.push(t("analysis.guidance.lowDebt"));
  else if (debtToEquity <= 2) warnings.push(t("analysis.guidance.modDebt"));
  else warnings.push(t("analysis.guidance.highDebt"));

  if (roa >= 5) strengths.push(t("analysis.guidance.goodRoa"));
  else actions.push(t("analysis.guidance.improveRoa"));

  if (expenseRatio > 85) actions.push(t("analysis.guidance.reduceExpenses"));
  if (equityRatio >= 40) strengths.push(t("analysis.guidance.strongEquity"));
  else actions.push(t("analysis.guidance.buildEquity"));

  actions.push(t("analysis.guidance.reviewMonthly"));
  actions.push(t("analysis.guidance.cashBuffer"));

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <BarChart2 className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t("analysis.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("analysis.subtitle")}</p>
        </div>
        <span className="ms-auto text-xs text-muted-foreground border border-border rounded-lg px-3 py-1.5">
          {from} — {to}
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-32">
          <div className="text-center text-muted-foreground">
            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm">{t("analysis.loading")}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Top row: Health + Charts ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Health gauge */}
            <div className="rounded-2xl border border-border bg-card p-6 flex flex-col items-center gap-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {t("analysis.health.title")}
              </h2>
              <HealthGauge score={healthScore} />
              <p className="text-xs text-center text-muted-foreground max-w-xs">
                {t("analysis.health.note")}
              </p>
            </div>

            {/* Income chart */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-semibold text-muted-foreground mb-3">
                {t("analysis.chart.incomeTitle")}
              </p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={incomeChartData} barCategoryGap="35%">
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    formatter={(v) => [fmtK(v as number), ""]}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {incomeChartData.map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Balance sheet chart */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-semibold text-muted-foreground mb-3">
                {t("analysis.chart.bsTitle")}
              </p>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={bsChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={42}
                    outerRadius={68}
                    dataKey="value"
                    paddingAngle={3}
                  >
                    {bsChartData.map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                  </Pie>
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(v) => [fmtK(v as number), ""]}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Financial ratios ── */}
          <div>
            <h2 className="text-base font-bold mb-3 flex items-center gap-2">
              <Scale className="w-4 h-4 text-muted-foreground" />
              {t("analysis.ratios.title")}
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <RatioCard
                label={t("analysis.ratios.profitMargin")}
                value={`${profitMargin.toFixed(1)}%`}
                benchmark={t("analysis.ratios.profitMarginBench")}
                status={ratioStatus(profitMargin, [5, 15], "higher")}
              />
              <RatioCard
                label={t("analysis.ratios.debtToEquity")}
                value={debtToEquity.toFixed(2)}
                benchmark={t("analysis.ratios.debtToEquityBench")}
                status={ratioStatus(debtToEquity, [1, 2], "lower")}
              />
              <RatioCard
                label={t("analysis.ratios.roa")}
                value={`${roa.toFixed(1)}%`}
                benchmark={t("analysis.ratios.roaBench")}
                status={ratioStatus(roa, [3, 8], "higher")}
              />
              <RatioCard
                label={t("analysis.ratios.equityRatio")}
                value={`${equityRatio.toFixed(1)}%`}
                benchmark={t("analysis.ratios.equityRatioBench")}
                status={ratioStatus(equityRatio, [20, 40], "higher")}
              />
              <RatioCard
                label={t("analysis.ratios.expenseRatio")}
                value={`${expenseRatio.toFixed(1)}%`}
                benchmark={t("analysis.ratios.expenseRatioBench")}
                status={ratioStatus(expenseRatio, [70, 85], "lower")}
              />
            </div>
          </div>

          {/* ── Key figures ── */}
          <div>
            <h2 className="text-base font-bold mb-3 flex items-center gap-2">
              <Target className="w-4 h-4 text-muted-foreground" />
              {t("analysis.figures.title")}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                {
                  label: t("financialReports.kpi.revenue"),
                  value: fmtK(revenue),
                  positive: true,
                },
                {
                  label: t("financialReports.kpi.expenses"),
                  value: fmtK(expenses),
                  positive: false,
                },
                {
                  label: t("financialReports.kpi.profit"),
                  value: fmtK(profit),
                  positive: profit >= 0,
                },
                {
                  label: t("analysis.figures.assets"),
                  value: fmtK(totalAssets),
                  positive: true,
                },
                {
                  label: t("analysis.figures.liabilities"),
                  value: fmtK(totalLiabilities),
                  positive: false,
                },
                {
                  label: t("analysis.figures.equity"),
                  value: fmtK(totalEquity),
                  positive: totalEquity >= 0,
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-card p-3 text-center"
                >
                  <div className="text-xs text-muted-foreground mb-1">
                    {item.label}
                  </div>
                  <div
                    className={`text-lg font-bold tabular-nums ${
                      item.positive ? "text-foreground" : "text-rose-600"
                    }`}
                  >
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Financial guidance ── */}
          <div>
            <h2 className="text-base font-bold mb-3 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-muted-foreground" />
              {t("analysis.guidance.title")}
            </h2>
            <div className="grid md:grid-cols-3 gap-4">
              {strengths.length > 0 && (
                <GuidanceCard
                  icon={CheckCircle2}
                  title={t("analysis.guidance.strengthsTitle")}
                  points={strengths}
                  color="green"
                />
              )}
              {warnings.length > 0 && (
                <GuidanceCard
                  icon={AlertTriangle}
                  title={t("analysis.guidance.warningsTitle")}
                  points={warnings}
                  color="amber"
                />
              )}
              {actions.length > 0 && (
                <GuidanceCard
                  icon={TrendingUp}
                  title={t("analysis.guidance.actionsTitle")}
                  points={actions}
                  color="blue"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
