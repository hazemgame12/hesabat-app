import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListBankAccounts,
  useCreateBankAccount,
  useUpdateBankAccount,
  useDeleteBankAccount,
  useGetCompany,
  useListCurrencies,
  useListBankMovements,
  useCreateBankMovement,
  useUpdateBankMovement,
  useDeleteBankMovement,
  useListBankReconciliations,
  useCreateBankReconciliation,
  useGetBankReconciliation,
  useDeleteBankReconciliation,
  useMatchBankReconciliation,
  autoMatchReconciliation,
  useAdjustBankReconciliation,
  useCompleteBankReconciliation,
  useListAccounts,
  useListCostCenters,
  useGetCurrentUser,
  getListBankAccountsQueryKey,
  getListBankMovementsQueryKey,
  getListBankReconciliationsQueryKey,
  getGetBankReconciliationQueryKey,
  getListJournalEntriesQueryKey,
  type BankAccount,
  type BankMovement,
  type BankReconciliation,
  type Account,
} from "@workspace/api-client-react";
import { hasCapability } from "@workspace/permissions";
import { useQueryClient } from "@tanstack/react-query";
import {
  Landmark,
  Plus,
  X,
  Trash2,
  Edit2,
  ArrowLeftRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  Upload,
  CheckCircle2,
  ChevronLeft,
  Download,
  Wand2,
  Clock,
  RotateCcw,
  Copy,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { ExcelToolbar } from "@/components/ExcelToolbar";
import { ImportWizard } from "@/components/import-wizard/ImportWizard";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GridTable, GridToggle, useGridView, type GridColumn } from "@/components/GridTable";

type AccountType = "bank" | "cash" | "credit_card" | "loan";
type MovementType =
  | "deposit"
  | "withdrawal"
  | "transfer"
  | "bank_charge"
  | "interest_income"
  | "interest_expense"
  | "customer_collection"
  | "supplier_payment"
  | "loan_installment"
  | "cash_expense";

const ACCOUNT_TYPES: AccountType[] = ["bank", "cash", "credit_card", "loan"];
const MOVEMENT_TYPES: MovementType[] = [
  "deposit",
  "customer_collection",
  "interest_income",
  "withdrawal",
  "supplier_payment",
  "loan_installment",
  "bank_charge",
  "interest_expense",
  "cash_expense",
  "transfer",
];
const ADJUSTMENT_TYPES = [
  "bank_charge",
  "interest_income",
  "interest_expense",
] as const;
const IN_TYPES = new Set<MovementType>([
  "deposit",
  "customer_collection",
  "interest_income",
]);

function displayName(
  e: { nameAr: string; nameEn?: string | null },
  lang: string,
): string {
  return lang.startsWith("en") && e.nameEn ? e.nameEn : e.nameAr;
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function Bank() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [tab, setTab] = useState<"accounts" | "movements" | "reconciliation">(
    "accounts",
  );

  const { data: accounts = [], isLoading: accountsLoading } =
    useListBankAccounts();
  const { data: chartAccounts = [] } = useListAccounts();
  const leafAccounts = useMemo(
    () => chartAccounts.filter((a: Account) => !a.isGroup),
    [chartAccounts],
  );
  const cashLeafAccounts = useMemo(() => {
    // Find group accounts that represent "cash & cash equivalents"
    // by matching Arabic name (نقدية) or English name (cash), excluding
    // non-cash groups like "Petty Cash Advance" (leaf) or "Advances & Custody"
    const cashGroupCodes = chartAccounts
      .filter((a: Account) => {
        if (!a.isGroup) return false;
        const ar = a.nameAr ?? "";
        const en = (a.nameEn ?? "").toLowerCase();
        return (
          ar.includes("نقدية") ||
          (en.includes("cash") && !en.includes("advance") && !en.includes("custody") && !en.includes("petty"))
        );
      })
      .map((a: Account) => a.code);

    if (cashGroupCodes.length === 0) {
      // Fallback: all leaf asset accounts (old behavior)
      return chartAccounts.filter((a: Account) => !a.isGroup && a.type === "asset");
    }

    // Show only leaf accounts whose code starts with a cash group code
    return chartAccounts.filter((a: Account) =>
      !a.isGroup && cashGroupCodes.some((prefix: string) => a.code.startsWith(prefix))
    );
  }, [chartAccounts]);

  const { data: user } = useGetCurrentUser();
  const role = user?.role ?? "";
  const canCreate = hasCapability(role, "bank:create");
  const canUpdate = hasCapability(role, "bank:update");
  const canDelete = hasCapability(role, "bank:delete");

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(n);
  const accountLabel = (a: Account) => `${a.code} · ${displayName(a, lang)}`;

  const createAccount = useCreateBankAccount();
  const updateAccount = useUpdateBankAccount();
  const deleteAccount = useDeleteBankAccount();

  const linkedChartAccountIds = useMemo(
    () => new Set(accounts.map((a) => a.accountId).filter(Boolean)),
    [accounts],
  );
  const unlinkedCashAccounts = useMemo(
    () => cashLeafAccounts.filter((a) => !linkedChartAccountIds.has(a.id)),
    [cashLeafAccounts, linkedChartAccountIds],
  );

  const [accountModal, setAccountModal] = useState<{
    mode: "create" | "edit";
    account: BankAccount | null;
    preselectedAccountId?: string;
  } | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<BankAccount | null>(
    null,
  );

  const invalidateAccounts = () =>
    queryClient.invalidateQueries({ queryKey: getListBankAccountsQueryKey() });

  const handleDeleteAccount = () => {
    if (!accountToDelete) return;
    deleteAccount.mutate(
      { id: accountToDelete.id },
      {
        onSuccess: () => {
          invalidateAccounts();
          toast({ title: t("bank.toast.accountDeleted") });
          setAccountToDelete(null);
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: t("bank.toast.error"),
            description: err?.data?.error,
          });
          setAccountToDelete(null);
        },
      },
    );
  };

  const typeBadge = (type: string) => (
    <span className="inline-flex items-center text-[11px] font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
      {t(`bank.types.${type}`)}
    </span>
  );

  return (
    <div className="flex flex-col">
      <header className="h-20 bg-background/80 backdrop-blur-md border-b flex items-center justify-between px-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-card border shadow-sm flex items-center justify-center text-primary">
            <Landmark className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">
              {t("bank.title")}
            </h1>
            <p className="text-sm text-muted-foreground font-medium">
              {t("bank.subtitle")}
            </p>
          </div>
        </div>
        {tab === "accounts" && canCreate && (
          <button
            onClick={() => setAccountModal({ mode: "create", account: null })}
            className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            {t("bank.addAccount")}
          </button>
        )}
      </header>

      <div className="px-8 pt-6">
        <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-full w-fit">
          {(["accounts", "movements", "reconciliation"] as const).map((tk) => (
            <button
              key={tk}
              onClick={() => setTab(tk)}
              className={`px-5 py-2 rounded-full text-sm font-bold transition-colors ${
                tab === tk
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(`bank.tabs.${tk}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="p-8 flex flex-col gap-6 max-w-6xl mx-auto w-full">
        {tab === "accounts" && (
          <AccountsTable
            accounts={accounts}
            unlinkedCashAccounts={unlinkedCashAccounts}
            loading={accountsLoading}
            fmt={fmt}
            lang={lang}
            t={t}
            typeBadge={typeBadge}
            canCreate={canCreate}
            canUpdate={canUpdate}
            canDelete={canDelete}
            onCreate={() =>
              setAccountModal({ mode: "create", account: null })
            }
            onEdit={(a) => setAccountModal({ mode: "edit", account: a })}
            onDelete={(a) => setAccountToDelete(a)}
            onQuickAdd={(chartAccount) =>
              setAccountModal({
                mode: "create",
                account: null,
                preselectedAccountId: chartAccount.id,
              })
            }
          />
        )}
        {tab === "movements" && (
          <MovementsTab
            accounts={accounts}
            leafAccounts={leafAccounts}
            fmt={fmt}
            lang={lang}
            t={t}
            accountLabel={accountLabel}
            canCreate={canCreate}
            canUpdate={canUpdate}
            canDelete={canDelete}
          />
        )}
        {tab === "reconciliation" && (
          <ReconciliationTab
            accounts={accounts}
            leafAccounts={leafAccounts}
            fmt={fmt}
            lang={lang}
            t={t}
            accountLabel={accountLabel}
            canCreate={canCreate}
            canUpdate={canUpdate}
            canDelete={canDelete}
          />
        )}
      </div>

      {accountModal && (
        <AccountModal
          mode={accountModal.mode}
          account={accountModal.account}
          preselectedAccountId={accountModal.preselectedAccountId}
          leafAccounts={cashLeafAccounts}
          accountLabel={accountLabel}
          t={t}
          onClose={() => setAccountModal(null)}
          onSaved={() => {
            invalidateAccounts();
            setAccountModal(null);
          }}
          createAccount={createAccount}
          updateAccount={updateAccount}
        />
      )}

      <AlertDialog
        open={!!accountToDelete}
        onOpenChange={(o) => !o && setAccountToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("bank.account.editTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("bank.confirmDeleteAccount")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Accounts table
// ---------------------------------------------------------------------------
function AccountsTable({
  accounts,
  unlinkedCashAccounts,
  loading,
  fmt,
  lang,
  t,
  typeBadge,
  canCreate,
  canUpdate,
  canDelete,
  onCreate,
  onEdit,
  onDelete,
  onQuickAdd,
}: {
  accounts: BankAccount[];
  unlinkedCashAccounts: Account[];
  loading: boolean;
  fmt: (n: number) => string;
  lang: string;
  t: (k: string, o?: any) => string;
  typeBadge: (type: string) => React.ReactNode;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onCreate: () => void;
  onEdit: (a: BankAccount) => void;
  onDelete: (a: BankAccount) => void;
  onQuickAdd: (chartAccount: Account) => void;
}) {
  return (
    <div className="bg-card border rounded-2xl shadow-sm overflow-hidden min-h-[300px]">
      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Spinner className="w-8 h-8 text-primary" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-2 text-center">
          <p className="font-bold text-foreground">{t("bank.noAccounts")}</p>
          <p className="text-sm max-w-md">{t("bank.noAccountsHint")}</p>
          {canCreate && (
            <button
              onClick={onCreate}
              className="mt-2 text-primary font-bold hover:underline"
            >
              {t("bank.addFirst")}
            </button>
          )}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
              <th className="text-start px-6 py-3">{t("bank.table.name")}</th>
              <th className="text-start px-3 py-3">{t("bank.table.type")}</th>
              <th className="text-start px-3 py-3">{t("bank.table.bank")}</th>
              <th className="text-start px-3 py-3">
                {t("bank.table.currency")}
              </th>
              <th className="text-end px-3 py-3">{t("bank.table.balance")}</th>
              <th className="text-end px-3 py-3">
                {t("bank.table.statementBalance")}
              </th>
              <th className="text-end px-3 py-3">
                {t("bank.table.difference")}
              </th>
              <th className="text-center px-3 py-3">{t("bank.table.status")}</th>
              {(canUpdate || canDelete) && <th className="w-20 px-6 py-3" />}
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr
                key={a.id}
                className="group border-t hover:bg-muted/40 transition-colors"
              >
                <td className="px-6 py-3.5">
                  <div className="font-medium text-foreground">
                    {displayName(a, lang)}
                  </div>
                  {a.accountCode && (
                    <div className="text-xs text-muted-foreground" dir="ltr">
                      {a.accountCode} · {a.accountName}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3.5">{typeBadge(a.type)}</td>
                <td className="px-3 py-3.5 text-foreground/80">
                  {a.bankName || "—"}
                  {a.accountNumber && (
                    <div className="text-xs text-muted-foreground" dir="ltr">
                      {a.accountNumber}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3.5 text-foreground/80" dir="ltr">
                  {a.currency}
                </td>
                <td
                  className="px-3 py-3.5 text-end font-bold font-sans tabular-nums text-foreground"
                  dir="ltr"
                >
                  {fmt(a.currentBalance)}
                </td>
                <td
                  className="px-3 py-3.5 text-end font-sans tabular-nums text-foreground/80"
                  dir="ltr"
                >
                  {a.latestStatementBalance == null
                    ? "—"
                    : fmt(a.latestStatementBalance)}
                </td>
                <td className="px-3 py-3.5 text-end" dir="ltr">
                  {a.latestDifference == null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : Math.abs(a.latestDifference) < 0.005 ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-success bg-success/10 px-2.5 py-1 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {t("bank.table.balanced")}
                    </span>
                  ) : (
                    <span className="font-bold font-sans tabular-nums text-destructive">
                      {fmt(a.latestDifference)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-3.5 text-center">
                  {a.isActive ? (
                    <span className="text-[11px] font-bold text-success bg-success/10 px-2.5 py-1 rounded-full">
                      {t("bank.active")}
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                      {t("bank.inactive")}
                    </span>
                  )}
                </td>
                {(canUpdate || canDelete) && (
                  <td className="px-6 py-3.5">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 justify-end">
                      {canUpdate && (
                        <button
                          onClick={() => onEdit(a)}
                          className="p-1.5 rounded-md hover:bg-primary/10 text-primary transition-colors"
                          title={t("common.edit")}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => onDelete(a)}
                          className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive transition-colors"
                          title={t("common.delete")}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!loading && unlinkedCashAccounts.length > 0 && (
        <div className="border-t">
          <div className="px-6 py-3 bg-muted/30 flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
              {t("bank.unlinkedAccounts")}
            </span>
            <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              {unlinkedCashAccounts.length}
            </span>
          </div>
          <div className="divide-y">
            {unlinkedCashAccounts.map((ca) => (
              <div
                key={ca.id}
                className="flex items-center justify-between px-6 py-3 hover:bg-muted/20 transition-colors"
              >
                <div>
                  <span className="text-sm font-medium text-foreground">
                    {displayName(ca, lang)}
                  </span>
                  <span className="text-xs text-muted-foreground ms-2 font-mono">
                    {ca.code}
                  </span>
                </div>
                {canCreate && (
                  <button
                    onClick={() => onQuickAdd(ca)}
                    className="flex items-center gap-1.5 text-xs font-bold text-primary hover:bg-primary/10 px-3 py-1.5 rounded-full transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t("bank.registerAccount")}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Account create/edit modal
// ---------------------------------------------------------------------------
function AccountModal({
  mode,
  account,
  preselectedAccountId,
  leafAccounts,
  accountLabel,
  t,
  onClose,
  onSaved,
  createAccount,
  updateAccount,
}: {
  mode: "create" | "edit";
  account: BankAccount | null;
  preselectedAccountId?: string;
  leafAccounts: Account[];
  accountLabel: (a: Account) => string;
  t: (k: string, o?: any) => string;
  onClose: () => void;
  onSaved: () => void;
  createAccount: ReturnType<typeof useCreateBankAccount>;
  updateAccount: ReturnType<typeof useUpdateBankAccount>;
}) {
  const { toast } = useToast();
  const { data: company } = useGetCompany();
  const baseCurrency = company?.baseCurrency ?? "EGP";
  const { data: currencies = [] } = useListCurrencies();
  const currencyCodes = useMemo(() => {
    const codes = [baseCurrency];
    for (const c of currencies) {
      if (c.isActive && c.code !== baseCurrency) codes.push(c.code);
    }
    return codes;
  }, [currencies, baseCurrency]);
  const [nameAr, setNameAr] = useState(account?.nameAr ?? "");
  const [nameEn, setNameEn] = useState(account?.nameEn ?? "");
  const [type, setType] = useState<AccountType>(
    (account?.type as AccountType) ?? "bank",
  );
  const [bankName, setBankName] = useState(account?.bankName ?? "");
  const [accountNumber, setAccountNumber] = useState(
    account?.accountNumber ?? "",
  );
  const [currency, setCurrency] = useState(account?.currency ?? baseCurrency);
  const [openingBalance, setOpeningBalance] = useState(
    account ? String(account.openingBalance) : "0",
  );
  const [openingBalanceDate, setOpeningBalanceDate] = useState(
    account?.openingBalanceDate ?? "",
  );
  const [accountId, setAccountId] = useState(preselectedAccountId ?? account?.accountId ?? "");
  const [isActive, setIsActive] = useState(account?.isActive ?? true);

  const submit = () => {
    if (!nameAr.trim()) {
      toast({ variant: "destructive", title: t("bank.account.nameAr") });
      return;
    }
    if (!accountId) {
      toast({ variant: "destructive", title: t("bank.account.linkedAccount") });
      return;
    }
    const data = {
      nameAr: nameAr.trim(),
      nameEn: nameEn.trim() || null,
      type,
      bankName: bankName.trim() || null,
      accountNumber: accountNumber.trim() || null,
      currency: currency.trim().toUpperCase() || baseCurrency,
      openingBalance: Number(openingBalance) || 0,
      openingBalanceDate: openingBalanceDate || null,
      accountId,
      isActive,
    };
    const onError = (err: any) =>
      toast({
        variant: "destructive",
        title: t("bank.toast.error"),
        description: err?.data?.error,
      });
    if (mode === "create") {
      createAccount.mutate(
        { data },
        {
          onSuccess: () => {
            toast({ title: t("bank.toast.accountAdded") });
            onSaved();
          },
          onError,
        },
      );
    } else if (account) {
      updateAccount.mutate(
        { id: account.id, data },
        {
          onSuccess: () => {
            toast({ title: t("bank.toast.accountEdited") });
            onSaved();
          },
          onError,
        },
      );
    }
  };

  const inputCls =
    "w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";
  const labelCls = "text-xs font-bold text-muted-foreground mb-1 block";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-card">
          <h2 className="font-bold text-foreground">
            {mode === "create"
              ? t("bank.account.createTitle")
              : t("bank.account.editTitle")}
          </h2>
          <button onClick={onClose} className="text-muted-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>{t("bank.account.nameAr")} *</label>
            <input
              className={inputCls}
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>{t("bank.account.nameEn")}</label>
            <input
              className={inputCls}
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              dir="ltr"
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>{t("bank.account.type")}</label>
            <select
              className={inputCls}
              value={type}
              onChange={(e) => setType(e.target.value as AccountType)}
            >
              {ACCOUNT_TYPES.map((tp) => (
                <option key={tp} value={tp}>
                  {t(`bank.types.${tp}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>{t("bank.account.currency")}</label>
            <select
              className={inputCls}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              dir="ltr"
            >
              {currencyCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>{t("bank.account.bankName")}</label>
            <input
              className={inputCls}
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>
              {t("bank.account.accountNumber")}
            </label>
            <input
              className={inputCls}
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              dir="ltr"
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>
              {t("bank.account.openingBalance")}
            </label>
            <input
              type="number"
              step="0.01"
              className={inputCls}
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              dir="ltr"
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>
              {t("bank.account.openingBalanceDate")}
            </label>
            <input
              type="date"
              className={inputCls}
              value={openingBalanceDate}
              onChange={(e) => setOpeningBalanceDate(e.target.value)}
              dir="ltr"
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>
              {t("bank.account.linkedAccount")} *
            </label>
            <select
              className={inputCls}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">—</option>
              {leafAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {accountLabel(a)}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input
              id="bank-active"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="bank-active" className="text-sm font-medium">
              {t("bank.account.isActive")}
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t sticky bottom-0 bg-card">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full text-sm font-bold text-muted-foreground hover:bg-muted"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={submit}
            disabled={createAccount.isPending || updateAccount.isPending}
            className="px-5 py-2 rounded-full text-sm font-bold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Movements tab
// ---------------------------------------------------------------------------
function MovementsTab({
  accounts,
  leafAccounts,
  fmt,
  lang,
  t,
  accountLabel,
  canCreate,
  canUpdate,
  canDelete,
}: {
  accounts: BankAccount[];
  leafAccounts: Account[];
  fmt: (n: number) => string;
  lang: string;
  t: (k: string, o?: any) => string;
  accountLabel: (a: Account) => string;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string>(accounts[0]?.id ?? "");
  const effectiveId = selectedId || accounts[0]?.id || "";
  const { data: movements = [], isLoading } = useListBankMovements(
    { bankAccountId: effectiveId },
    {
      query: {
        enabled: !!effectiveId,
        queryKey: getListBankMovementsQueryKey({
          bankAccountId: effectiveId,
        }),
      },
    },
  );
  const createMovement = useCreateBankMovement();
  const updateMovement = useUpdateBankMovement();
  const deleteMovement = useDeleteBankMovement();
  const [modalOpen, setModalOpen] = useState(false);
  const [toClassify, setToClassify] = useState<BankMovement | null>(null);
  const [toDelete, setToDelete] = useState<BankMovement | null>(null);
  const [inlineClassify, setInlineClassify] = useState<
    Record<string, { counterpartAccountId: string; costCenterId: string; description: string }>
  >({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bankImportOpen, setBankImportOpen] = useState(false);
  const [isGridView, toggleGridView] = useGridView("bank-movements");

  const { data: costCenters = [] } = useListCostCenters();

  const movementGridColumns = useMemo<GridColumn<BankMovement>[]>(() => [
    { key: "date", header: t("bank.movementsTable.date"), type: "readonly" },
    {
      key: "type", header: t("bank.movementsTable.type"), type: "readonly",
      render: (v, row) => (
        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
          row.direction === "in" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
        }`}>
          {row.direction === "in" ? <ArrowDownToLine className="w-3 h-3" /> : <ArrowUpFromLine className="w-3 h-3" />}
          {t(`bank.movementTypes.${v}`)}
        </span>
      ),
    },
    { key: "notes", header: t("bank.movementsTable.statementDescription"), type: "readonly" },
    {
      key: "amount", header: t("bank.movementsTable.amount"), type: "readonly", align: "end",
      render: (v, row) => (
        <span className={`font-bold font-sans tabular-nums ${row.direction === "in" ? "text-success" : "text-destructive"}`} dir="ltr">
          {row.direction === "in" ? "+" : "−"}{fmt(Number(v ?? 0))} {row.currency}
        </span>
      ),
    },
    { key: "counterpartAccountName", header: t("bank.movementsTable.counterpart"), type: "readonly" },
    { key: "costCenterName", header: t("bank.movementsTable.costCenter"), type: "readonly" },
    { key: "description", header: t("bank.movementsTable.journalDescription"), type: "readonly" },
    {
      key: "status", header: t("bank.movementsTable.status"), type: "readonly", align: "center",
      render: (v) => v === "pending" ? (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
          <Clock className="w-3 h-3" />{t("bank.movementsTable.pending")}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-success/10 text-success">
          <CheckCircle2 className="w-3 h-3" />{t("bank.movementsTable.posted")}
        </span>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, fmt]);

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: getListBankMovementsQueryKey({ bankAccountId: effectiveId }),
    });
    queryClient.invalidateQueries({ queryKey: getListBankAccountsQueryKey() });
    queryClient.invalidateQueries({
      queryKey: getListJournalEntriesQueryKey(),
    });
  };

  const handleDelete = () => {
    if (!toDelete) return;
    deleteMovement.mutate(
      { id: toDelete.id },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: t("bank.toast.movementDeleted") });
          setToDelete(null);
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: t("bank.toast.error"),
            description: err?.data?.error,
          });
          setToDelete(null);
        },
      },
    );
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      const resp = await fetch("/api/bank/movements", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        toast({ variant: "destructive", title: t("bank.toast.error"), description: data?.error });
        return;
      }
      const { deleted, skipped } = data as { deleted: number; skipped: number };
      if (skipped > 0) {
        toast({ title: t("bank.bulkDelete.bulkDeletePartial", { deleted, skipped }) });
      } else {
        toast({ title: t("bank.bulkDelete.bulkDeleted", { count: deleted }) });
      }
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      invalidate();
    } catch {
      toast({ variant: "destructive", title: t("bank.toast.error") });
    } finally {
      setBulkDeleting(false);
    }
  };

  if (accounts.length === 0) {
    return (
      <div className="bg-card border rounded-2xl shadow-sm p-12 text-center text-muted-foreground">
        <p className="font-bold text-foreground">{t("bank.noAccounts")}</p>
        <p className="text-sm mt-1">{t("bank.noAccountsHint")}</p>
      </div>
    );
  }

  return (
    <>
      {bankImportOpen && effectiveId && (
        <ImportWizard
          moduleType="bank-statement"
          extraContext={{ bankAccountId: effectiveId }}
          onClose={() => setBankImportOpen(false)}
          onSuccess={() => {
            invalidate();
            setBankImportOpen(false);
          }}
        />
      )}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-muted-foreground">
            {t("bank.selectAccount")}
          </span>
          <select
            className="px-3 py-2 rounded-lg border bg-background text-sm font-medium"
            value={effectiveId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {displayName(a, lang)} ({a.currency})
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          {effectiveId && (
            <>
              <ExcelToolbar
                exportPath={`/api/bank/movements/export?bankAccountId=${effectiveId}`}
              />
              {canCreate && (
                <button
                  onClick={() => setBankImportOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 rounded-full text-sm font-semibold border border-primary/40 text-primary bg-primary/5 hover:bg-primary/10 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  {t("importWizard.openButton")}
                </button>
              )}
            </>
          )}
          {canCreate && (
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90"
            >
              <ArrowLeftRight className="w-4 h-4" />
              {t("bank.recordMovement")}
            </button>
          )}
          <GridToggle isGrid={isGridView} onToggle={toggleGridView} />
        </div>
      </div>

      {canCreate && (
        <p className="text-xs text-muted-foreground -mt-2">
          {t("bank.importHint")}
        </p>
      )}

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm flex-wrap">
          <span className="font-bold text-slate-700">
            {t("bank.bulkDelete.selected", { count: selectedIds.size })}
          </span>
          {/* Copy selected rows */}
          <button
            onClick={() => {
              const selected = movements.filter((m) => selectedIds.has(m.id));
              const headers = ["التاريخ", "النوع", "الوصف", "المبلغ", "العملة", "الحالة"].join("\t");
              const rows = selected.map((m) =>
                [m.date, m.type, m.notes ?? "", m.amount, m.currency, m.status].join("\t")
              ).join("\n");
              const text = headers + "\n" + rows;
              const copy = async () => {
                try { await navigator.clipboard.writeText(text); }
                catch {
                  const ta = document.createElement("textarea");
                  ta.value = text; ta.style.cssText = "position:fixed;opacity:0;top:0;left:0;width:1px;height:1px";
                  document.body.appendChild(ta); ta.focus(); ta.select();
                  document.execCommand("copy"); document.body.removeChild(ta);
                }
              };
              void copy().then(() => toast({ title: `تم نسخ ${selected.length} حركة` }));
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-medium hover:bg-slate-100 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            {t("bank.bulkCopy", "نسخ")}
          </button>
          {/* Void: for posted movements */}
          {Array.from(selectedIds).some((id) => movements.find((m) => m.id === id)?.status === "posted") && (
            <button
              onClick={() => setBulkDeleteOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-bold hover:bg-orange-600 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t("bank.bulkVoid", "فك الترحيل")}
            </button>
          )}
          {/* Delete: for pending/deletable movements */}
          {canDelete && Array.from(selectedIds).some((id) => {
            const m = movements.find((mv) => mv.id === id);
            return m && !m.isCleared && !m.reconciliationId && m.type !== "transfer";
          }) && (
            <button
              onClick={() => setBulkDeleteOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-bold hover:opacity-90 transition-opacity"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t("bank.bulkDelete.deleteSelected")}
            </button>
          )}
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors ms-auto"
          >
            {t("bank.bulkDelete.cancel")}
          </button>
        </div>
      )}

      <div className="bg-card border rounded-2xl shadow-sm overflow-hidden min-h-[280px]">
        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <Spinner className="w-8 h-8 text-primary" />
          </div>
        ) : movements.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-2 text-center">
            <p className="font-bold text-foreground">{t("bank.noMovements")}</p>
            <p className="text-sm">{t("bank.noMovementsHint")}</p>
          </div>
        ) : isGridView ? (
          <GridTable
            rows={movements}
            columns={movementGridColumns}
            canEdit={false}
            canDelete={false}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            emptyMessage={t("bank.noMovements")}
            rowClassName={(row) =>
              row.status === "pending" ? "bg-amber-50/30 dark:bg-amber-500/5" : ""
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead>
                <tr className="text-xs font-bold text-muted-foreground bg-muted/50 border-b">
                  {canDelete && (
                    <th className="px-3 py-2.5 w-10">
                      {(() => {
                        const deletable = movements.filter(
                          (m) => !m.isCleared && !m.reconciliationId && m.type !== "transfer",
                        );
                        const allSelected =
                          deletable.length > 0 &&
                          deletable.every((m) => selectedIds.has(m.id));
                        const someSelected =
                          !allSelected && deletable.some((m) => selectedIds.has(m.id));
                        return (
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={(el) => { if (el) el.indeterminate = someSelected; }}
                            onChange={() => {
                              if (allSelected) {
                                setSelectedIds(new Set());
                              } else {
                                setSelectedIds(new Set(deletable.map((m) => m.id)));
                              }
                            }}
                            className="rounded border-border w-3.5 h-3.5 cursor-pointer"
                            title={allSelected ? t("bank.bulkDelete.cancel") : t("bank.bulkDelete.deleteSelected")}
                          />
                        );
                      })()}
                    </th>
                  )}
                  <th className="text-start px-4 py-2.5 w-28">
                    {t("bank.movementsTable.date")}
                  </th>
                  <th className="text-start px-3 py-2.5 w-24">
                    {t("bank.movementsTable.type")}
                  </th>
                  <th className="text-start px-3 py-2.5 w-44">
                    {t("bank.movementsTable.statementDescription")}
                  </th>
                  <th className="text-end px-3 py-2.5 w-32">
                    {t("bank.movementsTable.amount")}
                  </th>
                  <th className="text-end px-3 py-2.5 w-32">
                    {t("bank.movementsTable.balance")}
                  </th>
                  <th className="text-start px-3 py-2.5 w-56">
                    {t("bank.movementsTable.counterpart")}
                  </th>
                  <th className="text-start px-3 py-2.5 w-40">
                    {t("bank.movementsTable.costCenter")}
                  </th>
                  <th className="text-start px-3 py-2.5 w-48">
                    {t("bank.movementsTable.journalDescription")}
                  </th>
                  <th className="text-center px-3 py-2.5 w-24">
                    {t("bank.movementsTable.status")}
                  </th>
                  <th className="text-center px-4 py-2.5 w-20">
                    {t("bank.movementsTable.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let running = 0;
                  const sorted = [...movements].sort(
                    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
                  );
                  const balances = new Map<string, number>();
                  for (const m of sorted) {
                    running += m.direction === "in" ? m.amount : -m.amount;
                    balances.set(m.id, running);
                  }
                  return movements.map((m) => {
                    const bal = balances.get(m.id) ?? 0;
                    const inline = inlineClassify[m.id];
                    const isPending = m.status === "pending";
                    const isDeletable =
                      !m.isCleared && !m.reconciliationId && m.type !== "transfer";
                    return (
                      <tr
                        key={m.id}
                        className={`group border-b border-border/50 hover:bg-muted/30 transition-colors ${selectedIds.has(m.id) ? "bg-destructive/5" : ""}`}
                      >
                        {/* Checkbox */}
                        {canDelete && (
                          <td className="px-3 py-2">
                            {isDeletable && (
                              <input
                                type="checkbox"
                                checked={selectedIds.has(m.id)}
                                onChange={() => {
                                  setSelectedIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(m.id)) next.delete(m.id);
                                    else next.add(m.id);
                                    return next;
                                  });
                                }}
                                className="rounded border-border w-3.5 h-3.5 cursor-pointer"
                              />
                            )}
                          </td>
                        )}
                        {/* Date */}
                        <td className="px-4 py-2 tabular-nums text-foreground/80" dir="ltr">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <rect x="3" y="4" width="18" height="18" rx="2" />
                                <path d="M16 2v4M8 2v4M3 10h18" />
                              </svg>
                            </span>
                            {m.date}
                          </div>
                        </td>

                        {/* Type */}
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                              m.direction === "in"
                                ? "bg-success/10 text-success"
                                : "bg-destructive/10 text-destructive"
                            }`}
                          >
                            {m.direction === "in" ? (
                              <ArrowDownToLine className="w-3 h-3" />
                            ) : (
                              <ArrowUpFromLine className="w-3 h-3" />
                            )}
                            {t(`bank.movementTypes.${m.type}`)}
                          </span>
                        </td>

                        {/* Statement Description */}
                        <td className="px-3 py-2 text-foreground/80">
                          <div className="text-xs leading-snug">
                            {m.notes || m.description || (
                              <span className="text-muted-foreground/50 italic">—</span>
                            )}
                          </div>
                        </td>

                        {/* Amount */}
                        <td
                          className={`px-3 py-2 text-end font-bold font-sans tabular-nums ${
                            m.direction === "in" ? "text-success" : "text-destructive"
                          }`}
                          dir="ltr"
                        >
                          {m.direction === "in" ? "+" : "−"}
                          {fmt(m.amount)} {m.currency}
                        </td>

                        {/* Balance */}
                        <td
                          className="px-3 py-2 text-end font-sans tabular-nums text-foreground/70"
                          dir="ltr"
                        >
                          {fmt(bal)} {m.currency}
                        </td>

                        {/* Counterpart Account */}
                        <td className="px-3 py-2">
                          {isPending ? (
                            <select
                              className="w-full text-xs px-2 py-1.5 rounded-md border border-border/70 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                              value={inline?.counterpartAccountId ?? m.counterpartAccountId ?? ""}
                              onChange={(e) =>
                                setInlineClassify((prev) => ({
                                  ...prev,
                                  [m.id]: {
                                    counterpartAccountId: e.target.value,
                                    costCenterId: prev[m.id]?.costCenterId ?? m.costCenterId ?? "",
                                    description: prev[m.id]?.description ?? m.description ?? "",
                                  },
                                }))
                              }
                            >
                              <option value="">{t("bank.movementsTable.selectCounterpart")}</option>
                              {leafAccounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {accountLabel(a)}
                                </option>
                              ))}
                            </select>
                          ) : m.type === "transfer" ? (
                            <span className="text-xs text-foreground/70">
                              {m.transferAccountName ?? "—"}
                            </span>
                          ) : (
                            <span className="text-xs text-foreground/70">
                              {m.counterpartAccountName ?? "—"}
                            </span>
                          )}
                        </td>

                        {/* Cost Center */}
                        <td className="px-3 py-2">
                          {isPending ? (
                            <select
                              className="w-full text-xs px-2 py-1.5 rounded-md border border-border/70 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                              value={inline?.costCenterId ?? m.costCenterId ?? ""}
                              onChange={(e) =>
                                setInlineClassify((prev) => ({
                                  ...prev,
                                  [m.id]: {
                                    counterpartAccountId:
                                      prev[m.id]?.counterpartAccountId ?? m.counterpartAccountId ?? "",
                                    costCenterId: e.target.value,
                                    description: prev[m.id]?.description ?? m.description ?? "",
                                  },
                                }))
                              }
                            >
                              <option value="">{t("bank.movementsTable.selectCostCenter")}</option>
                              {costCenters.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.nameAr}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {m.costCenterName ?? "—"}
                            </span>
                          )}
                        </td>

                        {/* Journal Description */}
                        <td className="px-3 py-2">
                          {isPending ? (
                            <input
                              type="text"
                              className="w-full text-xs px-2 py-1.5 rounded-md border border-border/70 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                              placeholder={m.notes || t("bank.classify.descriptionPlaceholder")}
                              value={inline?.description ?? m.description ?? ""}
                              onChange={(e) =>
                                setInlineClassify((prev) => ({
                                  ...prev,
                                  [m.id]: {
                                    counterpartAccountId:
                                      prev[m.id]?.counterpartAccountId ?? m.counterpartAccountId ?? "",
                                    costCenterId: prev[m.id]?.costCenterId ?? m.costCenterId ?? "",
                                    description: e.target.value,
                                  },
                                }))
                              }
                            />
                          ) : (
                            <span className="text-xs text-foreground/70 truncate block max-w-[180px]">
                              {m.description ?? (
                                <span className="text-muted-foreground/50">—</span>
                              )}
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-3 py-2 text-center">
                          {isPending ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                              <Clock className="w-3 h-3" />
                              {t("bank.movementsTable.pending")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-success/10 text-success">
                              <CheckCircle2 className="w-3 h-3" />
                              {t("bank.movementsTable.posted")}
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-2">
                          <div className="flex items-center justify-center gap-0.5">
                            {canUpdate &&
                              !m.isCleared &&
                              !m.reconciliationId &&
                              m.type !== "transfer" &&
                              !m.transferGroupId && (
                                <>
                                  {isPending && (
                                    <button
                                      onClick={() => {
                                        const cid = inline?.counterpartAccountId ?? m.counterpartAccountId ?? "";
                                        if (!cid) {
                                          toast({
                                            variant: "destructive",
                                            title: t("bank.toast.error"),
                                            description: t("bank.classify.selectCounterpart"),
                                          });
                                          return;
                                        }
                                        updateMovement.mutate(
                                          {
                                            id: m.id,
                                            data: {
                                              counterpartAccountId: cid,
                                              costCenterId: inline?.costCenterId || null,
                                              description: inline?.description?.trim() || null,
                                            },
                                          },
                                          {
                                            onSuccess: () => {
                                              toast({ title: t("bank.classify.saved") });
                                              invalidate();
                                              setInlineClassify((prev) => {
                                                const n = { ...prev };
                                                delete n[m.id];
                                                return n;
                                              });
                                            },
                                            onError: (err: any) =>
                                              toast({
                                                variant: "destructive",
                                                title: t("bank.toast.error"),
                                                description: err?.data?.error,
                                              }),
                                          },
                                        );
                                      }}
                                      className="p-1.5 rounded-md hover:bg-primary/10 text-primary"
                                      title={t("bank.classify.post")}
                                    >
                                      <CheckCircle2 className="w-4 h-4" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => setToClassify(m)}
                                    className="p-1.5 rounded-md hover:bg-primary/10 text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                                    title={isPending ? t("bank.classify.action") : t("common.edit")}
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            {canDelete && !m.isCleared && !m.reconciliationId && (
                              <button
                                onClick={() => setToDelete(m)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-destructive/10 text-destructive"
                                title={t("common.delete")}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <MovementModal
          bankAccountId={effectiveId}
          accounts={accounts}
          leafAccounts={leafAccounts}
          accountLabel={accountLabel}
          lang={lang}
          t={t}
          createMovement={createMovement}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            invalidate();
            setModalOpen(false);
          }}
        />
      )}

      {toClassify && (
        <ClassifyMovementModal
          movement={toClassify}
          leafAccounts={leafAccounts}
          accountLabel={accountLabel}
          t={t}
          updateMovement={updateMovement}
          onClose={() => setToClassify(null)}
          onSaved={() => {
            invalidate();
            setToClassify(null);
          }}
        />
      )}

      <AlertDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("bank.recordMovement")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("bank.confirmDeleteMovement")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={bulkDeleteOpen}
        onOpenChange={(o) => !o && setBulkDeleteOpen(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("bank.bulkDelete.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("bank.bulkDelete.confirmDescription", { count: selectedIds.size })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleting ? t("common.saving") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Movement modal
// ---------------------------------------------------------------------------
function MovementModal({
  bankAccountId,
  accounts,
  leafAccounts,
  accountLabel,
  lang,
  t,
  createMovement,
  onClose,
  onSaved,
}: {
  bankAccountId: string;
  accounts: BankAccount[];
  leafAccounts: Account[];
  accountLabel: (a: Account) => string;
  lang: string;
  t: (k: string, o?: any) => string;
  createMovement: ReturnType<typeof useCreateBankMovement>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const account = accounts.find((a) => a.id === bankAccountId);
  const [date, setDate] = useState(today());
  const [type, setType] = useState<MovementType>("deposit");
  const [amount, setAmount] = useState("");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [counterpartAccountId, setCounterpartAccountId] = useState("");
  const [transferAccountId, setTransferAccountId] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [reference, setReference] = useState("");

  const isTransfer = type === "transfer";
  const isIn = IN_TYPES.has(type);

  const submit = () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast({
        variant: "destructive",
        title: t("bank.toast.error"),
        description: t("bank.validation.amountPositive"),
      });
      return;
    }
    if (isTransfer && !transferAccountId) {
      toast({
        variant: "destructive",
        title: t("bank.toast.error"),
        description: t("bank.validation.selectTransfer"),
      });
      return;
    }
    if (!isTransfer && !counterpartAccountId) {
      toast({
        variant: "destructive",
        title: t("bank.toast.error"),
        description: t("bank.movement.counterpart"),
      });
      return;
    }
    createMovement.mutate(
      {
        data: {
          bankAccountId,
          date,
          type,
          amount: amt,
          currency: account?.currency ?? "EGP",
          exchangeRate: Number(exchangeRate) || 1,
          counterpartAccountId: isTransfer ? null : counterpartAccountId,
          transferAccountId: isTransfer ? transferAccountId : null,
          description: description.trim() || null,
          notes: notes.trim() || null,
          reference: reference.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: t("bank.toast.movementAdded") });
          onSaved();
        },
        onError: (err: any) =>
          toast({
            variant: "destructive",
            title: t("bank.toast.error"),
            description: err?.data?.error,
          }),
      },
    );
  };

  const inputCls =
    "w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";
  const labelCls = "text-xs font-bold text-muted-foreground mb-1 block";
  const otherAccounts = accounts.filter((a) => a.id !== bankAccountId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-card">
          <h2 className="font-bold text-foreground">{t("bank.movement.title")}</h2>
          <button onClick={onClose} className="text-muted-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>{t("bank.movement.date")}</label>
            <input
              type="date"
              className={inputCls}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              dir="ltr"
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>{t("bank.movement.type")}</label>
            <select
              className={inputCls}
              value={type}
              onChange={(e) => setType(e.target.value as MovementType)}
            >
              {MOVEMENT_TYPES.map((tp) => (
                <option key={tp} value={tp}>
                  {t(`bank.movementTypes.${tp}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>
              {t("bank.movement.amount")} ({account?.currency})
            </label>
            <input
              type="number"
              step="0.01"
              className={inputCls}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              dir="ltr"
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>{t("bank.movement.exchangeRate")}</label>
            <input
              type="number"
              step="0.0001"
              className={inputCls}
              value={exchangeRate}
              onChange={(e) => setExchangeRate(e.target.value)}
              dir="ltr"
            />
          </div>
          {isTransfer ? (
            <div className="col-span-2">
              <label className={labelCls}>{t("bank.movement.transferTo")}</label>
              <select
                className={inputCls}
                value={transferAccountId}
                onChange={(e) => setTransferAccountId(e.target.value)}
              >
                <option value="">—</option>
                {otherAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {displayName(a, lang)} ({a.currency})
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                {t("bank.movement.transferHint")}
              </p>
            </div>
          ) : (
            <div className="col-span-2">
              <label className={labelCls}>{t("bank.movement.counterpart")}</label>
              <select
                className={inputCls}
                value={counterpartAccountId}
                onChange={(e) => setCounterpartAccountId(e.target.value)}
              >
                <option value="">—</option>
                {leafAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {accountLabel(a)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                {isIn
                  ? t("bank.movement.counterpartHintIn")
                  : t("bank.movement.counterpartHintOut")}
              </p>
            </div>
          )}
          <div className="col-span-2">
            <label className={labelCls}>{t("bank.movement.description")}</label>
            <input
              className={inputCls}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>{t("bank.movement.notes")}</label>
            <textarea
              className={inputCls}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("bank.movement.notesPlaceholder")}
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>{t("bank.movement.reference")}</label>
            <input
              className={inputCls}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              dir="ltr"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t sticky bottom-0 bg-card">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full text-sm font-bold text-muted-foreground hover:bg-muted"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={submit}
            disabled={createMovement.isPending}
            className="px-5 py-2 rounded-full text-sm font-bold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Classify / edit movement modal (used to finish imported pending rows)
// ---------------------------------------------------------------------------
function ClassifyMovementModal({
  movement,
  leafAccounts,
  accountLabel,
  t,
  updateMovement,
  onClose,
  onSaved,
}: {
  movement: BankMovement;
  leafAccounts: Account[];
  accountLabel: (a: Account) => string;
  t: (k: string, o?: any) => string;
  updateMovement: ReturnType<typeof useUpdateBankMovement>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isPending = movement.status === "pending";
  const [date, setDate] = useState(movement.date);
  const [type, setType] = useState<MovementType>(
    (movement.type as MovementType) ?? "deposit",
  );
  const [amount, setAmount] = useState(String(movement.amount));
  const [counterpartAccountId, setCounterpartAccountId] = useState(
    movement.counterpartAccountId ?? "",
  );
  const [costCenterId, setCostCenterId] = useState(
    movement.costCenterId ?? "",
  );
  const [description, setDescription] = useState(movement.description ?? "");
  const [reference, setReference] = useState(movement.reference ?? "");
  const { data: costCenters = [] } = useListCostCenters();
  const isIn = IN_TYPES.has(type);

  const selectableTypes = MOVEMENT_TYPES.filter((tp) => tp !== "transfer");

  const submit = () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast({
        variant: "destructive",
        title: t("bank.toast.error"),
        description: t("bank.validation.amountPositive"),
      });
      return;
    }
    if (!counterpartAccountId) {
      toast({
        variant: "destructive",
        title: t("bank.toast.error"),
        description: t("bank.classify.selectCounterpart"),
      });
      return;
    }
    updateMovement.mutate(
      {
        id: movement.id,
        data: {
          date,
          type: type as Exclude<MovementType, "transfer">,
          amount: amt,
          counterpartAccountId,
          costCenterId: costCenterId || null,
          description: description.trim() || null,
          reference: reference.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: t("bank.classify.saved") });
          onSaved();
        },
        onError: (err: any) =>
          toast({
            variant: "destructive",
            title: t("bank.toast.error"),
            description: err?.data?.error,
          }),
      },
    );
  };

  const inputCls =
    "w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";
  const labelCls = "text-xs font-bold text-muted-foreground mb-1 block";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-card">
          <h2 className="font-bold text-foreground">
            {isPending ? t("bank.classify.title") : t("bank.classify.editTitle")}
          </h2>
          <button onClick={onClose} className="text-muted-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          {movement.notes && (
            <div className="col-span-2 rounded-lg bg-muted/50 border px-3 py-2">
              <span className="text-xs font-bold text-muted-foreground">
                {t("bank.classify.bankDescription")}
              </span>
              <p className="text-sm text-foreground mt-0.5">{movement.notes}</p>
            </div>
          )}
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>{t("bank.movement.date")}</label>
            <input
              type="date"
              className={inputCls}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              dir="ltr"
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>
              {t("bank.movement.amount")} ({movement.currency})
            </label>
            <input
              type="number"
              step="0.01"
              className={inputCls}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              dir="ltr"
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>{t("bank.movement.type")}</label>
            <select
              className={inputCls}
              value={type}
              onChange={(e) => setType(e.target.value as MovementType)}
            >
              {selectableTypes.map((tp) => (
                <option key={tp} value={tp}>
                  {t(`bank.movementTypes.${tp}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelCls}>{t("bank.movement.counterpart")}</label>
            <select
              className={inputCls}
              value={counterpartAccountId}
              onChange={(e) => setCounterpartAccountId(e.target.value)}
            >
              <option value="">—</option>
              {leafAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {accountLabel(a)}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              {isIn
                ? t("bank.movement.counterpartHintIn")
                : t("bank.movement.counterpartHintOut")}
            </p>
          </div>
          <div className="col-span-2">
            <label className={labelCls}>{t("bank.classify.costCenter")}</label>
            <select
              className={inputCls}
              value={costCenterId}
              onChange={(e) => setCostCenterId(e.target.value)}
            >
              <option value="">{t("bank.classify.noCostCenter")}</option>
              {costCenters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameAr}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelCls}>{t("bank.movement.description")}</label>
            <input
              className={inputCls}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("bank.classify.descriptionPlaceholder")}
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>{t("bank.movement.reference")}</label>
            <input
              className={inputCls}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              dir="ltr"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t sticky bottom-0 bg-card">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full text-sm font-bold text-muted-foreground hover:bg-muted"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={submit}
            disabled={updateMovement.isPending}
            className="px-5 py-2 rounded-full text-sm font-bold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? t("bank.classify.post") : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reconciliation tab
// ---------------------------------------------------------------------------
function ReconciliationTab({
  accounts,
  leafAccounts,
  fmt,
  lang,
  t,
  accountLabel,
  canCreate,
  canUpdate,
  canDelete,
}: {
  accounts: BankAccount[];
  leafAccounts: Account[];
  fmt: (n: number) => string;
  lang: string;
  t: (k: string, o?: any) => string;
  accountLabel: (a: Account) => string;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedRecId, setSelectedRecId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: reconciliations = [], isLoading } =
    useListBankReconciliations();
  const createRec = useCreateBankReconciliation();
  const deleteRec = useDeleteBankReconciliation();
  const [toDelete, setToDelete] = useState<BankReconciliation | null>(null);

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getListBankReconciliationsQueryKey(),
    });

  const accountName = (id: string) =>
    displayName(
      accounts.find((a) => a.id === id) ?? { nameAr: "—", nameEn: null },
      lang,
    );

  const handleDelete = () => {
    if (!toDelete) return;
    deleteRec.mutate(
      { id: toDelete.id },
      {
        onSuccess: () => {
          invalidateList();
          toast({ title: t("bank.toast.reconciliationDeleted") });
          setToDelete(null);
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: t("bank.toast.error"),
            description: err?.data?.error,
          });
          setToDelete(null);
        },
      },
    );
  };

  if (selectedRecId) {
    return (
      <ReconciliationDetail
        reconciliationId={selectedRecId}
        leafAccounts={leafAccounts}
        accountLabel={accountLabel}
        fmt={fmt}
        lang={lang}
        t={t}
        canCreate={canCreate}
        canUpdate={canUpdate}
        onBack={() => {
          setSelectedRecId(null);
          invalidateList();
        }}
      />
    );
  }

  return (
    <>
      <div className="flex items-center justify-end">
        {canCreate && accounts.length > 0 && (
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90"
          >
            <Plus className="w-4 h-4" />
            {t("bank.reconciliation.create")}
          </button>
        )}
      </div>

      <div className="bg-card border rounded-2xl shadow-sm overflow-hidden min-h-[280px]">
        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <Spinner className="w-8 h-8 text-primary" />
          </div>
        ) : reconciliations.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-2 text-center">
            <p className="font-bold text-foreground">
              {t("bank.reconciliation.noReconciliations")}
            </p>
            <p className="text-sm max-w-md">
              {t("bank.reconciliation.noReconciliationsHint")}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
                <th className="text-start px-6 py-3">{t("bank.table.name")}</th>
                <th className="text-start px-3 py-3">
                  {t("bank.reconciliation.periodEnd")}
                </th>
                <th className="text-end px-3 py-3">
                  {t("bank.reconciliation.statementBalance")}
                </th>
                <th className="text-end px-3 py-3">
                  {t("bank.reconciliation.difference")}
                </th>
                <th className="text-center px-3 py-3">
                  {t("bank.reconciliation.status")}
                </th>
                <th className="w-16 px-6 py-3" />
              </tr>
            </thead>
            <tbody>
              {reconciliations.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelectedRecId(r.id)}
                  className="group border-t hover:bg-muted/40 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-3.5 font-medium text-foreground">
                    {r.bankAccountName ?? accountName(r.bankAccountId)}
                  </td>
                  <td className="px-3 py-3.5 tabular-nums text-foreground/80" dir="ltr">
                    {r.periodStart} → {r.periodEnd}
                  </td>
                  <td className="px-3 py-3.5 text-end tabular-nums text-foreground/80" dir="ltr">
                    {fmt(r.statementBalance)}
                  </td>
                  <td
                    className={`px-3 py-3.5 text-end font-bold tabular-nums ${
                      Math.abs(r.difference) < 0.005
                        ? "text-success"
                        : "text-destructive"
                    }`}
                    dir="ltr"
                  >
                    {fmt(r.difference)}
                  </td>
                  <td className="px-3 py-3.5 text-center">
                    {r.status === "completed" ? (
                      <span className="text-[11px] font-bold text-success bg-success/10 px-2.5 py-1 rounded-full">
                        {t("bank.reconciliation.completed")}
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-amber-600 bg-amber-500/10 px-2.5 py-1 rounded-full">
                        {t("bank.reconciliation.draft")}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3.5">
                    {canDelete && r.status !== "completed" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setToDelete(r);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-destructive/10 text-destructive"
                        title={t("common.delete")}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {createOpen && (
        <CreateReconciliationModal
          accounts={accounts}
          lang={lang}
          t={t}
          createRec={createRec}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            invalidateList();
            setCreateOpen(false);
            setSelectedRecId(id);
          }}
        />
      )}

      <AlertDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("bank.reconciliation.create")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("bank.confirmDeleteReconciliation")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CreateReconciliationModal({
  accounts,
  lang,
  t,
  createRec,
  onClose,
  onCreated,
}: {
  accounts: BankAccount[];
  lang: string;
  t: (k: string, o?: any) => string;
  createRec: ReturnType<typeof useCreateBankReconciliation>;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { toast } = useToast();
  const [bankAccountId, setBankAccountId] = useState(accounts[0]?.id ?? "");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState(today());
  const [statementBalance, setStatementBalance] = useState("");
  const [notes, setNotes] = useState("");

  const submit = () => {
    if (!bankAccountId || !periodStart || !periodEnd) {
      toast({ variant: "destructive", title: t("bank.toast.error") });
      return;
    }
    createRec.mutate(
      {
        data: {
          bankAccountId,
          periodStart,
          periodEnd,
          statementBalance: Number(statementBalance) || 0,
          notes: notes.trim() || null,
        },
      },
      {
        onSuccess: (detail) => {
          toast({ title: t("bank.toast.reconciliationCreated") });
          onCreated(detail.reconciliation.id);
        },
        onError: (err: any) =>
          toast({
            variant: "destructive",
            title: t("bank.toast.error"),
            description: err?.data?.error,
          }),
      },
    );
  };

  const inputCls =
    "w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";
  const labelCls = "text-xs font-bold text-muted-foreground mb-1 block";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-bold text-foreground">
            {t("bank.reconciliation.newTitle")}
          </h2>
          <button onClick={onClose} className="text-muted-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelCls}>{t("bank.selectAccount")}</label>
            <select
              className={inputCls}
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {displayName(a, lang)} ({a.currency})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>
              {t("bank.reconciliation.periodStart")}
            </label>
            <input
              type="date"
              className={inputCls}
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              dir="ltr"
            />
          </div>
          <div>
            <label className={labelCls}>
              {t("bank.reconciliation.periodEnd")}
            </label>
            <input
              type="date"
              className={inputCls}
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              dir="ltr"
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>
              {t("bank.reconciliation.statementBalance")}
            </label>
            <input
              type="number"
              step="0.01"
              className={inputCls}
              value={statementBalance}
              onChange={(e) => setStatementBalance(e.target.value)}
              dir="ltr"
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>{t("bank.reconciliation.notes")}</label>
            <input
              className={inputCls}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full text-sm font-bold text-muted-foreground hover:bg-muted"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={submit}
            disabled={createRec.isPending}
            className="px-5 py-2 rounded-full text-sm font-bold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {t("bank.reconciliation.create")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reconciliation detail / workflow
// ---------------------------------------------------------------------------
function ReconciliationDetail({
  reconciliationId,
  leafAccounts,
  accountLabel,
  fmt,
  lang,
  t,
  canCreate,
  canUpdate,
  onBack,
}: {
  reconciliationId: string;
  leafAccounts: Account[];
  accountLabel: (a: Account) => string;
  fmt: (n: number) => string;
  lang: string;
  t: (k: string, o?: any) => string;
  canCreate: boolean;
  canUpdate: boolean;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: detail, isLoading } =
    useGetBankReconciliation(reconciliationId);
  const matchRec = useMatchBankReconciliation();
  const adjustRec = useAdjustBankReconciliation();
  const completeRec = useCompleteBankReconciliation();

  const [uploading, setUploading] = useState(false);
  const [autoMatching, setAutoMatching] = useState(false);
  const [cleared, setCleared] = useState<Record<string, boolean>>({});
  const [matched, setMatched] = useState<Record<string, string>>({});
  const [suggestedLines, setSuggestedLines] = useState<Record<string, boolean>>(
    {},
  );
  const [adjType, setAdjType] = useState<(typeof ADJUSTMENT_TYPES)[number]>(
    "bank_charge",
  );
  const [adjAmount, setAdjAmount] = useState("");
  const [adjAccount, setAdjAccount] = useState("");
  const [adjDesc, setAdjDesc] = useState("");
  const [adjDate, setAdjDate] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: getGetBankReconciliationQueryKey(reconciliationId),
    });
    queryClient.invalidateQueries({
      queryKey: getListBankReconciliationsQueryKey(),
    });
    queryClient.invalidateQueries({ queryKey: getListBankAccountsQueryKey() });
    queryClient.invalidateQueries({
      queryKey: getListJournalEntriesQueryKey(),
    });
  };

  // Sync checkbox/match state from server on every detail change. For movements
  // and statement lines already in local state we keep the (possibly unsaved)
  // local value; rows not yet tracked are seeded from the server, and rows the
  // server no longer returns are pruned. This ensures movements created server
  // side AFTER the initial load (e.g. adjusting entries, which come back
  // isCleared=true) are reflected — otherwise a later saveMatch would drop them
  // from the payload and the backend would un-clear them.
  React.useEffect(() => {
    if (!detail) return;
    setCleared((prev) => {
      const next: Record<string, boolean> = {};
      for (const m of detail.movements)
        next[m.id] = m.id in prev ? prev[m.id] : m.isCleared;
      return next;
    });
    setMatched((prev) => {
      const next: Record<string, string> = {};
      for (const s of detail.statementLines)
        next[s.id] = s.id in prev ? prev[s.id] : (s.matchedMovementId ?? "");
      return next;
    });
  }, [detail]);

  const isCompleted = detail?.reconciliation.status === "completed";
  const editable = !isCompleted && canUpdate;

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(
        `/api/bank/reconciliations/${reconciliationId}/statement`,
        { method: "POST", body: formData, credentials: "include" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error);
      }
      invalidate();
      toast({ title: t("bank.toast.statementUploaded") });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: t("bank.toast.error"),
        description: err?.message,
      });
    } finally {
      setUploading(false);
    }
  };

  const saveMatch = () => {
    const movementIds = Object.entries(cleared)
      .filter(([, v]) => v)
      .map(([k]) => k);
    const statementLineMatches = Object.entries(matched).map(
      ([statementLineId, movementId]) => ({
        statementLineId,
        movementId: movementId || null,
      }),
    );
    matchRec.mutate(
      { id: reconciliationId, data: { movementIds, statementLineMatches } },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: t("bank.toast.matched") });
        },
        onError: (err: any) =>
          toast({
            variant: "destructive",
            title: t("bank.toast.error"),
            description: err?.data?.error,
          }),
      },
    );
  };

  const runAutoMatch = async () => {
    setAutoMatching(true);
    try {
      const result = await autoMatchReconciliation(reconciliationId);
      if (result.suggestions.length === 0) {
        setSuggestedLines({});
        toast({
          title: t("bank.reconciliation.autoMatch"),
          description: t("bank.reconciliation.autoMatchNone"),
        });
        return;
      }
      // Apply every suggestion to local state: clear the movement and link the
      // statement line. The user reviews then clicks "Match" to persist.
      const suggestedMovementIds = new Set(
        result.suggestions.map((s) => s.movementId),
      );
      setCleared((c) => {
        const next = { ...c };
        for (const s of result.suggestions) next[s.movementId] = true;
        return next;
      });
      setMatched((m) => {
        // Drop any prior local assignment that points at a movement a suggestion
        // is about to claim — a movement can only link to one statement line.
        const next: Record<string, string> = {};
        for (const [lineId, mvId] of Object.entries(m)) {
          if (!suggestedMovementIds.has(mvId)) next[lineId] = mvId;
        }
        for (const s of result.suggestions)
          next[s.statementLineId] = s.movementId;
        return next;
      });
      const flags: Record<string, boolean> = {};
      for (const s of result.suggestions) flags[s.statementLineId] = true;
      setSuggestedLines(flags);
      toast({
        title: t("bank.reconciliation.autoMatch"),
        description: t("bank.reconciliation.autoMatchSummary", {
          matched: result.matchedCount,
          suggested: result.suggestedCount,
          unmatched: result.unmatchedStatementLineIds.length,
        }),
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: t("bank.toast.error"),
        description: err?.data?.error ?? err?.message,
      });
    } finally {
      setAutoMatching(false);
    }
  };

  const saveAdjustment = () => {
    const amt = Number(adjAmount);
    if (!amt || amt <= 0 || !adjAccount) {
      toast({
        variant: "destructive",
        title: t("bank.toast.error"),
        description: t("bank.validation.amountPositive"),
      });
      return;
    }
    adjustRec.mutate(
      {
        id: reconciliationId,
        data: {
          lines: [
            {
              type: adjType,
              amount: amt,
              counterpartAccountId: adjAccount,
              description: adjDesc.trim() || null,
              date: adjDate || null,
            },
          ],
        },
      },
      {
        onSuccess: () => {
          invalidate();
          setAdjAmount("");
          setAdjDesc("");
          setAdjAccount("");
          toast({ title: t("bank.toast.adjustmentAdded") });
        },
        onError: (err: any) =>
          toast({
            variant: "destructive",
            title: t("bank.toast.error"),
            description: err?.data?.error,
          }),
      },
    );
  };

  const complete = () => {
    completeRec.mutate(
      { id: reconciliationId },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: t("bank.toast.completed") });
        },
        onError: (err: any) =>
          toast({
            variant: "destructive",
            title: t("bank.toast.error"),
            description: err?.data?.error,
          }),
      },
    );
  };

  if (isLoading || !detail) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner className="w-8 h-8 text-primary" />
      </div>
    );
  }

  const r = detail.reconciliation;
  const inputCls =
    "w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";
  const labelCls = "text-xs font-bold text-muted-foreground mb-1 block";
  const balanced = Math.abs(detail.reconciledDifference) < 0.005;
  const depositsInTransit = detail.outstanding.filter(
    (m) => m.direction === "in",
  );
  const outstandingChecks = detail.outstanding.filter(
    (m) => m.direction === "out",
  );
  const outstandingNet =
    depositsInTransit.reduce((s, m) => s + m.amount, 0) -
    outstandingChecks.reduce((s, m) => s + m.amount, 0);
  const adjustments = detail.movements.filter((m) => m.isAdjustment);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
          {t("bank.reconciliation.back")}
        </button>
        <div className="flex items-center gap-2">
          {r.status === "completed" ? (
            <span className="text-xs font-bold text-success bg-success/10 px-3 py-1.5 rounded-full">
              {t("bank.reconciliation.completed")}
            </span>
          ) : (
            <span className="text-xs font-bold text-amber-600 bg-amber-500/10 px-3 py-1.5 rounded-full">
              {t("bank.reconciliation.draft")}
            </span>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          label={t("bank.reconciliation.statementBalance")}
          value={fmt(r.statementBalance)}
        />
        <SummaryCard
          label={t("bank.reconciliation.clearedBalance")}
          value={fmt(detail.clearedBookBalance)}
        />
        <SummaryCard
          label={t("bank.reconciliation.bookBalance")}
          value={fmt(r.bookBalance)}
        />
        <SummaryCard
          label={t("bank.reconciliation.reconciledDifference")}
          value={fmt(detail.reconciledDifference)}
          highlight={balanced ? "success" : "destructive"}
          note={balanced ? t("bank.reconciliation.balanced") : undefined}
        />
      </div>


      {/* Movements + matching */}
      <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-bold text-foreground">
            {t("bank.reconciliation.movements")}
          </h3>
          {editable && (
            <div className="flex items-center gap-2">
              <button
                onClick={runAutoMatch}
                disabled={autoMatching || detail.statementLines.length === 0}
                className="flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold bg-card border text-foreground hover:bg-muted disabled:opacity-50"
              >
                <Wand2 className="w-4 h-4" />
                {autoMatching
                  ? t("bank.reconciliation.autoMatching")
                  : t("bank.reconciliation.autoMatch")}
              </button>
              <button
                onClick={saveMatch}
                disabled={matchRec.isPending}
                className="px-4 py-1.5 rounded-full text-sm font-bold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {t("bank.reconciliation.match")}
              </button>
            </div>
          )}
        </div>
        {detail.movements.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {t("bank.noMovements")}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
                <th className="w-12 px-6 py-3 text-center">
                  {t("bank.movementsTable.cleared")}
                </th>
                <th className="text-start px-3 py-3">
                  {t("bank.movementsTable.date")}
                </th>
                <th className="text-start px-3 py-3">
                  {t("bank.movementsTable.type")}
                </th>
                <th className="text-end px-6 py-3">
                  {t("bank.movementsTable.amount")}
                </th>
              </tr>
            </thead>
            <tbody>
              {detail.movements.map((m) => (
                <tr key={m.id} className="border-t hover:bg-muted/40">
                  <td className="px-6 py-3 text-center">
                    <input
                      type="checkbox"
                      className="w-4 h-4"
                      disabled={!editable}
                      checked={cleared[m.id] ?? false}
                      onChange={(e) =>
                        setCleared((c) => ({ ...c, [m.id]: e.target.checked }))
                      }
                    />
                  </td>
                  <td className="px-3 py-3 tabular-nums text-foreground/80" dir="ltr">
                    {m.date}
                  </td>
                  <td className="px-3 py-3 text-foreground/80">
                    {t(`bank.movementTypes.${m.type}`)}
                  </td>
                  <td
                    className={`px-6 py-3 text-end font-bold tabular-nums ${
                      m.direction === "in" ? "text-success" : "text-destructive"
                    }`}
                    dir="ltr"
                  >
                    {m.direction === "in" ? "+" : "−"}
                    {fmt(m.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Statement lines */}
      <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-bold text-foreground">
            {t("bank.reconciliation.statementLines")}
          </h3>
          {editable && (
            <label className="px-4 py-1.5 rounded-full text-sm font-bold bg-card border text-foreground hover:bg-muted cursor-pointer flex items-center gap-2">
              <Upload className="w-4 h-4" />
              {uploading
                ? t("bank.reconciliation.uploading")
                : t("bank.reconciliation.uploadStatement")}
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                disabled={uploading}
                onChange={onUpload}
              />
            </label>
          )}
        </div>
        {detail.statementLines.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {t("bank.reconciliation.noStatementLines")}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
                <th className="text-start px-6 py-3">
                  {t("bank.movementsTable.date")}
                </th>
                <th className="text-start px-3 py-3">
                  {t("bank.movement.description")}
                </th>
                <th className="text-end px-6 py-3">
                  {t("bank.movementsTable.amount")}
                </th>
                <th className="text-start px-3 py-3">
                  {t("bank.reconciliation.matchColumn")}
                </th>
              </tr>
            </thead>
            <tbody>
              {detail.statementLines.map((s) => {
                const matchedMv = detail.movements.find(
                  (m) => m.id === (matched[s.id] || s.matchedMovementId),
                );
                return (
                  <tr
                    key={s.id}
                    className={`border-t hover:bg-muted/40 ${
                      suggestedLines[s.id] && matched[s.id]
                        ? "bg-primary/5"
                        : ""
                    }`}
                  >
                    <td className="px-6 py-3 tabular-nums text-foreground/80" dir="ltr">
                      {s.date}
                    </td>
                    <td className="px-3 py-3 text-foreground/80">
                      {s.description}
                    </td>
                    <td
                      className={`px-6 py-3 text-end font-bold tabular-nums ${
                        s.direction === "in"
                          ? "text-success"
                          : "text-destructive"
                      }`}
                      dir="ltr"
                    >
                      {s.direction === "in" ? "+" : "−"}
                      {fmt(s.amount)}
                    </td>
                    <td className="px-3 py-3 text-foreground/80">
                      {editable ? (
                        <select
                          className="w-full max-w-[14rem] px-2 py-1.5 rounded-lg border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                          value={matched[s.id] ?? ""}
                          onChange={(e) =>
                            setMatched((mm) => ({
                              ...mm,
                              [s.id]: e.target.value,
                            }))
                          }
                        >
                          <option value="">
                            {t("bank.reconciliation.unmatched")}
                          </option>
                          {detail.movements.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.date} · {t(`bank.movementTypes.${m.type}`)} ·{" "}
                              {m.direction === "in" ? "+" : "−"}
                              {fmt(m.amount)}
                            </option>
                          ))}
                        </select>
                      ) : matchedMv ? (
                        <span className="text-xs font-bold text-success">
                          {matchedMv.date} ·{" "}
                          {t(`bank.movementTypes.${matchedMv.type}`)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {t("bank.reconciliation.unmatched")}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Outstanding items (uncleared movements) */}
      <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h3 className="font-bold text-foreground">
            {t("bank.reconciliation.outstandingTitle")}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("bank.reconciliation.outstandingHint")}
          </p>
        </div>
        {detail.outstanding.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {t("bank.reconciliation.noOutstanding")}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
                <th className="text-start px-6 py-3">
                  {t("bank.movementsTable.date")}
                </th>
                <th className="text-start px-3 py-3">
                  {t("bank.movementsTable.type")}
                </th>
                <th className="text-start px-3 py-3">
                  {t("bank.movement.description")}
                </th>
                <th className="text-end px-6 py-3">
                  {t("bank.movementsTable.amount")}
                </th>
              </tr>
            </thead>
            <tbody>
              {detail.outstanding.map((m) => (
                <tr key={m.id} className="border-t hover:bg-muted/40">
                  <td className="px-6 py-3 tabular-nums text-foreground/80" dir="ltr">
                    {m.date}
                  </td>
                  <td className="px-3 py-3 text-foreground/80">
                    {t(`bank.movementTypes.${m.type}`)}
                    <span className="ms-2 text-[11px] text-muted-foreground">
                      {m.direction === "in"
                        ? t("bank.reconciliation.depositInTransit")
                        : t("bank.reconciliation.outstandingChecks")}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-foreground/80">
                    {m.description ?? "—"}
                  </td>
                  <td
                    className={`px-6 py-3 text-end font-bold tabular-nums ${
                      m.direction === "in" ? "text-success" : "text-destructive"
                    }`}
                    dir="ltr"
                  >
                    {m.direction === "in" ? "+" : "−"}
                    {fmt(m.amount)}
                  </td>
                </tr>
              ))}
              <tr className="border-t bg-muted/30 font-bold">
                <td className="px-6 py-3" colSpan={3}>
                  {t("bank.reconciliation.outstandingTotal")}
                </td>
                <td className="px-6 py-3 text-end tabular-nums" dir="ltr">
                  {fmt(outstandingNet)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* Reconciliation report */}
      <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-bold text-foreground">
            {t("bank.reconciliation.report")}
          </h3>
          <button
            onClick={() =>
              window.open(
                `/api/bank/reconciliations/${reconciliationId}/report/export`,
                "_blank",
              )
            }
            className="flex items-center gap-2 text-sm font-bold text-primary hover:opacity-80"
          >
            <Download className="w-4 h-4" />
            {t("bank.reconciliation.exportReport")}
          </button>
        </div>
        <div className="p-6 flex flex-col gap-2 text-sm">
          <ReportRow
            label={t("bank.reconciliation.bookBalance")}
            value={fmt(r.bookBalance)}
          />
          <ReportRow
            label={t("bank.reconciliation.outstandingTotal")}
            value={fmt(outstandingNet)}
          />
          <ReportRow
            label={t("bank.reconciliation.clearedBalance")}
            value={fmt(detail.clearedBookBalance)}
          />
          <div className="border-t my-1" />
          <ReportRow
            label={t("bank.reconciliation.statementBalance")}
            value={fmt(r.statementBalance)}
          />
          <ReportRow
            label={t("bank.reconciliation.reconciledDifference")}
            value={fmt(detail.reconciledDifference)}
            highlight={balanced ? "success" : "destructive"}
          />
          <div className="border-t my-1" />
          <ReportRow
            label={t("bank.reconciliation.postReconciliationBalance")}
            value={fmt(detail.clearedBookBalance)}
            bold
          />
          {/* Adjusting entries created during this reconciliation */}
          <div className="mt-4">
            <div className="text-xs font-bold text-muted-foreground mb-2">
              {t("bank.reconciliation.entriesCreated")}
            </div>
            {adjustments.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("bank.reconciliation.noEntriesCreated")}
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {adjustments.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-3 text-xs border rounded-lg px-3 py-2"
                  >
                    <span className="text-foreground/80">
                      <span dir="ltr">{m.date}</span> ·{" "}
                      {t(`bank.movementTypes.${m.type}`)}
                      {m.counterpartAccountName
                        ? ` · ${m.counterpartAccountName}`
                        : ""}
                    </span>
                    <span
                      className={`font-bold tabular-nums ${
                        m.direction === "in"
                          ? "text-success"
                          : "text-destructive"
                      }`}
                      dir="ltr"
                    >
                      {m.direction === "in" ? "+" : "−"}
                      {fmt(m.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Adjustment + complete */}
      {editable && (
        <div className="bg-card border rounded-2xl shadow-sm p-6 flex flex-col gap-4">
          <h3 className="font-bold text-foreground">
            {t("bank.reconciliation.addAdjustment")}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className={labelCls}>
                {t("bank.reconciliation.adjustmentType")}
              </label>
              <select
                className={inputCls}
                value={adjType}
                onChange={(e) =>
                  setAdjType(
                    e.target.value as (typeof ADJUSTMENT_TYPES)[number],
                  )
                }
              >
                {ADJUSTMENT_TYPES.map((tp) => (
                  <option key={tp} value={tp}>
                    {t(`bank.movementTypes.${tp}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>
                {t("bank.reconciliation.adjustmentAmount")}
              </label>
              <input
                type="number"
                step="0.01"
                className={inputCls}
                value={adjAmount}
                onChange={(e) => setAdjAmount(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>
                {t("bank.reconciliation.adjustmentAccount")}
              </label>
              <select
                className={inputCls}
                value={adjAccount}
                onChange={(e) => setAdjAccount(e.target.value)}
              >
                <option value="">—</option>
                {leafAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {accountLabel(a)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>
                {t("bank.reconciliation.adjustmentDate")}
              </label>
              <input
                type="date"
                className={inputCls}
                value={adjDate}
                onChange={(e) => setAdjDate(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="col-span-2 md:col-span-4">
              <label className={labelCls}>
                {t("bank.reconciliation.adjustmentDesc")}
              </label>
              <input
                className={inputCls}
                value={adjDesc}
                onChange={(e) => setAdjDesc(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={saveAdjustment}
                disabled={adjustRec.isPending}
                className="w-full px-4 py-2 rounded-lg text-sm font-bold bg-card border text-foreground hover:bg-muted disabled:opacity-50"
              >
                {t("bank.reconciliation.saveAdjustment")}
              </button>
            </div>
          </div>
          <div className="border-t pt-4 flex justify-end">
            <button
              onClick={complete}
              disabled={completeRec.isPending}
              className="flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {t("bank.reconciliation.complete")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportRow({
  label,
  value,
  highlight,
  bold,
}: {
  label: string;
  value: string;
  highlight?: "success" | "destructive";
  bold?: boolean;
}) {
  const color =
    highlight === "success"
      ? "text-success"
      : highlight === "destructive"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-4">
      <span
        className={`${bold ? "font-bold text-foreground" : "text-muted-foreground"}`}
      >
        {label}
      </span>
      <span className={`tabular-nums ${bold ? "font-bold" : ""} ${color}`} dir="ltr">
        {value}
      </span>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
  note,
}: {
  label: string;
  value: string;
  highlight?: "success" | "destructive";
  note?: string;
}) {
  const color =
    highlight === "success"
      ? "text-success"
      : highlight === "destructive"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div className="bg-card border rounded-2xl shadow-sm p-4">
      <div className="text-xs font-bold text-muted-foreground mb-1">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${color}`} dir="ltr">
        {value}
      </div>
      {note && (
        <div className="text-xs font-bold text-success mt-1">{note}</div>
      )}
    </div>
  );
}

