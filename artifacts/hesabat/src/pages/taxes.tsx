import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListTaxes,
  useCreateTax,
  useUpdateTax,
  useDeleteTax,
  useSeedDefaultTaxes,
  useListAccounts,
  useGetCurrentUser,
  getListTaxesQueryKey,
  type Tax,
} from "@workspace/api-client-react";
import { hasCapability } from "@workspace/permissions";
import { useQueryClient } from "@tanstack/react-query";
import { Percent, Plus, X, Check, ChevronDown, Link2, Trash2, Edit2, Download } from "lucide-react";
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

const TAX_KINDS = ["vat", "wht", "income", "payroll", "zakat"] as const;
type TaxKind = (typeof TAX_KINDS)[number];

const KIND_RATE_COLOR: Record<TaxKind, string> = {
  vat: "text-primary bg-primary/10",
  wht: "text-amber-600 bg-amber-500/10",
  income: "text-blue-600 bg-blue-500/10",
  payroll: "text-purple-600 bg-purple-500/10",
  zakat: "text-emerald-600 bg-emerald-500/10",
};

const taxSchema = z.object({
  nameAr: z.string().min(1, "nameRequired"),
  nameEn: z.string().optional(),
  kind: z.enum(TAX_KINDS),
  rate: z.coerce.number().min(0, "rateRequired"),
  serviceNature: z.string().optional(),
  linkedAccountId: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});

type TaxForm = z.input<typeof taxSchema>;

function displayName(e: { nameAr: string; nameEn?: string | null }, lang: string): string {
  return lang.startsWith("en") && e.nameEn ? e.nameEn : e.nameAr;
}

export function Taxes() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: taxes = [], isLoading } = useListTaxes();
  const { data: accounts = [] } = useListAccounts();
  const createTax = useCreateTax();
  const updateTax = useUpdateTax();
  const deleteTax = useDeleteTax();
  const seedTaxes = useSeedDefaultTaxes();
  const { data: user } = useGetCurrentUser();
  const role = user?.role ?? "";
  const canCreate = hasCapability(role, "taxes:create");
  const canUpdate = hasCapability(role, "taxes:update");
  const canDelete = hasCapability(role, "taxes:delete");

  const [tab, setTab] = useState<TaxKind>("vat");
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [taxToEdit, setTaxToEdit] = useState<Tax | null>(null);
  const [taxToDelete, setTaxToDelete] = useState<Tax | null>(null);

  const visible = taxes.filter((tx) => tx.kind === tab);
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<TaxForm>({
    resolver: zodResolver(taxSchema),
    defaultValues: { kind: "vat", isActive: true, linkedAccountId: null },
  });
  const isActive = watch("isActive");

  const openCreateModal = () => {
    reset({ nameAr: "", nameEn: "", kind: tab, rate: 0, serviceNature: "", linkedAccountId: null, isActive: true });
    setModalMode("create");
  };

  const openEditModal = (tx: Tax) => {
    reset({
      nameAr: tx.nameAr,
      nameEn: tx.nameEn ?? "",
      kind: tx.kind as TaxKind,
      rate: tx.rate,
      serviceNature: tx.serviceNature ?? "",
      linkedAccountId: tx.linkedAccountId,
      isActive: tx.isActive,
    });
    setTaxToEdit(tx);
    setModalMode("edit");
  };

  const closeModals = () => {
    setModalMode(null);
    setTaxToEdit(null);
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListTaxesQueryKey() });

  const onSubmit = (form: TaxForm) => {
    const data = {
      nameAr: form.nameAr,
      nameEn: form.nameEn || null,
      kind: form.kind,
      rate: Number(form.rate),
      serviceNature: form.serviceNature || null,
      linkedAccountId: form.linkedAccountId || null,
      isActive: form.isActive ?? true,
    };
    if (modalMode === "create") {
      createTax.mutate({ data }, {
        onSuccess: () => { invalidate(); toast({ title: t("taxes.toast.added") }); closeModals(); },
        onError: (err: any) => toast({ variant: "destructive", title: t("common.error"), description: err?.data?.error || t("taxes.toast.addError") }),
      });
    } else if (modalMode === "edit" && taxToEdit) {
      updateTax.mutate({ id: taxToEdit.id, data }, {
        onSuccess: () => { invalidate(); toast({ title: t("taxes.toast.edited") }); closeModals(); },
        onError: (err: any) => toast({ variant: "destructive", title: t("common.error"), description: err?.data?.error || t("taxes.toast.editError") }),
      });
    }
  };

  const handleDelete = () => {
    if (!taxToDelete) return;
    deleteTax.mutate({ id: taxToDelete.id }, {
      onSuccess: () => { invalidate(); toast({ title: t("taxes.toast.deleted") }); setTaxToDelete(null); },
      onError: (err: any) => { toast({ variant: "destructive", title: t("common.error"), description: err?.data?.error || t("taxes.toast.deleteError") }); setTaxToDelete(null); },
    });
  };

  const handleSeedDefaults = () => {
    seedTaxes.mutate(undefined, {
      onSuccess: () => { invalidate(); toast({ title: t("taxes.toast.seeded") }); },
      onError: (err: any) => toast({ variant: "destructive", title: t("common.error"), description: err?.data?.error || t("taxes.toast.seedError") }),
    });
  };

  const rateColor = KIND_RATE_COLOR[tab];

  return (
    <div className="flex flex-col">
      <header className="h-20 bg-background/80 backdrop-blur-md border-b flex items-center justify-between px-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-card border shadow-sm flex items-center justify-center text-primary">
            <Percent className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">{t("taxes.title")}</h1>
            <p className="text-sm text-muted-foreground font-medium">{t("taxes.subtitle")}</p>
          </div>
        </div>
        {canCreate && (
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            {t("taxes.addTax")}
          </button>
        )}
      </header>

      <div className="p-8 flex flex-col gap-6 max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-full w-fit">
          {TAX_KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${
                tab === k ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(`taxes.tabs.${k}`)}
            </button>
          ))}
        </div>

        <p className="text-sm text-muted-foreground">{t(`taxes.hints.${tab}`)}</p>

        <div className="bg-card border rounded-2xl shadow-sm overflow-hidden min-h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center p-12"><Spinner className="w-8 h-8 text-primary" /></div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-3">
              <p>{t("taxes.noTaxes", { kind: t(`taxes.tabs.${tab}`) })}</p>
              {taxes.length === 0 && canCreate && (
                <>
                  <p className="text-xs text-center max-w-sm">{t("taxes.seedDefaultsHint")}</p>
                  <button
                    onClick={handleSeedDefaults}
                    disabled={seedTaxes.isPending}
                    className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
                  >
                    {seedTaxes.isPending ? <Spinner className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                    {t("taxes.seedDefaults")}
                  </button>
                </>
              )}
              {canCreate && (
                <button onClick={openCreateModal} className="text-primary font-bold hover:underline">{t("taxes.addTax")}</button>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
                  <th className="text-start px-6 py-3">{t("taxes.name")}</th>
                  <th className="text-center px-3 py-3">{t("taxes.rate")}</th>
                  <th className="text-start px-3 py-3">{t("taxes.serviceNature")}</th>
                  <th className="text-start px-3 py-3">{t("taxes.linkedAccount")}</th>
                  <th className="text-center px-3 py-3">{t("taxes.status")}</th>
                  {(canUpdate || canDelete) && <th className="w-20 px-6 py-3" />}
                </tr>
              </thead>
              <tbody>
                {visible.map((tx) => {
                  const acc = tx.linkedAccountId ? accountById.get(tx.linkedAccountId) : null;
                  return (
                    <tr key={tx.id} className="group border-t hover:bg-muted/40 transition-colors">
                      <td className="px-6 py-3.5 font-bold text-foreground">{displayName(tx, lang)}</td>
                      <td className="px-3 py-3.5 text-center">
                        <span className={`font-sans font-bold px-2.5 py-1 rounded-full ${rateColor}`}>{tx.rate}%</span>
                      </td>
                      <td className="px-3 py-3.5 text-foreground/80">{tx.serviceNature || t("taxes.none")}</td>
                      <td className="px-3 py-3.5">
                        {acc ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Link2 className="w-3.5 h-3.5 text-success" />
                            <span className="font-sans" dir="ltr">{acc.code} - {displayName(acc, lang)}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t("taxes.none")}</span>
                        )}
                      </td>
                      <td className="px-3 py-3.5 text-center">
                        {tx.isActive ? (
                          <span className="text-[11px] font-bold text-success bg-success/10 px-2.5 py-1 rounded-full">{t("taxes.active")}</span>
                        ) : (
                          <span className="text-[11px] font-bold text-muted-foreground bg-muted px-2.5 py-1 rounded-full">{t("taxes.inactive")}</span>
                        )}
                      </td>
                      {(canUpdate || canDelete) && (
                        <td className="px-6 py-3.5">
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 justify-end">
                            {canUpdate && (
                              <button onClick={() => openEditModal(tx)} className="p-1.5 rounded-md hover:bg-primary/10 text-primary transition-colors" title={t("common.edit")}>
                                <Edit2 className="w-4 h-4" />
                              </button>
                            )}
                            {canDelete && (
                              <button onClick={() => setTaxToDelete(tx)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive transition-colors" title={t("common.delete")}>
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={closeModals} />
          <form onSubmit={handleSubmit(onSubmit)} className="relative bg-card rounded-2xl shadow-2xl w-full max-w-lg border flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <Percent className="w-5 h-5 text-primary" />
                <h2 className="text-base font-bold text-foreground">{modalMode === "create" ? t("taxes.createTitle") : t("taxes.editTitle")}</h2>
              </div>
              <button type="button" onClick={closeModals} className="p-1 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 flex flex-col gap-5 overflow-y-auto">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">{t("taxes.kind")}</label>
                <div className="grid grid-cols-3 gap-2">
                  {TAX_KINDS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setValue("kind", k)}
                      className={`p-3 rounded-xl border text-sm font-bold transition-all ${
                        watch("kind") === k ? "border-primary/50 bg-primary/5 text-primary ring-1 ring-primary/20" : "border-border text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      {t(`taxes.kindLabels.${k}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">{t("taxes.nameAr")}</label>
                <input dir="rtl" placeholder={t("taxes.namePlaceholder")} className="bg-background border rounded-xl h-11 px-4 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("nameAr")} />
                {errors.nameAr && <span className="text-xs text-destructive">{t(`taxes.validation.${errors.nameAr.message}`)}</span>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">
                  {t("taxes.nameEn")}<span className="text-xs font-medium text-muted-foreground ms-2">{t("taxes.optional")}</span>
                </label>
                <input dir="ltr" placeholder={t("taxes.namePlaceholderEn")} className="bg-background border rounded-xl h-11 px-4 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("nameEn")} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-foreground">{t("taxes.rate")} (%)</label>
                  <input dir="ltr" type="number" step="0.001" placeholder={t("taxes.ratePlaceholder")} className="bg-background border rounded-xl h-11 px-4 text-sm font-sans text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("rate")} />
                  {errors.rate && <span className="text-xs text-destructive">{t(`taxes.validation.${errors.rate.message}`)}</span>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-foreground">{t("taxes.serviceNature")}<span className="text-xs font-medium text-muted-foreground ms-2">{t("taxes.optional")}</span></label>
                  <input placeholder={t("taxes.serviceNaturePlaceholder")} className="bg-background border rounded-xl h-11 px-4 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("serviceNature")} />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">{t("taxes.linkedAccountLabel")}<span className="text-xs font-medium text-muted-foreground ms-2">{t("taxes.optional")}</span></label>
                <div className="relative">
                  <select className="w-full appearance-none bg-background border rounded-xl h-11 ps-4 pe-10 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("linkedAccountId")}>
                    <option value="">{t("taxes.linkedAccountNone")}</option>
                    {accounts.filter((a) => !a.isGroup).map((a) => (
                      <option key={a.id} value={a.id}>{a.code} - {displayName(a, lang)}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              <div className="flex items-center justify-between bg-secondary/40 border border-secondary rounded-xl px-4 py-3 cursor-pointer" onClick={() => setValue("isActive", !isActive)}>
                <span className="text-sm font-bold text-foreground">{t("taxes.isActive")}</span>
                <div className={`w-10 h-6 rounded-full flex items-center transition-colors px-0.5 ${isActive ? "bg-primary" : "bg-muted-foreground/30"}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${isActive ? "translate-x-4 rtl:-translate-x-4" : "translate-x-0"}`} />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/30">
              <button type="button" onClick={closeModals} className="px-5 py-2.5 rounded-full text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">{t("common.cancel")}</button>
              <button type="submit" disabled={createTax.isPending || updateTax.isPending} className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-5 py-2.5 rounded-full text-sm font-bold hover:opacity-90 transition-opacity">
                <Check className="w-4 h-4" />
                {createTax.isPending || updateTax.isPending ? t("common.saving") : t("taxes.save")}
              </button>
            </div>
          </form>
        </div>
      )}

      <AlertDialog open={!!taxToDelete} onOpenChange={(open) => !open && setTaxToDelete(null)}>
        <AlertDialogContent className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-start">{t("taxes.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="text-start">
              {t("taxes.deleteBody", { name: taxToDelete ? displayName(taxToDelete, lang) : "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              {deleteTax.isPending ? t("taxes.deleting") : t("taxes.confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
