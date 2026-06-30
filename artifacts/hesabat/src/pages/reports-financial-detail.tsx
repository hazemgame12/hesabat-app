/**
 * reports-financial-detail.tsx
 *
 * Professional financial report detail pages.
 *
 * Each report type (Trial Balance, General Ledger, Account Statement,
 * Income Statement, Balance Sheet, Cash Flow) has its own self-contained
 * component that:
 *   - manages its own date/filter state
 *   - calls the same API hooks as the legacy reports page
 *   - uses the same export functions (PDF/Excel) unchanged
 *   - renders data in a new professional accounting layout
 *
 * The old tab components are intentionally NOT imported here.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  useGetCompany,
  useListCurrencies,
  useListAccounts,
  useGetJournalEntry,
  useGetTrialBalance,
  useGetGeneralLedger,
  useGetIncomeStatement,
  useGetBalanceSheet,
  useGetCashFlow,
  getGetGeneralLedgerQueryKey,
  type Account,
  type Currency,
  type Company,
  type CurrencyInfo,
  type CashFlowLine,
  type TrialBalanceRow,
  type GeneralLedgerEntry,
  type PnlLine,
} from "@workspace/api-client-react";
import {
  type CurrencyControls,
  type Fmt,
  reportCurrencyParam,
  displayName,
  today,
  startOfYear,
  buildTrialBalancePdfHtml,
  buildIncomeStatementPdfHtml,
  buildBalanceSheetPdfHtml,
} from "@/pages/reports-utils";
import {
  DimensionFilters,
  type DimensionFilterQuery,
  type DimensionFilterValues,
} from "@/components/reports/DimensionFilters";
import {
  ReportShell,
  ReportHeader,
  ReportFilterRow,
  ReportFilterField,
  ReportDateInput,
  ReportExcelButton,
  ReportPdfButton,
  ReportEmpty,
  ReportLoading,
  ReportTableCard,
  ReportSectionCard,
  ReportNetCard,
  ReportTotalCard,
} from "@/components/reports/ReportPageShell";
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
import { Check, ChevronsUpDown, Download, ExternalLink, Paperclip, X } from "lucide-react";

// ─── Route helpers ────────────────────────────────────────────────────────────

const REPORT_KEYS = [
  "trial-balance",
  "general-ledger",
  "account-statement",
  "income-statement",
  "balance-sheet",
  "cash-flow",
] as const;

type FinancialReportKey = (typeof REPORT_KEYS)[number];

type DrillToGeneralLedger = (accountId: string, params?: {
  from?: string;
  to?: string;
}) => void;

function getReportKey(pathname: string): FinancialReportKey {
  const parts = pathname.split("/").filter(Boolean);
  const key = parts[parts.length - 1];
  return REPORT_KEYS.includes(key as FinancialReportKey)
    ? (key as FinancialReportKey)
    : "trial-balance";
}

function parseQuery(location: string) {
  return new URLSearchParams(location.split("?")[1] || "");
}

// ─── Shared table cell helpers ────────────────────────────────────────────────

const TH_BASE = "px-4 py-2.5 font-semibold text-muted-foreground";
const TH_NUM = `${TH_BASE} text-end`;
const TD_CODE =
  "px-4 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap";
const TD_NAME = "px-4 py-2.5";
const TD_NUM =
  "px-4 py-2.5 text-end tabular-nums font-mono whitespace-nowrap";

function AccountDrillLink({
  accountId,
  label,
  onDrill,
}: {
  accountId?: string | null;
  label: string;
  onDrill?: DrillToGeneralLedger;
}) {
  const { t } = useTranslation();
  if (!accountId || !onDrill) return <>{label}</>;
  return (
    <button
      type="button"
      onClick={() => onDrill(accountId)}
      title={t("reportsPage.drill.viewGeneralLedger")}
      aria-label={`${t("reportsPage.drill.viewGeneralLedger")}: ${label}`}
      className="text-start text-primary hover:underline underline-offset-2 transition-colors inline-flex items-center gap-1.5 group cursor-pointer"
    >
      <span>{label}</span>
      <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-70 transition-opacity shrink-0" />
    </button>
  );
}

// ─── Searchable account dropdown ──────────────────────────────────────────────

function AccountCombobox({
  value,
  onValueChange,
  options,
  placeholder,
  searchPlaceholder,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className="flex h-11 min-w-64 items-center justify-between rounded-xl border border-border bg-background px-3 py-2 text-sm hover:bg-accent/30 focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <span className="truncate text-start">
            {selected ? (
              selected.label
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
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
          <CommandInput placeholder={searchPlaceholder ?? "…"} />
          <CommandList className="max-h-64 overflow-y-auto">
            <CommandEmpty>—</CommandEmpty>
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
                    className={`me-2 h-4 w-4 shrink-0 ${
                      opt.value === value ? "opacity-100" : "opacity-0"
                    }`}
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

// ─── Currency selector ────────────────────────────────────────────────────────

function CurrencySelect({ cc }: { cc: CurrencyControls }) {
  const { t } = useTranslation();
  const codes = cc.currencies
    .map((c) => c.code)
    .filter((c) => c.toUpperCase() !== cc.baseCurrency);
  return (
    <ReportFilterField label={t("reportsPage.currency.label")}>
      <Select
        value={cc.reportCurrency || cc.baseCurrency}
        onValueChange={cc.setReportCurrency}
      >
        <SelectTrigger className="h-11 min-w-40 rounded-xl">
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
    </ReportFilterField>
  );
}

// ─── Inline currency-rate note ────────────────────────────────────────────────

function CurrencyRateNote({
  info,
  fmt,
}: {
  info?: CurrencyInfo;
  fmt: Fmt;
}) {
  const { t } = useTranslation();
  if (!info || info.rate === 1 || info.reportCurrency === info.baseCurrency)
    return null;
  return (
    <p className="text-xs text-muted-foreground px-1 no-print">
      {t("reportsPage.currency.header", {
        currency: info.reportCurrency,
        rate: fmt(info.rate),
        base: info.baseCurrency,
      })}
    </p>
  );
}

// ─── Trial Balance ────────────────────────────────────────────────────────────

function TrialBalanceDetail({
  company,
  cc,
  fmt,
  lang,
  dimensionFilters,
  onDrillToGeneralLedger,
}: {
  company?: Company;
  cc: CurrencyControls;
  fmt: Fmt;
  lang: string;
  dimensionFilters: DimensionFilterQuery;
  onDrillToGeneralLedger?: DrillToGeneralLedger;
}) {
  const { t } = useTranslation();
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());

  const { data, isLoading } = useGetTrialBalance({
    from: from || undefined,
    to: to || undefined,
    reportCurrency: reportCurrencyParam(cc),
    ...dimensionFilters,
  });

  const exportExcel = () => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (dimensionFilters?.costCenterId)
      qs.set("costCenterId", dimensionFilters.costCenterId);
    if (dimensionFilters?.projectId)
      qs.set("projectId", dimensionFilters.projectId);
    if (dimensionFilters?.branchId)
      qs.set("branchId", dimensionFilters.branchId);
    window.open(
      `/api/reports/trial-balance/export?${qs.toString()}`,
      "_blank",
    );
  };

  const exportPdf = () => {
    if (!data) return;
    const html = buildTrialBalancePdfHtml(
      data,
      fmt,
      lang,
      from,
      to,
      {
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
      },
      company,
    );
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  const currency = reportCurrencyParam(cc) || cc.baseCurrency;
  const dateLabel = `${t("reportsPage.filters.from")}: ${from || "—"}  ·  ${t("reportsPage.filters.to")}: ${to || "—"}`;

  return (
    <>
      <ReportHeader
        company={company}
        title={t("reportsPage.trialBalance.title")}
        dateLabel={dateLabel}
        currency={currency}
        baseCurrency={cc.baseCurrency}
        rateLabel={
          data?.currencyInfo &&
          data.currencyInfo.rate !== 1 &&
          data.currencyInfo.reportCurrency !== data.currencyInfo.baseCurrency
            ? t("reportsPage.currency.header", {
                currency: data.currencyInfo.reportCurrency,
                rate: fmt(data.currencyInfo.rate),
                base: data.currencyInfo.baseCurrency,
              })
            : undefined
        }
        actions={
          data && data.rows.length > 0 ? (
            <div className="flex gap-2">
              <ReportExcelButton onClick={exportExcel} />
              <ReportPdfButton onClick={exportPdf} />
            </div>
          ) : undefined
        }
      />

      <ReportFilterRow>
        <ReportDateInput
          label={t("reportsPage.filters.from")}
          value={from}
          onChange={setFrom}
        />
        <ReportDateInput
          label={t("reportsPage.filters.to")}
          value={to}
          onChange={setTo}
        />
        <CurrencySelect cc={cc} />
      </ReportFilterRow>

      {isLoading ? (
        <ReportLoading />
      ) : !data || data.rows.length === 0 ? (
        <ReportEmpty />
      ) : (
        <ReportTableCard>
          <table className="w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-800 text-muted-foreground border-b border-border">
              <tr>
                <th
                  rowSpan={2}
                  className={`${TH_BASE} text-start border-e border-border`}
                >
                  {t("reportsPage.table.code")}
                </th>
                <th
                  rowSpan={2}
                  className={`${TH_BASE} text-start border-e border-border`}
                >
                  {t("reportsPage.table.account")}
                </th>
                <th
                  colSpan={2}
                  className={`${TH_BASE} text-center border-e border-border border-b border-border`}
                >
                  {t("reportsPage.trialBalance.opening")}
                </th>
                <th
                  colSpan={2}
                  className={`${TH_BASE} text-center border-e border-border border-b border-border`}
                >
                  {t("reportsPage.trialBalance.period")}
                </th>
                <th
                  colSpan={2}
                  className={`${TH_BASE} text-center border-b border-border`}
                >
                  {t("reportsPage.trialBalance.closing")}
                </th>
              </tr>
              <tr>
                <th className={`${TH_NUM} border-e border-border`}>
                  {t("reportsPage.table.debit")}
                </th>
                <th className={`${TH_NUM} border-e border-border`}>
                  {t("reportsPage.table.credit")}
                </th>
                <th className={`${TH_NUM} border-e border-border`}>
                  {t("reportsPage.table.debit")}
                </th>
                <th className={`${TH_NUM} border-e border-border`}>
                  {t("reportsPage.table.credit")}
                </th>
                <th className={`${TH_NUM} border-e border-border`}>
                  {t("reportsPage.table.debit")}
                </th>
                <th className={TH_NUM}>{t("reportsPage.table.credit")}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: TrialBalanceRow, idx: number) => (
                <tr
                  key={r.accountId}
                  className={`border-t border-border transition-colors hover:bg-primary/5 ${idx % 2 === 1 ? "bg-muted/20" : ""}`}
                >
                  <td className={`${TD_CODE} border-e border-border`}>
                    {r.code}
                  </td>
                  <td
                    className={`${TD_NAME} border-e border-border font-medium`}
                  >
                    <AccountDrillLink
                      accountId={r.accountId}
                      label={displayName(r, lang)}
                      onDrill={(accountId) =>
                        onDrillToGeneralLedger?.(accountId, { from, to })
                      }
                    />
                  </td>
                  <td
                    className={`${TD_NUM} border-e border-border text-slate-700 dark:text-slate-300`}
                  >
                    {r.openingDebit ? fmt(r.openingDebit) : "—"}
                  </td>
                  <td
                    className={`${TD_NUM} border-e border-border text-slate-700 dark:text-slate-300`}
                  >
                    {r.openingCredit ? fmt(r.openingCredit) : "—"}
                  </td>
                  <td className={`${TD_NUM} border-e border-border`}>
                    {r.periodDebit ? fmt(r.periodDebit) : "—"}
                  </td>
                  <td className={`${TD_NUM} border-e border-border`}>
                    {r.periodCredit ? fmt(r.periodCredit) : "—"}
                  </td>
                  <td
                    className={`${TD_NUM} border-e border-border font-semibold`}
                  >
                    {r.closingDebit ? fmt(r.closingDebit) : "—"}
                  </td>
                  <td className={`${TD_NUM} font-semibold`}>
                    {r.closingCredit ? fmt(r.closingCredit) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-primary/20 bg-primary/5 font-bold">
                <td
                  className="px-4 py-3.5 border-e border-border"
                  colSpan={2}
                >
                  {t("reportsPage.table.total")}
                </td>
                <td className={`${TD_NUM} border-e border-border`}>
                  {fmt(data.totalOpeningDebit)}
                </td>
                <td className={`${TD_NUM} border-e border-border`}>
                  {fmt(data.totalOpeningCredit)}
                </td>
                <td className={`${TD_NUM} border-e border-border`}>
                  {fmt(data.totalPeriodDebit)}
                </td>
                <td className={`${TD_NUM} border-e border-border`}>
                  {fmt(data.totalPeriodCredit)}
                </td>
                <td className={`${TD_NUM} border-e border-border`}>
                  {fmt(data.totalClosingDebit)}
                </td>
                <td className={TD_NUM}>{fmt(data.totalClosingCredit)}</td>
              </tr>
            </tfoot>
          </table>
          {/* Balanced indicator footer */}
          <div className="flex items-center justify-between border-t border-border bg-card px-5 py-3">
            <CurrencyRateNote info={data.currencyInfo} fmt={fmt} />
            <span
              className={`rounded-full px-4 py-1 text-xs font-bold ${
                data.balanced
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                  : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400"
              }`}
            >
              {data.balanced
                ? t("reportsPage.trialBalance.balanced")
                : t("reportsPage.trialBalance.unbalanced")}
            </span>
          </div>
        </ReportTableCard>
      )}
    </>
  );
}

// ─── General Ledger / Account Statement ──────────────────────────────────────

function GeneralLedgerDetail({
  company,
  cc,
  fmt,
  lang,
  leafAccounts,
  dimensionFilters,
  isAccountStatement = false,
  initialAccountId,
  initialFrom,
  initialTo,
}: {
  company?: Company;
  cc: CurrencyControls;
  fmt: Fmt;
  lang: string;
  leafAccounts: Account[];
  dimensionFilters: DimensionFilterQuery;
  isAccountStatement?: boolean;
  initialAccountId?: string;
  initialFrom?: string;
  initialTo?: string;
}) {
  const { t } = useTranslation();
  const [accountId, setAccountId] = useState(initialAccountId ?? "");
  const [from, setFrom] = useState(initialFrom ?? startOfYear());
  const [to, setTo] = useState(initialTo ?? today());
  const [jeModalId, setJeModalId] = useState<string | null>(null);

  useEffect(() => {
    const nextAccountId =
      initialAccountId &&
      leafAccounts.some((account) => account.id === initialAccountId)
        ? initialAccountId
        : "";
    setAccountId(nextAccountId);
  }, [initialAccountId, leafAccounts]);

  useEffect(() => {
    if (initialFrom) setFrom(initialFrom);
  }, [initialFrom]);

  useEffect(() => {
    if (initialTo) setTo(initialTo);
  }, [initialTo]);

  const glParams = {
    accountId,
    from: from || undefined,
    to: to || undefined,
    reportCurrency: reportCurrencyParam(cc),
    ...dimensionFilters,
  };

  const { data, isLoading } = useGetGeneralLedger(glParams, {
    query: {
      enabled: !!accountId,
      queryKey: getGetGeneralLedgerQueryKey(glParams),
    },
  });

  const exportExcel = () => {
    if (!accountId) return;
    const qs = new URLSearchParams();
    qs.set("accountId", accountId);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const rc = reportCurrencyParam(cc);
    if (rc) qs.set("reportCurrency", rc);
    if (dimensionFilters?.costCenterId)
      qs.set("costCenterId", dimensionFilters.costCenterId);
    if (dimensionFilters?.projectId)
      qs.set("projectId", dimensionFilters.projectId);
    if (dimensionFilters?.branchId)
      qs.set("branchId", dimensionFilters.branchId);
    window.open(
      `/api/reports/general-ledger/export?${qs.toString()}`,
      "_blank",
    );
  };

  const titleKey = isAccountStatement
    ? "reportsPage.detail.accountStatementTitle"
    : "reportsPage.tabs.generalLedger";

  const currency = reportCurrencyParam(cc) || cc.baseCurrency;
  const selectedAccount = leafAccounts.find((a) => a.id === accountId);
  const dateLabel = accountId
    ? `${
        selectedAccount
          ? `${selectedAccount.code} · ${displayName(selectedAccount, lang)}  ·  `
          : ""
      }${t("reportsPage.filters.from")}: ${from || "—"}  ·  ${t("reportsPage.filters.to")}: ${to || "—"}`
    : "—";

  return (
    <>
      <ReportHeader
        company={company}
        title={t(titleKey)}
        dateLabel={dateLabel}
        currency={currency}
        baseCurrency={cc.baseCurrency}
        rateLabel={
          data?.currencyInfo &&
          data.currencyInfo.rate !== 1 &&
          data.currencyInfo.reportCurrency !== data.currencyInfo.baseCurrency
            ? t("reportsPage.currency.header", {
                currency: data.currencyInfo.reportCurrency,
                rate: fmt(data.currencyInfo.rate),
                base: data.currencyInfo.baseCurrency,
              })
            : undefined
        }
        actions={
          data && accountId ? (
            <ReportExcelButton onClick={exportExcel} />
          ) : undefined
        }
      />

      <ReportFilterRow>
        <ReportFilterField label={t("reportsPage.filters.account")}>
          <AccountCombobox
            value={accountId}
            onValueChange={setAccountId}
            options={leafAccounts.map((a) => ({
              value: a.id,
              label: `${a.code} · ${displayName(a, lang)}`,
            }))}
            placeholder={t("reportsPage.filters.selectAccount")}
            searchPlaceholder={t("reportsPage.filters.searchAccount")}
          />
        </ReportFilterField>
        <ReportDateInput
          label={t("reportsPage.filters.from")}
          value={from}
          onChange={setFrom}
        />
        <ReportDateInput
          label={t("reportsPage.filters.to")}
          value={to}
          onChange={setTo}
        />
        <CurrencySelect cc={cc} />
      </ReportFilterRow>

      {selectedAccount && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm">
          <span className="text-muted-foreground me-2">
            {t("reportsPage.drill.selectedAccount")}:
          </span>
          <span className="font-semibold">
            {selectedAccount.code} · {displayName(selectedAccount, lang)}
          </span>
        </div>
      )}

      {!accountId ? (
        <ReportEmpty message={t("reportsPage.filters.selectAccount")} />
      ) : isLoading ? (
        <ReportLoading />
      ) : !data ? (
        <ReportEmpty />
      ) : (
        <ReportTableCard>
          {/* Account + opening balance subheader */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-slate-50 dark:bg-slate-800 px-5 py-3.5">
            <div>
              <span className="font-mono text-xs text-muted-foreground me-2">
                {data.accountCode}
              </span>
              <span className="font-bold">{data.accountName}</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {t("reportsPage.ledger.openingBalance")}:{" "}
              <span className="font-mono font-semibold tabular-nums text-foreground">
                {fmt(data.openingBalance)}
              </span>
            </span>
          </div>

          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground border-b border-border">
              <tr>
                <th className={`${TH_BASE} text-start`}>
                  {t("reportsPage.table.date")}
                </th>
                <th className={`${TH_BASE} text-start`}>
                  {t("reportsPage.table.entryNo")}
                </th>
                <th className={`${TH_BASE} text-start`}>
                  {t("reportsPage.table.description")}
                </th>
                <th className={TH_NUM}>{t("reportsPage.table.debit")}</th>
                <th className={TH_NUM}>{t("reportsPage.table.credit")}</th>
                <th className={TH_NUM}>{t("reportsPage.table.balance")}</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-8 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    {t("reportsPage.noData")}
                  </td>
                </tr>
              ) : (
                data.entries.map((e: GeneralLedgerEntry, i: number) => (
                  <tr
                    key={i}
                    className={`border-t border-border transition-colors hover:bg-primary/5 ${i % 2 === 1 ? "bg-muted/20" : ""}`}
                  >
                    <td className="px-4 py-2.5 tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setJeModalId(e.entryId)}
                        className="hover:underline underline-offset-2"
                        title={t("reportsPage.drill.openJournalEntry")}
                        aria-label={`${t("reportsPage.drill.openJournalEntry")} ${e.entryNo}`}
                      >
                        {e.date}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-primary font-semibold text-xs whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setJeModalId(e.entryId)}
                        className="hover:underline underline-offset-2"
                        title={t("reportsPage.drill.openJournalEntry")}
                        aria-label={`${t("reportsPage.drill.openJournalEntry")} ${e.entryNo}`}
                      >
                        #{e.entryNo}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[240px] truncate">
                      {e.description}
                    </td>
                    <td className="px-4 py-2.5 text-end tabular-nums font-mono text-rose-600 dark:text-rose-400">
                      {e.debit ? fmt(e.debit) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-end tabular-nums font-mono text-emerald-600 dark:text-emerald-400">
                      {e.credit ? fmt(e.credit) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-end tabular-nums font-mono font-bold">
                      {fmt(e.balance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-primary/20 bg-primary/5 font-bold">
                <td className="px-4 py-3.5" colSpan={5}>
                  {t("reportsPage.ledger.closingBalance")}
                </td>
                <td className="px-4 py-3.5 text-end tabular-nums font-mono">
                  {fmt(data.closingBalance)}
                </td>
              </tr>
            </tfoot>
          </table>
          <div className="border-t border-border bg-card px-5 py-2.5 no-print">
            <CurrencyRateNote info={data.currencyInfo} fmt={fmt} />
          </div>
        </ReportTableCard>
      )}
      {jeModalId && (
        <JournalEntryModal
          entryId={jeModalId}
          onClose={() => setJeModalId(null)}
          fmt={fmt}
          lang={lang}
        />
      )}
    </>
  );
}

// ─── Income Statement ─────────────────────────────────────────────────────────

function IncomeStatementDetail({
  company,
  cc,
  fmt,
  lang,
  dimensionFilters,
  onDrillToGeneralLedger,
}: {
  company?: Company;
  cc: CurrencyControls;
  fmt: Fmt;
  lang: string;
  dimensionFilters: DimensionFilterQuery;
  onDrillToGeneralLedger?: DrillToGeneralLedger;
}) {
  const { t } = useTranslation();
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());

  const { data, isLoading } = useGetIncomeStatement({
    from: from || undefined,
    to: to || undefined,
    reportCurrency: reportCurrencyParam(cc),
    ...dimensionFilters,
  });

  const exportExcel = () => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const rc = reportCurrencyParam(cc);
    if (rc) qs.set("reportCurrency", rc);
    if (dimensionFilters?.costCenterId)
      qs.set("costCenterId", dimensionFilters.costCenterId);
    if (dimensionFilters?.projectId)
      qs.set("projectId", dimensionFilters.projectId);
    if (dimensionFilters?.branchId)
      qs.set("branchId", dimensionFilters.branchId);
    window.open(
      `/api/reports/income-statement/export?${qs.toString()}`,
      "_blank",
    );
  };

  const exportPdf = () => {
    if (!data) return;
    const html = buildIncomeStatementPdfHtml(
      data,
      fmt,
      lang,
      from,
      to,
      {
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
      },
      company,
    );
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  const currency = reportCurrencyParam(cc) || cc.baseCurrency;
  const profit = (data?.netProfit ?? 0) >= 0;
  const dateLabel = `${t("reportsPage.filters.from")}: ${from || "—"}  ·  ${t("reportsPage.filters.to")}: ${to || "—"}`;

  return (
    <>
      <ReportHeader
        company={company}
        title={t("reportsPage.tabs.incomeStatement")}
        dateLabel={dateLabel}
        currency={currency}
        baseCurrency={cc.baseCurrency}
        rateLabel={
          data?.currencyInfo &&
          data.currencyInfo.rate !== 1 &&
          data.currencyInfo.reportCurrency !== data.currencyInfo.baseCurrency
            ? t("reportsPage.currency.header", {
                currency: data.currencyInfo.reportCurrency,
                rate: fmt(data.currencyInfo.rate),
                base: data.currencyInfo.baseCurrency,
              })
            : undefined
        }
        actions={
          data ? (
            <div className="flex gap-2">
              <ReportExcelButton onClick={exportExcel} />
              <ReportPdfButton onClick={exportPdf} />
            </div>
          ) : undefined
        }
      />

      <ReportFilterRow>
        <ReportDateInput
          label={t("reportsPage.filters.from")}
          value={from}
          onChange={setFrom}
        />
        <ReportDateInput
          label={t("reportsPage.filters.to")}
          value={to}
          onChange={setTo}
        />
        <CurrencySelect cc={cc} />
      </ReportFilterRow>

      {isLoading ? (
        <ReportLoading />
      ) : !data ? (
        <ReportEmpty />
      ) : (
        <div className="flex flex-col gap-4">
          {/* Revenue */}
          <ReportSectionCard
            title={t("reportsPage.incomeStatement.revenue")}
            total={data.totalRevenue}
            totalLabel={t("reportsPage.incomeStatement.totalRevenue")}
            fmt={fmt}
            accentClass="bg-emerald-50 dark:bg-emerald-900/20"
          >
            <thead className="bg-muted/30 text-muted-foreground border-b border-border">
              <tr>
                <th className={`${TH_BASE} text-start`}>
                  {t("reportsPage.table.code")}
                </th>
                <th className={`${TH_BASE} text-start`}>
                  {t("reportsPage.table.account")}
                </th>
                <th className={TH_NUM}>{t("reportsPage.table.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {data.revenue.map((l: PnlLine, i: number) => (
                <tr
                  key={l.accountId ?? i}
                  className={`border-t border-border/50 hover:bg-muted/20 transition-colors ${i % 2 === 1 ? "bg-muted/10" : ""}`}
                >
                  <td className={TD_CODE}>{l.code}</td>
                  <td className={TD_NAME}>
                    <AccountDrillLink
                      accountId={l.accountId}
                      label={displayName(l, lang)}
                      onDrill={(accountId) =>
                        onDrillToGeneralLedger?.(accountId, { from, to })
                      }
                    />
                  </td>
                  <td
                    className={`${TD_NUM} font-semibold text-emerald-700 dark:text-emerald-400`}
                  >
                    {fmt(l.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </ReportSectionCard>

          {/* Expenses */}
          <ReportSectionCard
            title={t("reportsPage.incomeStatement.expenses")}
            total={data.totalExpenses}
            totalLabel={t("reportsPage.incomeStatement.totalExpenses")}
            fmt={fmt}
            accentClass="bg-rose-50 dark:bg-rose-900/20"
          >
            <thead className="bg-muted/30 text-muted-foreground border-b border-border">
              <tr>
                <th className={`${TH_BASE} text-start`}>
                  {t("reportsPage.table.code")}
                </th>
                <th className={`${TH_BASE} text-start`}>
                  {t("reportsPage.table.account")}
                </th>
                <th className={TH_NUM}>{t("reportsPage.table.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {data.expenses.map((l: PnlLine, i: number) => (
                <tr
                  key={l.accountId ?? i}
                  className={`border-t border-border/50 hover:bg-muted/20 transition-colors ${i % 2 === 1 ? "bg-muted/10" : ""}`}
                >
                  <td className={TD_CODE}>{l.code}</td>
                  <td className={TD_NAME}>
                    <AccountDrillLink
                      accountId={l.accountId}
                      label={displayName(l, lang)}
                      onDrill={(accountId) =>
                        onDrillToGeneralLedger?.(accountId, { from, to })
                      }
                    />
                  </td>
                  <td
                    className={`${TD_NUM} font-semibold text-rose-700 dark:text-rose-400`}
                  >
                    {fmt(l.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </ReportSectionCard>

          {/* Net result */}
          <ReportNetCard
            label={
              profit
                ? t("reportsPage.incomeStatement.netProfit")
                : t("reportsPage.incomeStatement.netLoss")
            }
            value={data.netProfit}
            fmt={fmt}
            positive={profit}
          />
        </div>
      )}
    </>
  );
}

// ─── Balance Sheet ────────────────────────────────────────────────────────────

function BalanceSheetDetail({
  company,
  cc,
  fmt,
  lang,
  dimensionFilters,
  onDrillToGeneralLedger,
}: {
  company?: Company;
  cc: CurrencyControls;
  fmt: Fmt;
  lang: string;
  dimensionFilters: DimensionFilterQuery;
  onDrillToGeneralLedger?: DrillToGeneralLedger;
}) {
  const { t } = useTranslation();
  const [asOf, setAsOf] = useState(today());

  const { data, isLoading } = useGetBalanceSheet({
    asOf: asOf || undefined,
    reportCurrency: reportCurrencyParam(cc),
    ...dimensionFilters,
  });

  const exportExcel = () => {
    const qs = new URLSearchParams();
    if (asOf) qs.set("asOf", asOf);
    const rc = reportCurrencyParam(cc);
    if (rc) qs.set("reportCurrency", rc);
    if (dimensionFilters?.costCenterId)
      qs.set("costCenterId", dimensionFilters.costCenterId);
    if (dimensionFilters?.projectId)
      qs.set("projectId", dimensionFilters.projectId);
    if (dimensionFilters?.branchId)
      qs.set("branchId", dimensionFilters.branchId);
    window.open(
      `/api/reports/balance-sheet/export?${qs.toString()}`,
      "_blank",
    );
  };

  const exportPdf = () => {
    if (!data) return;
    const html = buildBalanceSheetPdfHtml(
      data,
      fmt,
      lang,
      asOf,
      {
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
        totalLiabilitiesAndEquity: t(
          "reportsPage.balanceSheet.totalLiabilitiesAndEquity",
        ),
      },
      company,
    );
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  const currency = reportCurrencyParam(cc) || cc.baseCurrency;
  const dateLabel = `${t("reportsPage.filters.asOf")}: ${asOf || "—"}`;

  return (
    <>
      <ReportHeader
        company={company}
        title={t("reportsPage.tabs.balanceSheet")}
        dateLabel={dateLabel}
        currency={currency}
        baseCurrency={cc.baseCurrency}
        rateLabel={
          data?.currencyInfo &&
          data.currencyInfo.rate !== 1 &&
          data.currencyInfo.reportCurrency !== data.currencyInfo.baseCurrency
            ? t("reportsPage.currency.header", {
                currency: data.currencyInfo.reportCurrency,
                rate: fmt(data.currencyInfo.rate),
                base: data.currencyInfo.baseCurrency,
              })
            : undefined
        }
        actions={
          data ? (
            <div className="flex gap-2">
              <ReportExcelButton onClick={exportExcel} />
              <ReportPdfButton onClick={exportPdf} />
            </div>
          ) : undefined
        }
      />

      <ReportFilterRow>
        <ReportFilterField label={t("reportsPage.filters.asOf")}>
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="h-11 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </ReportFilterField>
        <CurrencySelect cc={cc} />
      </ReportFilterRow>

      {isLoading ? (
        <ReportLoading />
      ) : !data ? (
        <ReportEmpty />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Assets column */}
          <ReportSectionCard
            title={t("reportsPage.balanceSheet.assets")}
            total={data.totalAssets}
            totalLabel={t("reportsPage.balanceSheet.totalAssets")}
            fmt={fmt}
            accentClass="bg-blue-50 dark:bg-blue-900/20"
          >
            <thead className="bg-muted/30 text-muted-foreground border-b border-border">
              <tr>
                <th className={`${TH_BASE} text-start`}>
                  {t("reportsPage.table.code")}
                </th>
                <th className={`${TH_BASE} text-start`}>
                  {t("reportsPage.table.account")}
                </th>
                <th className={TH_NUM}>{t("reportsPage.table.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {data.assets.map((l: PnlLine, i: number) => (
                <tr
                  key={l.accountId ?? i}
                  className={`border-t border-border/50 hover:bg-muted/20 transition-colors ${i % 2 === 1 ? "bg-muted/10" : ""}`}
                >
                  <td className={TD_CODE}>{l.code}</td>
                  <td className={TD_NAME}>
                    <AccountDrillLink
                      accountId={l.accountId}
                      label={displayName(l, lang)}
                      onDrill={(accountId) =>
                        onDrillToGeneralLedger?.(accountId, { to: asOf })
                      }
                    />
                  </td>
                  <td className={`${TD_NUM} font-semibold`}>
                    {fmt(l.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </ReportSectionCard>

          {/* Liabilities + Equity column */}
          <div className="flex flex-col gap-4">
            <ReportSectionCard
              title={t("reportsPage.balanceSheet.liabilities")}
              total={data.totalLiabilities}
              totalLabel={t("reportsPage.balanceSheet.totalLiabilities")}
              fmt={fmt}
              accentClass="bg-orange-50 dark:bg-orange-900/20"
            >
              <thead className="bg-muted/30 text-muted-foreground border-b border-border">
                <tr>
                  <th className={`${TH_BASE} text-start`}>
                    {t("reportsPage.table.code")}
                  </th>
                  <th className={`${TH_BASE} text-start`}>
                    {t("reportsPage.table.account")}
                  </th>
                  <th className={TH_NUM}>{t("reportsPage.table.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {data.liabilities.map((l: PnlLine, i: number) => (
                  <tr
                    key={l.accountId ?? i}
                    className={`border-t border-border/50 hover:bg-muted/20 transition-colors ${i % 2 === 1 ? "bg-muted/10" : ""}`}
                  >
                    <td className={TD_CODE}>{l.code}</td>
                    <td className={TD_NAME}>
                      <AccountDrillLink
                        accountId={l.accountId}
                        label={displayName(l, lang)}
                        onDrill={(accountId) =>
                          onDrillToGeneralLedger?.(accountId, { to: asOf })
                        }
                      />
                    </td>
                    <td className={`${TD_NUM} font-semibold`}>
                      {fmt(l.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </ReportSectionCard>

            <ReportSectionCard
              title={t("reportsPage.balanceSheet.equity")}
              total={data.totalEquity}
              totalLabel={t("reportsPage.balanceSheet.totalEquity")}
              fmt={fmt}
              accentClass="bg-violet-50 dark:bg-violet-900/20"
            >
              <thead className="bg-muted/30 text-muted-foreground border-b border-border">
                <tr>
                  <th className={`${TH_BASE} text-start`}>
                    {t("reportsPage.table.code")}
                  </th>
                  <th className={`${TH_BASE} text-start`}>
                    {t("reportsPage.table.account")}
                  </th>
                  <th className={TH_NUM}>{t("reportsPage.table.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {data.equity.map((l: PnlLine, i: number) => (
                  <tr
                    key={l.accountId ?? i}
                    className={`border-t border-border/50 hover:bg-muted/20 transition-colors ${i % 2 === 1 ? "bg-muted/10" : ""}`}
                  >
                    <td className={TD_CODE}>{l.code}</td>
                    <td className={TD_NAME}>
                      <AccountDrillLink
                        accountId={l.accountId}
                        label={displayName(l, lang)}
                        onDrill={(accountId) =>
                          onDrillToGeneralLedger?.(accountId, { to: asOf })
                        }
                      />
                    </td>
                    <td className={`${TD_NUM} font-semibold`}>
                      {fmt(l.amount)}
                    </td>
                  </tr>
                ))}
                {/* Net result row */}
                <tr className="border-t border-border/50 bg-muted/10 italic">
                  <td className={TD_CODE} />
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {t("reportsPage.balanceSheet.netResult")}
                  </td>
                  <td className={`${TD_NUM} font-semibold`}>
                    {fmt(data.netResult)}
                  </td>
                </tr>
              </tbody>
            </ReportSectionCard>

            {/* Total liabilities & equity check */}
            <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-4 font-bold shadow-sm">
              <span className="text-sm">
                {t("reportsPage.balanceSheet.totalLiabilitiesAndEquity")}
              </span>
              <span className="font-mono tabular-nums">
                {fmt(data.totalLiabilitiesAndEquity)}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Cash Flow ────────────────────────────────────────────────────────────────

function CashFlowDetail({
  company,
  cc,
  fmt,
  lang,
  onDrillToGeneralLedger,
}: {
  company?: Company;
  cc: CurrencyControls;
  fmt: Fmt;
  lang: string;
  onDrillToGeneralLedger?: DrillToGeneralLedger;
}) {
  const { t } = useTranslation();
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());

  const { data, isLoading } = useGetCashFlow({
    from: from || undefined,
    to: to || undefined,
  });

  const exportExcel = () => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    window.open(`/api/reports/cash-flow/export?${qs.toString()}`, "_blank");
  };

  const currency = reportCurrencyParam(cc) || cc.baseCurrency;
  const dateLabel = `${t("reportsPage.filters.from")}: ${from || "—"}  ·  ${t("reportsPage.filters.to")}: ${to || "—"}`;

  const flowSection = (
    title: string,
    lines: CashFlowLine[],
    total: number,
    accentClass: string,
  ) => (
    <ReportSectionCard
      title={title}
      total={total}
      totalLabel={title}
      fmt={fmt}
      accentClass={accentClass}
    >
      <thead className="bg-muted/30 text-muted-foreground border-b border-border">
        <tr>
          <th className={`${TH_BASE} text-start`}>
            {t("reportsPage.table.code")}
          </th>
          <th className={`${TH_BASE} text-start`}>
            {t("reportsPage.table.account")}
          </th>
          <th className={TH_NUM}>{t("reportsPage.table.amount")}</th>
        </tr>
      </thead>
      <tbody>
        {lines.length === 0 ? (
          <tr>
            <td
              className="px-4 py-6 text-center text-muted-foreground"
              colSpan={3}
            >
              {t("reportsPage.noData")}
            </td>
          </tr>
        ) : (
          lines.map((l, i) => (
            <tr
              key={l.accountId ?? i}
              className={`border-t border-border/50 hover:bg-muted/20 transition-colors ${i % 2 === 1 ? "bg-muted/10" : ""}`}
            >
              <td className={TD_CODE}>{l.code}</td>
              <td className={TD_NAME}>
                <AccountDrillLink
                  accountId={l.accountId}
                  label={displayName(l, lang)}
                  onDrill={(accountId) =>
                    onDrillToGeneralLedger?.(accountId, { from, to })
                  }
                />
              </td>
              <td className={`${TD_NUM} font-semibold`}>{fmt(l.amount)}</td>
            </tr>
          ))
        )}
      </tbody>
    </ReportSectionCard>
  );

  return (
    <>
      <ReportHeader
        company={company}
        title={t("reportsPage.tabs.cashFlow")}
        dateLabel={dateLabel}
        currency={currency}
        baseCurrency={cc.baseCurrency}
        actions={data ? <ReportExcelButton onClick={exportExcel} /> : undefined}
      />

      <ReportFilterRow>
        <ReportDateInput
          label={t("reportsPage.filters.from")}
          value={from}
          onChange={setFrom}
        />
        <ReportDateInput
          label={t("reportsPage.filters.to")}
          value={to}
          onChange={setTo}
        />
      </ReportFilterRow>

      {isLoading ? (
        <ReportLoading />
      ) : !data ? (
        <ReportEmpty />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <ReportTotalCard
              label={t("reportsPage.cashFlow.openingCash")}
              value={data.openingCash}
              fmt={fmt}
            />
            <ReportTotalCard
              label={t("reportsPage.cashFlow.closingCash")}
              value={data.closingCash}
              fmt={fmt}
            />
          </div>
          {flowSection(
            t("reportsPage.cashFlow.inflows"),
            data.inflows,
            data.totalInflow,
            "bg-emerald-50 dark:bg-emerald-900/20",
          )}
          {flowSection(
            t("reportsPage.cashFlow.outflows"),
            data.outflows,
            data.totalOutflow,
            "bg-rose-50 dark:bg-rose-900/20",
          )}
          <ReportNetCard
            label={t("reportsPage.cashFlow.netCashFlow")}
            value={data.netCashFlow}
            fmt={fmt}
            positive={data.netCashFlow >= 0}
          />
        </div>
      )}
    </>
  );
}

function JournalEntryModal({
  entryId,
  onClose,
  fmt,
  lang,
}: {
  entryId: string;
  onClose: () => void;
  fmt: Fmt;
  lang: string;
}) {
  const { t } = useTranslation();
  const { data, isLoading } = useGetJournalEntry(entryId);
  const { data: accounts = [] } = useListAccounts();
  const accountMap = useMemo(
    () => new Map((accounts as Account[]).map((a) => [a.id, a])),
    [accounts],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-lg">
                {t("reportsPage.je.title")}
                {data ? ` #${data.entryNo}` : ""}
              </h2>
              {data?.status && (
                <span className="text-xs rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground">
                  {data.status}
                </span>
              )}
            </div>
            {data && (
              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  {t("reportsPage.table.date")}: {data.date}
                </span>
                {data.reference && (
                  <span>
                    {t("reportsPage.table.reference")}: {data.reference}
                  </span>
                )}
                {data.entryType && (
                  <span>
                    {t("reportsPage.drill.sourceModule")}: {data.entryType}
                  </span>
                )}
                {data.postedAt && (
                  <span>
                    {t("reportsPage.drill.postedAt")}: {data.postedAt}
                  </span>
                )}
                <span>
                  {t("reportsPage.drill.createdAt")}: {data.createdAt}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-primary hover:underline"
            >
              {t("reportsPage.drill.backToReport")}
            </button>
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
            <ReportLoading />
          ) : !data ? (
            <ReportEmpty />
          ) : (
            <>
              <div className="overflow-x-auto [direction:ltr]">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="text-start px-4 py-3 font-semibold">
                        {t("reportsPage.table.account")}
                      </th>
                      <th className="text-start px-4 py-3 font-semibold">
                        {t("reportsPage.table.description")}
                      </th>
                      <th className="text-start px-4 py-3 font-semibold">
                        {t("reportsPage.drill.dimensions")}
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
                      const dimensions = [
                        line.costCenterId
                          ? `${t("dimensions.costCenter")}: ${line.costCenterId}`
                          : null,
                        line.projectId
                          ? `${t("dimensions.project")}: ${line.projectId}`
                          : null,
                        line.branchId
                          ? `${t("dimensions.branch")}: ${line.branchId}`
                          : null,
                      ].filter(Boolean);
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
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">
                            {dimensions.length > 0
                              ? dimensions.join(" · ")
                              : "—"}
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
                      <td colSpan={3} className="px-4 py-3">
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
              </div>
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

// ─── Main routing component ───────────────────────────────────────────────────

export function ReportsFinancialDetail() {
  const { i18n } = useTranslation();
  const [location, setLocation] = useLocation();
  const lang = i18n.language;

  const reportKey = getReportKey(location.split("?")[0] || "");
  const query = useMemo(() => parseQuery(location), [location]);

  const [dimensionFilters, setDimensionFilters] = useState<DimensionFilterValues>({
    costCenterId: query.get("costCenterId") ?? "",
    projectId: query.get("projectId") ?? "",
    branchId: query.get("branchId") ?? "",
  });

  const dimensionQuery: DimensionFilterQuery = useMemo(
    () => ({
      costCenterId: dimensionFilters.costCenterId || undefined,
      projectId: dimensionFilters.projectId || undefined,
      branchId: dimensionFilters.branchId || undefined,
    }),
    [dimensionFilters],
  );

  const { data: company } = useGetCompany();
  const baseCurrency = (company?.baseCurrency ?? "EGP").toUpperCase();
  const { data: currencies = [] } = useListCurrencies();
  const [reportCurrency, setReportCurrency] = useState(
    (query.get("currency") || query.get("reportCurrency") || "").toUpperCase(),
  );
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

  const queryAccountId = query.get("accountId") || "";
  const initialAccountId = leafAccounts.some((a) => a.id === queryAccountId)
    ? queryAccountId
    : "";
  const initialFrom = query.get("from") || undefined;
  const initialTo = query.get("to") || undefined;

  useEffect(() => {
    const nextCurrency =
      (query.get("currency") || query.get("reportCurrency") || "").toUpperCase();
    if (nextCurrency) setReportCurrency(nextCurrency);

    setDimensionFilters({
      costCenterId: query.get("costCenterId") ?? "",
      projectId: query.get("projectId") ?? "",
      branchId: query.get("branchId") ?? "",
    });
  }, [query]);

  const fmt: Fmt = (n: number) =>
    new Intl.NumberFormat(lang, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const commonProps = {
    company,
    cc,
    fmt,
    lang,
    dimensionFilters: dimensionQuery,
  };

  const drillToGeneralLedger: DrillToGeneralLedger = (accountId, params) => {
    const qs = new URLSearchParams();
    qs.set("accountId", accountId);
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    const rc = reportCurrencyParam(cc);
    if (rc) qs.set("currency", rc);
    if (dimensionQuery.costCenterId) qs.set("costCenterId", dimensionQuery.costCenterId);
    if (dimensionQuery.projectId) qs.set("projectId", dimensionQuery.projectId);
    if (dimensionQuery.branchId) qs.set("branchId", dimensionQuery.branchId);
    setLocation(`/reports/financial/general-ledger?${qs.toString()}`);
  };

  return (
    <ReportShell>
      {/* Dimension filters — shared across all reports; also hosts back button */}
      <DimensionFilters
        value={dimensionFilters}
        onChange={setDimensionFilters}
        onBack={() => setLocation("/reports/center")}
      />

      {reportKey === "trial-balance" && (
        <TrialBalanceDetail
          {...commonProps}
          onDrillToGeneralLedger={drillToGeneralLedger}
        />
      )}
      {reportKey === "general-ledger" && (
        <GeneralLedgerDetail
          {...commonProps}
          leafAccounts={leafAccounts}
          initialAccountId={initialAccountId}
          initialFrom={initialFrom}
          initialTo={initialTo}
        />
      )}
      {reportKey === "account-statement" && (
        <GeneralLedgerDetail
          {...commonProps}
          leafAccounts={leafAccounts}
          isAccountStatement
          initialAccountId={initialAccountId}
          initialFrom={initialFrom}
          initialTo={initialTo}
        />
      )}
      {reportKey === "income-statement" && (
        <IncomeStatementDetail
          {...commonProps}
          onDrillToGeneralLedger={drillToGeneralLedger}
        />
      )}
      {reportKey === "balance-sheet" && (
        <BalanceSheetDetail
          {...commonProps}
          onDrillToGeneralLedger={drillToGeneralLedger}
        />
      )}
      {reportKey === "cash-flow" && (
        <CashFlowDetail
          company={company}
          cc={cc}
          fmt={fmt}
          lang={lang}
          onDrillToGeneralLedger={drillToGeneralLedger}
        />
      )}
    </ReportShell>
  );
}
