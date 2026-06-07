import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useGetOutstandingInvoices,
  useGetAgingReport,
  useGetPartyStatement,
  useGetInvoiceSummaryReport,
  useGetPaymentsSummaryReport,
  useListCustomers,
  useListSuppliers,
} from "@workspace/api-client-react";
import { Spinner } from "@/components/ui/spinner";
import { displayName } from "./InvoiceWorkspace";

type Kind = "sales" | "purchase";
type ReportTab =
  | "outstanding"
  | "aging"
  | "statement"
  | "invoiceSummary"
  | "paymentsSummary";

export function InvoiceReports({ kind }: { kind: Kind }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [tab, setTab] = useState<ReportTab>("outstanding");

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const subTabs: ReportTab[] = [
    "outstanding",
    "aging",
    "statement",
    "invoiceSummary",
    "paymentsSummary",
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-1 bg-muted/50 p-1 rounded-full w-fit">
        {subTabs.map((rt) => (
          <button
            key={rt}
            onClick={() => setTab(rt)}
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${
              tab === rt
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(`invoices.reports.${rt}`)}
          </button>
        ))}
      </div>

      {tab === "outstanding" && <OutstandingReport kind={kind} fmt={fmt} />}
      {tab === "aging" && <AgingReportView kind={kind} fmt={fmt} />}
      {tab === "statement" && <StatementReport kind={kind} fmt={fmt} />}
      {tab === "invoiceSummary" && <InvoiceSummaryView kind={kind} fmt={fmt} />}
      {tab === "paymentsSummary" && <PaymentsSummaryView kind={kind} fmt={fmt} />}
    </div>
  );
}

const cardCls = "bg-card border rounded-2xl shadow-sm overflow-hidden";
const thCls = "text-xs font-bold text-muted-foreground bg-muted/40";
const inputCls =
  "bg-background border rounded-lg h-9 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";

function Empty({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center p-12 text-muted-foreground text-sm">
      {label}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center p-12">
      <Spinner className="w-8 h-8 text-primary" />
    </div>
  );
}

function OutstandingReport({
  kind,
  fmt,
}: {
  kind: Kind;
  fmt: (n: number) => string;
}) {
  const { t } = useTranslation();
  const { data = [], isLoading } = useGetOutstandingInvoices({ kind });
  return (
    <div className={cardCls}>
      {isLoading ? (
        <Loading />
      ) : data.length === 0 ? (
        <Empty label={t("invoices.reports.noData")} />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className={thCls}>
              <th className="text-start px-6 py-3">{t("invoices.invoiceNo")}</th>
              <th className="text-start px-3 py-3">{t("invoices.date")}</th>
              <th className="text-start px-3 py-3">{t("invoices.dueDate")}</th>
              <th className="text-start px-3 py-3">{t("invoices.party")}</th>
              <th className="text-end px-3 py-3">{t("invoices.total")}</th>
              <th className="text-end px-3 py-3">{t("invoices.paid")}</th>
              <th className="text-end px-6 py-3">{t("invoices.balance")}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((inv) => (
              <tr key={inv.id} className="border-t hover:bg-muted/40">
                <td className="px-6 py-3 font-sans tabular-nums font-bold" dir="ltr">
                  #{inv.invoiceNo}
                </td>
                <td className="px-3 py-3 font-sans tabular-nums" dir="ltr">
                  {inv.date}
                </td>
                <td
                  className={`px-3 py-3 font-sans tabular-nums ${
                    inv.overdue ? "text-destructive font-bold" : ""
                  }`}
                  dir="ltr"
                >
                  {inv.dueDate ?? "—"}
                </td>
                <td className="px-3 py-3 text-start">{inv.partyName}</td>
                <td className="px-3 py-3 text-end font-sans tabular-nums" dir="ltr">
                  {fmt(inv.total)}
                </td>
                <td className="px-3 py-3 text-end font-sans tabular-nums" dir="ltr">
                  {fmt(inv.amountPaid)}
                </td>
                <td className="px-6 py-3 text-end font-bold font-sans tabular-nums" dir="ltr">
                  {fmt(inv.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AgingReportView({
  kind,
  fmt,
}: {
  kind: Kind;
  fmt: (n: number) => string;
}) {
  const { t } = useTranslation();
  const [asOf, setAsOf] = useState("");
  const type = kind === "sales" ? "ar" : "ap";
  const { data, isLoading } = useGetAgingReport({
    type,
    ...(asOf ? { asOf } : {}),
  });
  const rows = data?.rows ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <label className="text-sm font-bold text-muted-foreground">
          {t("invoices.reports.asOf")}
        </label>
        <input
          type="date"
          className={inputCls}
          value={asOf}
          onChange={(e) => setAsOf(e.target.value)}
          dir="ltr"
        />
      </div>
      <div className={cardCls}>
        {isLoading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty label={t("invoices.reports.noData")} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className={thCls}>
                <th className="text-start px-6 py-3">{t("invoices.party")}</th>
                <th className="text-end px-3 py-3">{t("invoices.reports.current")}</th>
                <th className="text-end px-3 py-3">{t("invoices.reports.d30")}</th>
                <th className="text-end px-3 py-3">{t("invoices.reports.d60")}</th>
                <th className="text-end px-3 py-3">{t("invoices.reports.d90")}</th>
                <th className="text-end px-3 py-3">{t("invoices.reports.d90plus")}</th>
                <th className="text-end px-6 py-3">{t("invoices.total")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.partyId} className="border-t hover:bg-muted/40">
                  <td className="px-6 py-3 text-start font-bold">{r.partyName}</td>
                  <td className="px-3 py-3 text-end font-sans tabular-nums" dir="ltr">
                    {fmt(r.current)}
                  </td>
                  <td className="px-3 py-3 text-end font-sans tabular-nums" dir="ltr">
                    {fmt(r.days30)}
                  </td>
                  <td className="px-3 py-3 text-end font-sans tabular-nums" dir="ltr">
                    {fmt(r.days60)}
                  </td>
                  <td className="px-3 py-3 text-end font-sans tabular-nums" dir="ltr">
                    {fmt(r.days90)}
                  </td>
                  <td className="px-3 py-3 text-end font-sans tabular-nums" dir="ltr">
                    {fmt(r.days90plus)}
                  </td>
                  <td className="px-6 py-3 text-end font-bold font-sans tabular-nums" dir="ltr">
                    {fmt(r.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatementReport({
  kind,
  fmt,
}: {
  kind: Kind;
  fmt: (n: number) => string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const partyType = kind === "sales" ? "customer" : "supplier";
  const { data: customers = [] } = useListCustomers();
  const { data: suppliers = [] } = useListSuppliers();
  const parties = kind === "sales" ? customers : suppliers;

  const [partyId, setPartyId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data, isLoading } = useGetPartyStatement(
    {
      partyType,
      partyId,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    },
    { query: { enabled: !!partyId } as any },
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          className={inputCls}
          value={partyId}
          onChange={(e) => setPartyId(e.target.value)}
        >
          <option value="">{t("invoices.reports.selectParty")}</option>
          {parties.map((p) => (
            <option key={p.id} value={p.id}>
              {displayName(p, lang)}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <label className="text-sm text-muted-foreground">
            {t("invoices.reports.from")}
          </label>
          <input
            type="date"
            className={inputCls}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            dir="ltr"
          />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-sm text-muted-foreground">
            {t("invoices.reports.to")}
          </label>
          <input
            type="date"
            className={inputCls}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            dir="ltr"
          />
        </div>
      </div>

      {!partyId ? (
        <div className={cardCls}>
          <Empty label={t("invoices.reports.selectParty")} />
        </div>
      ) : isLoading ? (
        <div className={cardCls}>
          <Loading />
        </div>
      ) : data ? (
        <div className={cardCls}>
          <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/20">
            <div className="font-bold text-foreground">{data.partyName}</div>
            <div className="flex gap-6 text-sm">
              <span className="text-muted-foreground">
                {t("invoices.reports.openingBalance")}:{" "}
                <span className="font-sans tabular-nums text-foreground" dir="ltr">
                  {fmt(data.openingBalance)}
                </span>
              </span>
              <span className="text-muted-foreground">
                {t("invoices.reports.closingBalance")}:{" "}
                <span className="font-bold font-sans tabular-nums text-foreground" dir="ltr">
                  {fmt(data.closingBalance)}
                </span>
              </span>
            </div>
          </div>
          {data.entries.length === 0 ? (
            <Empty label={t("invoices.reports.noData")} />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className={thCls}>
                  <th className="text-start px-6 py-3">{t("invoices.date")}</th>
                  <th className="text-start px-3 py-3">{t("invoices.description")}</th>
                  <th className="text-end px-3 py-3">{t("invoices.reports.debit")}</th>
                  <th className="text-end px-3 py-3">{t("invoices.reports.credit")}</th>
                  <th className="text-end px-6 py-3">{t("invoices.reports.runningBalance")}</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e, i) => (
                  <tr key={i} className="border-t hover:bg-muted/40">
                    <td className="px-6 py-3 font-sans tabular-nums" dir="ltr">
                      {e.date}
                    </td>
                    <td className="px-3 py-3 text-start">{e.description}</td>
                    <td className="px-3 py-3 text-end font-sans tabular-nums" dir="ltr">
                      {e.debit ? fmt(e.debit) : "—"}
                    </td>
                    <td className="px-3 py-3 text-end font-sans tabular-nums" dir="ltr">
                      {e.credit ? fmt(e.credit) : "—"}
                    </td>
                    <td className="px-6 py-3 text-end font-bold font-sans tabular-nums" dir="ltr">
                      {fmt(e.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className={cardCls}>
          <Empty label={t("invoices.reports.noData")} />
        </div>
      )}
    </div>
  );
}

function InvoiceSummaryView({
  kind,
  fmt,
}: {
  kind: Kind;
  fmt: (n: number) => string;
}) {
  const { t } = useTranslation();
  const [groupBy, setGroupBy] = useState<"party" | "costCenter">("party");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data = [], isLoading } = useGetInvoiceSummaryReport({
    kind,
    groupBy,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-full">
          {(["party", "costCenter"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              className={`px-3 py-1 rounded-full text-xs font-bold ${
                groupBy === g
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              {t(
                g === "party"
                  ? "invoices.reports.groupByParty"
                  : "invoices.reports.groupByCostCenter",
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <label className="text-sm text-muted-foreground">
            {t("invoices.reports.from")}
          </label>
          <input
            type="date"
            className={inputCls}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            dir="ltr"
          />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-sm text-muted-foreground">
            {t("invoices.reports.to")}
          </label>
          <input
            type="date"
            className={inputCls}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            dir="ltr"
          />
        </div>
      </div>
      <div className={cardCls}>
        {isLoading ? (
          <Loading />
        ) : data.length === 0 ? (
          <Empty label={t("invoices.reports.noData")} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className={thCls}>
                <th className="text-start px-6 py-3">
                  {t(
                    groupBy === "party"
                      ? "invoices.party"
                      : "invoices.costCenter",
                  )}
                </th>
                <th className="text-end px-3 py-3">{t("invoices.reports.count")}</th>
                <th className="text-end px-6 py-3">{t("invoices.total")}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={r.key ?? i} className="border-t hover:bg-muted/40">
                  <td className="px-6 py-3 text-start font-bold">{r.label}</td>
                  <td className="px-3 py-3 text-end font-sans tabular-nums" dir="ltr">
                    {r.count}
                  </td>
                  <td className="px-6 py-3 text-end font-bold font-sans tabular-nums" dir="ltr">
                    {fmt(r.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function PaymentsSummaryView({
  kind,
  fmt,
}: {
  kind: Kind;
  fmt: (n: number) => string;
}) {
  const { t } = useTranslation();
  const paymentKind = kind === "sales" ? "collection" : "payment";
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data = [], isLoading } = useGetPaymentsSummaryReport({
    kind: paymentKind,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <label className="text-sm text-muted-foreground">
            {t("invoices.reports.from")}
          </label>
          <input
            type="date"
            className={inputCls}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            dir="ltr"
          />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-sm text-muted-foreground">
            {t("invoices.reports.to")}
          </label>
          <input
            type="date"
            className={inputCls}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            dir="ltr"
          />
        </div>
      </div>
      <div className={cardCls}>
        {isLoading ? (
          <Loading />
        ) : data.length === 0 ? (
          <Empty label={t("invoices.reports.noData")} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className={thCls}>
                <th className="text-start px-6 py-3">{t("invoices.paymentNo")}</th>
                <th className="text-start px-3 py-3">{t("invoices.date")}</th>
                <th className="text-start px-3 py-3">{t("invoices.party")}</th>
                <th className="text-start px-3 py-3">{t("invoices.method")}</th>
                <th className="text-end px-6 py-3">{t("invoices.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="border-t hover:bg-muted/40">
                  <td className="px-6 py-3 font-sans tabular-nums font-bold" dir="ltr">
                    #{p.paymentNo}
                  </td>
                  <td className="px-3 py-3 font-sans tabular-nums" dir="ltr">
                    {p.date}
                  </td>
                  <td className="px-3 py-3 text-start">{p.partyName ?? "—"}</td>
                  <td className="px-3 py-3 text-start">
                    {t(`invoices.methods.${p.method}`)}
                  </td>
                  <td className="px-6 py-3 text-end font-bold font-sans tabular-nums" dir="ltr">
                    {fmt(p.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
