import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { 
  useListAccounts, 
  useCreateAccount, 
  useUpdateAccount, 
  useDeleteAccount,
  useSeedDefaultAccounts,
  useGetCurrentUser,
  useListCurrencies,
  getListAccountsQueryKey,
  getGetDashboardSummaryQueryKey,
  type Account,
} from "@workspace/api-client-react";
import { hasCapability } from "@workspace/permissions";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, ChevronDown, ChevronLeft, Check, X, Trash2, Edit2 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { ExcelToolbar } from "@/components/ExcelToolbar";

const ACCOUNT_TYPES = ["asset", "liability", "equity", "revenue", "expense"] as const;
type AccountType = (typeof ACCOUNT_TYPES)[number];

const TYPE_COLORS: Record<AccountType, string> = {
  asset: "bg-primary",
  liability: "bg-destructive",
  equity: "bg-secondary-foreground",
  revenue: "bg-success",
  expense: "bg-amber-500",
};

const ALL_TAB = "all";

const TYPE_PREFIX: Record<AccountType, string> = {
  asset: "1",
  liability: "2",
  equity: "3",
  revenue: "4",
  expense: "5",
};

// Suggests the next account code based on existing siblings, mirroring the
// hierarchical scheme of the default chart (parentCode + next digit, e.g.
// "11" → "111" → "1111"). The suffix is incremented within the parent prefix
// so it never escapes the hierarchy (the 9th child of "11" becomes "1110",
// not "120"). Editable by the user afterwards.
function computeNextCode(
  parentId: string | null,
  type: AccountType,
  accounts: Account[],
): string {
  const parent = parentId ? accounts.find((a) => a.id === parentId) : null;
  const prefix = parent ? parent.code : TYPE_PREFIX[type];

  const siblings = parentId
    ? accounts.filter((a) => a.parentId === parentId)
    : accounts.filter((a) => !a.parentId && a.type === type);

  const suffixes = siblings
    .filter((a) => a.code.startsWith(prefix) && a.code.length > prefix.length)
    .map((a) => a.code.slice(prefix.length))
    .filter((s) => /^\d+$/.test(s));

  if (suffixes.length > 0) {
    const max = suffixes.reduce((m, s) => Math.max(m, Number(s)), 0);
    const width = Math.max(...suffixes.map((s) => s.length));
    return prefix + String(max + 1).padStart(width, "0");
  }

  return `${prefix}1`;
}

const accountSchema = z.object({
  code: z.string().min(1, "codeRequired"),
  nameAr: z.string().min(1, "nameRequired"),
  nameEn: z.string().optional(),
  type: z.enum(ACCOUNT_TYPES),
  currencyType: z.enum(["base", "fixed", "multi"]).default("base"),
  currency: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  isGroup: z.boolean().default(false),
});

const BASE_CURRENCY = "EGP";

type TreeNode = Account & {
  children?: TreeNode[];
};

function buildTree(accounts: Account[]): Record<AccountType, TreeNode[]> {
  const tree = {
    asset: [],
    liability: [],
    equity: [],
    revenue: [],
    expense: [],
  } as Record<AccountType, TreeNode[]>;

  const accountMap = new Map<string, TreeNode>();
  accounts.forEach(acc => {
    accountMap.set(acc.id, { ...acc, children: [] });
  });

  accounts.forEach(acc => {
    const node = accountMap.get(acc.id)!;
    if (acc.parentId) {
      const parent = accountMap.get(acc.parentId);
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(node);
      }
    } else {
      const type = acc.type as AccountType;
      if (tree[type]) {
        tree[type].push(node);
      }
    }
  });

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.code.localeCompare(b.code));
    nodes.forEach(n => {
      if (n.children) sortNodes(n.children);
    });
  };
  Object.values(tree).forEach(sortNodes);

  return tree;
}

function displayName(acc: Pick<Account, "nameAr" | "nameEn">, lang: string): string {
  return lang.startsWith("en") && acc.nameEn ? acc.nameEn : acc.nameAr;
}

export function Accounts() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: accounts = [], isLoading } = useListAccounts();
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();
  const seedDefaults = useSeedDefaultAccounts();
  const { data: user } = useGetCurrentUser();
  const role = user?.role ?? "";
  const canCreate = hasCapability(role, "accounts:create");
  const canUpdate = hasCapability(role, "accounts:update");
  const canDelete = hasCapability(role, "accounts:delete");

  const [activeTab, setActiveTab] = useState<AccountType | typeof ALL_TAB>(ALL_TAB);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [accountToEdit, setAccountToEdit] = useState<Account | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);

  const tree = buildTree(accounts);
  const groups = ACCOUNT_TYPES.filter((g) => activeTab === ALL_TAB || g === activeTab);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<z.infer<typeof accountSchema>>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      type: "asset",
      currencyType: "base",
      currency: null,
      isGroup: false,
      parentId: null
    }
  });

  const isGroup = watch("isGroup");
  const watchedParentId = watch("parentId");
  const watchedType = watch("type");
  const watchedCurrencyType = watch("currencyType");

  const { data: currencies = [] } = useListCurrencies();
  const currencyCodes = React.useMemo(() => {
    const codes = [BASE_CURRENCY];
    for (const c of currencies) {
      if (c.isActive && c.code !== BASE_CURRENCY) codes.push(c.code);
    }
    return codes;
  }, [currencies]);

  useEffect(() => {
    if (watchedCurrencyType !== "fixed") {
      setValue("currency", null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedCurrencyType]);

  useEffect(() => {
    if (modalMode !== "create") return;
    setValue("code", computeNextCode(watchedParentId ?? null, watchedType, accounts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalMode, watchedParentId, watchedType, accounts]);

  const openCreateModal = () => {
    reset({
      code: "",
      nameAr: "",
      nameEn: "",
      type: "asset",
      currencyType: "base",
      currency: null,
      parentId: null,
      isGroup: false
    });
    setModalMode("create");
  };

  const openEditModal = (account: Account) => {
    reset({
      code: account.code,
      nameAr: account.nameAr,
      nameEn: account.nameEn ?? "",
      type: account.type as AccountType,
      currencyType: (account.currencyType as "base" | "fixed" | "multi") ?? "base",
      currency: account.currency ?? null,
      parentId: account.parentId,
      isGroup: account.isGroup
    });
    setAccountToEdit(account);
    setModalMode("edit");
  };

  const handleLoadDefaults = () => {
    seedDefaults.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        toast({ title: t("accounts.toast.defaultsLoaded") });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: t("common.error"), description: err?.data?.error || t("accounts.toast.defaultsError") });
      }
    });
  };

  const closeModals = () => {
    setModalMode(null);
    setAccountToEdit(null);
  };

  const onSubmit = (data: z.infer<typeof accountSchema>) => {
    if (data.currencyType !== "fixed") {
      data.currency = null;
    }
    if (modalMode === "create") {
      createAccount.mutate({ data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          toast({ title: t("accounts.toast.added") });
          closeModals();
        },
        onError: (err: any) => {
          toast({ variant: "destructive", title: t("common.error"), description: err?.data?.error || t("accounts.toast.addError") });
        }
      });
    } else if (modalMode === "edit" && accountToEdit) {
      updateAccount.mutate({ id: accountToEdit.id, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          toast({ title: t("accounts.toast.edited") });
          closeModals();
        },
        onError: (err: any) => {
          toast({ variant: "destructive", title: t("common.error"), description: err?.data?.error || t("accounts.toast.editError") });
        }
      });
    }
  };

  const handleDelete = () => {
    if (!accountToDelete) return;
    deleteAccount.mutate({ id: accountToDelete.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        toast({ title: t("accounts.toast.deleted") });
        setAccountToDelete(null);
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: t("common.error"), description: err?.data?.error || t("accounts.toast.deleteError") });
        setAccountToDelete(null);
      }
    });
  };

  const TreeRow = ({ node, depth }: { node: TreeNode; depth: number }) => {
    const hasChildren = !!node.children?.length;
    const [open, setOpen] = useState(depth < 2);
    
    return (
      <>
        <div
          className="group flex items-center gap-3 py-2.5 rounded-lg hover:bg-muted/60 transition-colors cursor-pointer"
          style={{ paddingInlineStart: 12 + depth * 26, paddingInlineEnd: 16 }}
        >
          <button 
            className="w-5 flex-shrink-0 text-muted-foreground flex items-center justify-center"
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          >
            {hasChildren ? (
              open ? <ChevronDown className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4 rtl:-scale-x-100" />
            ) : null}
          </button>
          
          <div className="flex-1 flex items-center gap-3" onClick={() => hasChildren && setOpen((o) => !o)}>
            <span className="font-sans text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-md flex-shrink-0 min-w-12 text-center" dir="ltr">
              {node.code}
            </span>
            <span className={`text-sm ${node.isGroup ? "font-bold text-foreground" : "font-medium text-foreground/90"}`}>
              {displayName(node, lang)}
            </span>
            {node.isGroup && (
              <span className="text-[11px] font-bold text-secondary-foreground bg-secondary px-2 py-0.5 rounded-full flex-shrink-0">
                {t("accounts.mainAccountBadge")}
              </span>
            )}
          </div>

          {(canUpdate || canDelete) && (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 flex-shrink-0 px-2">
              {canUpdate && (
                <button 
                  onClick={(e) => { e.stopPropagation(); openEditModal(node); }}
                  className="p-1.5 rounded-md hover:bg-primary/10 text-primary transition-colors"
                  title={t("common.edit")}
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
              {canDelete && (
                <button 
                  onClick={(e) => { e.stopPropagation(); setAccountToDelete(node); }}
                  className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive transition-colors"
                  title={t("common.delete")}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
        {hasChildren && open && (
          <div>
            {node.children!.map((c) => (
              <TreeRow key={c.id} node={c} depth={depth + 1} />
            ))}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="flex flex-col min-h-screen">
      <header className="h-20 bg-background/80 backdrop-blur-md border-b sticky top-0 z-10 flex items-center justify-between px-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-card border shadow-sm flex items-center justify-center text-primary">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">{t("accounts.title")}</h1>
            <p className="text-sm text-muted-foreground font-medium">{t("accounts.subtitle")}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ExcelToolbar
            exportPath="/api/accounts/export"
            importPath="/api/accounts/import"
            canImport={canCreate}
            invalidateKeys={[getListAccountsQueryKey(), getGetDashboardSummaryQueryKey()]}
          />
          {canCreate && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              {t("accounts.addAccount")}
            </button>
          )}
        </div>
      </header>

      <div className="p-8 flex flex-col gap-6 max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {ACCOUNT_TYPES.map((type) => (
            <div key={type} className="bg-card border rounded-xl p-4 flex flex-col gap-2 relative overflow-hidden shadow-sm">
              <div className={`absolute top-0 bottom-0 w-1 start-0 ${TYPE_COLORS[type]}`} />
              <span className="text-xs font-semibold text-muted-foreground">{t(`accountTypes.${type}`)}</span>
              <span className="font-sans text-lg font-bold tabular-nums">
                {accounts.filter(a => a.type === type).length}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-b pb-px overflow-x-auto">
          {[ALL_TAB, ...ACCOUNT_TYPES].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as AccountType | typeof ALL_TAB)}
              className={`px-4 py-2.5 text-sm font-bold rounded-t-lg border-b-2 -mb-px transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === ALL_TAB ? t("common.all") : t(`accountTypes.${tab}`)}
            </button>
          ))}
        </div>

        <div className="bg-card border rounded-2xl shadow-sm overflow-hidden min-h-[400px]">
          <div className="flex items-center gap-3 px-6 py-3 border-b bg-muted/40 text-xs font-bold text-muted-foreground">
            <span className="w-5" />
            <span className="w-12 text-center">{t("accounts.code")}</span>
            <span className="flex-1">{t("accounts.accountName")}</span>
            <span className="w-20" />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Spinner className="w-8 h-8 text-primary" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
              <p>{t("accounts.noAccounts")}</p>
              {canCreate && (
                <div className="mt-4 flex flex-col items-center gap-3">
                  <button
                    onClick={handleLoadDefaults}
                    disabled={seedDefaults.isPending}
                    className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-5 py-2.5 rounded-full text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
                  >
                    {seedDefaults.isPending ? <Spinner className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {t("accounts.loadDefaults")}
                  </button>
                  <span className="text-xs text-muted-foreground">{t("accounts.loadDefaultsHint")}</span>
                  <button onClick={openCreateModal} className="text-primary font-bold hover:underline">
                    {t("accounts.addFirst")}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 flex flex-col gap-4">
              {groups.map((g) => {
                if (tree[g].length === 0) return null;
                return (
                  <div key={g}>
                    <div className="flex items-center gap-3 px-4 py-2 mb-1">
                      <span className={`w-2.5 h-2.5 rounded-sm ${TYPE_COLORS[g]}`} />
                      <h3 className="text-sm font-extrabold text-foreground">{t(`accountTypes.${g}`)}</h3>
                    </div>
                    <div className="flex flex-col">
                      {tree[g].map((node) => (
                        <TreeRow key={node.id} node={node} depth={1} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={closeModals} />
          <form onSubmit={handleSubmit(onSubmit)} className="relative bg-card rounded-2xl shadow-2xl w-full max-w-lg border flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" />
                <h2 className="text-base font-bold text-foreground">
                  {modalMode === "create" ? t("accounts.createTitle") : t("accounts.editTitle")}
                </h2>
              </div>
              <button type="button" onClick={closeModals} className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-5 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-foreground">{t("accounts.accountCode")}</label>
                  <input
                    dir="ltr"
                    className="bg-background border rounded-xl h-11 px-4 text-sm font-sans font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-start"
                    {...register("code")}
                  />
                  {errors.code && <span className="text-xs text-destructive">{t(`accounts.validation.${errors.code.message}`)}</span>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-foreground">{t("accounts.accountType")}</label>
                  <div className="relative">
                    <select 
                      className="w-full appearance-none bg-background border rounded-xl h-11 ps-4 pe-10 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      {...register("type")}
                    >
                      {ACCOUNT_TYPES.map((val) => (
                        <option key={val} value={val}>{t(`accountTypes.${val}`)}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-foreground">{t("accounts.currencyType")}</label>
                  <div className="relative">
                    <select
                      className="w-full appearance-none bg-background border rounded-xl h-11 ps-4 pe-10 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      {...register("currencyType")}
                    >
                      {(["base", "fixed", "multi"] as const).map((val) => (
                        <option key={val} value={val}>{t(`accounts.currencyTypes.${val}`)}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
                {watchedCurrencyType === "fixed" && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-bold text-foreground">{t("accounts.currency")}</label>
                    <div className="relative">
                      <select
                        dir="ltr"
                        className="w-full appearance-none bg-background border rounded-xl h-11 ps-4 pe-10 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-start"
                        {...register("currency")}
                      >
                        {currencyCodes.map((code) => (
                          <option key={code} value={code}>{code}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">{t("accounts.accountNameAr")}</label>
                <input
                  dir="rtl"
                  placeholder={t("accounts.namePlaceholder")}
                  className="bg-background border rounded-xl h-11 px-4 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  {...register("nameAr")}
                />
                {errors.nameAr && <span className="text-xs text-destructive">{t(`accounts.validation.${errors.nameAr.message}`)}</span>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">
                  {t("accounts.accountNameEn")}
                  <span className="text-xs font-medium text-muted-foreground ms-2">{t("accounts.optional")}</span>
                </label>
                <input
                  dir="ltr"
                  placeholder={t("accounts.namePlaceholderEn")}
                  className="bg-background border rounded-xl h-11 px-4 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  {...register("nameEn")}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">{t("accounts.parentAccount")}</label>
                <div className="relative">
                  <select 
                    className="w-full appearance-none bg-background border rounded-xl h-11 ps-4 pe-10 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    {...register("parentId")}
                  >
                    <option value="">{t("accounts.parentNone")}</option>
                    {accounts.filter(a => a.isGroup && a.id !== accountToEdit?.id).map(a => (
                      <option key={a.id} value={a.id}>{a.code} - {displayName(a, lang)}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              <div className="flex items-center justify-between bg-secondary/40 border border-secondary rounded-xl px-4 py-3 cursor-pointer" onClick={() => setValue("isGroup", !isGroup)}>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-foreground">{t("accounts.isGroupTitle")}</span>
                  <span className="text-xs text-muted-foreground">{t("accounts.isGroupHint")}</span>
                </div>
                <div className={`w-10 h-6 rounded-full flex items-center transition-colors px-0.5 ${isGroup ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${isGroup ? 'translate-x-4 rtl:-translate-x-4' : 'translate-x-0'}`} />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/30">
              <button
                type="button"
                onClick={closeModals}
                className="px-5 py-2.5 rounded-full text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button 
                type="submit" 
                disabled={createAccount.isPending || updateAccount.isPending}
                className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-5 py-2.5 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
              >
                <Check className="w-4 h-4" />
                {createAccount.isPending || updateAccount.isPending ? t("common.saving") : t("accounts.saveAccount")}
              </button>
            </div>
          </form>
        </div>
      )}

      <AlertDialog open={!!accountToDelete} onOpenChange={(open) => !open && setAccountToDelete(null)}>
        <AlertDialogContent className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-start">{t("accounts.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="text-start">
              {t("accounts.deleteBody", { name: accountToDelete ? displayName(accountToDelete, lang) : "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              {deleteAccount.isPending ? t("accounts.deleting") : t("accounts.confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
