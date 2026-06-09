import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useGetCompany,
  useGetVatReport,
  useGetWhtReport,
  useGetPayrollTaxReport,
  getGetVatReportQueryKey,
  getGetWhtReportQueryKey,
  getGetPayrollTaxReportQueryKey,
  type VatReport,
  type WhtReport,
  type PayrollTaxReport,
} from "@workspace/api-client-react";
import { taxReportsFor, type TaxReportDef } from "@workspace/locale";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Fmt = (n: number) => string;

// ---- date helpers -----------------------------------------------------------
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function monthRange(d = new Date()): { from: string; to: string } {
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: iso(from), to: iso(to) };
}
function quarterRange(d = new Date()): { from: string; to: string } {
  const q = Math.floor(d.getMonth() / 3);
  const from = new Date(d.getFullYear(), q * 3, 1);
  const to = new Date(d.getFullYear(), q * 3 + 3, 0);
  return { from: iso(from), to: iso(to) };
}
function yearRange(d = new Date()): { from: string; to: string } {
  return { from: `${d.getFullYear()}-01-01`, to: `${d.getFullYear()}-12-31` };
}

type PeriodPreset = "month" | "quarter" | "year" | "custom";

// Escape any dynamic value before interpolating into the print-window HTML.
function esc(v: string | number): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-xl border border-border bg-card overflow-hidden">
      {children}
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

export function TaxReports({ fmt, lang }: { fmt: Fmt; lang: string }) {
  const { t } = useTranslation();
  const { data: company } = useGetCompany();
  const country = company?.country ?? "EG";
  const reports = useMemo(() => taxReportsFor(country), [country]);

  const [reportId, setReportId] = useState<string>("");
  const selected: TaxReportDef | undefined =
    reports.find((r) => r.id === reportId) ?? reports[0];

  const [preset, setPreset] = useState<PeriodPreset>("month");
  const init = monthRange();
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);

  const applyPreset = (p: PeriodPreset) => {
    setPreset(p);
    if (p === "month") {
      const r = monthRange();
      setFrom(r.from);
      setTo(r.to);
    } else if (p === "quarter") {
      const r = quarterRange();
      setFrom(r.from);
      setTo(r.to);
    } else if (p === "year") {
      const r = yearRange();
      setFrom(r.from);
      setTo(r.to);
    }
  };

  const dataset = selected?.dataset;
  const params = { from: from || undefined, to: to || undefined };
  const vatQ = useGetVatReport(params, {
    query: {
      enabled: dataset === "vat",
      queryKey: getGetVatReportQueryKey(params),
    },
  });
  const whtQ = useGetWhtReport(params, {
    query: {
      enabled: dataset === "wht",
      queryKey: getGetWhtReportQueryKey(params),
    },
  });
  const payQ = useGetPayrollTaxReport(params, {
    query: {
      enabled: dataset === "payroll",
      queryKey: getGetPayrollTaxReportQueryKey(params),
    },
  });

  const isLoading =
    dataset === "vat"
      ? vatQ.isLoading
      : dataset === "wht"
        ? whtQ.isLoading
        : payQ.isLoading;

  const exportExcel = () => {
    if (!dataset) return;
    const path =
      dataset === "payroll" ? "payroll-tax" : dataset === "wht" ? "wht" : "vat";
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    window.open(`/api/reports/${path}/export?${qs.toString()}`, "_blank");
  };

  const exportPdf = () => {
    if (!selected) return;
    let bodyHtml = "";
    if (dataset === "vat" && vatQ.data) bodyHtml = vatPdfBody(vatQ.data, fmt, t);
    else if (dataset === "wht" && whtQ.data)
      bodyHtml = whtPdfBody(whtQ.data, fmt, t);
    else if (dataset === "payroll" && payQ.data)
      bodyHtml = payrollPdfBody(payQ.data, fmt, t);
    else return;
    const title = lang.startsWith("en") ? selected.nameEn : selected.nameAr;
    const html = pdfShell(title, selected.formRefAr, from, to, bodyHtml, t);
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  if (reports.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        {t("reportsPage.tax.noReports")}
      </div>
    );
  }

  const reportName = (r: TaxReportDef) =>
    lang.startsWith("en") ? r.nameEn : r.nameAr;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          {/* Report selector — driven by the company's country */}
          <div className="mb-4 min-w-[16rem]">
            <label className="block text-sm font-medium mb-1.5">
              {t("reportsPage.tax.selectReport")}
            </label>
            <Select value={selected?.id} onValueChange={setReportId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reports.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {reportName(r)}
                    {r.formRefAr ? ` — ${r.formRefAr}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Period preset */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1.5">
              {t("reportsPage.tax.period")}
            </label>
            <Select
              value={preset}
              onValueChange={(v) => applyPreset(v as PeriodPreset)}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">
                  {t("reportsPage.tax.presetMonth")}
                </SelectItem>
                <SelectItem value="quarter">
                  {t("reportsPage.tax.presetQuarter")}
                </SelectItem>
                <SelectItem value="year">
                  {t("reportsPage.tax.presetYear")}
                </SelectItem>
                <SelectItem value="custom">
                  {t("reportsPage.tax.presetCustom")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1.5">
              {t("reportsPage.filters.from")}
            </label>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPreset("custom");
              }}
              className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1.5">
              {t("reportsPage.filters.to")}
            </label>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPreset("custom");
              }}
              className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
            />
          </div>
        </div>
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
      </div>

      {selected?.descriptionAr && (
        <p className="text-sm text-muted-foreground -mt-1 mb-3">
          {lang.startsWith("en") && selected.descriptionEn
            ? selected.descriptionEn
            : selected.descriptionAr}
        </p>
      )}

      {isLoading ? (
        <Loading />
      ) : dataset === "vat" ? (
        <VatView data={vatQ.data} fmt={fmt} />
      ) : dataset === "wht" ? (
        <WhtView data={whtQ.data} fmt={fmt} />
      ) : (
        <PayrollView data={payQ.data} fmt={fmt} />
      )}
    </div>
  );
}

// ---- VAT (Form 10) view -----------------------------------------------------
function VatView({ data, fmt }: { data?: VatReport; fmt: Fmt }) {
  const { t } = useTranslation();
  if (!data || data.rows.length === 0) {
    return <Empty />;
  }
  const net = data.netVat;
  return (
    <>
      <Card>
        <SectionTitle>{t("reportsPage.tax.outputSection")}</SectionTitle>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-start px-4 py-2.5 font-semibold">
                {t("reportsPage.tax.taxBand")}
              </th>
              <th className="px-4 py-2.5 font-semibold text-center">
                {t("reportsPage.tax.rate")}
              </th>
              <th className="px-4 py-2.5 font-semibold text-end">
                {t("reportsPage.tax.salesBase")}
              </th>
              <th className="px-4 py-2.5 font-semibold text-end">
                {t("reportsPage.tax.outputTax")}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.taxId} className="border-t border-border">
                <td className="px-4 py-2.5">{r.taxName}</td>
                <td className="px-4 py-2.5 text-center tabular-nums">
                  {r.rate}%
                </td>
                <td className="px-4 py-2.5 text-end tabular-nums">
                  {fmt(r.salesBase)}
                </td>
                <td className="px-4 py-2.5 text-end tabular-nums">
                  {fmt(r.outputTax)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/30 font-bold">
              <td className="px-4 py-3" colSpan={2}>
                {t("reportsPage.tax.total")}
              </td>
              <td className="px-4 py-3 text-end tabular-nums">
                {fmt(data.salesBase)}
              </td>
              <td className="px-4 py-3 text-end tabular-nums">
                {fmt(data.outputTax)}
              </td>
            </tr>
          </tfoot>
        </table>
      </Card>

      <Card>
        <SectionTitle>{t("reportsPage.tax.inputSection")}</SectionTitle>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-start px-4 py-2.5 font-semibold">
                {t("reportsPage.tax.taxBand")}
              </th>
              <th className="px-4 py-2.5 font-semibold text-center">
                {t("reportsPage.tax.rate")}
              </th>
              <th className="px-4 py-2.5 font-semibold text-end">
                {t("reportsPage.tax.purchaseBase")}
              </th>
              <th className="px-4 py-2.5 font-semibold text-end">
                {t("reportsPage.tax.inputTax")}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.taxId} className="border-t border-border">
                <td className="px-4 py-2.5">{r.taxName}</td>
                <td className="px-4 py-2.5 text-center tabular-nums">
                  {r.rate}%
                </td>
                <td className="px-4 py-2.5 text-end tabular-nums">
                  {fmt(r.purchaseBase)}
                </td>
                <td className="px-4 py-2.5 text-end tabular-nums">
                  {fmt(r.inputTax)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/30 font-bold">
              <td className="px-4 py-3" colSpan={2}>
                {t("reportsPage.tax.total")}
              </td>
              <td className="px-4 py-3 text-end tabular-nums">
                {fmt(data.purchaseBase)}
              </td>
              <td className="px-4 py-3 text-end tabular-nums">
                {fmt(data.inputTax)}
              </td>
            </tr>
          </tfoot>
        </table>
      </Card>

      <div className="mt-4 rounded-xl border-2 border-primary/40 bg-primary/5 px-5 py-4 flex items-center justify-between">
        <span className="font-bold">
          {net >= 0
            ? t("reportsPage.tax.netPayable")
            : t("reportsPage.tax.netCreditable")}
        </span>
        <span className="text-xl font-bold tabular-nums">
          {fmt(Math.abs(net))}
        </span>
      </div>
    </>
  );
}

// ---- WHT view ---------------------------------------------------------------
function WhtView({ data, fmt }: { data?: WhtReport; fmt: Fmt }) {
  const { t } = useTranslation();
  if (!data || data.rows.length === 0) {
    return <Empty />;
  }
  return (
    <>
      <Card>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-start px-4 py-2.5 font-semibold">
                {t("reportsPage.tax.category")}
              </th>
              <th className="px-4 py-2.5 font-semibold text-center">
                {t("reportsPage.tax.rate")}
              </th>
              <th className="px-4 py-2.5 font-semibold text-end">
                {t("reportsPage.tax.whtBase")}
              </th>
              <th className="px-4 py-2.5 font-semibold text-end">
                {t("reportsPage.tax.whtAmount")}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.taxId} className="border-t border-border">
                <td className="px-4 py-2.5">{r.taxName}</td>
                <td className="px-4 py-2.5 text-center tabular-nums">
                  {r.rate}%
                </td>
                <td className="px-4 py-2.5 text-end tabular-nums">
                  {fmt(r.base)}
                </td>
                <td className="px-4 py-2.5 text-end tabular-nums">
                  {fmt(r.whtAmount)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/30 font-bold">
              <td className="px-4 py-3" colSpan={2}>
                {t("reportsPage.tax.total")}
              </td>
              <td className="px-4 py-3 text-end tabular-nums">
                {fmt(data.totalBase)}
              </td>
              <td className="px-4 py-3 text-end tabular-nums">
                {fmt(data.totalWht)}
              </td>
            </tr>
          </tfoot>
        </table>
      </Card>
      <p className="text-xs text-muted-foreground mt-3">
        {t("reportsPage.tax.whtNote")}
      </p>
    </>
  );
}

// ---- Payroll view -----------------------------------------------------------
function PayrollView({ data, fmt }: { data?: PayrollTaxReport; fmt: Fmt }) {
  const { t } = useTranslation();
  if (!data || data.rows.length === 0) {
    return <Empty />;
  }
  return (
    <>
      <Card>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-start px-4 py-2.5 font-semibold">
                {t("reportsPage.tax.month")}
              </th>
              <th className="px-4 py-2.5 font-semibold text-center">
                {t("reportsPage.tax.employeeCount")}
              </th>
              <th className="px-4 py-2.5 font-semibold text-end">
                {t("reportsPage.tax.gross")}
              </th>
              <th className="px-4 py-2.5 font-semibold text-end">
                {t("reportsPage.tax.deductions")}
              </th>
              <th className="px-4 py-2.5 font-semibold text-end">
                {t("reportsPage.tax.netPay")}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.period} className="border-t border-border">
                <td className="px-4 py-2.5 font-mono text-xs">{r.period}</td>
                <td className="px-4 py-2.5 text-center tabular-nums">
                  {r.employeeCount}
                </td>
                <td className="px-4 py-2.5 text-end tabular-nums">
                  {fmt(r.gross)}
                </td>
                <td className="px-4 py-2.5 text-end tabular-nums">
                  {fmt(r.deductions)}
                </td>
                <td className="px-4 py-2.5 text-end tabular-nums">
                  {fmt(r.netPay)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/30 font-bold">
              <td className="px-4 py-3">{t("reportsPage.tax.total")}</td>
              <td className="px-4 py-3 text-center tabular-nums">
                {data.totals.employeeCount}
              </td>
              <td className="px-4 py-3 text-end tabular-nums">
                {fmt(data.totals.gross)}
              </td>
              <td className="px-4 py-3 text-end tabular-nums">
                {fmt(data.totals.deductions)}
              </td>
              <td className="px-4 py-3 text-end tabular-nums">
                {fmt(data.totals.netPay)}
              </td>
            </tr>
          </tfoot>
        </table>
      </Card>
      <p className="text-xs text-muted-foreground mt-3">
        {t("reportsPage.tax.payrollNote")}
      </p>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-2.5 bg-muted/70 font-bold text-sm border-b border-border">
      {children}
    </div>
  );
}

function Empty() {
  const { t } = useTranslation();
  return (
    <div className="py-16 text-center text-muted-foreground">
      {t("reportsPage.noData")}
    </div>
  );
}

// ---- PDF print-window builders ---------------------------------------------
type Tfn = (k: string) => string;

function pdfShell(
  title: string,
  formRef: string | undefined,
  from: string,
  to: string,
  body: string,
  t: Tfn,
): string {
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  *{font-family:'Cairo',Arial,sans-serif;box-sizing:border-box}
  body{margin:24px;color:#1a2332}
  h1{font-size:20px;margin:0 0 4px}
  .meta{color:#667085;font-size:13px;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;margin:12px 0}
  th,td{border:1px solid #d0d5dd;padding:8px 10px;font-size:13px}
  th{background:#f2f4f7;text-align:start}
  td.num,th.num{text-align:end;font-variant-numeric:tabular-nums}
  .section{font-weight:700;background:#eef0f3;padding:8px 10px;margin-top:14px;border:1px solid #d0d5dd}
  .net{display:flex;justify-content:space-between;border:2px solid #98a2b3;padding:12px 16px;margin-top:14px;font-weight:700;font-size:16px}
  .note{color:#667085;font-size:11px;margin-top:10px}
  @media print{body{margin:0}}
</style></head>
<body onload="window.print()">
  <h1>${esc(title)}${formRef ? ` — ${esc(formRef)}` : ""}</h1>
  <div class="meta">${esc(t("reportsPage.tax.period"))}: ${esc(from)} → ${esc(to)} · ${esc(t("reportsPage.tax.preparedAt"))} ${esc(iso(new Date()))}</div>
  ${body}
</body></html>`;
}

function vatPdfBody(data: VatReport, fmt: Fmt, t: Tfn): string {
  const outRows = data.rows
    .map(
      (r) =>
        `<tr><td>${esc(r.taxName)}</td><td class="num">${esc(r.rate)}%</td><td class="num">${esc(fmt(r.salesBase))}</td><td class="num">${esc(fmt(r.outputTax))}</td></tr>`,
    )
    .join("");
  const inRows = data.rows
    .map(
      (r) =>
        `<tr><td>${esc(r.taxName)}</td><td class="num">${esc(r.rate)}%</td><td class="num">${esc(fmt(r.purchaseBase))}</td><td class="num">${esc(fmt(r.inputTax))}</td></tr>`,
    )
    .join("");
  const net = data.netVat;
  return `
  <div class="section">${esc(t("reportsPage.tax.outputSection"))}</div>
  <table><thead><tr><th>${esc(t("reportsPage.tax.taxBand"))}</th><th class="num">${esc(t("reportsPage.tax.rate"))}</th><th class="num">${esc(t("reportsPage.tax.salesBase"))}</th><th class="num">${esc(t("reportsPage.tax.outputTax"))}</th></tr></thead>
  <tbody>${outRows}</tbody>
  <tfoot><tr><th colspan="2">${esc(t("reportsPage.tax.total"))}</th><th class="num">${esc(fmt(data.salesBase))}</th><th class="num">${esc(fmt(data.outputTax))}</th></tr></tfoot></table>
  <div class="section">${esc(t("reportsPage.tax.inputSection"))}</div>
  <table><thead><tr><th>${esc(t("reportsPage.tax.taxBand"))}</th><th class="num">${esc(t("reportsPage.tax.rate"))}</th><th class="num">${esc(t("reportsPage.tax.purchaseBase"))}</th><th class="num">${esc(t("reportsPage.tax.inputTax"))}</th></tr></thead>
  <tbody>${inRows}</tbody>
  <tfoot><tr><th colspan="2">${esc(t("reportsPage.tax.total"))}</th><th class="num">${esc(fmt(data.purchaseBase))}</th><th class="num">${esc(fmt(data.inputTax))}</th></tr></tfoot></table>
  <div class="net"><span>${esc(net >= 0 ? t("reportsPage.tax.netPayable") : t("reportsPage.tax.netCreditable"))}</span><span>${esc(fmt(Math.abs(net)))}</span></div>`;
}

function whtPdfBody(data: WhtReport, fmt: Fmt, t: Tfn): string {
  const rows = data.rows
    .map(
      (r) =>
        `<tr><td>${esc(r.taxName)}</td><td class="num">${esc(r.rate)}%</td><td class="num">${esc(fmt(r.base))}</td><td class="num">${esc(fmt(r.whtAmount))}</td></tr>`,
    )
    .join("");
  return `
  <table><thead><tr><th>${esc(t("reportsPage.tax.category"))}</th><th class="num">${esc(t("reportsPage.tax.rate"))}</th><th class="num">${esc(t("reportsPage.tax.whtBase"))}</th><th class="num">${esc(t("reportsPage.tax.whtAmount"))}</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr><th colspan="2">${esc(t("reportsPage.tax.total"))}</th><th class="num">${esc(fmt(data.totalBase))}</th><th class="num">${esc(fmt(data.totalWht))}</th></tr></tfoot></table>
  <div class="note">${esc(t("reportsPage.tax.whtNote"))}</div>`;
}

function payrollPdfBody(data: PayrollTaxReport, fmt: Fmt, t: Tfn): string {
  const rows = data.rows
    .map(
      (r) =>
        `<tr><td>${esc(r.period)}</td><td class="num">${esc(r.employeeCount)}</td><td class="num">${esc(fmt(r.gross))}</td><td class="num">${esc(fmt(r.deductions))}</td><td class="num">${esc(fmt(r.netPay))}</td></tr>`,
    )
    .join("");
  return `
  <table><thead><tr><th>${esc(t("reportsPage.tax.month"))}</th><th class="num">${esc(t("reportsPage.tax.employeeCount"))}</th><th class="num">${esc(t("reportsPage.tax.gross"))}</th><th class="num">${esc(t("reportsPage.tax.deductions"))}</th><th class="num">${esc(t("reportsPage.tax.netPay"))}</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr><th>${esc(t("reportsPage.tax.total"))}</th><th class="num">${esc(data.totals.employeeCount)}</th><th class="num">${esc(fmt(data.totals.gross))}</th><th class="num">${esc(fmt(data.totals.deductions))}</th><th class="num">${esc(fmt(data.totals.netPay))}</th></tr></tfoot></table>
  <div class="note">${esc(t("reportsPage.tax.payrollNote"))}</div>`;
}
