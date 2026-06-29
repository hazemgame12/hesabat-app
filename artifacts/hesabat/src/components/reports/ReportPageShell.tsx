/**
 * Reusable professional report page layout components.
 *
 * Usage:
 *   <ReportShell>
 *     <ReportHeader company={…} title={…} … />
 *     <ReportFilterRow>…inputs…</ReportFilterRow>
 *     {isLoading ? <ReportLoading /> : !data ? <ReportEmpty /> : <table …/>}
 *   </ReportShell>
 */

import React from "react";
import { useTranslation } from "react-i18next";
import type { Company } from "@workspace/api-client-react";
import { Building2, Download, Printer } from "lucide-react";

// ─── Print styles ────────────────────────────────────────────────────────────
// Hides the sidebar (fixed <aside>) and resets the main margin so the report
// takes up the full page width when the user prints / saves as PDF.
const PRINT_STYLES = `
  @media print {
    aside { display: none !important; }
    main  { margin-inline-start: 0 !important; }
    .no-print { display: none !important; }
    body { background: #fff !important; }
  }
`;

// ─── ReportShell ──────────────────────────────────────────────────────────────
/**
 * Outer page wrapper.  Injects global print styles and provides the subtle
 * slate background used on all report detail pages.
 */
export function ReportShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />
      <div className="min-h-screen bg-slate-50/80 dark:bg-slate-900/30 print:bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8 flex flex-col gap-5">
          {children}
        </div>
      </div>
    </>
  );
}

// ─── ReportHeader ─────────────────────────────────────────────────────────────
/**
 * Professional report header card.
 *
 * Left column: company logo / name / tax reg.
 * Right column: report title, date label, currency badges.
 * Bottom strip: active dimension-filter pills + generated-at + action buttons.
 */
export function ReportHeader({
  company,
  title,
  dateLabel,
  currency,
  baseCurrency,
  rateLabel,
  activeFilters = [],
  onBack,
  backLabel,
  actions,
}: {
  company?: Company;
  title: string;
  dateLabel: string;
  currency: string;
  baseCurrency: string;
  /** e.g. "1 USD = 30.00 EGP" — shown only when currencies differ */
  rateLabel?: string;
  activeFilters?: string[];
  onBack?: () => void;
  backLabel?: string;
  actions?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const generatedAt = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden no-print">
      {/* Accent stripe */}
      <div className="h-1.5 w-full bg-gradient-to-r from-primary/70 via-primary to-primary/50" />

      <div className="p-5 lg:p-6 flex flex-col gap-4">
        {/* Back button */}
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="self-start inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline focus:outline-none"
          >
            {/* Flip direction to start so it looks correct in RTL too */}
            <span className="inline-block rotate-0 rtl:rotate-180">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </span>
            {backLabel ?? t("reportsPage.detail.backToReportsCenter")}
          </button>
        )}

        {/* Two-column header: company left, report info right */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Company block */}
          <div className="flex items-start gap-3">
            {company?.logoUrl ? (
              <img
                src={company.logoUrl}
                alt=""
                className="h-14 w-14 shrink-0 rounded-2xl border border-border object-contain"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                <Building2 className="h-7 w-7 text-primary" />
              </div>
            )}
            <div>
              <p className="text-lg font-black text-foreground leading-tight">
                {company?.name ?? t("reportsPage.detail.companyFallback")}
              </p>
              {company?.tradeName && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {company.tradeName}
                </p>
              )}
              {company?.taxRegistrationNumber && (
                <p className="text-xs text-muted-foreground">
                  {company.taxRegistrationNumber}
                </p>
              )}
              {company?.address && (
                <p className="text-xs text-muted-foreground">{company.address}</p>
              )}
            </div>
          </div>

          {/* Report info block */}
          <div className="text-end">
            <h1 className="text-2xl font-black text-primary leading-tight">{title}</h1>
            <p className="mt-1 text-sm font-semibold text-foreground">{dateLabel}</p>
            <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
              <span className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-bold text-primary">
                {t("reportsPage.detail.reportCurrency")}: {currency}
              </span>
              {currency !== baseCurrency && (
                <span className="rounded-full bg-muted px-3 py-0.5 text-xs font-semibold text-muted-foreground">
                  {t("reportsPage.detail.baseCurrency")}: {baseCurrency}
                </span>
              )}
            </div>
            {rateLabel && (
              <p className="mt-1 text-xs text-muted-foreground">{rateLabel}</p>
            )}
          </div>
        </div>

        {/* Bottom strip: filter pills + generated date + action buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-2">
            {activeFilters.length > 0 ? (
              activeFilters.map((f, i) => (
                <span
                  key={i}
                  className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                >
                  {f}
                </span>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">
                {t("reportsPage.detail.noFilters")}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {t("reportsPage.trialBalance.preparedAt")}: {generatedAt}
            </span>
            {actions}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ReportFilterRow ──────────────────────────────────────────────────────────
/**
 * Filter panel card.  Wraps date inputs, currency selects, account pickers, etc.
 */
export function ReportFilterRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-border bg-card/90 shadow-sm no-print">
      <div className="flex flex-wrap items-end gap-4 p-4 lg:p-5">{children}</div>
    </div>
  );
}

// ─── ReportFilterField ─────────────────────────────────────────────────────────
/** Labelled wrapper for a single filter input. */
export function ReportFilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

// ─── ReportDateInput ──────────────────────────────────────────────────────────
export function ReportDateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <ReportFilterField label={label}>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </ReportFilterField>
  );
}

// ─── ReportActionButton ────────────────────────────────────────────────────────
export function ReportActionButton({
  onClick,
  icon,
  label,
}: {
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted"
    >
      {icon}
      {label}
    </button>
  );
}

// ─── ReportExcelButton ─────────────────────────────────────────────────────────
export function ReportExcelButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <ReportActionButton
      onClick={onClick}
      icon={<Download className="h-4 w-4" />}
      label={t("reportsPage.export.excel")}
    />
  );
}

// ─── ReportPdfButton ──────────────────────────────────────────────────────────
export function ReportPdfButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <ReportActionButton
      onClick={onClick}
      icon={<Printer className="h-4 w-4" />}
      label={t("reportsPage.export.pdf")}
    />
  );
}

// ─── ReportEmpty ──────────────────────────────────────────────────────────────
export function ReportEmpty({ message }: { message?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-border bg-card py-16 text-center">
      <div className="mb-3 rounded-2xl bg-muted p-4">
        <svg
          className="h-8 w-8 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </div>
      <p className="font-semibold text-muted-foreground">
        {message ?? t("reportsPage.noData")}
      </p>
    </div>
  );
}

// ─── ReportLoading ────────────────────────────────────────────────────────────
export function ReportLoading() {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-border bg-card py-16">
      <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-primary border-t-transparent" />
    </div>
  );
}

// ─── ReportTableCard ──────────────────────────────────────────────────────────
/**
 * Card wrapper for the main report table.
 * Handles overflow-x scrolling and forces LTR table direction so that
 * numeric columns always align correctly even in RTL mode.
 */
export function ReportTableCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto [direction:ltr]">{children}</div>
    </div>
  );
}

// ─── ReportSectionCard ─────────────────────────────────────────────────────────
/**
 * A grouped section card used in income-statement / balance-sheet layouts.
 * Shows a colored header bar with section title + total, then a table of rows.
 */
export function ReportSectionCard({
  title,
  total,
  totalLabel,
  fmt,
  accentClass = "bg-slate-100 dark:bg-slate-800",
  children,
}: {
  title: string;
  total: number;
  totalLabel: string;
  fmt: (n: number) => string;
  accentClass?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      {/* Section header */}
      <div
        className={`flex items-center justify-between px-5 py-3.5 ${accentClass} border-b border-border`}
      >
        <span className="font-bold text-sm tracking-wide text-foreground">{title}</span>
        <span className="font-black tabular-nums font-mono text-sm text-foreground">
          {fmt(total)}
        </span>
      </div>
      {/* Row table */}
      <div className="overflow-x-auto [direction:ltr]">
        <table className="w-full text-sm">{children}</table>
      </div>
      {/* Section footer */}
      <div className="flex items-center justify-between border-t border-border bg-muted/40 px-5 py-3 font-bold">
        <span className="text-muted-foreground">{totalLabel}</span>
        <span className="tabular-nums font-mono">{fmt(total)}</span>
      </div>
    </div>
  );
}

// ─── ReportNetCard ────────────────────────────────────────────────────────────
/**
 * Colored result card for net profit/loss or net cash flow.
 */
export function ReportNetCard({
  label,
  value,
  fmt,
  positive,
}: {
  label: string;
  value: number;
  fmt: (n: number) => string;
  positive: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-3xl border px-6 py-5 font-bold shadow-sm ${
        positive
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
          : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300"
      }`}
    >
      <span className="text-base">{label}</span>
      <span className="font-mono tabular-nums text-lg">{fmt(Math.abs(value))}</span>
    </div>
  );
}

// ─── ReportTotalCard ──────────────────────────────────────────────────────────
/** Simple total summary card (opening cash, closing cash, etc.) */
export function ReportTotalCard({
  label,
  value,
  fmt,
}: {
  label: string;
  value: number;
  fmt: (n: number) => string;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
      <span className="text-sm font-semibold text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums font-bold">{fmt(value)}</span>
    </div>
  );
}
