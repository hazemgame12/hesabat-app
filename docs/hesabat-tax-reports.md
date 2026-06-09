# Hesabat — Country-aware Tax Reports

Tax reports are tied to the **company's country** (`company.country`, set in Company
Profile). The catalog of which reports a company sees lives in `@workspace/locale`;
the figures are computed server-side and surfaced in the Reports Hub
("التقارير الضريبية" tab).

## Architecture

```
lib/locale/src/index.ts        → catalog: which reports exist per country
artifacts/api-server/.../reports-extra.ts → computations + routes + Excel export
lib/api-spec/openapi.yaml       → contract (paths + schemas) → Orval codegen
artifacts/hesabat/src/components/reports/TaxReports.tsx → UI (selector + period + Excel/PDF)
```

### 1. Catalog (`@workspace/locale`)

- `TaxReportDataset` — the compute backend a report maps to: `"vat" | "wht" | "payroll"`.
- `TaxReportDef` — `{ id, kind, dataset, nameAr, nameEn, descriptionAr?, descriptionEn?, formRefAr? }`.
  - `id` is the stable, country-scoped selector key (e.g. `eg-vat-form10`).
  - `formRefAr` is the official form reference shown to the user (e.g. `نموذج 10`).
- `TAX_REPORTS: Record<CountryCode, TaxReportDef[]>` — the per-country catalog.
- `taxReportsFor(country: string)` — safe lookup; falls back to Egypt for unknown codes.
- `EG_TAX_REPORTS` — Egypt's three official reports (fully mapped).
- `genericTaxReports(country)` — for non-EG countries that have a `vat`/`wht` tax
  template: emits a generic VAT-return entry (+ WHT where applicable). These are
  intentionally **not** mapped to an official form layout yet (`formRefAr` omitted).

### 2. Compute backends (`reports-extra.ts`)

All three datasets are computed from already-posted business data so the tax figures
**reconcile with the ledgers and invoice totals** (same posted-invoice status set the
receivables reports use: `approved`, `partially_paid`, `paid`).

| Dataset   | Source                                  | Grouping            |
| --------- | --------------------------------------- | ------------------- |
| `vat`     | invoice lines with a `kind:"vat"` tax   | per VAT band        |
| `wht`     | **purchase** invoice lines, `kind:"wht"`| per tax/rate        |
| `payroll` | payroll run lines                       | per pay period      |

Routes (each has a JSON endpoint + an `/export` Excel endpoint, both Zod-validated on
`from`/`to` and guarded by `requireCapability`):

- `GET /reports/vat` · `GET /reports/vat/export`
- `GET /reports/wht` · `GET /reports/wht/export`
- `GET /reports/payroll-tax` · `GET /reports/payroll-tax/export`

> **Gotcha — never use `= ANY(${jsArray})` in a drizzle `sql` template.** Drizzle inlines
> a JS array as a comma list, so Postgres receives `ANY(($1,$2,$3))` (a row, not an
> array) and throws *"op ANY/ALL (array) requires array on right side"*. Use
> `inArray(col, arr)` instead. (This bug originally affected `computeVatReport`.)

### 3. UI (`TaxReports.tsx`)

- Reads `company.country` → `taxReportsFor(country)` → report selector.
- Period: presets (month / quarter / year) + editable custom `from`/`to`.
- Picks the dataset hook by `selected.dataset` (all three hooks are mounted; only the
  active one is `enabled`). React-Query options must pass `queryKey` (use the generated
  `getGet<X>ReportQueryKey(params)` helper) alongside `enabled`.
- Excel: `window.open('/api/reports/<path>/export?from=&to=')`.
- PDF: print-window (`window.open("")` + `document.write`) with RTL HTML; all dynamic
  values are escaped via the local `esc()` before interpolation.
- VAT renders the **Form 10 official layout** (Output section, Input section, net
  payable/creditable). WHT and Payroll render a table + a regulatory note.

## Per-country report mapping

### Egypt (EG) — fully mapped to ETA official forms

| Report id          | Form        | Dataset   | What it shows                                                        |
| ------------------ | ----------- | --------- | ------------------------------------------------------------------- |
| `eg-vat-form10`    | نموذج 10    | `vat`     | VAT return: output tax (sales) − input tax (purchases) = net VAT.   |
| `eg-wht-form41`    | نموذج 41    | `wht`     | Withholding at source on purchases, grouped by category/rate.       |
| `eg-payroll-tax`   | كسب العمل   | `payroll` | Monthly payroll-tax / salary summary (employees, gross, deductions).|

Egyptian rules encoded in the UI notes:

- **VAT** standard rate 14%.
- **WHT (نموذج 41):** computed on the **net value excluding VAT**; applies only when the
  dealing with a single supplier exceeds **EGP 300**. Indicative rates: supplies &
  contracting 0.5–1%, services 3%, commissions/professional fees 5%.
- **Payroll tax (كسب العمل):** progressive brackets; remitted monthly. Shown here as a
  per-period summary, not a per-employee bracket calculation.

### GCC (SA, AE, KW, QA, BH, OM) — framework only (not yet officially mapped)

Countries whose locale tax template includes a `vat` (and/or `wht`) entry get generic
entries from `genericTaxReports()`:

- A generic **VAT return** (dataset `vat`) — e.g. KSA standard rate 15%, UAE 5%.
- A generic **withholding** report where the template defines a `wht` tax.

These deliberately omit `formRefAr` because the official return layouts
(ZATCA VAT, FTA VAT201, etc.) have not been mapped. To promote a country to "fully
mapped", add explicit `TaxReportDef`s (with `formRefAr` and the official box order) and,
if needed, a dedicated compute path, mirroring the Egypt implementation.

## Sources

- Egyptian Tax Authority (ETA) — VAT Form 10, Withholding Form 41, payroll/كسب العمل.
- Egyptian Income Tax Law withholding-at-source provisions (EGP 300 threshold; rate
  bands by activity nature).
- For future GCC mapping: ZATCA VAT return (KSA) and UAE FTA VAT201 box layouts.

## Extending

1. **New report for an existing fully-mapped country:** add a `TaxReportDef` to that
   country's array in `@workspace/locale`, pointing `dataset` at an existing compute
   path (or add a new one).
2. **New compute backend:** add a `computeXReport` + routes in `reports-extra.ts`, add
   the path/schemas to `openapi.yaml`, run
   `pnpm --filter @workspace/api-spec run codegen`, then render it in `TaxReports.tsx`
   by branching on the new `dataset`.
3. Always keep figures reconciling with the ledgers — compute from posted data, reuse
   `POSTED_INVOICE_STATUSES`.
