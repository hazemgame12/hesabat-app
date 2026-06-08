import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListFiscalYears,
  useCreateFiscalYear,
  useCloseFiscalYear,
  useReopenFiscalYear,
  useDeleteFiscalYear,
  useGetCurrentUser,
  getListFiscalYearsQueryKey,
  type FiscalYear,
} from "@workspace/api-client-react";
import { hasCapability } from "@workspace/permissions";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  CalendarRange,
  Plus,
  X,
  Lock,
  Unlock,
  Trash2,
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

const fiscalYearSchema = z
  .object({
    name: z.string().min(1, "nameRequired").max(120),
    startDate: z.string().min(1, "startRequired"),
    endDate: z.string().min(1, "endRequired"),
  })
  .refine((d) => d.startDate < d.endDate, {
    message: "rangeInvalid",
    path: ["endDate"],
  });

type FiscalYearForm = z.infer<typeof fiscalYearSchema>;

function errorMessage(err: unknown): string | undefined {
  if (
    err &&
    typeof err === "object" &&
    "error" in err &&
    typeof (err as { error: unknown }).error === "string"
  ) {
    return (err as { error: string }).error;
  }
  return undefined;
}

export function FiscalYears() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: years = [], isLoading } = useListFiscalYears();
  const createYear = useCreateFiscalYear();
  const closeYear = useCloseFiscalYear();
  const reopenYear = useReopenFiscalYear();
  const deleteYear = useDeleteFiscalYear();
  const { data: user } = useGetCurrentUser();
  const canManage = hasCapability(user?.role ?? "", "fiscalyear:manage");

  const [showCreate, setShowCreate] = useState(false);
  const [yearToClose, setYearToClose] = useState<FiscalYear | null>(null);
  const [yearToReopen, setYearToReopen] = useState<FiscalYear | null>(null);
  const [yearToDelete, setYearToDelete] = useState<FiscalYear | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FiscalYearForm>({
    resolver: zodResolver(fiscalYearSchema),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListFiscalYearsQueryKey() });

  const fmtDate = (d: string) =>
    new Intl.DateTimeFormat(lang, { dateStyle: "medium" }).format(
      new Date(d + "T00:00:00"),
    );

  const openCreate = () => {
    reset({ name: "", startDate: "", endDate: "" });
    setShowCreate(true);
  };

  const onCreate = (data: FiscalYearForm) => {
    createYear.mutate(
      { data },
      {
        onSuccess: () => {
          invalidate();
          setShowCreate(false);
          toast({ title: t("fiscalYearsPage.toast.created") });
        },
        onError: (err) =>
          toast({
            variant: "destructive",
            title: t("fiscalYearsPage.toast.error"),
            description: errorMessage(err),
          }),
      },
    );
  };

  const confirmClose = () => {
    if (!yearToClose) return;
    closeYear.mutate(
      { id: yearToClose.id },
      {
        onSuccess: () => {
          invalidate();
          setYearToClose(null);
          toast({ title: t("fiscalYearsPage.toast.closed") });
        },
        onError: (err) => {
          setYearToClose(null);
          toast({
            variant: "destructive",
            title: t("fiscalYearsPage.toast.error"),
            description: errorMessage(err),
          });
        },
      },
    );
  };

  const confirmReopen = () => {
    if (!yearToReopen) return;
    reopenYear.mutate(
      { id: yearToReopen.id },
      {
        onSuccess: () => {
          invalidate();
          setYearToReopen(null);
          toast({ title: t("fiscalYearsPage.toast.reopened") });
        },
        onError: (err) => {
          setYearToReopen(null);
          toast({
            variant: "destructive",
            title: t("fiscalYearsPage.toast.error"),
            description: errorMessage(err),
          });
        },
      },
    );
  };

  const confirmDelete = () => {
    if (!yearToDelete) return;
    deleteYear.mutate(
      { id: yearToDelete.id },
      {
        onSuccess: () => {
          invalidate();
          setYearToDelete(null);
          toast({ title: t("fiscalYearsPage.toast.deleted") });
        },
        onError: (err) => {
          setYearToDelete(null);
          toast({
            variant: "destructive",
            title: t("fiscalYearsPage.toast.error"),
            description: errorMessage(err),
          });
        },
      },
    );
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <CalendarRange className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {t("fiscalYearsPage.title")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("fiscalYearsPage.subtitle")}
            </p>
          </div>
        </div>
        {canManage && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t("fiscalYearsPage.new")}
          </button>
        )}
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : years.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {t("fiscalYearsPage.empty")}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {years.map((y) => (
              <div
                key={y.id}
                className="flex flex-wrap items-center gap-3 p-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">
                      {y.name}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                        y.status === "open"
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {t(`fiscalYearsPage.status.${y.status}`)}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    {fmtDate(y.startDate)} — {fmtDate(y.endDate)}
                  </div>
                  {y.closingEntryNumber && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {t("fiscalYearsPage.closingEntry")}:{" "}
                      <span className="font-mono">{y.closingEntryNumber}</span>
                    </div>
                  )}
                </div>
                {canManage && (
                  <div className="flex items-center gap-2">
                    {y.status === "open" ? (
                      <>
                        <button
                          onClick={() => setYearToClose(y)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                        >
                          <Lock className="w-4 h-4" />
                          {t("fiscalYearsPage.close")}
                        </button>
                        <button
                          onClick={() => setYearToDelete(y)}
                          className="inline-flex items-center justify-center rounded-lg border border-border p-1.5 text-destructive hover:bg-destructive/10 transition-colors"
                          aria-label={t("fiscalYearsPage.delete")}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setYearToReopen(y)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                      >
                        <Unlock className="w-4 h-4" />
                        {t("fiscalYearsPage.reopen")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">
                {t("fiscalYearsPage.new")}
              </h2>
              <button
                onClick={() => setShowCreate(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label={t("common.close")}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit(onCreate)} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-foreground">
                  {t("fiscalYearsPage.form.name")}
                </label>
                <input
                  {...register("name")}
                  placeholder={t("fiscalYearsPage.form.namePlaceholder")}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                />
                {errors.name && (
                  <span className="text-xs text-destructive">
                    {t(`fiscalYearsPage.errors.${errors.name.message}`, {
                      defaultValue: t("fiscalYearsPage.errors.nameRequired"),
                    })}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-foreground">
                    {t("fiscalYearsPage.form.startDate")}
                  </label>
                  <input
                    type="date"
                    {...register("startDate")}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  {errors.startDate && (
                    <span className="text-xs text-destructive">
                      {t("fiscalYearsPage.errors.startRequired")}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-foreground">
                    {t("fiscalYearsPage.form.endDate")}
                  </label>
                  <input
                    type="date"
                    {...register("endDate")}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  {errors.endDate && (
                    <span className="text-xs text-destructive">
                      {t(`fiscalYearsPage.errors.${errors.endDate.message}`, {
                        defaultValue: t("fiscalYearsPage.errors.endRequired"),
                      })}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={createYear.isPending}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AlertDialog
        open={!!yearToClose}
        onOpenChange={(o) => !o && setYearToClose(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("fiscalYearsPage.confirmClose.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("fiscalYearsPage.confirmClose.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmClose}
              disabled={closeYear.isPending}
            >
              {t("fiscalYearsPage.close")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!yearToReopen}
        onOpenChange={(o) => !o && setYearToReopen(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("fiscalYearsPage.confirmReopen.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("fiscalYearsPage.confirmReopen.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmReopen}
              disabled={reopenYear.isPending}
            >
              {t("fiscalYearsPage.reopen")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!yearToDelete}
        onOpenChange={(o) => !o && setYearToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("fiscalYearsPage.confirmDelete.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("fiscalYearsPage.confirmDelete.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteYear.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("fiscalYearsPage.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
