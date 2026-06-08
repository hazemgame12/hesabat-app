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
  getGetGeneralLedgerQueryKey,
  getGetPartyStatementQueryKey,
  useListAccounts,
  useListCustomers,
  useListSuppliers,
  type Account,
  type PnlLine,
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

type TabKey =
  | "trialBalance"
  | "incomeStatement"
  | "balanceSheet"
  | "generalLedger"
  | "partyStatement"
  | "aging"
  | "outstanding";

function displayName(
  e: { nameAr: string; nameEn?: string | null },
  lang: string,
): string {
  return lang.startsWith("en") && e.nameEn ? e.nameEn : e.nameAr;
}

export function Reports() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
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

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as TabKey)}
        className="mt-6"
      >
        <TabsList className="flex flex-wrap h-auto justify-start gap-1">
          <TabsTrigger value="trialBalance">
            {t("reportsPage.tabs.trialBalance")}
          </TabsTrigger>
          <TabsTrigger value="incomeStatement">
            {t("reportsPage.tabs.incomeStatement")}
          </TabsTrigger>
          <TabsTrigger value="balanceSheet">
            {t("reportsPage.tabs.balanceSheet")}
          </TabsTrigger>
          <TabsTrigger value="generalLedger">
            {t("reportsPage.tabs.generalLedger")}
          </TabsTrigger>
          <TabsTrigger value="partyStatement">
            {t("reportsPage.tabs.partyStatement")}
          </TabsTrigger>
          <TabsTrigger value="aging">{t("reportsPage.tabs.aging")}</TabsTrigger>
          <TabsTrigger value="outstanding">
            {t("reportsPage.tabs.outstanding")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trialBalance" className="mt-6">
          <TrialBalanceTab fmt={fmt} lang={lang} />
        </TabsContent>
        <TabsContent value="incomeStatement" className="mt-6">
          <IncomeStatementTab fmt={fmt} lang={lang} />
        </TabsContent>
        <TabsContent value="balanceSheet" className="mt-6">
          <BalanceSheetTab fmt={fmt} lang={lang} />
        </TabsContent>
        <TabsContent value="generalLedger" className="mt-6">
          <GeneralLedgerTab
            fmt={fmt}
            lang={lang}
            leafAccounts={leafAccounts}
          />
        </TabsContent>
        <TabsContent value="partyStatement" className="mt-6">
          <PartyStatementTab fmt={fmt} lang={lang} />
        </TabsContent>
        <TabsContent value="aging" className="mt-6">
          <AgingTab fmt={fmt} />
        </TabsContent>
        <TabsContent value="outstanding" className="mt-6">
          <OutstandingTab fmt={fmt} />
        </TabsContent>
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

// ---- Trial balance ----
function TrialBalanceTab({ fmt, lang }: { fmt: Fmt; lang: string }) {
  const { t } = useTranslation();
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());
  const { data, isLoading } = useGetTrialBalance({
    from: from || undefined,
    to: to || undefined,
  });

  return (
    <div>
      <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
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
                  {t("reportsPage.table.code")}
                </th>
                <th className="text-start px-4 py-3 font-semibold">
                  {t("reportsPage.table.account")}
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
              {data.rows.map((r) => (
                <tr key={r.accountId} className="border-t border-border">
                  <td className="px-4 py-2.5 font-mono text-xs">{r.code}</td>
                  <td className="px-4 py-2.5">{displayName(r, lang)}</td>
                  <td className="px-4 py-2.5 text-end tabular-nums">
                    {r.debit ? fmt(r.debit) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-end tabular-nums">
                    {r.credit ? fmt(r.credit) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/30 font-bold">
                <td className="px-4 py-3" colSpan={2}>
                  {t("reportsPage.table.total")}
                </td>
                <td className="px-4 py-3 text-end tabular-nums">
                  {fmt(data.totalDebit)}
                </td>
                <td className="px-4 py-3 text-end tabular-nums">
                  {fmt(data.totalCredit)}
                </td>
              </tr>
            </tfoot>
          </table>
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

function IncomeStatementTab({ fmt, lang }: { fmt: Fmt; lang: string }) {
  const { t } = useTranslation();
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());
  const { data, isLoading } = useGetIncomeStatement({
    from: from || undefined,
    to: to || undefined,
  });

  const profit = (data?.netProfit ?? 0) >= 0;

  return (
    <div>
      <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
      {isLoading ? (
        <Loading />
      ) : !data ? (
        <Empty />
      ) : (
        <div className="grid gap-4">
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
function BalanceSheetTab({ fmt, lang }: { fmt: Fmt; lang: string }) {
  const { t } = useTranslation();
  const [asOf, setAsOf] = useState(today());
  const { data, isLoading } = useGetBalanceSheet({ asOf: asOf || undefined });

  return (
    <div>
      <div className="flex items-end gap-3 mb-4">
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
      ) : !data ? (
        <Empty />
      ) : (
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
      )}
    </div>
  );
}

// ---- General ledger ----
function GeneralLedgerTab({
  fmt,
  lang,
  leafAccounts,
}: {
  fmt: Fmt;
  lang: string;
  leafAccounts: Account[];
}) {
  const { t } = useTranslation();
  const [accountId, setAccountId] = useState<string>("");
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());
  const glParams = {
    accountId,
    from: from || undefined,
    to: to || undefined,
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
      </div>
      {!accountId ? (
        <Empty />
      ) : isLoading ? (
        <Loading />
      ) : !data ? (
        <Empty />
      ) : (
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

export default Reports;
