import type { TrialBalance, Currency } from "@workspace/api-client-react";

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

export function buildTrialBalancePdfHtml(
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
