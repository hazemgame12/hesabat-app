import type {
  TrialBalance,
  TrialBalanceBreakdownGroup,
  IncomeStatement,
  IncomeStatementBreakdownGroup,
  BalanceSheet,
  Currency,
  Company,
} from "@workspace/api-client-react";

export type { TrialBalanceBreakdownGroup, IncomeStatementBreakdownGroup };

export type Fmt = (n: number) => string;

export type CurrencyControls = {
  reportCurrency: string;
  setReportCurrency: (v: string) => void;
  baseCurrency: string;
  currencies: Currency[];
};

export function displayName(
  e: { nameAr: string; nameEn?: string | null },
  lang: string,
): string {
  return lang.startsWith("en") && e.nameEn ? e.nameEn : e.nameAr;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function startOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}

export function esc(v: string | number): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared masthead helpers
// ─────────────────────────────────────────────────────────────────────────────

const MASTHEAD_CSS = `
  .masthead { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #1e3a5f; padding-bottom:14px; margin-bottom:16px; }
  .co-block { display:flex; gap:10px; align-items:flex-start; }
  .co-logo { width:60px; height:60px; object-fit:contain; }
  .co-name { font-size:17px; font-weight:800; color:#1e293b; line-height:1.2; }
  .co-sub { font-size:11px; color:#64748b; margin-top:2px; }
  .rpt-title { font-size:20px; font-weight:800; color:#1e40af; text-align:end; line-height:1.3; }
  .rpt-meta { font-size:11px; color:#64748b; margin-bottom:14px; }
`;

function mastheadHtml(company: Company | undefined, title: string): string {
  const rawLogo = company?.logoUrl ?? null;
  const logoSrc = rawLogo
    ? rawLogo.startsWith("http")
      ? rawLogo
      : `${window.location.origin}${rawLogo}`
    : null;
  const coBlock = company
    ? `<div class="co-block">
    ${logoSrc ? `<img class="co-logo" src="${esc(logoSrc)}" alt="" />` : ""}
    <div>
      <div class="co-name">${esc(company.name ?? "")}</div>
      ${company.tradeName ? `<div class="co-sub">${esc(company.tradeName)}</div>` : ""}
      ${company.taxRegistrationNumber ? `<div class="co-sub">س.ت/ض: ${esc(company.taxRegistrationNumber)}</div>` : ""}
      ${company.address ? `<div class="co-sub">${esc(company.address)}</div>` : ""}
      ${company.phone ? `<div class="co-sub" dir="ltr">${esc(company.phone)}</div>` : ""}
    </div>
  </div>`
    : `<div class="co-block"></div>`;
  return `<div class="masthead">
  ${coBlock}
  <div class="rpt-title">${esc(title)}</div>
</div>`;
}

type BreakdownGroupLabel = {
  dimensionName?: string;
  dimensionNameAr?: string;
  dimensionNameEn?: string | null;
};

function breakdownGroupName(group: BreakdownGroupLabel, lang: string): string {
  return lang.startsWith("en")
    ? group.dimensionNameEn || group.dimensionName || group.dimensionNameAr || "Unassigned"
    : group.dimensionNameAr || group.dimensionName || group.dimensionNameEn || "غير محدد";
}

function metaLinesHtml(lines: string[] | undefined): string {
  if (!lines?.length) return "";
  return `<div class="meta-lines">${lines
    .map((line) => `<div>${esc(line)}</div>`)
    .join("")}</div>`;
}

export function buildTrialBalancePdfHtml(
  data: TrialBalance,
  fmt: Fmt,
  lang: string,
  from: string,
  to: string,
  labels: Record<string, string>,
  company?: Company,
  metaLines?: string[],
): string {
  const rtl = !lang.startsWith("en");
  const cell = (v: number) => (v ? esc(fmt(v)) : "—");
  const rowsHtml = (rows: TrialBalance["rows"]) =>
    rows
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
  const totalsHtml = (
    openingDebit: number,
    openingCredit: number,
    periodDebit: number,
    periodCredit: number,
    closingDebit: number,
    closingCredit: number,
    label: string,
  ) => `<tfoot>
      <tr>
        <td colspan="2">${esc(label)}</td>
        <td class="num">${esc(fmt(openingDebit))}</td>
        <td class="num">${esc(fmt(openingCredit))}</td>
        <td class="num">${esc(fmt(periodDebit))}</td>
        <td class="num">${esc(fmt(periodCredit))}</td>
        <td class="num">${esc(fmt(closingDebit))}</td>
        <td class="num">${esc(fmt(closingCredit))}</td>
      </tr>
    </tfoot>`;
  const tableHead = `<thead>
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
    </thead>`;
  const breakdownTables =
    data.breakdownGroups && data.breakdownGroups.length > 0
      ? data.breakdownGroups
          .map(
            (group) => `<section class="breakdown-group">
      <div class="group-title">${esc(
        breakdownGroupName(group as BreakdownGroupLabel, lang),
      )}</div>
      <table>
        ${tableHead}
        <tbody>${rowsHtml(group.rows)}</tbody>
        ${totalsHtml(
          group.totalOpeningDebit,
          group.totalOpeningCredit,
          group.totalPeriodDebit,
          group.totalPeriodCredit,
          group.totalClosingDebit,
          group.totalClosingCredit,
          labels.subtotal ?? labels.total,
        )}
      </table>
    </section>`,
          )
          .join("")
      : "";
  return `<!doctype html><html dir="${rtl ? "rtl" : "ltr"}" lang="${esc(lang)}">
<head><meta charset="utf-8"><title>${esc(labels.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Cairo','Segoe UI',Tahoma,Arial,sans-serif; margin: 28px; color: #1f2937; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px; }
  thead th { background: #f3f4f6; text-align: center; font-weight: 700; }
  td.code { font-family: monospace; }
  td.num, th.num { text-align: ${rtl ? "left" : "right"}; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tfoot td { font-weight: 700; background: #f9fafb; }
  .group-title { font-size: 13px; font-weight: 700; margin: 14px 0 6px; color: #1e40af; }
  .breakdown-group { margin-bottom: 16px; }
  .badge { display: inline-block; margin-top: 12px; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; }
  .ok { background: #d1fae5; color: #047857; }
  .bad { background: #fee2e2; color: #b91c1c; }
  .meta-lines { font-size: 11px; color: #64748b; margin-bottom: 10px; display: flex; flex-direction: column; gap: 2px; }
  @media print { body { margin: 0; } }
  ${MASTHEAD_CSS}
</style></head>
<body onload="window.print()">
  ${mastheadHtml(company, labels.title)}
  <div class="rpt-meta">${esc(labels.periodLabel)}: ${esc(from || "—")} → ${esc(to || "—")} &nbsp;·&nbsp; ${esc(labels.preparedAt)}: ${esc(new Date().toLocaleDateString(lang))}</div>
  ${metaLinesHtml(metaLines)}
  ${breakdownTables || `<table>
    ${tableHead}
    <tbody>${rowsHtml(data.rows)}</tbody>
    ${totalsHtml(
      data.totalOpeningDebit,
      data.totalOpeningCredit,
      data.totalPeriodDebit,
      data.totalPeriodCredit,
      data.totalClosingDebit,
      data.totalClosingCredit,
      labels.total,
    )}
  </table>`}
  ${
    breakdownTables
      ? `<table>
    ${tableHead}
    ${totalsHtml(
      data.totalOpeningDebit,
      data.totalOpeningCredit,
      data.totalPeriodDebit,
      data.totalPeriodCredit,
      data.totalClosingDebit,
      data.totalClosingCredit,
      labels.total,
    )}
  </table>`
      : ""
  }
  <span class="badge ${data.balanced ? "ok" : "bad"}">${esc(data.balanced ? labels.balanced : labels.unbalanced)}</span>
</body></html>`;
}

export function buildIncomeStatementPdfHtml(
  data: IncomeStatement,
  fmt: Fmt,
  lang: string,
  from: string,
  to: string,
  labels: Record<string, string>,
  company?: Company,
  metaLines?: string[],
): string {
  const rtl = !lang.startsWith("en");
  const numCell = (v: number) =>
    `<td class="num">${esc(fmt(v))}</td>`;
  const sectionRows = (
    lines: { code: string; nameAr: string; nameEn?: string | null; amount: number }[],
  ) =>
    lines
      .map(
        (l) => `<tr>
        <td class="code">${esc(l.code)}</td>
        <td>${esc(displayName(l, lang))}</td>
        ${numCell(l.amount)}
      </tr>`,
      )
      .join("");
  const profit = data.netProfit >= 0;
  const sectionTable = (
    title: string,
    lines: { code: string; nameAr: string; nameEn?: string | null; amount: number }[],
    totalLabel: string,
    total: number,
  ) => `<table>
    <thead><tr><th class="code">${esc(labels.code)}</th><th>${esc(title)}</th><th class="num">${esc(labels.amount)}</th></tr></thead>
    <tbody>${sectionRows(lines)}</tbody>
    <tfoot><tr><td class="code"></td><td>${esc(totalLabel)}</td><td class="num">${esc(fmt(total))}</td></tr></tfoot>
  </table>`;
  const breakdownBlocks =
    data.breakdownGroups && data.breakdownGroups.length > 0
      ? data.breakdownGroups
          .map((group) => {
            const groupProfit = group.netProfit >= 0;
            return `<section class="breakdown-group">
      <div class="group-title">${esc(
        breakdownGroupName(group as BreakdownGroupLabel, lang),
      )}</div>
      ${sectionTable(
        labels.revenue,
        group.revenue,
        labels.totalRevenue,
        group.totalRevenue,
      )}
      ${sectionTable(
        labels.expenses,
        group.expenses,
        labels.totalExpenses,
        group.totalExpenses,
      )}
      <div class="net ${groupProfit ? "profit" : "loss"}">
        <span>${esc(labels.subtotal ?? labels.total)} · ${esc(groupProfit ? labels.netProfit : labels.netLoss)}</span>
        <span class="num-val">${esc(fmt(Math.abs(group.netProfit)))}</span>
      </div>
    </section>`;
          })
          .join("")
      : "";

  return `<!doctype html><html dir="${rtl ? "rtl" : "ltr"}" lang="${esc(lang)}">
<head><meta charset="utf-8"><title>${esc(labels.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Cairo','Segoe UI',Tahoma,Arial,sans-serif; margin: 28px; color: #1f2937; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 14px; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px; }
  thead th { background: #f3f4f6; font-weight: 700; }
  td.code { font-family: monospace; width: 80px; }
  td.num, th.num { text-align: ${rtl ? "left" : "right"}; font-variant-numeric: tabular-nums; white-space: nowrap; width: 130px; }
  tfoot td { font-weight: 700; background: #f9fafb; }
  .net { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-radius: 6px; font-weight: 700; font-size: 14px; margin-top: 4px; }
  .profit { background: #d1fae5; color: #047857; border: 1px solid #6ee7b7; }
  .loss   { background: #fee2e2; color: #b91c1c;  border: 1px solid #fca5a5; }
  .num-val { font-family: monospace; font-variant-numeric: tabular-nums; }
  .group-title { font-size: 13px; font-weight: 700; margin: 14px 0 6px; color: #1e40af; }
  .breakdown-group { margin-bottom: 16px; }
  .meta-lines { font-size: 11px; color: #64748b; margin-bottom: 10px; display: flex; flex-direction: column; gap: 2px; }
  @media print { body { margin: 0; } }
  ${MASTHEAD_CSS}
</style></head>
<body onload="window.print()">
  ${mastheadHtml(company, labels.title)}
  <div class="rpt-meta">${esc(labels.periodLabel)}: ${esc(from || "—")} → ${esc(to || "—")} &nbsp;·&nbsp; ${esc(labels.preparedAt)}: ${esc(new Date().toLocaleDateString(lang))}</div>
  ${metaLinesHtml(metaLines)}
  ${
    breakdownBlocks ||
    `${sectionTable(labels.revenue, data.revenue, labels.totalRevenue, data.totalRevenue)}
  ${sectionTable(labels.expenses, data.expenses, labels.totalExpenses, data.totalExpenses)}`
  }
  ${
    breakdownBlocks
      ? `<div class="group-title">${esc(labels.total)}</div>
  ${sectionTable(labels.revenue, data.revenue, labels.totalRevenue, data.totalRevenue)}
  ${sectionTable(labels.expenses, data.expenses, labels.totalExpenses, data.totalExpenses)}`
      : ""
  }

  <div class="net ${profit ? "profit" : "loss"}">
    <span>${esc(profit ? labels.netProfit : labels.netLoss)}</span>
    <span class="num-val">${esc(fmt(Math.abs(data.netProfit)))}</span>
  </div>
</body></html>`;
}

export function buildBalanceSheetPdfHtml(
  data: BalanceSheet,
  fmt: Fmt,
  lang: string,
  asOf: string,
  labels: Record<string, string>,
  company?: Company,
  metaLines?: string[],
): string {
  const rtl = !lang.startsWith("en");
  const numCell = (v: number) =>
    `<td class="num">${esc(fmt(v))}</td>`;
  const sectionRows = (
    lines: { code: string; nameAr: string; nameEn?: string | null; amount: number }[],
  ) =>
    lines
      .map(
        (l) => `<tr>
        <td class="code">${esc(l.code)}</td>
        <td>${esc(displayName(l, lang))}</td>
        ${numCell(l.amount)}
      </tr>`,
      )
      .join("");

  return `<!doctype html><html dir="${rtl ? "rtl" : "ltr"}" lang="${esc(lang)}">
<head><meta charset="utf-8"><title>${esc(labels.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Cairo','Segoe UI',Tahoma,Arial,sans-serif; margin: 28px; color: #1f2937; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 14px; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px; }
  thead th { background: #f3f4f6; font-weight: 700; }
  td.code { font-family: monospace; width: 80px; }
  td.num, th.num { text-align: ${rtl ? "left" : "right"}; font-variant-numeric: tabular-nums; white-space: nowrap; width: 130px; }
  tfoot td { font-weight: 700; background: #f9fafb; }
  .total-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-radius: 6px; font-weight: 700; font-size: 13px; background: #f3f4f6; border: 1px solid #d1d5db; }
  .num-val { font-family: monospace; font-variant-numeric: tabular-nums; }
  .meta-lines { font-size: 11px; color: #64748b; margin-bottom: 10px; display: flex; flex-direction: column; gap: 2px; }
  @media print { body { margin: 0; } }
  ${MASTHEAD_CSS}
</style></head>
<body onload="window.print()">
  ${mastheadHtml(company, labels.title)}
  <div class="rpt-meta">${esc(labels.asOfLabel)}: ${esc(asOf || "—")} &nbsp;·&nbsp; ${esc(labels.preparedAt)}: ${esc(new Date().toLocaleDateString(lang))}</div>
  ${metaLinesHtml(metaLines)}

  <table>
    <thead><tr><th class="code">${esc(labels.code)}</th><th>${esc(labels.assets)}</th><th class="num">${esc(labels.amount)}</th></tr></thead>
    <tbody>${sectionRows(data.assets)}</tbody>
    <tfoot><tr><td class="code"></td><td>${esc(labels.totalAssets)}</td><td class="num">${esc(fmt(data.totalAssets))}</td></tr></tfoot>
  </table>

  <table>
    <thead><tr><th class="code">${esc(labels.code)}</th><th>${esc(labels.liabilities)}</th><th class="num">${esc(labels.amount)}</th></tr></thead>
    <tbody>${sectionRows(data.liabilities)}</tbody>
    <tfoot><tr><td class="code"></td><td>${esc(labels.totalLiabilities)}</td><td class="num">${esc(fmt(data.totalLiabilities))}</td></tr></tfoot>
  </table>

  <table>
    <thead><tr><th class="code">${esc(labels.code)}</th><th>${esc(labels.equity)}</th><th class="num">${esc(labels.amount)}</th></tr></thead>
    <tbody>
      ${sectionRows(data.equity)}
      <tr><td class="code"></td><td><em>${esc(labels.netResult)}</em></td>${numCell(data.netResult)}</tr>
    </tbody>
    <tfoot><tr><td class="code"></td><td>${esc(labels.totalEquity)}</td><td class="num">${esc(fmt(data.totalEquity))}</td></tr></tfoot>
  </table>

  <div class="total-row">
    <span>${esc(labels.totalLiabilitiesAndEquity)}</span>
    <span class="num-val">${esc(fmt(data.totalLiabilitiesAndEquity))}</span>
  </div>
</body></html>`;
}

export function reportCurrencyParam(cc: CurrencyControls): string | undefined {
  const v = cc.reportCurrency.toUpperCase();
  return v && v !== cc.baseCurrency ? v : undefined;
}

export function openExport(slug: string, from?: string, to?: string) {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  window.open(`/api/reports/${slug}/export${suffix}`, "_blank");
}
