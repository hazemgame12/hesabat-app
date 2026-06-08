import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListBankAccounts,
  useCreateBankAccount,
  useUpdateBankAccount,
  useDeleteBankAccount,
  useListBankMovements,
  useCreateBankMovement,
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
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
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

  const [accountModal, setAccountModal] = useState<{
    mode: "create" | "edit";
    account: BankAccount | null;
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
        {canCreate && tab === "accounts" && (
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
          leafAccounts={leafAccounts}
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
}: {
  accounts: BankAccount[];
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Account create/edit modal
// ---------------------------------------------------------------------------
function AccountModal({
  mode,
  account,
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
  leafAccounts: Account[];
  accountLabel: (a: Account) => string;
  t: (k: string, o?: any) => string;
  onClose: () => void;
  onSaved: () => void;
  createAccount: ReturnType<typeof useCreateBankAccount>;
  updateAccount: ReturnType<typeof useUpdateBankAccount>;
}) {
  const { toast } = useToast();
  const [nameAr, setNameAr] = useState(account?.nameAr ?? "");
  const [nameEn, setNameEn] = useState(account?.nameEn ?? "");
  const [type, setType] = useState<AccountType>(
    (account?.type as AccountType) ?? "bank",
  );
  const [bankName, setBankName] = useState(account?.bankName ?? "");
  const [accountNumber, setAccountNumber] = useState(
    account?.accountNumber ?? "",
  );
  const [currency, setCurrency] = useState(account?.currency ?? "EGP");
  const [openingBalance, setOpeningBalance] = useState(
    account ? String(account.openingBalance) : "0",
  );
  const [openingBalanceDate, setOpeningBalanceDate] = useState(
    account?.openingBalanceDate ?? "",
  );
  const [accountId, setAccountId] = useState(account?.accountId ?? "");
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
      currency: currency.trim().toUpperCase() || "EGP",
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
            <input
              className={inputCls}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              dir="ltr"
            />
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
  canDelete,
}: {
  accounts: BankAccount[];
  leafAccounts: Account[];
  fmt: (n: number) => string;
  lang: string;
  t: (k: string, o?: any) => string;
  accountLabel: (a: Account) => string;
  canCreate: boolean;
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
  const deleteMovement = useDeleteBankMovement();
  const [modalOpen, setModalOpen] = useState(false);
  const [toDelete, setToDelete] = useState<BankMovement | null>(null);

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
        {canCreate && (
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90"
          >
            <ArrowLeftRight className="w-4 h-4" />
            {t("bank.recordMovement")}
          </button>
        )}
      </div>

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
                  {t("bank.movementsTable.counterpart")}
                </th>
                <th className="text-end px-3 py-3">
                  {t("bank.movementsTable.amount")}
                </th>
                <th className="text-center px-3 py-3">
                  {t("bank.movementsTable.cleared")}
                </th>
                {canDelete && <th className="w-16 px-6 py-3" />}
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr
                  key={m.id}
                  className="group border-t hover:bg-muted/40 transition-colors"
                >
                  <td className="px-6 py-3.5 tabular-nums text-foreground/80" dir="ltr">
                    {m.date}
                  </td>
                  <td className="px-3 py-3.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-muted text-foreground/80">
                      {m.direction === "in" ? (
                        <ArrowDownToLine className="w-3 h-3 text-success" />
                      ) : (
                        <ArrowUpFromLine className="w-3 h-3 text-destructive" />
                      )}
                      {t(`bank.movementTypes.${m.type}`)}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-foreground/80">
                    {m.type === "transfer"
                      ? m.transferAccountName
                      : m.counterpartAccountName}
                    {m.description && (
                      <div className="text-xs text-muted-foreground">
                        {m.description}
                      </div>
                    )}
                  </td>
                  <td
                    className={`px-3 py-3.5 text-end font-bold font-sans tabular-nums ${
                      m.direction === "in" ? "text-success" : "text-destructive"
                    }`}
                    dir="ltr"
                  >
                    {m.direction === "in" ? "+" : "−"}
                    {fmt(m.amount)} {m.currency}
                  </td>
                  <td className="px-3 py-3.5 text-center">
                    {m.isCleared && (
                      <CheckCircle2 className="w-4 h-4 text-success inline" />
                    )}
                  </td>
                  {canDelete && (
                    <td className="px-6 py-3.5">
                      {!m.isCleared && !m.reconciliationId && (
                        <button
                          onClick={() => setToDelete(m)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-destructive/10 text-destructive"
                          title={t("common.delete")}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
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

