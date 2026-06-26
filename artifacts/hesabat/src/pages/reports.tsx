import React, { useEffect, useMemo, useState } from "react";
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
  usePreviewRevaluation,
  useGetAuditLog,
  useGetJournalEntry,
  getGetGeneralLedgerQueryKey,
  getGetPartyStatementQueryKey,
  useListAccounts,
  useListCustomers,
  useListSuppliers,
  useListCurrencies,
  useGetCompany,
  type Company,
  type Account,
  type CurrencyInfo,
  type PnlLine,
  type CashFlowLine,
  type CashForecastBucket,
  type ItemSalesRow,
  type InventorySummaryRow,
  type RevaluationLine,
  type AuditLogEntry,
} from "@workspace/api-client-react";
import {
  type Fmt,
  type CurrencyControls,
  displayName,
  today,
  startOfYear,
  esc,
  buildTrialBalancePdfHtml,
  buildIncomeStatementPdfHtml,
  buildBalanceSheetPdfHtml,
  reportCurrencyParam,
  openExport,
} from "./reports-utils";
import { FileBarChart, ExternalLink, X, ChevronsUpDown, Check, Paperclip, Download, Columns2, TrendingUp, TrendingDown } from "lucide-react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { TaxReports } from "@/components/reports/TaxReports";

// ── Searchable combobox for long lists (accounts / parties) ──────────────────
function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={`flex h-10 w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent/30 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ""}`}
        >
          <span className="truncate text-start">
            {selected ? selected.label : <span className="text-muted-foreground">{placeholder}</span>}
          </span>
          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        side="bottom"
        avoidCollisions={false}
        sideOffset={4}
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder ?? "بحث…"} />
          <CommandList className="max-h-64 overflow-y-auto">
            <CommandEmpty>{emptyText ?? "لا توجد نتائج"}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => {
                    onValueChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={`me-2 h-4 w-4 shrink-0 ${opt.value === value ? "opacity-100" : "opacity-0"}`}
                  />
                  <span className="truncate">{opt.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

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
  | "tax"
  | "revaluation"
  | "auditLog";

type CategoryKey =
  | "financial"
  | "cash"
  | "salesPurchases"
  | "inventory"
  | "parties"
  | "tax"
  | "audit";

const CATEGORIES: { key: CategoryKey; tabs: TabKey[] }[] = [
  {
    key: "financial",
    tabs: [
      "trialBalance",
      "incomeStatement",
      "balanceSheet",
      "generalLedger",
      "revaluation",
    ],
  },
  { key: "cash", tabs: ["cashFlow", "cashForecast"] },
  { key: "salesPurchases", tabs: ["salesByItem", "purchasesByItem"] },
  { key: "inventory", tabs: ["inventorySummary"] },
  { key: "parties", tabs: ["partyStatement", "aging", "outstanding"] },
  { key: "tax", tabs: ["tax"] },
  { key: "audit", tabs: ["auditLog"] },
];

export function Reports() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [category, setCategory] = useState<CategoryKey>("financial");
  const [tab, setTab] = useState<TabKey>("trialBalance");
  const [drillGL, setDrillGL] = useState<{
    accountId: string;
    from: string;
    to: string;
  } | null>(null);

  function drillToGL(accountId: string, from: string, to: string) {
    setDrillGL({ accountId, from, to });
    setCategory("financial");
    setTab("generalLedger");
  }

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
        return (
          <TrialBalanceTab
            fmt={fmt}
            lang={lang}
            cc={cc}
            onDrillAccount={drillToGL}
            company={company}
          />
        );
      case "incomeStatement":
        return (
          <IncomeStatementTab
            fmt={fmt}
            lang={lang}
            cc={cc}
            onDrillAccount={drillToGL}
            company={company}
          />
        );
      case "balanceSheet":
        return (
          <BalanceSheetTab
            fmt={fmt}
            lang={lang}
            cc={cc}
            onDrillAccount={drillToGL}
            company={company}
          />
        );
      case "generalLedger":
        return (
          <GeneralLedgerTab
            fmt={fmt}
            lang={lang}
            leafAccounts={leafAccounts}
            cc={cc}
            initialAccountId={drillGL?.accountId}
            initialFrom={drillGL?.from}
            initialTo={drillGL?.to}
          />
        );
      case "cashFlow":
        return <CashFlowTab fmt={fmt} lang={lang} onDrillAccount={drillToGL} />;
      case "cashForecast":
        return <CashForecastTab fmt={fmt} />;
      case "salesByItem":
        return <SalesByItemTab fmt={fmt} lang={lang} />;
      case "purchasesByItem":
        return <PurchasesByItemTab fmt={fmt} lang={lang} />;
      case "inventorySummary":
        return <InventorySummaryTab fmt={fmt} lang={lang} />;
      case "revaluation":
        return <RevaluationTab fmt={fmt} />;
      case "auditLog":
        return <AuditLogTab lang={lang} />;
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
export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {children}
    </div>
  );
}

export function DateRange({
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

export function Loading() {
  return (
    <div className="flex justify-center py-16">
      <Spinner />
    </div>
  );
}

export function Empty() {
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
export function ReportCurrencySelect({ cc }: { cc: CurrencyControls }) {
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
export function CurrencyHeader({ info, fmt }: { info?: CurrencyInfo; fmt: Fmt }) {
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
export function TrialBalanceTab({
  fmt,
  lang,
  cc,
  onDrillAccount,
  company,
}: {
  fmt: Fmt;
  lang: string;
  cc: CurrencyControls;
  onDrillAccount?: (accountId: string, from: string, to: string) => void;
  company?: Company;
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
    }, company);
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
                  <tr key={r.accountId} className="border-t border-border hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{r.code}</td>
                    <td className="px-4 py-2.5">
                      {onDrillAccount ? (
                        <button
                          type="button"
                          onClick={() => onDrillAccount(r.accountId, from, to)}
                          className="text-start hover:text-primary hover:underline transition-colors inline-flex items-center gap-1.5 group"
                        >
                          {displayName(r, lang)}
                          <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
                        </button>
                      ) : displayName(r, lang)}
                    </td>
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
export function PnlSection({
  title,
  lines,
  total,
  compLines,
  compTotal,
  showComparison,
  fmt,
  lang,
  onDrillAccount,
  drillFrom,
  drillTo,
}: {
  title: string;
  lines: PnlLine[];
  total: number;
  compLines?: PnlLine[];
  compTotal?: number;
  showComparison?: boolean;
  fmt: Fmt;
  lang: string;
  onDrillAccount?: (accountId: string, from: string, to: string) => void;
  drillFrom?: string;
  drillTo?: string;
}) {
  const { t } = useTranslation();
  const compMap = new Map(compLines?.map((l) => [l.accountId, l.amount]) ?? []);
  const cols = showComparison ? 4 : 2;

  return (
    <div className="rounded-2xl border border-border overflow-hidden shadow-sm">
      <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-900/60 border-b border-border">
        <span className="font-bold text-sm tracking-wide text-foreground">{title}</span>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td className="px-5 py-4 text-muted-foreground" colSpan={cols}>
                {t("reportsPage.noData")}
              </td>
            </tr>
          ) : (
            lines.map((l) => {
              const compAmt = compMap.get(l.accountId);
              const delta =
                showComparison && compAmt !== undefined ? l.amount - compAmt : null;
              return (
                <tr
                  key={l.accountId}
                  className="border-t border-border/50 hover:bg-muted/20 transition-colors"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-[11px] text-muted-foreground/70 w-14 shrink-0">
                        {l.code}
                      </span>
                      {onDrillAccount ? (
                        <button
                          type="button"
                          onClick={() =>
                            onDrillAccount(
                              l.accountId,
                              drillFrom ?? startOfYear(),
                              drillTo ?? today(),
                            )
                          }
                          className="hover:text-primary hover:underline transition-colors inline-flex items-center gap-1 group/btn text-start"
                        >
                          <span>{displayName(l, lang)}</span>
                          <ExternalLink className="w-3 h-3 opacity-0 group-hover/btn:opacity-50 transition-opacity shrink-0" />
                        </button>
                      ) : (
                        displayName(l, lang)
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-end tabular-nums font-mono w-36">
                    {fmt(l.amount)}
                  </td>
                  {showComparison && (
                    <>
                      <td className="px-5 py-3 text-end tabular-nums font-mono text-muted-foreground w-36">
                        {compAmt !== undefined ? fmt(compAmt) : "—"}
                      </td>
                      <td
                        className={`px-5 py-3 text-end tabular-nums text-xs font-semibold w-28 ${
                          delta !== null
                            ? delta >= 0
                              ? "text-emerald-600"
                              : "text-rose-600"
                            : "text-muted-foreground"
                        }`}
                      >
                        {delta !== null
                          ? `${delta >= 0 ? "+" : ""}${fmt(delta)}`
                          : "—"}
                      </td>
                    </>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-primary/20 bg-slate-50 dark:bg-slate-900/60 font-bold">
            <td className="px-5 py-3.5">{t("reportsPage.table.total")}</td>
            <td className="px-5 py-3.5 text-end tabular-nums font-mono">{fmt(total)}</td>
            {showComparison && (
              <>
                <td className="px-5 py-3.5 text-end tabular-nums font-mono text-muted-foreground">
                  {compTotal !== undefined ? fmt(compTotal) : "—"}
                </td>
                <td
                  className={`px-5 py-3.5 text-end tabular-nums text-xs font-semibold ${
                    compTotal !== undefined
                      ? total - compTotal >= 0
                        ? "text-emerald-600"
                        : "text-rose-600"
                      : "text-muted-foreground"
                  }`}
                >
                  {compTotal !== undefined
                    ? `${total - compTotal >= 0 ? "+" : ""}${fmt(total - compTotal)}`
                    : "—"}
                </td>
              </>
            )}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function IncomeStatementTab({
  fmt,
  lang,
  cc,
  onDrillAccount,
  company,
}: {
  fmt: Fmt;
  lang: string;
  cc: CurrencyControls;
  onDrillAccount?: (accountId: string, from: string, to: string) => void;
  company?: Company;
}) {
  const { t } = useTranslation();
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());
  const [showComparison, setShowComparison] = useState(false);
  const [compFrom, setCompFrom] = useState(
    `${parseInt(startOfYear().slice(0, 4)) - 1}${startOfYear().slice(4)}`,
  );
  const [compTo, setCompTo] = useState(
    `${parseInt(today().slice(0, 4)) - 1}${today().slice(4)}`,
  );

  const { data, isLoading } = useGetIncomeStatement({
    from: from || undefined,
    to: to || undefined,
    reportCurrency: reportCurrencyParam(cc),
  });
  const { data: compData, isLoading: compLoading } = useGetIncomeStatement(
    { from: compFrom || undefined, to: compTo || undefined, reportCurrency: reportCurrencyParam(cc) },
    { query: { enabled: showComparison } as any },
  );

  const profit = (data?.netProfit ?? 0) >= 0;
  const netDelta =
    showComparison && compData != null
      ? (data?.netProfit ?? 0) - compData.netProfit
      : null;

  const exportIsExcel = () => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const rc = reportCurrencyParam(cc);
    if (rc) qs.set("reportCurrency", rc);
    window.open(`/api/reports/income-statement/export?${qs.toString()}`, "_blank");
  };
  const exportIsPdf = () => {
    if (!data) return;
    const html = buildIncomeStatementPdfHtml(data, fmt, lang, from, to, {
      title: t("reportsPage.tabs.incomeStatement"),
      periodLabel: t("reportsPage.trialBalance.periodLabel"),
      preparedAt: t("reportsPage.trialBalance.preparedAt"),
      code: t("reportsPage.table.code"),
      amount: t("reportsPage.table.amount"),
      revenue: t("reportsPage.incomeStatement.revenue"),
      totalRevenue: t("reportsPage.incomeStatement.totalRevenue"),
      expenses: t("reportsPage.incomeStatement.expenses"),
      totalExpenses: t("reportsPage.incomeStatement.totalExpenses"),
      netProfit: t("reportsPage.incomeStatement.netProfit"),
      netLoss: t("reportsPage.incomeStatement.netLoss"),
    }, company);
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {showComparison
              ? t("reportsPage.comparison.currentPeriod")
              : t("reportsPage.filters.from")}
          </span>
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        </div>
        {showComparison && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {t("reportsPage.comparison.priorPeriod")}
            </span>
            <DateRange from={compFrom} to={compTo} onFrom={setCompFrom} onTo={setCompTo} />
          </div>
        )}
        <div className="flex items-end gap-2 mb-4">
          <ReportCurrencySelect cc={cc} />
          <button
            onClick={() => setShowComparison(!showComparison)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
              showComparison
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-background text-muted-foreground border-border hover:border-primary hover:text-foreground"
            }`}
          >
            <Columns2 className="w-4 h-4" />
            {t("reportsPage.comparison.enable")}
          </button>
        </div>
        {data && (
          <div className="flex items-end gap-2 mb-4">
            <button
              onClick={exportIsExcel}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-border bg-card hover:bg-muted transition-colors"
            >
              {t("reportsPage.export.excel")}
            </button>
            <button
              onClick={exportIsPdf}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-border bg-card hover:bg-muted transition-colors"
            >
              {t("reportsPage.export.pdf")}
            </button>
          </div>
        )}
      </div>

      {isLoading || (showComparison && compLoading) ? (
        <Loading />
      ) : !data ? (
        <Empty />
      ) : (
        <div className="flex flex-col gap-4">
          <CurrencyHeader info={data.currencyInfo} fmt={fmt} />

          {showComparison && (
            <div className="flex text-xs font-bold text-muted-foreground uppercase tracking-wide px-5 py-1">
              <div className="flex-1">{t("reportsPage.table.account")}</div>
              <div className="w-36 text-end">{t("reportsPage.comparison.current")}</div>
              <div className="w-36 text-end">{t("reportsPage.comparison.prior")}</div>
              <div className="w-28 text-end">{t("reportsPage.comparison.change")}</div>
            </div>
          )}

          <PnlSection
            title={t("reportsPage.incomeStatement.revenue")}
            lines={data.revenue}
            total={data.totalRevenue}
            compLines={compData?.revenue}
            compTotal={compData?.totalRevenue}
            showComparison={showComparison}
            fmt={fmt}
            lang={lang}
            onDrillAccount={onDrillAccount}
            drillFrom={from}
            drillTo={to}
          />
          <PnlSection
            title={t("reportsPage.incomeStatement.expenses")}
            lines={data.expenses}
            total={data.totalExpenses}
            compLines={compData?.expenses}
            compTotal={compData?.totalExpenses}
            showComparison={showComparison}
            fmt={fmt}
            lang={lang}
            onDrillAccount={onDrillAccount}
            drillFrom={from}
            drillTo={to}
          />

          {/* Net profit row */}
          <div
            className={`rounded-2xl px-6 py-5 border font-bold ${
              profit
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-rose-50 border-rose-200 text-rose-800"
            }`}
          >
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                {profit ? (
                  <TrendingUp className="w-5 h-5" />
                ) : (
                  <TrendingDown className="w-5 h-5" />
                )}
                <span className="text-base">
                  {profit
                    ? t("reportsPage.incomeStatement.netProfit")
                    : t("reportsPage.incomeStatement.netLoss")}
                </span>
              </div>
              <div className="flex items-center gap-5">
                <span className="tabular-nums font-mono text-base">
                  {fmt(Math.abs(data.netProfit))}
                </span>
                {showComparison && compData && (
                  <span className="tabular-nums font-mono text-sm opacity-65">
                    {fmt(Math.abs(compData.netProfit))}
                  </span>
                )}
                {netDelta !== null && (
                  <span
                    className={`tabular-nums font-mono text-sm px-2.5 py-1 rounded-lg ${
                      netDelta >= 0
                        ? "bg-emerald-200/80 text-emerald-900"
                        : "bg-rose-200/80 text-rose-900"
                    }`}
                  >
                    {netDelta >= 0 ? "+" : ""}
                    {fmt(netDelta)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Balance sheet ----
export function BalanceSheetTab({
  fmt,
  lang,
  cc,
  onDrillAccount,
  company,
}: {
  fmt: Fmt;
  lang: string;
  cc: CurrencyControls;
  onDrillAccount?: (accountId: string, from: string, to: string) => void;
  company?: Company;
}) {
  const { t } = useTranslation();
  const [asOf, setAsOf] = useState(today());
  const [showComparison, setShowComparison] = useState(false);
  const [compAsOf, setCompAsOf] = useState(
    `${parseInt(today().slice(0, 4)) - 1}${today().slice(4)}`,
  );

  const { data, isLoading } = useGetBalanceSheet({
    asOf: asOf || undefined,
    reportCurrency: reportCurrencyParam(cc),
  });
  const { data: compData, isLoading: compLoading } = useGetBalanceSheet(
    { asOf: compAsOf || undefined, reportCurrency: reportCurrencyParam(cc) },
    { query: { enabled: showComparison } as any },
  );

  const exportBsExcel = () => {
    const qs = new URLSearchParams();
    if (asOf) qs.set("asOf", asOf);
    const rc = reportCurrencyParam(cc);
    if (rc) qs.set("reportCurrency", rc);
    window.open(`/api/reports/balance-sheet/export?${qs.toString()}`, "_blank");
  };
  const exportBsPdf = () => {
    if (!data) return;
    const html = buildBalanceSheetPdfHtml(data, fmt, lang, asOf, {
      title: t("reportsPage.tabs.balanceSheet"),
      asOfLabel: t("reportsPage.filters.asOf"),
      preparedAt: t("reportsPage.trialBalance.preparedAt"),
      code: t("reportsPage.table.code"),
      amount: t("reportsPage.table.amount"),
      assets: t("reportsPage.balanceSheet.assets"),
      totalAssets: t("reportsPage.balanceSheet.totalAssets"),
      liabilities: t("reportsPage.balanceSheet.liabilities"),
      totalLiabilities: t("reportsPage.balanceSheet.totalLiabilities"),
      equity: t("reportsPage.balanceSheet.equity"),
      netResult: t("reportsPage.balanceSheet.netResult"),
      totalEquity: t("reportsPage.balanceSheet.totalEquity"),
      totalLiabilitiesAndEquity: t("reportsPage.balanceSheet.totalLiabilitiesAndEquity"),
    }, company);
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {showComparison
              ? t("reportsPage.comparison.currentDate")
              : t("reportsPage.filters.asOf")}
          </span>
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="border border-border rounded-xl px-3 py-2 bg-background text-sm"
          />
        </label>
        {showComparison && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {t("reportsPage.comparison.priorDate")}
            </span>
            <input
              type="date"
              value={compAsOf}
              onChange={(e) => setCompAsOf(e.target.value)}
              className="border border-border rounded-xl px-3 py-2 bg-background text-sm"
            />
          </label>
        )}
        <div className="flex items-end gap-2 mb-1">
          <ReportCurrencySelect cc={cc} />
          <button
            onClick={() => setShowComparison(!showComparison)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
              showComparison
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-background text-muted-foreground border-border hover:border-primary hover:text-foreground"
            }`}
          >
            <Columns2 className="w-4 h-4" />
            {t("reportsPage.comparison.enable")}
          </button>
        </div>
        {data && (
          <div className="flex items-end gap-2 mb-1">
            <button
              onClick={exportBsExcel}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-border bg-card hover:bg-muted transition-colors"
            >
              {t("reportsPage.export.excel")}
            </button>
            <button
              onClick={exportBsPdf}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-border bg-card hover:bg-muted transition-colors"
            >
              {t("reportsPage.export.pdf")}
            </button>
          </div>
        )}
      </div>

      {isLoading || (showComparison && compLoading) ? (
        <Loading />
      ) : !data ? (
        <Empty />
      ) : (
        <>
          <CurrencyHeader info={data.currencyInfo} fmt={fmt} />

          {showComparison && (
            <div className="flex text-xs font-bold text-muted-foreground uppercase tracking-wide px-5 py-1">
              <div className="flex-1">{t("reportsPage.table.account")}</div>
              <div className="w-36 text-end">{asOf}</div>
              <div className="w-36 text-end">{compAsOf}</div>
              <div className="w-28 text-end">{t("reportsPage.comparison.change")}</div>
            </div>
          )}

          <div className={`grid gap-4 ${showComparison ? "" : "md:grid-cols-2"}`}>
            <PnlSection
              title={t("reportsPage.balanceSheet.assets")}
              lines={data.assets}
              total={data.totalAssets}
              compLines={compData?.assets}
              compTotal={compData?.totalAssets}
              showComparison={showComparison}
              fmt={fmt}
              lang={lang}
              onDrillAccount={onDrillAccount}
              drillFrom={startOfYear()}
              drillTo={asOf}
            />
            <div className="flex flex-col gap-4">
              <PnlSection
                title={t("reportsPage.balanceSheet.liabilities")}
                lines={data.liabilities}
                total={data.totalLiabilities}
                compLines={compData?.liabilities}
                compTotal={compData?.totalLiabilities}
                showComparison={showComparison}
                fmt={fmt}
                lang={lang}
                onDrillAccount={onDrillAccount}
                drillFrom={startOfYear()}
                drillTo={asOf}
              />

              {/* Equity section */}
              <div className="rounded-2xl border border-border overflow-hidden shadow-sm">
                <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-900/60 border-b border-border">
                  <span className="font-bold text-sm tracking-wide">
                    {t("reportsPage.balanceSheet.equity")}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {data.equity.map((l) => {
                      const compAmt = showComparison
                        ? compData?.equity.find((x) => x.accountId === l.accountId)?.amount
                        : undefined;
                      const delta = compAmt !== undefined ? l.amount - compAmt : null;
                      return (
                        <tr
                          key={l.accountId}
                          className="border-t border-border/50 hover:bg-muted/20 transition-colors"
                        >
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              <span className="font-mono text-[11px] text-muted-foreground/70 w-14 shrink-0">
                                {l.code}
                              </span>
                              {onDrillAccount ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onDrillAccount(l.accountId, startOfYear(), asOf)
                                  }
                                  className="hover:text-primary hover:underline inline-flex items-center gap-1 group/btn text-start"
                                >
                                  <span>{displayName(l, lang)}</span>
                                  <ExternalLink className="w-3 h-3 opacity-0 group-hover/btn:opacity-50 transition-opacity shrink-0" />
                                </button>
                              ) : (
                                displayName(l, lang)
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3 text-end tabular-nums font-mono w-36">
                            {fmt(l.amount)}
                          </td>
                          {showComparison && (
                            <>
                              <td className="px-5 py-3 text-end tabular-nums font-mono text-muted-foreground w-36">
                                {compAmt !== undefined ? fmt(compAmt) : "—"}
                              </td>
                              <td
                                className={`px-5 py-3 text-end tabular-nums text-xs font-semibold w-28 ${
                                  delta !== null
                                    ? delta >= 0
                                      ? "text-emerald-600"
                                      : "text-rose-600"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {delta !== null
                                  ? `${delta >= 0 ? "+" : ""}${fmt(delta)}`
                                  : "—"}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                    <tr className="border-t border-border/50">
                      <td className="px-5 py-2.5 italic text-muted-foreground text-xs" colSpan={showComparison ? 1 : 1}>
                        {t("reportsPage.balanceSheet.netResult")}
                      </td>
                      <td className="px-5 py-2.5 text-end tabular-nums font-mono">
                        {fmt(data.netResult)}
                      </td>
                      {showComparison && (
                        <>
                          <td className="px-5 py-2.5 text-end tabular-nums font-mono text-muted-foreground">
                            {compData ? fmt(compData.netResult) : "—"}
                          </td>
                          <td
                            className={`px-5 py-2.5 text-end tabular-nums text-xs font-semibold ${
                              compData
                                ? data.netResult - compData.netResult >= 0
                                  ? "text-emerald-600"
                                  : "text-rose-600"
                                : "text-muted-foreground"
                            }`}
                          >
                            {compData
                              ? `${data.netResult - compData.netResult >= 0 ? "+" : ""}${fmt(data.netResult - compData.netResult)}`
                              : "—"}
                          </td>
                        </>
                      )}
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-primary/20 bg-slate-50 dark:bg-slate-900/60 font-bold">
                      <td className="px-5 py-3.5">
                        {t("reportsPage.balanceSheet.totalEquity")}
                      </td>
                      <td className="px-5 py-3.5 text-end tabular-nums font-mono">
                        {fmt(data.totalEquity)}
                      </td>
                      {showComparison && (
                        <>
                          <td className="px-5 py-3.5 text-end tabular-nums font-mono text-muted-foreground">
                            {compData ? fmt(compData.totalEquity) : "—"}
                          </td>
                          <td
                            className={`px-5 py-3.5 text-end tabular-nums text-xs font-semibold ${
                              compData
                                ? data.totalEquity - compData.totalEquity >= 0
                                  ? "text-emerald-600"
                                  : "text-rose-600"
                                : "text-muted-foreground"
                            }`}
                          >
                            {compData
                              ? `${data.totalEquity - compData.totalEquity >= 0 ? "+" : ""}${fmt(data.totalEquity - compData.totalEquity)}`
                              : "—"}
                          </td>
                        </>
                      )}
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Balance check */}
              <div className="rounded-2xl px-6 py-4 flex items-center justify-between font-bold bg-muted/40 border border-border">
                <span>{t("reportsPage.balanceSheet.totalLiabilitiesAndEquity")}</span>
                <div className="flex items-center gap-6">
                  <span className="tabular-nums font-mono">
                    {fmt(data.totalLiabilitiesAndEquity)}
                  </span>
                  {showComparison && compData && (
                    <span className="tabular-nums font-mono text-muted-foreground text-sm">
                      {fmt(compData.totalLiabilitiesAndEquity)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---- General ledger ----
export function GeneralLedgerTab({
  fmt,
  lang,
  leafAccounts,
  cc,
  initialAccountId,
  initialFrom,
  initialTo,
}: {
  fmt: Fmt;
  lang: string;
  leafAccounts: Account[];
  cc: CurrencyControls;
  initialAccountId?: string;
  initialFrom?: string;
  initialTo?: string;
}) {
  const { t } = useTranslation();
  const [accountId, setAccountId] = useState<string>(initialAccountId ?? "");
  const [from, setFrom] = useState(initialFrom ?? startOfYear());
  const [to, setTo] = useState(initialTo ?? today());
  const [jeModalId, setJeModalId] = useState<string | null>(null);

  useEffect(() => {
    if (initialAccountId) {
      setAccountId(initialAccountId);
      if (initialFrom) setFrom(initialFrom);
      if (initialTo) setTo(initialTo);
    }
  }, [initialAccountId, initialFrom, initialTo]);

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
          <SearchableSelect
            value={accountId}
            onValueChange={setAccountId}
            options={leafAccounts.map((a) => ({
              value: a.id,
              label: `${a.code} · ${displayName(a, lang)}`,
            }))}
            placeholder={t("reportsPage.filters.selectAccount")}
            searchPlaceholder={t("reportsPage.filters.searchAccount")}
          />
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
        {data && accountId && (
          <button
            onClick={() => {
              const qs = new URLSearchParams();
              if (accountId) qs.set("accountId", accountId);
              if (from) qs.set("from", from);
              if (to) qs.set("to", to);
              const rc = reportCurrencyParam(cc);
              if (rc) qs.set("reportCurrency", rc);
              window.open(`/api/reports/general-ledger/export?${qs.toString()}`, "_blank");
            }}
            className="px-4 py-2 rounded-xl text-sm font-semibold border border-border bg-card hover:bg-muted transition-colors self-end"
          >
            {t("reportsPage.export.excel")}
          </button>
        )}
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
                  <tr
                    key={i}
                    className="border-t border-border hover:bg-primary/5 transition-colors cursor-pointer"
                    onClick={() => setJeModalId(e.entryId)}
                  >
                    <td className="px-4 py-2.5 tabular-nums">{e.date}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-primary font-semibold">
                        #{e.entryNo}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">
                      {e.description}
                    </td>
                    <td className="px-4 py-2.5 text-end tabular-nums text-rose-600">
                      {e.debit ? fmt(e.debit) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-end tabular-nums text-emerald-600">
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
      {jeModalId && (
        <JournalEntryModal
          entryId={jeModalId}
          onClose={() => setJeModalId(null)}
          fmt={fmt}
        />
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
  const [jeModalId, setJeModalId] = useState<string | null>(null);
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
          <SearchableSelect
            value={partyId}
            onValueChange={setPartyId}
            options={parties.map((p) => ({
              value: p.id,
              label: displayName(p, lang),
            }))}
            placeholder={t("reportsPage.filters.selectParty")}
            searchPlaceholder={t("reportsPage.filters.searchParty")}
          />
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
                  <tr
                    key={i}
                    className="border-t border-border hover:bg-primary/5 transition-colors cursor-pointer"
                    onClick={() => setJeModalId(e.entryId)}
                  >
                    <td className="px-4 py-2.5 tabular-nums">{e.date}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">
                      {e.description}
                    </td>
                    <td className="px-4 py-2.5 text-end tabular-nums text-rose-600">
                      {e.debit ? fmt(e.debit) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-end tabular-nums text-emerald-600">
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
      {jeModalId && (
        <JournalEntryModal
          entryId={jeModalId}
          onClose={() => setJeModalId(null)}
          fmt={fmt}
        />
      )}
    </div>
  );
}

// ---- Journal Entry Modal ----
function JournalEntryModal({
  entryId,
  onClose,
  fmt,
}: {
  entryId: string;
  onClose: () => void;
  fmt: Fmt;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { data, isLoading } = useGetJournalEntry(entryId);
  const { data: accounts = [] } = useListAccounts();
  const accountMap = useMemo(
    () => new Map(accounts.map((a: Account) => [a.id, a])),
    [accounts],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            {data ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-bold text-lg">
                    {t("reportsPage.je.title")} #{data.entryNo}
                  </h2>
                  <span className="text-sm text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                    {data.date}
                  </span>
                </div>
                {data.reference && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {data.reference}
                  </p>
                )}
              </>
            ) : (
              <h2 className="font-bold text-lg">{t("reportsPage.je.title")}</h2>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          {isLoading ? (
            <Loading />
          ) : !data ? (
            <Empty />
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-start px-4 py-3 font-semibold">
                      {t("reportsPage.table.account")}
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
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((line, i) => {
                    const acc = accountMap.get(line.accountId);
                    return (
                      <tr key={i} className="border-t border-border">
                        <td className="px-4 py-2.5">
                          {acc && (
                            <span className="font-mono text-xs text-muted-foreground me-2">
                              {acc.code}
                            </span>
                          )}
                          {acc
                            ? displayName(acc, lang)
                            : line.accountId.slice(0, 8)}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">
                          {line.description ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 text-end tabular-nums text-rose-600">
                          {line.debitBase ? fmt(line.debitBase) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-end tabular-nums text-emerald-600">
                          {line.creditBase ? fmt(line.creditBase) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/30 font-bold">
                    <td colSpan={2} className="px-4 py-3">
                      {t("reportsPage.table.total")}
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums text-rose-600">
                      {fmt(data.totalDebitBase)}
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums text-emerald-600">
                      {fmt(data.totalCreditBase)}
                    </td>
                  </tr>
                </tfoot>
              </table>
              {data.notes && (
                <p className="mt-4 text-sm text-muted-foreground border-t border-border pt-3 px-4">
                  {data.notes}
                </p>
              )}
              {data.attachments.length > 0 && (
                <div className="mt-4 border-t border-border pt-3 px-4">
                  <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                    <Paperclip className="w-4 h-4 text-muted-foreground" />
                    <span>{t("reportsPage.je.attachments")}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {data.attachments.map((att) => (
                      <a
                        key={att.id}
                        href={`/api/journal/${entryId}/attachments/${att.id}/download`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-primary hover:underline group"
                      >
                        <Download className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{att.fileName}</span>
                        {att.size && (
                          <span className="text-xs text-muted-foreground">
                            ({Math.round(att.size / 1024)} KB)
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
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
export function ExcelButton({ onClick }: { onClick: () => void }) {
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

export function TotalRow({
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
export function CashFlowTab({
  fmt,
  lang,
  onDrillAccount,
}: {
  fmt: Fmt;
  lang: string;
  onDrillAccount?: (accountId: string, from: string, to: string) => void;
}) {
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
              <tr key={l.accountId} className="border-t border-border hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2.5">
                  <span className="font-mono text-xs text-muted-foreground me-2">
                    {l.code}
                  </span>
                  {onDrillAccount ? (
                    <button
                      type="button"
                      onClick={() => onDrillAccount(l.accountId, from, to)}
                      className="hover:text-primary hover:underline transition-colors inline-flex items-center gap-1.5 group"
                    >
                      {displayName(l, lang)}
                      <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
                    </button>
                  ) : displayName(l, lang)}
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

export function CashForecastTab({ fmt }: { fmt: Fmt }) {
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

// ---- FX revaluation (period-end unrealized gain/loss) ----
export function RevaluationTab({ fmt }: { fmt: Fmt }) {
  const { t } = useTranslation();
  const [asOf, setAsOf] = useState(today());
  const { data, isLoading } = usePreviewRevaluation({ asOfDate: asOf });
  const lines = data?.lines;
  const numCell = "px-3 py-2.5 text-end tabular-nums";
  const headCell = "text-end px-3 py-3 font-semibold whitespace-nowrap";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">
              {t("reportsPage.revaluation.asOf")}
            </span>
            <input
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              className="border border-border rounded-lg px-3 py-2 bg-background"
            />
          </label>
          <p className="text-sm text-muted-foreground max-w-md">
            {t("reportsPage.revaluation.note")}
          </p>
        </div>
        {lines && lines.length > 0 && (
          <ExcelButton
            onClick={() => {
              const qs = new URLSearchParams();
              if (asOf) qs.set("asOfDate", asOf);
              window.open(
                `/api/revaluations/preview/export?${qs.toString()}`,
                "_blank",
              );
            }}
          />
        )}
      </div>
      {isLoading ? (
        <Loading />
      ) : !lines || lines.length === 0 ? (
        <Empty />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 mb-4">
            <TotalRow
              label={t("reportsPage.revaluation.gain")}
              value={data!.totalGain}
              fmt={fmt}
            />
            <TotalRow
              label={t("reportsPage.revaluation.loss")}
              value={data!.totalLoss}
              fmt={fmt}
            />
            <TotalRow
              label={t("reportsPage.revaluation.net")}
              value={data!.totalGain - data!.totalLoss}
              fmt={fmt}
            />
          </div>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-start px-3 py-3 font-semibold">
                      {t("reportsPage.revaluation.account")}
                    </th>
                    <th className="text-start px-3 py-3 font-semibold">
                      {t("reportsPage.revaluation.currency")}
                    </th>
                    <th className={headCell}>
                      {t("reportsPage.revaluation.foreignBalance")}
                    </th>
                    <th className={headCell}>
                      {t("reportsPage.revaluation.baseBook")}
                    </th>
                    <th className={headCell}>
                      {t("reportsPage.revaluation.rate")}
                    </th>
                    <th className={headCell}>
                      {t("reportsPage.revaluation.revaluedBase")}
                    </th>
                    <th className={headCell}>
                      {t("reportsPage.revaluation.unrealized")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((r: RevaluationLine) => (
                    <tr
                      key={`${r.accountId}-${r.currency}`}
                      className="border-t border-border"
                    >
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-xs text-muted-foreground me-2">
                          {r.accountCode}
                        </span>
                        {r.accountName}
                      </td>
                      <td className="px-3 py-2.5">{r.currency}</td>
                      <td className={numCell}>{fmt(r.foreignBalance)}</td>
                      <td className={numCell}>{fmt(r.baseBook)}</td>
                      <td className={numCell}>{fmt(r.rate)}</td>
                      <td className={numCell}>{fmt(r.revaluedBase)}</td>
                      <td className={`${numCell} font-semibold`}>
                        {fmt(r.unrealized)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ---- Audit log (read-only activity trail) ----
function AuditLogTab({ lang }: { lang: string }) {
  const { t } = useTranslation();
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());
  const { data: rows, isLoading } = useGetAuditLog({
    from: from || undefined,
    to: to || undefined,
  });

  const entityLabel = (e: string) => {
    const key = `auditPage.entities.${e}`;
    const v = t(key);
    return v === key ? e : v;
  };
  const actionLabel = (a: string) => {
    const key = `auditPage.actions.${a}`;
    const v = t(key);
    return v === key ? a : v;
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        {rows && rows.length > 0 && (
          <div className="mb-4">
            <ExcelButton
              onClick={() => {
                const qs = new URLSearchParams();
                if (from) qs.set("from", from);
                if (to) qs.set("to", to);
                window.open(`/api/audit/export?${qs.toString()}`, "_blank");
              }}
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
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-start px-3 py-3 font-semibold">
                    {t("auditPage.columns.date")}
                  </th>
                  <th className="text-start px-3 py-3 font-semibold">
                    {t("auditPage.columns.user")}
                  </th>
                  <th className="text-start px-3 py-3 font-semibold">
                    {t("auditPage.columns.action")}
                  </th>
                  <th className="text-start px-3 py-3 font-semibold">
                    {t("auditPage.columns.entity")}
                  </th>
                  <th className="text-start px-3 py-3 font-semibold">
                    {t("reportsPage.audit.detail")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: AuditLogEntry) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleString(lang)}
                    </td>
                    <td className="px-3 py-2.5">{r.userName ?? "—"}</td>
                    <td className="px-3 py-2.5">{actionLabel(r.action)}</td>
                    <td className="px-3 py-2.5">{entityLabel(r.entity)}</td>
                    <td className="px-3 py-2.5">{r.entityLabel ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
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
                    {t("reportsPage.inventory.month")}
                  </th>
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
                  <tr
                    key={`${r.itemId}-${r.month}`}
                    className="border-t border-border"
                  >
                    <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                      {r.month}
                    </td>
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
                  <td className="px-3 py-3" colSpan={4}>
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
