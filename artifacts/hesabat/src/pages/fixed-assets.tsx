import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListAssets,
  useCreateAsset,
  useUpdateAsset,
  useDeleteAsset,
  useRunDepreciation,
  useListAccounts,
  useGetCurrentUser,
  getListAssetsQueryKey,
  getListJournalEntriesQueryKey,
  type FixedAsset,
  type Account,
} from "@workspace/api-client-react";
import { hasCapability } from "@workspace/permissions";
import { useQueryClient } from "@tanstack/react-query";
import { Boxes, Plus, X, Check, Trash2, Edit2, CalendarClock } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { ExcelToolbar } from "@/components/ExcelToolbar";
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

const assetSchema = z.object({
  nameAr: z.string().min(1, "nameRequired"),
  nameEn: z.string().optional(),
  category: z.string().optional(),
  acquisitionDate: z.string().min(1, "dateRequired"),
  cost: z.coerce.number().gt(0, "costRequired"),
  salvageValue: z.coerce.number().min(0, "salvageInvalid"),
  usefulLifeMonths: z.coerce.number().int().gt(0, "lifeRequired"),
  assetAccountId: z.string().min(1, "accountRequired"),
  accumulatedAccountId: z.string().min(1, "accountRequired"),
  expenseAccountId: z.string().min(1, "accountRequired"),
  status: z.enum(["active", "disposed"]).default("active"),
});

type AssetForm = z.input<typeof assetSchema>;

function displayName(
  e: { nameAr: string; nameEn?: string | null },
  lang: string,
): string {
  return lang.startsWith("en") && e.nameEn ? e.nameEn : e.nameAr;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function FixedAssets() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: assets = [], isLoading } = useListAssets();
  const { data: accounts = [] } = useListAccounts();
  const postableAccounts = useMemo(
    () => accounts.filter((a: Account) => !a.isGroup),
    [accounts],
  );
  const createAsset = useCreateAsset();
  const updateAsset = useUpdateAsset();
  const deleteAsset = useDeleteAsset();
  const runDepreciation = useRunDepreciation();
  const { data: user } = useGetCurrentUser();
  const role = user?.role ?? "";
  const canCreate = hasCapability(role, "assets:create");
  const canUpdate = hasCapability(role, "assets:update");
  const canDelete = hasCapability(role, "assets:delete");

  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [assetToEdit, setAssetToEdit] = useState<FixedAsset | null>(null);
  const [assetToDelete, setAssetToDelete] = useState<FixedAsset | null>(null);
  const [depModalOpen, setDepModalOpen] = useState(false);
  const [depPeriod, setDepPeriod] = useState(currentMonth());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AssetForm>({
    resolver: zodResolver(assetSchema),
    defaultValues: { status: "active", salvageValue: 0 },
  });
  const status = watch("status");

  const openCreateModal = () => {
    reset({
      nameAr: "",
      nameEn: "",
      category: "",
      acquisitionDate: "",
      cost: undefined,
      salvageValue: 0,
      usefulLifeMonths: undefined,
      assetAccountId: "",
      accumulatedAccountId: "",
      expenseAccountId: "",
      status: "active",
    });
    setModalMode("create");
  };

  const openEditModal = (a: FixedAsset) => {
    reset({
      nameAr: a.nameAr,
      nameEn: a.nameEn ?? "",
      category: a.category ?? "",
      acquisitionDate: a.acquisitionDate,
      cost: a.cost,
      salvageValue: a.salvageValue,
      usefulLifeMonths: a.usefulLifeMonths,
      assetAccountId: a.assetAccountId,
      accumulatedAccountId: a.accumulatedAccountId,
      expenseAccountId: a.expenseAccountId,
      status: a.status,
    });
    setAssetToEdit(a);
    setModalMode("edit");
  };

  const closeModals = () => {
    setModalMode(null);
    setAssetToEdit(null);
  };

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListAssetsQueryKey() });

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(n);

  const onSubmit = (form: AssetForm) => {
    const cost = Number(form.cost);
    const salvage = Number(form.salvageValue ?? 0);
    if (salvage >= cost) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t("assets.validation.salvageTooHigh"),
      });
      return;
    }
    const base = {
      nameAr: form.nameAr,
      nameEn: form.nameEn || null,
      category: form.category || null,
      acquisitionDate: form.acquisitionDate,
      cost,
      salvageValue: salvage,
      usefulLifeMonths: Number(form.usefulLifeMonths),
      assetAccountId: form.assetAccountId,
      accumulatedAccountId: form.accumulatedAccountId,
      expenseAccountId: form.expenseAccountId,
    };
    if (modalMode === "create") {
      createAsset.mutate(
        { data: base },
        {
          onSuccess: () => {
            invalidate();
            toast({ title: t("assets.toast.added") });
            closeModals();
          },
          onError: (err: any) =>
            toast({
              variant: "destructive",
              title: t("common.error"),
              description: err?.data?.error || t("assets.toast.addError"),
            }),
        },
      );
    } else if (modalMode === "edit" && assetToEdit) {
      updateAsset.mutate(
        { id: assetToEdit.id, data: { ...base, status: form.status } },
        {
          onSuccess: () => {
            invalidate();
            toast({ title: t("assets.toast.edited") });
            closeModals();
          },
          onError: (err: any) =>
            toast({
              variant: "destructive",
              title: t("common.error"),
              description: err?.data?.error || t("assets.toast.editError"),
            }),
        },
      );
    }
  };

  const handleBulkDeleteAssets = async () => {
    setIsBulkDeleting(true);
    let ok = 0; let fail = 0;
    for (const id of Array.from(selectedIds)) {
      try { await deleteAsset.mutateAsync({ id }); ok++; }
      catch { fail++; }
    }
    setIsBulkDeleting(false);
    setBulkDeleteOpen(false);
    setSelectedIds(new Set());
    invalidate();
    if (ok > 0) toast({ title: `تم حذف ${ok} أصل بنجاح` });
    if (fail > 0) toast({ variant: "destructive", title: t("common.error"), description: `فشل حذف ${fail} أصل` });
  };

  const handleDelete = () => {
    if (!assetToDelete) return;
    deleteAsset.mutate(
      { id: assetToDelete.id },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: t("assets.toast.deleted") });
          setAssetToDelete(null);
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: t("common.error"),
            description: err?.data?.error || t("assets.toast.deleteError"),
          });
          setAssetToDelete(null);
        },
      },
    );
  };

  const handleRunDepreciation = () => {
    if (!/^\d{4}-\d{2}$/.test(depPeriod)) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t("assets.depreciation.invalidPeriod"),
      });
      return;
    }
    runDepreciation.mutate(
      { data: { period: depPeriod } },
      {
        onSuccess: (result) => {
          invalidate();
          queryClient.invalidateQueries({
            queryKey: getListJournalEntriesQueryKey(),
          });
          if (result.assetsDepreciated > 0) {
            toast({
              title: t("assets.depreciation.successTitle"),
              description: t("assets.depreciation.successBody", {
                count: result.assetsDepreciated,
                total: fmt(result.totalAmount),
                no: result.journalEntryNo ?? "",
              }),
            });
          } else {
            toast({
              title: t("assets.depreciation.nothingTitle"),
              description: t("assets.depreciation.nothingBody"),
            });
          }
          setDepModalOpen(false);
        },
        onError: (err: any) =>
          toast({
            variant: "destructive",
            title: t("common.error"),
            description: err?.data?.error || t("assets.depreciation.error"),
          }),
      },
    );
  };

  const accountLabel = (a: Account) =>
    `${a.code} · ${displayName(a, lang)}`;

  return (
    <div className="flex flex-col">
      <header className="h-20 bg-background/80 backdrop-blur-md border-b flex items-center justify-between px-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-card border shadow-sm flex items-center justify-center text-primary">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">{t("assets.title")}</h1>
            <p className="text-sm text-muted-foreground font-medium">{t("assets.subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExcelToolbar
            exportPath="/api/assets/export"
            importPath="/api/assets/import"
            canImport={canCreate}
            invalidateKeys={[getListAssetsQueryKey()]}
          />
          {canCreate && assets.length > 0 && (
            <button
              onClick={() => {
                setDepPeriod(currentMonth());
                setDepModalOpen(true);
              }}
              className="flex items-center gap-2 bg-card border text-foreground px-4 py-2 rounded-full text-sm font-bold hover:bg-muted transition-colors"
            >
              <CalendarClock className="w-4 h-4" />
              {t("assets.runDepreciation")}
            </button>
          )}
          {canCreate && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              {t("assets.addAsset")}
            </button>
          )}
        </div>
      </header>

      <div className="p-8 flex flex-col gap-6 max-w-6xl mx-auto w-full">
        <div className="bg-card border rounded-2xl shadow-sm overflow-hidden min-h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center p-12"><Spinner className="w-8 h-8 text-primary" /></div>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-2 text-center">
              <p className="font-bold text-foreground">{t("assets.noAssets")}</p>
              <p className="text-sm max-w-md">{t("assets.noAssetsHint")}</p>
              {canCreate && (
                <button onClick={openCreateModal} className="mt-2 text-primary font-bold hover:underline">{t("assets.addAsset")}</button>
              )}
            </div>
          ) : (
            <>
              {selectedIds.size > 0 && canDelete && (
                <div className="flex items-center gap-3 bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex-wrap">
                  <span className="text-sm font-bold text-slate-700">تم تحديد {selectedIds.size} أصل</span>
                  <button onClick={() => setBulkDeleteOpen(true)} className="flex items-center gap-2 bg-destructive text-destructive-foreground px-3 py-1.5 rounded-lg text-sm font-bold hover:opacity-90">
                    <Trash2 className="w-4 h-4" />حذف المحدد
                  </button>
                  <button onClick={() => setSelectedIds(new Set())} className="text-sm text-slate-500 hover:underline ms-auto">إلغاء التحديد</button>
                </div>
              )}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
                    {canDelete && (
                      <th className="px-3 py-3 w-8">
                        {(() => {
                          const all = assets.length > 0 && assets.every((a) => selectedIds.has(a.id));
                          const some = assets.some((a) => selectedIds.has(a.id)) && !all;
                          return <input type="checkbox" checked={all} ref={(el) => { if (el) el.indeterminate = some; }} onChange={() => all ? setSelectedIds(new Set()) : setSelectedIds(new Set(assets.map((a) => a.id)))} className="w-4 h-4 accent-primary cursor-pointer" />;
                        })()}
                      </th>
                    )}
                    <th className="text-start px-6 py-3">{t("assets.name")}</th>
                    <th className="text-start px-3 py-3">{t("assets.acquisitionDate")}</th>
                    <th className="text-end px-3 py-3">{t("assets.cost")}</th>
                    <th className="text-end px-3 py-3">{t("assets.accumulated")}</th>
                    <th className="text-end px-3 py-3">{t("assets.netBookValue")}</th>
                    <th className="text-center px-3 py-3">{t("assets.status")}</th>
                    {(canUpdate || canDelete) && <th className="w-20 px-6 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a) => (
                    <tr key={a.id} className={`group border-t hover:bg-muted/40 transition-colors ${selectedIds.has(a.id) ? "bg-rose-50/40" : ""}`}>
                      {canDelete && (
                        <td className="px-3 py-3.5">
                          <input type="checkbox" checked={selectedIds.has(a.id)} onChange={() => { const n = new Set(selectedIds); n.has(a.id) ? n.delete(a.id) : n.add(a.id); setSelectedIds(n); }} className="w-4 h-4 accent-primary cursor-pointer" />
                        </td>
                      )}
                      <td className="px-6 py-3.5">
                        <div className="font-medium text-foreground">{displayName(a, lang)}</div>
                        {a.category && (
                          <div className="text-xs text-muted-foreground">{a.category}</div>
                        )}
                      </td>
                      <td className="px-3 py-3.5 text-foreground/80 font-sans tabular-nums" dir="ltr">{a.acquisitionDate}</td>
                      <td className="px-3 py-3.5 text-end text-foreground/80 font-sans tabular-nums" dir="ltr">{fmt(a.cost)}</td>
                      <td className="px-3 py-3.5 text-end text-foreground/80 font-sans tabular-nums" dir="ltr">{fmt(a.accumulatedDepreciation)}</td>
                      <td className="px-3 py-3.5 text-end font-bold text-foreground font-sans tabular-nums" dir="ltr">{fmt(a.netBookValue)}</td>
                      <td className="px-3 py-3.5 text-center">
                        {a.status === "active" ? (
                          <span className="text-[11px] font-bold text-success bg-success/10 px-2.5 py-1 rounded-full">{t("assets.statusActive")}</span>
                        ) : (
                          <span className="text-[11px] font-bold text-muted-foreground bg-muted px-2.5 py-1 rounded-full">{t("assets.statusDisposed")}</span>
                        )}
                      </td>
                      {(canUpdate || canDelete) && (
                        <td className="px-6 py-3.5">
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 justify-end">
                            {canUpdate && (
                              <button onClick={() => openEditModal(a)} className="p-1.5 rounded-md hover:bg-primary/10 text-primary transition-colors" title={t("common.edit")}>
                                <Edit2 className="w-4 h-4" />
                              </button>
                            )}
                            {canDelete && (
                              <button onClick={() => setAssetToDelete(a)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive transition-colors" title={t("common.delete")}>
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
            </>
          )}
        </div>
      </div>

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={closeModals} />
          <form onSubmit={handleSubmit(onSubmit)} className="relative bg-card rounded-2xl shadow-2xl w-full max-w-2xl border flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <Boxes className="w-5 h-5 text-primary" />
                <h2 className="text-base font-bold text-foreground">{modalMode === "create" ? t("assets.createTitle") : t("assets.editTitle")}</h2>
              </div>
              <button type="button" onClick={closeModals} className="p-1 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5 overflow-y-auto">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">{t("assets.nameAr")}</label>
                <input dir="rtl" placeholder={t("assets.namePlaceholder")} className="bg-background border rounded-xl h-11 px-4 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("nameAr")} />
                {errors.nameAr && <span className="text-xs text-destructive">{t(`assets.validation.${errors.nameAr.message}`)}</span>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">
                  {t("assets.nameEn")}<span className="text-xs font-medium text-muted-foreground ms-2">{t("assets.optional")}</span>
                </label>
                <input dir="ltr" placeholder={t("assets.namePlaceholderEn")} className="bg-background border rounded-xl h-11 px-4 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("nameEn")} />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">
                  {t("assets.category")}<span className="text-xs font-medium text-muted-foreground ms-2">{t("assets.optional")}</span>
                </label>
                <input placeholder={t("assets.categoryPlaceholder")} className="bg-background border rounded-xl h-11 px-4 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("category")} />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">{t("assets.acquisitionDate")}</label>
                <input dir="ltr" type="date" className="bg-background border rounded-xl h-11 px-4 text-sm font-sans text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("acquisitionDate")} />
                {errors.acquisitionDate && <span className="text-xs text-destructive">{t(`assets.validation.${errors.acquisitionDate.message}`)}</span>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">{t("assets.cost")}</label>
                <input dir="ltr" type="number" step="0.01" placeholder="100000" className="bg-background border rounded-xl h-11 px-4 text-sm font-sans text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("cost")} />
                {errors.cost && <span className="text-xs text-destructive">{t(`assets.validation.${errors.cost.message}`)}</span>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">{t("assets.salvageValue")}</label>
                <input dir="ltr" type="number" step="0.01" placeholder="0" className="bg-background border rounded-xl h-11 px-4 text-sm font-sans text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("salvageValue")} />
                {errors.salvageValue && <span className="text-xs text-destructive">{t(`assets.validation.${errors.salvageValue.message}`)}</span>}
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-sm font-bold text-foreground">{t("assets.usefulLifeMonths")}</label>
                <input dir="ltr" type="number" step="1" placeholder="60" className="bg-background border rounded-xl h-11 px-4 text-sm font-sans text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("usefulLifeMonths")} />
                {errors.usefulLifeMonths && <span className="text-xs text-destructive">{t(`assets.validation.${errors.usefulLifeMonths.message}`)}</span>}
                <span className="text-xs text-muted-foreground">{t("assets.usefulLifeHint")}</span>
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2 border-t pt-4">
                <span className="text-xs font-bold text-muted-foreground">{t("assets.accountsSection")}</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">{t("assets.assetAccount")}</label>
                <select className="bg-background border rounded-xl h-11 px-3 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("assetAccountId")}>
                  <option value="">{t("assets.selectAccount")}</option>
                  {postableAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{accountLabel(a)}</option>
                  ))}
                </select>
                {errors.assetAccountId && <span className="text-xs text-destructive">{t(`assets.validation.${errors.assetAccountId.message}`)}</span>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">{t("assets.accumulatedAccount")}</label>
                <select className="bg-background border rounded-xl h-11 px-3 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("accumulatedAccountId")}>
                  <option value="">{t("assets.selectAccount")}</option>
                  {postableAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{accountLabel(a)}</option>
                  ))}
                </select>
                {errors.accumulatedAccountId && <span className="text-xs text-destructive">{t(`assets.validation.${errors.accumulatedAccountId.message}`)}</span>}
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-sm font-bold text-foreground">{t("assets.expenseAccount")}</label>
                <select className="bg-background border rounded-xl h-11 px-3 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("expenseAccountId")}>
                  <option value="">{t("assets.selectAccount")}</option>
                  {postableAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{accountLabel(a)}</option>
                  ))}
                </select>
                {errors.expenseAccountId && <span className="text-xs text-destructive">{t(`assets.validation.${errors.expenseAccountId.message}`)}</span>}
              </div>

              {modalMode === "edit" && (
                <div className="flex items-center justify-between bg-secondary/40 border border-secondary rounded-xl px-4 py-3 cursor-pointer sm:col-span-2" onClick={() => setValue("status", status === "active" ? "disposed" : "active")}>
                  <span className="text-sm font-bold text-foreground">{t("assets.statusActiveLabel")}</span>
                  <div className={`w-10 h-6 rounded-full flex items-center transition-colors px-0.5 ${status === "active" ? "bg-primary" : "bg-muted-foreground/30"}`}>
                    <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${status === "active" ? "translate-x-4 rtl:-translate-x-4" : "translate-x-0"}`} />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/30">
              <button type="button" onClick={closeModals} className="px-5 py-2.5 rounded-full text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">{t("common.cancel")}</button>
              <button type="submit" disabled={createAsset.isPending || updateAsset.isPending} className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-5 py-2.5 rounded-full text-sm font-bold hover:opacity-90 transition-opacity">
                <Check className="w-4 h-4" />
                {createAsset.isPending || updateAsset.isPending ? t("common.saving") : t("assets.save")}
              </button>
            </div>
          </form>
        </div>
      )}

      {depModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setDepModalOpen(false)} />
          <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-md border flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-5 h-5 text-primary" />
                <h2 className="text-base font-bold text-foreground">{t("assets.depreciation.title")}</h2>
              </div>
              <button type="button" onClick={() => setDepModalOpen(false)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 flex flex-col gap-5">
              <p className="text-sm text-muted-foreground">{t("assets.depreciation.hint")}</p>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">{t("assets.depreciation.periodLabel")}</label>
                <input dir="ltr" type="month" value={depPeriod} onChange={(e) => setDepPeriod(e.target.value)} className="bg-background border rounded-xl h-11 px-4 text-sm font-sans text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/30">
              <button type="button" onClick={() => setDepModalOpen(false)} className="px-5 py-2.5 rounded-full text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">{t("common.cancel")}</button>
              <button type="button" onClick={handleRunDepreciation} disabled={runDepreciation.isPending} className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-5 py-2.5 rounded-full text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60">
                <Check className="w-4 h-4" />
                {runDepreciation.isPending ? t("assets.depreciation.running") : t("assets.depreciation.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={bulkDeleteOpen} onOpenChange={(open) => !open && setBulkDeleteOpen(false)}>
        <AlertDialogContent className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-start">حذف {selectedIds.size} أصل</AlertDialogTitle>
            <AlertDialogDescription className="text-start">
              سيتم حذف {selectedIds.size} أصل نهائياً ولا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogCancel disabled={isBulkDeleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDeleteAssets} disabled={isBulkDeleting} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              {isBulkDeleting ? "جارٍ الحذف..." : "حذف المحدد"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!assetToDelete} onOpenChange={(open) => !open && setAssetToDelete(null)}>
        <AlertDialogContent className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-start">{t("assets.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="text-start">
              {t("assets.deleteBody", { name: assetToDelete ? displayName(assetToDelete, lang) : "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              {deleteAsset.isPending ? t("assets.deleting") : t("assets.confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
