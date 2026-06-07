import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListCurrencies,
  useCreateCurrency,
  useUpdateCurrency,
  useDeleteCurrency,
  useRefreshCurrencyRates,
  useGetCurrentUser,
  useGetCompany,
  getListCurrenciesQueryKey,
  type Currency,
} from "@workspace/api-client-react";
import { hasCapability } from "@workspace/permissions";
import { useQueryClient } from "@tanstack/react-query";
import { Coins, Plus, X, Check, Trash2, Edit2, RefreshCw } from "lucide-react";
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

const currencySchema = z.object({
  code: z.string().min(1, "codeRequired"),
  nameAr: z.string().min(1, "nameRequired"),
  nameEn: z.string().optional(),
  exchangeRate: z.coerce.number().gt(0, "rateRequired"),
  isActive: z.boolean().default(true),
});

type CurrencyForm = z.input<typeof currencySchema>;

function displayName(
  e: { nameAr: string; nameEn?: string | null },
  lang: string,
): string {
  return lang.startsWith("en") && e.nameEn ? e.nameEn : e.nameAr;
}

export function Currencies() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: currencies = [], isLoading } = useListCurrencies();
  const { data: company } = useGetCompany();
  const baseCurrency = company?.baseCurrency || "EGP";
  const createCurrency = useCreateCurrency();
  const updateCurrency = useUpdateCurrency();
  const deleteCurrency = useDeleteCurrency();
  const refreshRates = useRefreshCurrencyRates();
  const { data: user } = useGetCurrentUser();
  const role = user?.role ?? "";
  const canCreate = hasCapability(role, "currencies:create");
  const canUpdate = hasCapability(role, "currencies:update");
  const canDelete = hasCapability(role, "currencies:delete");

  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [currencyToEdit, setCurrencyToEdit] = useState<Currency | null>(null);
  const [currencyToDelete, setCurrencyToDelete] = useState<Currency | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CurrencyForm>({
    resolver: zodResolver(currencySchema),
    defaultValues: { isActive: true },
  });
  const isActive = watch("isActive");

  const openCreateModal = () => {
    reset({ code: "", nameAr: "", nameEn: "", exchangeRate: undefined, isActive: true });
    setModalMode("create");
  };

  const openEditModal = (c: Currency) => {
    reset({
      code: c.code,
      nameAr: c.nameAr,
      nameEn: c.nameEn ?? "",
      exchangeRate: c.exchangeRate,
      isActive: c.isActive,
    });
    setCurrencyToEdit(c);
    setModalMode("edit");
  };

  const closeModals = () => {
    setModalMode(null);
    setCurrencyToEdit(null);
  };

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListCurrenciesQueryKey() });

  const lastUpdated = currencies
    .map((c) => c.rateUpdatedAt)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);

  const handleRefreshRates = () => {
    refreshRates.mutate(undefined, {
      onSuccess: (result) => {
        invalidate();
        toast({
          title: t("currencies.toast.ratesUpdated", { count: result.updated }),
          description:
            result.skipped.length > 0
              ? t("currencies.toast.ratesSkipped", { count: result.skipped.length })
              : undefined,
        });
      },
      onError: (err: any) =>
        toast({
          variant: "destructive",
          title: t("common.error"),
          description: err?.data?.error || t("currencies.toast.ratesError"),
        }),
    });
  };

  const onSubmit = (form: CurrencyForm) => {
    const data = {
      code: String(form.code).trim().toUpperCase(),
      nameAr: form.nameAr,
      nameEn: form.nameEn || null,
      exchangeRate: Number(form.exchangeRate),
      isActive: form.isActive ?? true,
    };
    if (modalMode === "create") {
      createCurrency.mutate(
        { data },
        {
          onSuccess: () => {
            invalidate();
            toast({ title: t("currencies.toast.added") });
            closeModals();
          },
          onError: (err: any) =>
            toast({
              variant: "destructive",
              title: t("common.error"),
              description: err?.data?.error || t("currencies.toast.addError"),
            }),
        },
      );
    } else if (modalMode === "edit" && currencyToEdit) {
      updateCurrency.mutate(
        { id: currencyToEdit.id, data },
        {
          onSuccess: () => {
            invalidate();
            toast({ title: t("currencies.toast.edited") });
            closeModals();
          },
          onError: (err: any) =>
            toast({
              variant: "destructive",
              title: t("common.error"),
              description: err?.data?.error || t("currencies.toast.editError"),
            }),
        },
      );
    }
  };

  const handleDelete = () => {
    if (!currencyToDelete) return;
    deleteCurrency.mutate(
      { id: currencyToDelete.id },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: t("currencies.toast.deleted") });
          setCurrencyToDelete(null);
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: t("common.error"),
            description: err?.data?.error || t("currencies.toast.deleteError"),
          });
          setCurrencyToDelete(null);
        },
      },
    );
  };

  return (
    <div className="flex flex-col">
      <header className="h-20 bg-background/80 backdrop-blur-md border-b flex items-center justify-between px-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-card border shadow-sm flex items-center justify-center text-primary">
            <Coins className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">{t("currencies.title")}</h1>
            <p className="text-sm text-muted-foreground font-medium">{t("currencies.subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canUpdate && currencies.length > 0 && (
            <button
              onClick={handleRefreshRates}
              disabled={refreshRates.isPending}
              className="flex items-center gap-2 bg-card border text-foreground px-4 py-2 rounded-full text-sm font-bold hover:bg-muted transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${refreshRates.isPending ? "animate-spin" : ""}`} />
              {refreshRates.isPending ? t("currencies.refreshing") : t("currencies.refreshRates")}
            </button>
          )}
          {canCreate && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              {t("currencies.addCurrency")}
            </button>
          )}
        </div>
      </header>

      <div className="p-8 flex flex-col gap-6 max-w-6xl mx-auto w-full">
        <div className="flex items-center justify-between bg-secondary/40 border border-secondary rounded-xl px-5 py-4 gap-4">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-muted-foreground">{t("currencies.baseCurrencyLabel")}</span>
            <span className="font-sans text-lg font-bold text-foreground" dir="ltr">{baseCurrency}</span>
          </div>
          <div className="flex flex-col items-end gap-1 flex-1">
            <p className="text-xs text-muted-foreground text-start w-full">{t("currencies.baseCurrencyHint", { base: baseCurrency })}</p>
            {currencies.length > 0 && (
              <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                {lastUpdated
                  ? t("currencies.lastUpdated", {
                      time: new Date(lastUpdated).toLocaleString(lang, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }),
                    })
                  : t("currencies.neverUpdated")}
              </span>
            )}
          </div>
        </div>

        <div className="bg-card border rounded-2xl shadow-sm overflow-hidden min-h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center p-12"><Spinner className="w-8 h-8 text-primary" /></div>
          ) : currencies.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-2 text-center">
              <p className="font-bold text-foreground">{t("currencies.noCurrencies")}</p>
              <p className="text-sm max-w-md">{t("currencies.noCurrenciesHint")}</p>
              {canCreate && (
                <button onClick={openCreateModal} className="mt-2 text-primary font-bold hover:underline">{t("currencies.addCurrency")}</button>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
                  <th className="text-start px-6 py-3">{t("currencies.code")}</th>
                  <th className="text-start px-3 py-3">{t("currencies.name")}</th>
                  <th className="text-start px-3 py-3">{t("currencies.exchangeRate")}</th>
                  <th className="text-center px-3 py-3">{t("currencies.status")}</th>
                  {(canUpdate || canDelete) && <th className="w-20 px-6 py-3" />}
                </tr>
              </thead>
              <tbody>
                {currencies.map((c) => (
                  <tr key={c.id} className="group border-t hover:bg-muted/40 transition-colors">
                    <td className="px-6 py-3.5">
                      <span className="font-sans font-bold text-foreground bg-muted px-2.5 py-1 rounded-md" dir="ltr">{c.code}</span>
                    </td>
                    <td className="px-3 py-3.5 font-medium text-foreground">{displayName(c, lang)}</td>
                    <td className="px-3 py-3.5 text-foreground/80 font-sans tabular-nums" dir="ltr">
                      {t("currencies.ratePerBase", { code: c.code, rate: c.exchangeRate, base: baseCurrency })}
                    </td>
                    <td className="px-3 py-3.5 text-center">
                      {c.isActive ? (
                        <span className="text-[11px] font-bold text-success bg-success/10 px-2.5 py-1 rounded-full">{t("currencies.active")}</span>
                      ) : (
                        <span className="text-[11px] font-bold text-muted-foreground bg-muted px-2.5 py-1 rounded-full">{t("currencies.inactive")}</span>
                      )}
                    </td>
                    {(canUpdate || canDelete) && (
                      <td className="px-6 py-3.5">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 justify-end">
                          {canUpdate && (
                            <button onClick={() => openEditModal(c)} className="p-1.5 rounded-md hover:bg-primary/10 text-primary transition-colors" title={t("common.edit")}>
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => setCurrencyToDelete(c)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive transition-colors" title={t("common.delete")}>
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
      </div>

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={closeModals} />
          <form onSubmit={handleSubmit(onSubmit)} className="relative bg-card rounded-2xl shadow-2xl w-full max-w-lg border flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-primary" />
                <h2 className="text-base font-bold text-foreground">{modalMode === "create" ? t("currencies.createTitle") : t("currencies.editTitle")}</h2>
              </div>
              <button type="button" onClick={closeModals} className="p-1 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 flex flex-col gap-5 overflow-y-auto">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">{t("currencies.codeLabel")}</label>
                <input dir="ltr" placeholder={t("currencies.codePlaceholder")} className="bg-background border rounded-xl h-11 px-4 text-sm font-sans font-bold uppercase text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("code")} />
                {errors.code && <span className="text-xs text-destructive">{t(`currencies.validation.${errors.code.message}`)}</span>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">{t("currencies.nameAr")}</label>
                <input dir="rtl" placeholder={t("currencies.namePlaceholder")} className="bg-background border rounded-xl h-11 px-4 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("nameAr")} />
                {errors.nameAr && <span className="text-xs text-destructive">{t(`currencies.validation.${errors.nameAr.message}`)}</span>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">
                  {t("currencies.nameEn")}<span className="text-xs font-medium text-muted-foreground ms-2">{t("currencies.optional")}</span>
                </label>
                <input dir="ltr" placeholder={t("currencies.namePlaceholderEn")} className="bg-background border rounded-xl h-11 px-4 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("nameEn")} />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">{t("currencies.rateLabel", { base: baseCurrency })}</label>
                <input dir="ltr" type="number" step="0.000001" placeholder={t("currencies.ratePlaceholder")} className="bg-background border rounded-xl h-11 px-4 text-sm font-sans text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("exchangeRate")} />
                {errors.exchangeRate && <span className="text-xs text-destructive">{t(`currencies.validation.${errors.exchangeRate.message}`)}</span>}
              </div>

              <div className="flex items-center justify-between bg-secondary/40 border border-secondary rounded-xl px-4 py-3 cursor-pointer" onClick={() => setValue("isActive", !isActive)}>
                <span className="text-sm font-bold text-foreground">{t("currencies.isActive")}</span>
                <div className={`w-10 h-6 rounded-full flex items-center transition-colors px-0.5 ${isActive ? "bg-primary" : "bg-muted-foreground/30"}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${isActive ? "translate-x-4 rtl:-translate-x-4" : "translate-x-0"}`} />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/30">
              <button type="button" onClick={closeModals} className="px-5 py-2.5 rounded-full text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">{t("common.cancel")}</button>
              <button type="submit" disabled={createCurrency.isPending || updateCurrency.isPending} className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-5 py-2.5 rounded-full text-sm font-bold hover:opacity-90 transition-opacity">
                <Check className="w-4 h-4" />
                {createCurrency.isPending || updateCurrency.isPending ? t("common.saving") : t("currencies.save")}
              </button>
            </div>
          </form>
        </div>
      )}

      <AlertDialog open={!!currencyToDelete} onOpenChange={(open) => !open && setCurrencyToDelete(null)}>
        <AlertDialogContent className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-start">{t("currencies.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="text-start">
              {t("currencies.deleteBody", { name: currencyToDelete ? displayName(currencyToDelete, lang) : "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              {deleteCurrency.isPending ? t("currencies.deleting") : t("currencies.confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
