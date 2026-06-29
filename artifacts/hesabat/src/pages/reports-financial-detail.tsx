import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { ChevronRight, LayoutGrid } from "lucide-react";
import {
  useGetCompany,
  useListCurrencies,
  useListAccounts,
  type Account,
  type Currency,
} from "@workspace/api-client-react";
import { type CurrencyControls } from "./reports-utils";
import {
  TrialBalanceTab,
  IncomeStatementTab,
  BalanceSheetTab,
  GeneralLedgerTab,
  CashFlowTab,
} from "./reports";
import {
  DimensionFilters,
  type DimensionFilterQuery,
  type DimensionFilterValues,
} from "@/components/reports/DimensionFilters";

type ReportSlug =
  | "trial-balance"
  | "general-ledger"
  | "account-statement"
  | "income-statement"
  | "balance-sheet"
  | "cash-flow";

const TAB_MAP: Record<string, string> = {
  "trial-balance": "trialBalance",
  "general-ledger": "generalLedger",
  "account-statement": "generalLedger",
  "income-statement": "incomeStatement",
  "balance-sheet": "balanceSheet",
  "cash-flow": "cashFlow",
};

const TITLE_KEY_MAP: Record<string, string> = {
  "trial-balance": "reportsPage.tabs.trialBalance",
  "general-ledger": "reportsPage.tabs.generalLedger",
  "account-statement": "reportsPage.tabs.partyStatement",
  "income-statement": "reportsPage.tabs.incomeStatement",
  "balance-sheet": "reportsPage.tabs.balanceSheet",
  "cash-flow": "reportsPage.tabs.cashFlow",
};

export function ReportsFinancialDetail({ reportKey }: { reportKey?: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [, setLocation] = useLocation();

  const slug = (reportKey ?? "trial-balance") as ReportSlug;
  const tabKey = TAB_MAP[slug] ?? "trialBalance";
  const titleKey = TITLE_KEY_MAP[slug] ?? "reportsPage.tabs.trialBalance";
  const title = t(titleKey);

  const [dimensionFilters, setDimensionFilters] = useState<DimensionFilterValues>({
    costCenterId: "",
    projectId: "",
    branchId: "",
  });

  const [drillGL, setDrillGL] = useState<{
    accountId: string;
    from: string;
    to: string;
  } | null>(null);

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

  function drillToGL(accountId: string, from: string, to: string) {
    setDrillGL({ accountId, from, to });
    setLocation("/reports/financial/general-ledger");
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <nav className="flex items-center gap-2 mb-6 text-sm">
        <button
          type="button"
          onClick={() => setLocation("/reports/center")}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <LayoutGrid className="w-4 h-4" />
          {t("nav.reportsCenter")}
        </button>
        <ChevronRight className="w-4 h-4 text-muted-foreground rtl:rotate-180 shrink-0" />
        <span className="font-semibold text-foreground">{title}</span>
      </nav>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("financialReports.subtitle")}
        </p>
      </div>

      {tabKey !== "cashFlow" && (
        <DimensionFilters value={dimensionFilters} onChange={setDimensionFilters} />
      )}

      {tabKey === "trialBalance" && (
        <TrialBalanceTab
          fmt={fmt}
          lang={lang}
          cc={cc}
          onDrillAccount={drillToGL}
          dimensionFilters={dimensionQuery}
        />
      )}

      {tabKey === "incomeStatement" && (
        <IncomeStatementTab
          fmt={fmt}
          lang={lang}
          cc={cc}
          onDrillAccount={drillToGL}
          dimensionFilters={dimensionQuery}
        />
      )}

      {tabKey === "balanceSheet" && (
        <BalanceSheetTab
          fmt={fmt}
          lang={lang}
          cc={cc}
          onDrillAccount={drillToGL}
          dimensionFilters={dimensionQuery}
        />
      )}

      {tabKey === "generalLedger" && (
        <GeneralLedgerTab
          fmt={fmt}
          lang={lang}
          leafAccounts={leafAccounts}
          cc={cc}
          initialAccountId={drillGL?.accountId}
          initialFrom={drillGL?.from}
          initialTo={drillGL?.to}
          dimensionFilters={dimensionQuery}
        />
      )}

      {tabKey === "cashFlow" && (
        <CashFlowTab fmt={fmt} lang={lang} onDrillAccount={drillToGL} />
      )}
    </div>
  );
}
