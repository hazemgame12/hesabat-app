import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  useGetCompany,
  useListCurrencies,
  useListAccounts,
  type Account,
  type Currency,
} from "@workspace/api-client-react";
import {
  TrialBalanceTab,
  GeneralLedgerTab,
  IncomeStatementTab,
  BalanceSheetTab,
  CashFlowTab,
} from "@/pages/reports";
import {
  type CurrencyControls,
  reportCurrencyParam,
} from "@/pages/reports-utils";
import {
  DimensionFilters,
  type DimensionFilterQuery,
  type DimensionFilterValues,
} from "@/components/reports/DimensionFilters";
import { ArrowLeft, Printer } from "lucide-react";

const REPORT_KEYS = [
  "trial-balance",
  "general-ledger",
  "account-statement",
  "income-statement",
  "balance-sheet",
  "cash-flow",
] as const;

type FinancialReportKey = (typeof REPORT_KEYS)[number];

const REPORT_TITLE_KEY: Record<FinancialReportKey, string> = {
  "trial-balance": "reportsPage.tabs.trialBalance",
  "general-ledger": "reportsPage.tabs.generalLedger",
  "account-statement": "reportsPage.detail.accountStatementTitle",
  "income-statement": "reportsPage.tabs.incomeStatement",
  "balance-sheet": "reportsPage.tabs.balanceSheet",
  "cash-flow": "reportsPage.tabs.cashFlow",
};

function getReportKey(pathname: string): FinancialReportKey {
  const parts = pathname.split("/").filter(Boolean);
  const key = parts[parts.length - 1];
  return REPORT_KEYS.includes(key as FinancialReportKey)
    ? (key as FinancialReportKey)
    : "trial-balance";
}

export function ReportsFinancialDetail() {
  const { t, i18n } = useTranslation();
  const [location, setLocation] = useLocation();
  const lang = i18n.language;

  const reportKey = getReportKey(location.split("?")[0] || "");
  const [dimensionFilters, setDimensionFilters] = useState<DimensionFilterValues>({
    costCenterId: "",
    projectId: "",
    branchId: "",
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
  const [reportCurrency, setReportCurrency] = useState("");
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

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const activeFilters = [
    dimensionFilters.costCenterId
      ? t("reportsPage.detail.filterWithValue", {
          label: t("dimensionFilters.costCenter"),
          value: dimensionFilters.costCenterId,
        })
      : null,
    dimensionFilters.projectId
      ? t("reportsPage.detail.filterWithValue", {
          label: t("dimensionFilters.project"),
          value: dimensionFilters.projectId,
        })
      : null,
    dimensionFilters.branchId
      ? t("reportsPage.detail.filterWithValue", {
          label: t("dimensionFilters.branch"),
          value: dimensionFilters.branchId,
        })
      : null,
  ].filter(Boolean) as string[];

  const titleKey = REPORT_TITLE_KEY[reportKey];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-6 lg:p-8">
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setLocation("/reports/center")}
              className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("reportsPage.detail.backToReportsCenter")}
            </button>
            <div>
              <h1 className="text-2xl font-black text-foreground">{t(titleKey)}</h1>
              <p className="text-sm text-muted-foreground">
                {company?.name || t("reportsPage.detail.companyFallback")}
              </p>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                {t("reportsPage.detail.reportCurrency")}: {reportCurrencyParam(cc) || baseCurrency}
              </span>
              <span>
                {t("reportsPage.detail.baseCurrency")}: {baseCurrency}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {activeFilters.length
                ? activeFilters.join(" • ")
                : t("reportsPage.detail.noFilters")}
            </div>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted"
          >
            <Printer className="h-4 w-4" />
            {t("reportsPage.detail.printButton")}
          </button>
        </div>
      </section>

      <DimensionFilters value={dimensionFilters} onChange={setDimensionFilters} />

      {reportKey === "trial-balance" && (
        <TrialBalanceTab fmt={fmt} lang={lang} cc={cc} company={company} dimensionFilters={dimensionQuery} />
      )}
      {reportKey === "general-ledger" && (
        <GeneralLedgerTab fmt={fmt} lang={lang} leafAccounts={leafAccounts} cc={cc} dimensionFilters={dimensionQuery} />
      )}
      {reportKey === "account-statement" && (
        <GeneralLedgerTab fmt={fmt} lang={lang} leafAccounts={leafAccounts} cc={cc} dimensionFilters={dimensionQuery} />
      )}
      {reportKey === "income-statement" && (
        <IncomeStatementTab fmt={fmt} lang={lang} cc={cc} company={company} dimensionFilters={dimensionQuery} />
      )}
      {reportKey === "balance-sheet" && (
        <BalanceSheetTab fmt={fmt} lang={lang} cc={cc} company={company} dimensionFilters={dimensionQuery} />
      )}
      {reportKey === "cash-flow" && <CashFlowTab fmt={fmt} lang={lang} />}
    </div>
  );
}
