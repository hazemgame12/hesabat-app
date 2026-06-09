import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useGetTrialBalance,
  useGetIncomeStatement,
  useGetBalanceSheet,
  useGetGeneralLedger,
  useGetPartyStatement,
  useGetAgingReport,
  useGetOutstandingInvoices,
  useGetCashFlow,
  useGetCashForecast,
  useGetSalesByItem,
  useGetPurchasesByItem,
  useGetInventorySummary,
  getGetGeneralLedgerQueryKey,
  getGetPartyStatementQueryKey,
  useListAccounts,
  useListCustomers,
  useListSuppliers,
  useListCurrencies,
  useGetCompany,
  type Account,
  type Currency,
  type CurrencyInfo,
  type PnlLine,
  type TrialBalance,
  type CashFlowLine,
  type CashForecastBucket,
  type ItemSalesRow,
  type InventorySummaryRow,
} from "@workspace/api-client-react";
import { FileBarChart } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TaxReports } from "@/components/reports/TaxReports";

type TabKey =
  | "trialBalance"
  | "incomeStatement"
  | "balanceSheet"
  | "generalLedger"
  | "cashFlow"
  | "cashForecast"
  | "salesByItem"
  | "purchasesByItem"
  | "inventorySummary"
  | "partyStatement"
  | "aging"
  | "outstanding"
  | "tax";

type CategoryKey =
  | "financial"
  | "cash"
  | "salesPurchases"
  | "inventory"
  | "parties"
  | "tax";

const CATEGORIES: { key: CategoryKey; tabs: TabKey[] }[] = [
  {
    key: "financial",
    tabs: ["trialBalance", "incomeStatement", "balanceSheet", "generalLedger"],
  },
  { key: "cash", tabs: ["cashFlow", "cashForecast"] },
  { key: "salesPurchases", tabs: ["salesByItem", "purchasesByItem"] },
  { key: "inventory", tabs: ["inventorySummary"] },
  { key: "parties", tabs: ["partyStatement", "aging", "outstanding"] },
  { key: "tax", tabs: ["tax"] },
];

function displayName(
  e: { nameAr: string; nameEn?: string | null },
  lang: string,
): string {
  return lang.startsWith("en") && e.nameEn ? e.nameEn : e.nameAr;
}

export function Reports() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [category, setCategory] = useState<CategoryKey>("financial");
  const [tab, setTab] = useState<TabKey>("trialBalance");

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const { data: chartAccounts = [] } = useListAccounts();
  const leafAccounts = useMemo(
    () => chartAccounts.filter((a: Account) => !a.isGroup),
    [chartAccounts],
  );

  // Report-currency (display-only) controls shared by the in-scope report tabs.
  const { data: company } = useGetCompany();
  const baseCurrency = (company?.baseCurrency ?? "EGP").toUpperCase();
  const { data: currencies = [] } = useListCurrencies();
  const [reportCurrency, setReportCurrency] = useState("");
  const cc: CurrencyControls = {
    reportCurrency,
    setReportCurrency,
    baseCurrency,
    currencies,
  };

  const activeTabs =
    CATEGORIES.find((c) => c.key === category)?.tabs ?? CATEGORIES[0].tabs;

  function renderTab(k: TabKey) {
    switch (k) {
      case "trialBalance":
        return <TrialBalanceTab fmt={fmt} lang={lang} cc={cc} />;
      case "incomeStatement":
        return <IncomeStatementTab fmt={fmt} lang={lang} cc={cc} />;
      case "balanceSheet":
        return <BalanceSheetTab fmt={fmt} lang={lang} cc={cc} />;
      case "generalLedger":
        return (
          <GeneralLedgerTab
            fmt={fmt}
            lang={lang}
            leafAccounts={leafAccounts}
            cc={cc}
          />
        );
      case "cashFlow":
        return <CashFlowTab fmt={fmt} lang={lang} />;
      case "cashForecast":
        return <CashForecastTab fmt={fmt} />;
      case "salesByItem":
        return <SalesByItemTab fmt={fmt} lang={lang} />;
      case "purchasesByItem":
        return <PurchasesByItemTab fmt={fmt} lang={lang} />;
      case "inventorySummary":
        return <InventorySummaryTab fmt={fmt} lang={lang} />;
      case "partyStatement":
        return <PartyStatementTab fmt={fmt} lang={lang} />;
      case "aging":
        return <AgingTab fmt={fmt} />;
      case "outstanding":
        return <OutstandingTab fmt={fmt} />;
      case "tax":
        return <TaxReports fmt={fmt} lang={lang} />;
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <FileBarChart className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {t("reportsPage.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("reportsPage.subtitle")}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-6">
        {CATEGORIES.map((c) => {
          const active = c.key === category;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => {
                setCategory(c.key);
                setTab(c.tabs[0]);
              }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              {t(`reportsPage.categories.${c.key}`)}
            </button>
          );
        })}
      </div>

      <Tabs
        value={activeTabs.includes(tab) ? tab : activeTabs[0]}
        onValueChange={(v) => setTab(v as TabKey)}
        className="mt-4"
      >
        <TabsList className="flex flex-wrap h-auto justify-start gap-1">
          {activeTabs.map((k) => (
            <TabsTrigger key={k} value={k}>
              {t(`reportsPage.tabs.${k}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        {activeTabs.map((k) => (
          <TabsContent key={k} value={k} className="mt-6">
            {renderTab(k)}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// ---- shared bits ----
type Fmt = (n: number) => string;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function startOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {children}
    </div>
  );
}

function DateRange({
  from,
  to,
  onFrom,
  onTo,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-end gap-3 mb-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">
          {t("reportsPage.filters.from")}
        </span>
        <input
          type="date"
          value={from}
          onChange={(e) => onFrom(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 bg-background"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">
          {t("reportsPage.filters.to")}
        </span>
        <input
          type="date"
          value={to}
          onChange={(e) => onTo(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 bg-background"
        />
      </label>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-16">
      <Spinner />
    </div>
  );
}

function Empty() {
  const { t } = useTranslation();
  return (
    <div className="text-center py-16 text-muted-foreground">
      {t("reportsPage.noData")}
    </div>
  );
}

// ---- Report-currency (display-only) controls ----
// Shared state lifted to <Reports> and passed to the four in-scope tabs so the
// chosen report currency is preserved while switching between them.
type CurrencyControls = {
  reportCurrency: string;
  setReportCurrency: (v: string) => void;
  baseCurrency: string;
  currencies: Currency[];
};

// Resolve the value to actually send to the API: undefined when empty or equal
// to the base currency (so the backend behaves exactly as before).
function reportCurrencyParam(cc: CurrencyControls): string | undefined {
  const v = cc.reportCurrency.toUpperCase();
  return v && v !== cc.baseCurrency ? v : undefined;
}

function ReportCurrencySelect({ cc }: { cc: CurrencyControls }) {
  const { t } = useTranslation();
  // Drop any list entry equal to the base currency to avoid a duplicate option.
  const codes = cc.currencies
    .map((c) => c.code)
    .filter((c) => c.toUpperCase() !== cc.baseCurrency);
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">
        {t("reportsPage.currency.label")}
      </span>
      <Select
        value={cc.reportCurrency || cc.baseCurrency}
        onValueChange={cc.setReportCurrency}
      >
        <SelectTrigger className="min-w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={cc.baseCurrency}>
            {t("reportsPage.currency.base", { code: cc.baseCurrency })}
          </SelectItem>
          {codes.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

// Small header line shown only when the report was actually converted.
function CurrencyHeader({ info, fmt }: { info?: CurrencyInfo; fmt: Fmt }) {
  const { t } = useTranslation();
  if (!info || info.rate === 1 || info.reportCurrency === info.baseCurrency)
    return null;
  return (
    <div className="mb-3 text-sm font-medium text-muted-foreground">
      {t("reportsPage.currency.header", {
        currency: info.reportCurrency,
        rate: fmt(info.rate),
        base: info.baseCurrency,
      })}
    </div>
  );
}

// ---- Trial balance (6 columns: opening / movement / closing, debit & credit) ----
// Escape any dynamic value before it is interpolated into the print-window
// HTML, so account names / labels containing markup cannot inject script.
function esc(v: string | number): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildTrialBalancePdfHtml(
  data: TrialBalance,
  fmt: Fmt,
  lang: string,
  from: string,
  to: string,
  labels: Record<string, string>,
): string {
  const rtl = !lang.startsWith("en");
  const cell = (v: number) => (v ? esc(fmt(v)) : "—");
  const rows = data.rows
    .map(
      (r) => `<tr>
        <td class="code">${esc(r.code)}</td>
        <td class="name">${esc(displayName(r, lang))}</td>
        <td class="num">${cell(r.openingDebit)}</td>
        <td class="num">${cell(r.openingCredit)}</td>
        <td class="num">${cell(r.periodDebit)}</td>
        <td class="num">${cell(r.periodCredit)}</td>
        <td class="num">${cell(r.closingDebit)}</td>
        <td class="num">${cell(r.closingCredit)}</td>
      </tr>`,
    )
    .join("");
  return `<!doctype html><html dir="${rtl ? "rtl" : "ltr"}" lang="${esc(lang)}">
<head><meta charset="utf-8"><title>${labels.title}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Cairo','Segoe UI',Tahoma,Arial,sans-serif; margin: 24px; color: #1f2937; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { font-size: 12px; color: #6b7280; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px; }
  thead th { background: #f3f4f6; text-align: center; }
  td.code { font-family: monospace; }
  td.num, th.num { text-align: ${rtl ? "left" : "right"}; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tfoot td { font-weight: 700; background: #f9fafb; }
  .badge { display: inline-block; margin-top: 12px; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; }
  .ok { background: #d1fae5; color: #047857; }
  .bad { background: #fee2e2; color: #b91c1c; }
  @media print { body { margin: 0; } }
</style></head>
<body onload="window.print()">
  <h1>${esc(labels.title)}</h1>
  <div class="meta">${esc(labels.periodLabel)}: ${esc(from || "—")} ← ${esc(to || "—")} · ${esc(labels.preparedAt)}: ${esc(new Date().toLocaleDateString(lang))}</div>
  <table>
    <thead>
      <tr>
        <th rowspan="2">${esc(labels.code)}</th>
        <th rowspan="2">${esc(labels.account)}</th>
        <th colspan="2">${esc(labels.opening)}</th>
        <th colspan="2">${esc(labels.period)}</th>
        <th colspan="2">${esc(labels.closing)}</th>
      </tr>
      <tr>
        <th class="num">${esc(labels.debit)}</th><th class="num">${esc(labels.credit)}</th>
        <th class="num">${esc(labels.debit)}</th><th class="num">${esc(labels.credit)}</th>
        <th class="num">${esc(labels.debit)}</th><th class="num">${esc(labels.credit)}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="2">${esc(labels.total)}</td>
        <td class="num">${esc(fmt(data.totalOpeningDebit))}</td>
        <td class="num">${esc(fmt(data.totalOpeningCredit))}</td>
        <td class="num">${esc(fmt(data.totalPeriodDebit))}</td>
        <td class="num">${esc(fmt(data.totalPeriodCredit))}</td>
        <td class="num">${esc(fmt(data.totalClosingDebit))}</td>
        <td class="num">${esc(fmt(data.totalClosingCredit))}</td>
      </tr>
    </tfoot>
  </table>
  <span class="badge ${data.balanced ? "ok" : "bad"}">${esc(data.balanced ? labels.balanced : labels.unbalanced)}</span>
</body></html>`;
}

function TrialBalanceTab({
  fmt,
  lang,
  cc,
}: {
  fmt: Fmt;
  lang: string;
  cc: CurrencyControls;
}) {
  const { t } = useTranslation();
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());
  const { data, isLoading } = useGetTrialBalance({
    from: from || undefined,
    to: to || undefined,
    reportCurrency: reportCurrencyParam(cc),
  });

  const exportExcel = () => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    // Same-origin GET download; the session cookie is sent automatically.
    window.open(`/api/reports/trial-balance/export?${qs.toString()}`, "_blank");
  };

  const exportPdf = () => {
    if (!data) return;
    const html = buildTrialBalancePdfHtml(data, fmt, lang, from, to, {
      title: t("reportsPage.trialBalance.title"),
      periodLabel: t("reportsPage.trialBalance.periodLabel"),
      preparedAt: t("reportsPage.trialBalance.preparedAt"),
      code: t("reportsPage.table.code"),
      account: t("reportsPage.table.account"),
      opening: t("reportsPage.trialBalance.opening"),
      period: t("reportsPage.trialBalance.period"),
      closing: t("reportsPage.trialBalance.closing"),
      debit: t("reportsPage.table.debit"),
      credit: t("reportsPage.table.credit"),
      total: t("reportsPage.table.total"),
      balanced: t("reportsPage.trialBalance.balanced"),
      unbalanced: t("reportsPage.trialBalance.unbalanced"),
    });
    // Render in an isolated window so the browser shapes Arabic correctly,
    // then trigger the native print → "Save as PDF" dialog.
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  const th = "px-4 py-2.5 font-semibold text-center";
  const groupTh = "px-4 py-2 font-semibold text-center border-s border-border";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
          <div className="mb-4">
            <ReportCurrencySelect cc={cc} />
          </div>
        </div>
        {data && data.rows.length > 0 && (
          <div className="flex gap-2 mb-4">
            <button
              onClick={exportExcel}
              className="px-4 py-2 rounded-lg text-sm font-semibold border border-border bg-card hover:bg-muted"
            >
              {t("reportsPage.export.excel")}
            </button>
            <button
              onClick={exportPdf}
              className="px-4 py-2 rounded-lg text-sm font-semibold border border-border bg-card hover:bg-muted"
            >
              {t("reportsPage.export.pdf")}
            </button>
          </div>
        )}
      </div>
      {isLoading ? (
        <Loading />
      ) : !data || data.rows.length === 0 ? (
        <Empty />
      ) : (
        <>
          <CurrencyHeader info={data.currencyInfo} fmt={fmt} />
          <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th rowSpan={2} className="text-start px-4 py-3 font-semibold">
                    {t("reportsPage.table.code")}
                  </th>
                  <th rowSpan={2} className="text-start px-4 py-3 font-semibold">
                    {t("reportsPage.table.account")}
                  </th>
                  <th colSpan={2} className={groupTh}>
                    {t("reportsPage.trialBalance.opening")}
                  </th>
                  <th colSpan={2} className={groupTh}>
                    {t("reportsPage.trialBalance.period")}
                  </th>
                  <th colSpan={2} className={groupTh}>
                    {t("reportsPage.trialBalance.closing")}
                  </th>
                </tr>
                <tr>
                  <th className={`${th} border-s border-border`}>
                    {t("reportsPage.table.debit")}
                  </th>
                  <th className={th}>{t("reportsPage.table.credit")}</th>
                  <th className={`${th} border-s border-border`}>
                    {t("reportsPage.table.debit")}
                  </th>
                  <th className={th}>{t("reportsPage.table.credit")}</th>
                  <th className={`${th} border-s border-border`}>
                    {t("reportsPage.table.debit")}
                  </th>
                  <th className={th}>{t("reportsPage.table.credit")}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.accountId} className="border-t border-border">
                    <td className="px-4 py-2.5 font-mono text-xs">{r.code}</td>
                    <td className="px-4 py-2.5">{displayName(r, lang)}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums border-s border-border">
                      {r.openingDebit ? fmt(r.openingDebit) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-end tabular-nums">
                      {r.openingCredit ? fmt(r.openingCredit) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-end tabular-nums border-s border-border">
                      {r.periodDebit ? fmt(r.periodDebit) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-end tabular-nums">
                      {r.periodCredit ? fmt(r.periodCredit) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-end tabular-nums border-s border-border">
                      {r.closingDebit ? fmt(r.closingDebit) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-end tabular-nums">
                      {r.closingCredit ? fmt(r.closingCredit) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30 font-bold">
                  <td className="px-4 py-3" colSpan={2}>
                    {t("reportsPage.table.total")}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums border-s border-border">
                    {fmt(data.totalOpeningDebit)}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {fmt(data.totalOpeningCredit)}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums border-s border-border">
                    {fmt(data.totalPeriodDebit)}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {fmt(data.totalPeriodCredit)}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums border-s border-border">
                    {fmt(data.totalClosingDebit)}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {fmt(data.totalClosingCredit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border">
            <span
              className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                data.balanced
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {data.balanced
                ? t("reportsPage.trialBalance.balanced")
                : t("reportsPage.trialBalance.unbalanced")}
            </span>
          </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ---- Income statement ----
function PnlSection({
  title,
  lines,
  total,
  fmt,
  lang,
}: {
  title: string;
  lines: PnlLine[];
  total: number;
  fmt: Fmt;
  lang: string;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <div className="px-4 py-3 bg-muted/50 font-bold">{title}</div>
      <table className="w-full text-sm">
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td className="px-4 py-3 text-muted-foreground" colSpan={2}>
                {t("reportsPage.noData")}
              </td>
            </tr>
          ) : (
            lines.map((l) => (
              <tr key={l.accountId} className="border-t border-border">
                <td className="px-4 py-2.5">
                  <span className="font-mono text-xs text-muted-foreground me-2">
                    {l.code}
                  </span>
                  {displayName(l, lang)}
                </td>
                <td className="px-4 py-2.5 text-end tabular-nums">
                  {fmt(l.amount)}
                </td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-muted/30 font-bold">
            <td className="px-4 py-3">{t("reportsPage.table.total")}</td>
            <td className="px-4 py-3 text-end tabular-nums">{fmt(total)}</td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}

function IncomeStatementTab({
  fmt,
  lang,
  cc,
}: {
  fmt: Fmt;
  lang: string;
  cc: CurrencyControls;
}) {
  const { t } = useTranslation();
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());
  const { data, isLoading } = useGetIncomeStatement({
    from: from || undefined,
    to: to || undefined,
    reportCurrency: reportCurrencyParam(cc),
  });

  const profit = (data?.netProfit ?? 0) >= 0;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <div className="mb-4">
          <ReportCurrencySelect cc={cc} />
        </div>
      </div>
      {isLoading ? (
        <Loading />
      ) : !data ? (
        <Empty />
      ) : (
        <div className="grid gap-4">
          <CurrencyHeader info={data.currencyInfo} fmt={fmt} />
          <PnlSection
            title={t("reportsPage.incomeStatement.revenue")}
            lines={data.revenue}
            total={data.totalRevenue}
            fmt={fmt}
            lang={lang}
          />
          <PnlSection
            title={t("reportsPage.incomeStatement.expenses")}
            lines={data.expenses}
            total={data.totalExpenses}
            fmt={fmt}
            lang={lang}
          />
          <div
            className={`rounded-2xl px-6 py-5 flex items-center justify-between font-bold text-lg ${
              profit
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            <span>
              {profit
                ? t("reportsPage.incomeStatement.netProfit")
                : t("reportsPage.incomeStatement.netLoss")}
            </span>
            <span className="tabular-nums">{fmt(Math.abs(data.netProfit))}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Balance sheet ----
function BalanceSheetTab({
  fmt,
  lang,
  cc,
}: {
  fmt: Fmt;
  lang: string;
  cc: CurrencyControls;
}) {
  const { t } = useTranslation();
  const [asOf, setAsOf] = useState(today());
  const { data, isLoading } = useGetBalanceSheet({
    asOf: asOf || undefined,
    reportCurrency: reportCurrencyParam(cc),
  });

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">
            {t("reportsPage.filters.asOf")}
          </span>
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 bg-background"
          />
        </label>
        <ReportCurrencySelect cc={cc} />
      </div>
      {isLoading ? (
        <Loading />
      ) : !data ? (
        <Empty />
      ) : (
        <>
          <CurrencyHeader info={data.currencyInfo} fmt={fmt} />
          <div className="grid md:grid-cols-2 gap-4">
          <PnlSection
            title={t("reportsPage.balanceSheet.assets")}
            lines={data.assets}
            total={data.totalAssets}
            fmt={fmt}
            lang={lang}
          />
          <div className="grid gap-4">
            <PnlSection
              title={t("reportsPage.balanceSheet.liabilities")}
              lines={data.liabilities}
              total={data.totalLiabilities}
              fmt={fmt}
              lang={lang}
            />
            <Card>
              <div className="px-4 py-3 bg-muted/50 font-bold">
                {t("reportsPage.balanceSheet.equity")}
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {data.equity.map((l) => (
                    <tr key={l.accountId} className="border-t border-border">
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs text-muted-foreground me-2">
                          {l.code}
                        </span>
                        {displayName(l, lang)}
                      </td>
                      <td className="px-4 py-2.5 text-end tabular-nums">
                        {fmt(l.amount)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-border">
                    <td className="px-4 py-2.5 italic text-muted-foreground">
                      {t("reportsPage.balanceSheet.netResult")}
                    </td>
                    <td className="px-4 py-2.5 text-end tabular-nums">
                      {fmt(data.netResult)}
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/30 font-bold">
                    <td className="px-4 py-3">
                      {t("reportsPage.balanceSheet.totalEquity")}
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums">
                      {fmt(data.totalEquity)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </Card>
            <div className="rounded-2xl px-6 py-4 flex items-center justify-between font-bold bg-muted/40 border border-border">
              <span>
                {t("reportsPage.balanceSheet.totalLiabilitiesAndEquity")}
              </span>
              <span className="tabular-nums">
                {fmt(data.totalLiabilitiesAndEquity)}
              </span>
            </div>
          </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---- General ledger ----
function GeneralLedgerTab({
  fmt,
  lang,
  leafAccounts,
  cc,
}: {
  fmt: Fmt;
  lang: string;
  leafAccounts: Account[];
  cc: CurrencyControls;
}) {
  const { t } = useTranslation();
  const [accountId, setAccountId] = useState<string>("");
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());
  const glParams = {
    accountId,
    from: from || undefined,
    to: to || undefined,
    reportCurrency: reportCurrencyParam(cc),
  };
  const { data, isLoading } = useGetGeneralLedger(glParams, {
    query: {
      enabled: !!accountId,
      queryKey: getGetGeneralLedgerQueryKey(glParams),
    },
  });

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="flex flex-col gap-1 text-sm min-w-64">
          <span className="text-muted-foreground">
            {t("reportsPage.filters.account")}
          </span>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue
                placeholder={t("reportsPage.filters.selectAccount")}
              />
            </SelectTrigger>
            <SelectContent>
              {leafAccounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.code} · {displayName(a, lang)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">
            {t("reportsPage.filters.from")}
          </span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 bg-background"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">
            {t("reportsPage.filters.to")}
          </span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 bg-background"
          />
        </label>
        <ReportCurrencySelect cc={cc} />
      </div>
      {!accountId ? (
        <Empty />
      ) : isLoading ? (
        <Loading />
      ) : !data ? (
        <Empty />
      ) : (
        <>
          <CurrencyHeader info={data.currencyInfo} fmt={fmt} />
          <Card>
          <div className="px-4 py-3 border-b border-border flex flex-wrap justify-between gap-2 text-sm">
            <span className="font-semibold">
              {data.accountCode} · {data.accountName}
            </span>
            <span className="text-muted-foreground">
              {t("reportsPage.ledger.openingBalance")}: {fmt(data.openingBalance)}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-start px-4 py-3 font-semibold">
                  {t("reportsPage.table.date")}
                </th>
                <th className="text-start px-4 py-3 font-semibold">
                  {t("reportsPage.table.entryNo")}
                </th>
                <th className="text-start px-4 py-3 font-semibold">
                  {t("reportsPage.table.description")}
                </th>
                <th className="text-end px-4 py-3 font-semibold">
                  {t("reportsPage.table.debit")}
                </th>
                <th className="text-end px-4 py-3 font-semibold">
                  {t("reportsPage.table.credit")}
                </th>
                <th className="text-end px-4 py-3 font-semibold">
                  {t("reportsPage.table.balance")}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.entries.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-6 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    {t("reportsPage.noData")}
                  </td>
                </tr>
              ) : (
                data.entries.map((e, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-4 py-2.5">{e.date}</td>
                    <td className="px-4 py-2.5">#{e.entryNo}</td>
                    <td className="px-4 py-2.5">{e.description}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums">
                      {e.debit ? fmt(e.debit) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-end tabular-nums">
                      {e.credit ? fmt(e.credit) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-end tabular-nums font-semibold">
                      {fmt(e.balance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/30 font-bold">
                <td className="px-4 py-3" colSpan={5}>
                  {t("reportsPage.ledger.closingBalance")}
                </td>
                <td className="px-4 py-3 text-end tabular-nums">
                  {fmt(data.closingBalance)}
                </td>
              </tr>
            </tfoot>
          </table>
          </Card>
        </>
      )}
    </div>
  );
}

// ---- Party statement ----
function PartyStatementTab({ fmt, lang }: { fmt: Fmt; lang: string }) {
  const { t } = useTranslation();
  const [partyType, setPartyType] = useState<"customer" | "supplier">(
    "customer",
  );
  const [partyId, setPartyId] = useState<string>("");
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());

  const { data: customers = [] } = useListCustomers();
  const { data: suppliers = [] } = useListSuppliers();
  const parties = partyType === "customer" ? customers : suppliers;

  const psParams = {
    partyType,
    partyId,
    from: from || undefined,
    to: to || undefined,
  };
  const { data, isLoading } = useGetPartyStatement(psParams, {
    query: {
      enabled: !!partyId,
      queryKey: getGetPartyStatementQueryKey(psParams),
    },
  });

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="flex flex-col gap-1 text-sm min-w-44">
          <span className="text-muted-foreground">
            {t("reportsPage.filters.type")}
          </span>
          <Select
            value={partyType}
            onValueChange={(v) => {
              setPartyType(v as "customer" | "supplier");
              setPartyId("");
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="customer">
                {t("reportsPage.filters.customer")}
              </SelectItem>
              <SelectItem value="supplier">
                {t("reportsPage.filters.supplier")}
              </SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm min-w-56">
          <span className="text-muted-foreground">
            {t("reportsPage.filters.party")}
          </span>
          <Select value={partyId} onValueChange={setPartyId}>
            <SelectTrigger>
              <SelectValue placeholder={t("reportsPage.filters.selectParty")} />
            </SelectTrigger>
            <SelectContent>
              {parties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {displayName(p, lang)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">
            {t("reportsPage.filters.from")}
          </span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 bg-background"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">
            {t("reportsPage.filters.to")}
          </span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 bg-background"
          />
        </label>
      </div>
      {!partyId ? (
        <Empty />
      ) : isLoading ? (
        <Loading />
      ) : !data ? (
        <Empty />
      ) : (
        <Card>
          <div className="px-4 py-3 border-b border-border flex flex-wrap justify-between gap-2 text-sm">
            <span className="font-semibold">{data.partyName}</span>
            <span className="text-muted-foreground">
              {t("reportsPage.ledger.openingBalance")}:{" "}
              {fmt(data.openingBalance)}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-start px-4 py-3 font-semibold">
                  {t("reportsPage.table.date")}
                </th>
                <th className="text-start px-4 py-3 font-semibold">
                  {t("reportsPage.table.description")}
                </th>
                <th className="text-end px-4 py-3 font-semibold">
                  {t("reportsPage.table.debit")}
                </th>
                <th className="text-end px-4 py-3 font-semibold">
                  {t("reportsPage.table.credit")}
                </th>
                <th className="text-end px-4 py-3 font-semibold">
                  {t("reportsPage.table.balance")}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.entries.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-6 text-center text-muted-foreground"
                    colSpan={5}
                  >
                    {t("reportsPage.noData")}
                  </td>
                </tr>
              ) : (
                data.entries.map((e, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-4 py-2.5">{e.date}</td>
                    <td className="px-4 py-2.5">{e.description}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums">
                      {e.debit ? fmt(e.debit) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-end tabular-nums">
                      {e.credit ? fmt(e.credit) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-end tabular-nums font-semibold">
                      {fmt(e.balance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/30 font-bold">
                <td className="px-4 py-3" colSpan={4}>
                  {t("reportsPage.ledger.closingBalance")}
                </td>
                <td className="px-4 py-3 text-end tabular-nums">
                  {fmt(data.closingBalance)}
                </td>
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
    </div>
  );
}

// ---- Aging ----
function AgingTab({ fmt }: { fmt: Fmt }) {
  const { t } = useTranslation();
  const [type, setType] = useState<"ar" | "ap">("ar");
  const [asOf, setAsOf] = useState(today());
  const { data, isLoading } = useGetAgingReport({ type, asOf: asOf || undefined });

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="flex flex-col gap-1 text-sm min-w-52">
          <span className="text-muted-foreground">
            {t("reportsPage.filters.type")}
          </span>
          <Select value={type} onValueChange={(v) => setType(v as "ar" | "ap")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ar">{t("reportsPage.filters.ar")}</SelectItem>
              <SelectItem value="ap">{t("reportsPage.filters.ap")}</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">
            {t("reportsPage.filters.asOf")}
          </span>
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 bg-background"
          />
        </label>
      </div>
      {isLoading ? (
        <Loading />
      ) : !data || data.rows.length === 0 ? (
        <Empty />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-start px-4 py-3 font-semibold">
                  {t("reportsPage.filters.party")}
                </th>
                <th className="text-end px-4 py-3 font-semibold">
                  {t("reportsPage.aging.current")}
                </th>
                <th className="text-end px-4 py-3 font-semibold">
                  {t("reportsPage.aging.d30")}
                </th>
                <th className="text-end px-4 py-3 font-semibold">
                  {t("reportsPage.aging.d60")}
                </th>
                <th className="text-end px-4 py-3 font-semibold">
                  {t("reportsPage.aging.d90")}
                </th>
                <th className="text-end px-4 py-3 font-semibold">
                  {t("reportsPage.aging.d90plus")}
                </th>
                <th className="text-end px-4 py-3 font-semibold">
                  {t("reportsPage.table.total")}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.partyId} className="border-t border-border">
                  <td className="px-4 py-2.5">{r.partyName}</td>
                  <td className="px-4 py-2.5 text-end tabular-nums">
                    {r.current ? fmt(r.current) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-end tabular-nums">
                    {r.days30 ? fmt(r.days30) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-end tabular-nums">
                    {r.days60 ? fmt(r.days60) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-end tabular-nums">
                    {r.days90 ? fmt(r.days90) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-end tabular-nums">
                    {r.days90plus ? fmt(r.days90plus) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-end tabular-nums font-semibold">
                    {fmt(r.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ---- Outstanding invoices ----
function OutstandingTab({ fmt }: { fmt: Fmt }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<"sales" | "purchase">("sales");
  const { data, isLoading } = useGetOutstandingInvoices({ kind });

  return (
    <div>
      <div className="flex items-end gap-3 mb-4">
        <label className="flex flex-col gap-1 text-sm min-w-44">
          <span className="text-muted-foreground">
            {t("reportsPage.filters.type")}
          </span>
          <Select
            value={kind}
            onValueChange={(v) => setKind(v as "sales" | "purchase")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sales">
                {t("reportsPage.filters.sales")}
              </SelectItem>
              <SelectItem value="purchase">
                {t("reportsPage.filters.purchases")}
              </SelectItem>
            </SelectContent>
          </Select>
        </label>
      </div>
      {isLoading ? (
        <Loading />
      ) : !data || data.length === 0 ? (
        <Empty />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-start px-4 py-3 font-semibold">
                  {t("reportsPage.table.invoiceNo")}
                </th>
                <th className="text-start px-4 py-3 font-semibold">
                  {t("reportsPage.filters.party")}
                </th>
                <th className="text-start px-4 py-3 font-semibold">
                  {t("reportsPage.table.dueDate")}
                </th>
                <th className="text-end px-4 py-3 font-semibold">
                  {t("reportsPage.table.total")}
                </th>
                <th className="text-end px-4 py-3 font-semibold">
                  {t("reportsPage.table.paid")}
                </th>
                <th className="text-end px-4 py-3 font-semibold">
                  {t("reportsPage.table.balance")}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((inv) => (
                <tr key={inv.id} className="border-t border-border">
                  <td className="px-4 py-2.5">#{inv.invoiceNo}</td>
                  <td className="px-4 py-2.5">{inv.partyName}</td>
                  <td className="px-4 py-2.5">
                    {inv.dueDate || "—"}
                    {inv.overdue && (
                      <span className="ms-2 inline-block px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
                        {t("reportsPage.overdue")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-end tabular-nums">
                    {fmt(inv.total)}
                  </td>
                  <td className="px-4 py-2.5 text-end tabular-nums">
                    {fmt(inv.amountPaid)}
                  </td>
                  <td className="px-4 py-2.5 text-end tabular-nums font-semibold">
                    {fmt(inv.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ---- Excel export button (shared by analytical tabs) ----
function ExcelButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-lg text-sm font-semibold border border-border bg-card hover:bg-muted"
    >
      {t("reportsPage.export.excel")}
    </button>
  );
}

function openExport(slug: string, from?: string, to?: string) {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  // Same-origin GET download; the session cookie is sent automatically.
  window.open(`/api/reports/${slug}/export${suffix}`, "_blank");
}

function TotalRow({
  label,
  value,
  fmt,
}: {
  label: string;
  value: number;
  fmt: Fmt;
}) {
  return (
    <div className="rounded-2xl px-6 py-4 flex items-center justify-between font-bold bg-muted/40 border border-border">
      <span>{label}</span>
      <span className="tabular-nums">{fmt(value)}</span>
    </div>
  );
}

// ---- Cash flow statement ----
function CashFlowTab({ fmt, lang }: { fmt: Fmt; lang: string }) {
  const { t } = useTranslation();
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());
  const { data, isLoading } = useGetCashFlow({
    from: from || undefined,
    to: to || undefined,
  });

  const section = (title: string, lines: CashFlowLine[], total: number) => (
    <Card>
      <div className="px-4 py-3 bg-muted/50 font-bold flex justify-between">
        <span>{title}</span>
        <span className="tabular-nums">{fmt(total)}</span>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td className="px-4 py-6 text-center text-muted-foreground" colSpan={2}>
                {t("reportsPage.noData")}
              </td>
            </tr>
          ) : (
            lines.map((l) => (
              <tr key={l.accountId} className="border-t border-border">
                <td className="px-4 py-2.5">
                  <span className="font-mono text-xs text-muted-foreground me-2">
                    {l.code}
                  </span>
                  {displayName(l, lang)}
                </td>
                <td className="px-4 py-2.5 text-end tabular-nums">
                  {fmt(l.amount)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </Card>
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        {data && (
          <div className="mb-4">
            <ExcelButton onClick={() => openExport("cash-flow", from, to)} />
          </div>
        )}
      </div>
      {isLoading ? (
        <Loading />
      ) : !data ? (
        <Empty />
      ) : (
        <div className="grid gap-4">
          <div className="grid md:grid-cols-2 gap-4">
            <TotalRow
              label={t("reportsPage.cashFlow.openingCash")}
              value={data.openingCash}
              fmt={fmt}
            />
            <TotalRow
              label={t("reportsPage.cashFlow.closingCash")}
              value={data.closingCash}
              fmt={fmt}
            />
          </div>
          {section(
            t("reportsPage.cashFlow.inflows"),
            data.inflows,
            data.totalInflow,
          )}
          {section(
            t("reportsPage.cashFlow.outflows"),
            data.outflows,
            data.totalOutflow,
          )}
          <div
            className={`rounded-2xl px-6 py-5 flex items-center justify-between font-bold text-lg ${
              data.netCashFlow >= 0
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            <span>{t("reportsPage.cashFlow.netCashFlow")}</span>
            <span className="tabular-nums">{fmt(data.netCashFlow)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Cash forecast ----
const FORECAST_BUCKETS: Record<string, string> = {
  overdue: "reportsPage.cashForecast.overdue",
  d0_30: "reportsPage.cashForecast.d0_30",
  d31_60: "reportsPage.cashForecast.d31_60",
  d61_90: "reportsPage.cashForecast.d61_90",
  beyond: "reportsPage.cashForecast.beyond",
};

function CashForecastTab({ fmt }: { fmt: Fmt }) {
  const { t } = useTranslation();
  const [asOf, setAsOf] = useState(today());
  const { data, isLoading } = useGetCashForecast({ asOf: asOf || undefined });

  const bucketLabel = (b: CashForecastBucket) =>
    FORECAST_BUCKETS[b.key]
      ? t(FORECAST_BUCKETS[b.key])
      : b.key;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">
              {t("reportsPage.cashForecast.asOf")}
            </span>
            <input
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              className="border border-border rounded-lg px-3 py-2 bg-background"
            />
          </label>
          <p className="text-sm text-muted-foreground max-w-md">
            {t("reportsPage.cashForecast.note")}
          </p>
        </div>
        {data && (
          <ExcelButton
            onClick={() => {
              const qs = new URLSearchParams();
              if (asOf) qs.set("asOf", asOf);
              window.open(
                `/api/reports/cash-forecast/export?${qs.toString()}`,
                "_blank",
              );
            }}
          />
        )}
      </div>
      {isLoading ? (
        <Loading />
      ) : !data ? (
        <Empty />
      ) : (
        <div className="grid gap-4">
          <TotalRow
            label={t("reportsPage.cashForecast.currentCash")}
            value={data.currentCash}
            fmt={fmt}
          />
          <Card>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-start px-4 py-3 font-semibold">
                    {t("reportsPage.cashForecast.period")}
                  </th>
                  <th className="text-end px-4 py-3 font-semibold">
                    {t("reportsPage.cashForecast.inflow")}
                  </th>
                  <th className="text-end px-4 py-3 font-semibold">
                    {t("reportsPage.cashForecast.outflow")}
                  </th>
                  <th className="text-end px-4 py-3 font-semibold">
                    {t("reportsPage.cashForecast.net")}
                  </th>
                  <th className="text-end px-4 py-3 font-semibold">
                    {t("reportsPage.cashForecast.projectedCash")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.buckets.map((b) => (
                  <tr key={b.key} className="border-t border-border">
                    <td className="px-4 py-2.5">{bucketLabel(b)}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums">
                      {b.inflow ? fmt(b.inflow) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-end tabular-nums">
                      {b.outflow ? fmt(b.outflow) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-end tabular-nums">
                      {fmt(b.net)}
                    </td>
                    <td className="px-4 py-2.5 text-end tabular-nums font-semibold">
                      {fmt(b.projectedCash)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30 font-bold">
                  <td className="px-4 py-3">
                    {t("reportsPage.table.total")}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {fmt(data.totalInflow)}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {fmt(data.totalOutflow)}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {fmt(data.netExpected)}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {fmt(data.projectedCash)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}

// ---- Sales / purchases by item (shared view) ----
function ByItemView({
  slug,
  rows,
  totalQuantity,
  totalAmount,
  isLoading,
  from,
  to,
  setFrom,
  setTo,
  fmt,
  lang,
}: {
  slug: string;
  rows: ItemSalesRow[] | undefined;
  totalQuantity: number | undefined;
  totalAmount: number | undefined;
  isLoading: boolean;
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  fmt: Fmt;
  lang: string;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        {rows && rows.length > 0 && (
          <div className="mb-4">
            <ExcelButton onClick={() => openExport(slug, from, to)} />
          </div>
        )}
      </div>
      {isLoading ? (
        <Loading />
      ) : !rows || rows.length === 0 ? (
        <Empty />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-start px-4 py-3 font-semibold">
                  {t("reportsPage.byItem.type")}
                </th>
                <th className="text-start px-4 py-3 font-semibold">
                  {t("reportsPage.table.code")}
                </th>
                <th className="text-start px-4 py-3 font-semibold">
                  {t("reportsPage.byItem.item")}
                </th>
                <th className="text-end px-4 py-3 font-semibold">
                  {t("reportsPage.byItem.quantity")}
                </th>
                <th className="text-end px-4 py-3 font-semibold">
                  {t("reportsPage.table.total")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.code}-${i}`} className="border-t border-border">
                  <td className="px-4 py-2.5">
                    {r.groupType === "item"
                      ? t("reportsPage.byItem.typeItem")
                      : t("reportsPage.byItem.typeService")}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {r.code}
                  </td>
                  <td className="px-4 py-2.5">{displayName(r, lang)}</td>
                  <td className="px-4 py-2.5 text-end tabular-nums">
                    {fmt(r.quantity)}
                  </td>
                  <td className="px-4 py-2.5 text-end tabular-nums font-semibold">
                    {fmt(r.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/30 font-bold">
                <td className="px-4 py-3" colSpan={3}>
                  {t("reportsPage.table.total")}
                </td>
                <td className="px-4 py-3 text-end tabular-nums">
                  {fmt(totalQuantity ?? 0)}
                </td>
                <td className="px-4 py-3 text-end tabular-nums">
                  {fmt(totalAmount ?? 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
    </div>
  );
}

function SalesByItemTab({ fmt, lang }: { fmt: Fmt; lang: string }) {
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());
  const { data, isLoading } = useGetSalesByItem({
    from: from || undefined,
    to: to || undefined,
  });
  return (
    <ByItemView
      slug="sales-by-item"
      rows={data?.rows}
      totalQuantity={data?.totalQuantity}
      totalAmount={data?.totalAmount}
      isLoading={isLoading}
      from={from}
      to={to}
      setFrom={setFrom}
      setTo={setTo}
      fmt={fmt}
      lang={lang}
    />
  );
}

function PurchasesByItemTab({ fmt, lang }: { fmt: Fmt; lang: string }) {
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());
  const { data, isLoading } = useGetPurchasesByItem({
    from: from || undefined,
    to: to || undefined,
  });
  return (
    <ByItemView
      slug="purchases-by-item"
      rows={data?.rows}
      totalQuantity={data?.totalQuantity}
      totalAmount={data?.totalAmount}
      isLoading={isLoading}
      from={from}
      to={to}
      setFrom={setFrom}
      setTo={setTo}
      fmt={fmt}
      lang={lang}
    />
  );
}

// ---- Inventory monthly summary ----
function InventorySummaryTab({ fmt, lang }: { fmt: Fmt; lang: string }) {
  const { t } = useTranslation();
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());
  const { data, isLoading } = useGetInventorySummary({
    from: from || undefined,
    to: to || undefined,
  });
  const rows = data?.rows;

  const numCell = "px-3 py-2.5 text-end tabular-nums";
  const headCell = "text-end px-3 py-3 font-semibold whitespace-nowrap";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        {rows && rows.length > 0 && (
          <div className="mb-4">
            <ExcelButton
              onClick={() => openExport("inventory-summary", from, to)}
            />
          </div>
        )}
      </div>
      {isLoading ? (
        <Loading />
      ) : !rows || rows.length === 0 ? (
        <Empty />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-start px-3 py-3 font-semibold">
                    {t("reportsPage.byItem.item")}
                  </th>
                  <th className="text-start px-3 py-3 font-semibold">
                    {t("reportsPage.inventory.unit")}
                  </th>
                  <th className={headCell}>
                    {t("reportsPage.inventory.openingQty")}
                  </th>
                  <th className={headCell}>
                    {t("reportsPage.inventory.openingValue")}
                  </th>
                  <th className={headCell}>{t("reportsPage.inventory.inQty")}</th>
                  <th className={headCell}>
                    {t("reportsPage.inventory.inValue")}
                  </th>
                  <th className={headCell}>{t("reportsPage.inventory.outQty")}</th>
                  <th className={headCell}>
                    {t("reportsPage.inventory.outValue")}
                  </th>
                  <th className={headCell}>
                    {t("reportsPage.inventory.adjValue")}
                  </th>
                  <th className={headCell}>
                    {t("reportsPage.inventory.closingQty")}
                  </th>
                  <th className={headCell}>
                    {t("reportsPage.inventory.closingValue")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: InventorySummaryRow) => (
                  <tr key={r.itemId} className="border-t border-border">
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-xs text-muted-foreground me-2">
                        {r.code}
                      </span>
                      {displayName(r, lang)}
                    </td>
                    <td className="px-3 py-2.5">{r.unit}</td>
                    <td className={numCell}>{fmt(r.openingQty)}</td>
                    <td className={numCell}>{fmt(r.openingValue)}</td>
                    <td className={numCell}>{fmt(r.inQty)}</td>
                    <td className={numCell}>{fmt(r.inValue)}</td>
                    <td className={numCell}>{fmt(r.outQty)}</td>
                    <td className={numCell}>{fmt(r.outValue)}</td>
                    <td className={numCell}>{fmt(r.adjValue)}</td>
                    <td className={`${numCell} font-semibold`}>
                      {fmt(r.closingQty)}
                    </td>
                    <td className={`${numCell} font-semibold`}>
                      {fmt(r.closingValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30 font-bold">
                  <td className="px-3 py-3" colSpan={3}>
                    {t("reportsPage.table.total")}
                  </td>
                  <td className={numCell}>{fmt(data!.totalOpeningValue)}</td>
                  <td className="px-3 py-3" />
                  <td className={numCell}>{fmt(data!.totalInValue)}</td>
                  <td className="px-3 py-3" />
                  <td className={numCell}>{fmt(data!.totalOutValue)}</td>
                  <td className={numCell}>{fmt(data!.totalAdjValue)}</td>
                  <td className="px-3 py-3" />
                  <td className={numCell}>{fmt(data!.totalClosingValue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export default Reports;
