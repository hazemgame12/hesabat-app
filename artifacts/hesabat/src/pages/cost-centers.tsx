import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListCostCenters,
  useCreateCostCenter,
  useUpdateCostCenter,
  useDeleteCostCenter,
  useGetCurrentUser,
  getListCostCentersQueryKey,
  type CostCenter,
} from "@workspace/api-client-react";
import { GridTable, GridToggle, useGridView, type GridColumn } from "@/components/GridTable";
import { hasCapability } from "@workspace/permissions";
import { useQueryClient } from "@tanstack/react-query";
import { ExcelToolbar } from "@/components/ExcelToolbar";
import { Boxes, Plus, X, Check, Building2, Trash2, Edit2 } from "lucide-react";
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

const centerSchema = z.object({
  nameAr: z.string().min(1, "nameRequired"),
  nameEn: z.string().optional(),
  budget: z.string().optional(),
  isActive: z.boolean().default(true),
});

type CenterForm = z.input<typeof centerSchema>;

function displayName(e: { nameAr: string; nameEn?: string | null }, lang: string): string {
  return lang.startsWith("en") && e.nameEn ? e.nameEn : e.nameAr;
}

const fmt = (n: number) => n.toLocaleString("en-US");

export function CostCenters({ embedded = false }: { embedded?: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: centers = [], isLoading } = useListCostCenters();
  const createCenter = useCreateCostCenter();
  const updateCenter = useUpdateCostCenter();
  const deleteCenter = useDeleteCostCenter();
  const { data: user } = useGetCurrentUser();
  const role = user?.role ?? "";
  const canCreate = hasCapability(role, "costCenters:create");
  const canUpdate = hasCapability(role, "costCenters:update");
  const canDelete = hasCapability(role, "costCenters:delete");

  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [centerToEdit, setCenterToEdit] = useState<CostCenter | null>(null);
  const [centerToDelete, setCenterToDelete] = useState<CostCenter | null>(null);
  const [isGridView, toggleGridView] = useGridView("cost-centers");
  const [selectedCenterIds, setSelectedCenterIds] = useState<Set<string>>(new Set());

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<CenterForm>({
    resolver: zodResolver(centerSchema),
    defaultValues: { isActive: true },
  });
  const isActive = watch("isActive");

  const openCreateModal = () => {
    reset({ nameAr: "", nameEn: "", budget: "", isActive: true });
    setModalMode("create");
  };

  const openEditModal = (c: CostCenter) => {
    reset({
      nameAr: c.nameAr,
      nameEn: c.nameEn ?? "",
      budget: c.budget === null || c.budget === undefined ? "" : String(c.budget),
      isActive: c.isActive,
    });
    setCenterToEdit(c);
    setModalMode("edit");
  };

  const closeModals = () => {
    setModalMode(null);
    setCenterToEdit(null);
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListCostCentersQueryKey() });

  const centerGridColumns: GridColumn<CostCenter>[] = [
    { key: "nameAr", header: t("costCenters.nameAr") ?? "الاسم (ع)", type: "text", editable: canUpdate, validate: (v) => !v ? "مطلوب" : null },
    { key: "nameEn", header: t("costCenters.nameEn") ?? "Name (EN)", type: "text", editable: canUpdate },
    { key: "budget", header: t("costCenters.budget"), type: "number", editable: canUpdate, align: "end",
      render: (v) => <span className="font-sans tabular-nums">{v === null || v === undefined ? t("costCenters.noBudget") : fmt(Number(v))}</span>
    },
    { key: "isActive", header: t("costCenters.status"), type: "boolean", editable: canUpdate, width: "80px",
      render: (v) => v
        ? <span className="text-[11px] font-bold text-success bg-success/10 px-2 py-0.5 rounded-full">{t("costCenters.active")}</span>
        : <span className="text-[11px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{t("costCenters.inactive")}</span>
    },
  ];

  const handleCenterGridSave = async (changes: { id: string; field: string; oldValue: unknown; newValue: unknown }[]) => {
    const byRow = new Map<string, Record<string, unknown>>();
    for (const c of changes) { if (!byRow.has(c.id)) byRow.set(c.id, {}); byRow.get(c.id)![c.field] = c.newValue; }
    for (const [id, patch] of byRow.entries()) {
      const ctr = centers.find((c) => c.id === id); if (!ctr) continue;
      const budgetRaw = patch.budget !== undefined ? patch.budget : ctr.budget;
      const data = {
        nameAr: String(patch.nameAr ?? ctr.nameAr),
        nameEn: patch.nameEn !== undefined ? (String(patch.nameEn) || null) : ctr.nameEn ?? null,
        budget: budgetRaw === null || budgetRaw === undefined || String(budgetRaw) === "" ? null : Number(budgetRaw),
        isActive: patch.isActive !== undefined ? Boolean(patch.isActive) : ctr.isActive,
      };
      await new Promise<void>((res, rej) => updateCenter.mutate({ id, data }, { onSuccess: () => res(), onError: rej }));
    }
    invalidate();
  };

  const handleCenterGridDelete = async (ids: string[]) => {
    for (const id of ids) await deleteCenter.mutateAsync({ id });
    invalidate();
  };

  const handleCenterGridCreate = async (newCenters: Partial<CostCenter>[]) => {
    for (const p of newCenters) {
      if (!String(p.nameAr ?? "").trim()) continue;
      const trimmed = String(p.budget ?? "").trim();
      const data = {
        nameAr: String(p.nameAr).trim(),
        nameEn: p.nameEn ? String(p.nameEn) : null,
        budget: trimmed === "" ? null : Number(trimmed),
        isActive: true,
      };
      await new Promise<void>((res, rej) => createCenter.mutate({ data }, { onSuccess: () => res(), onError: rej }));
    }
    invalidate();
  };

  const onSubmit = (form: CenterForm) => {
    const trimmed = (form.budget ?? "").trim();
    const data = {
      nameAr: form.nameAr,
      nameEn: form.nameEn || null,
      budget: trimmed === "" ? null : Number(trimmed),
      isActive: form.isActive ?? true,
    };
    if (modalMode === "create") {
      createCenter.mutate({ data }, {
        onSuccess: () => { invalidate(); toast({ title: t("costCenters.toast.added") }); closeModals(); },
        onError: (err: any) => toast({ variant: "destructive", title: t("common.error"), description: err?.data?.error || t("costCenters.toast.addError") }),
      });
    } else if (modalMode === "edit" && centerToEdit) {
      updateCenter.mutate({ id: centerToEdit.id, data }, {
        onSuccess: () => { invalidate(); toast({ title: t("costCenters.toast.edited") }); closeModals(); },
        onError: (err: any) => toast({ variant: "destructive", title: t("common.error"), description: err?.data?.error || t("costCenters.toast.editError") }),
      });
    }
  };

  const handleDelete = () => {
    if (!centerToDelete) return;
    deleteCenter.mutate({ id: centerToDelete.id }, {
      onSuccess: () => { invalidate(); toast({ title: t("costCenters.toast.deleted") }); setCenterToDelete(null); },
      onError: (err: any) => { toast({ variant: "destructive", title: t("common.error"), description: err?.data?.error || t("costCenters.toast.deleteError") }); setCenterToDelete(null); },
    });
  };

  return (
    <div className="flex flex-col">
      {!embedded && (
        <div className="flex items-center justify-between px-8 pt-7 pb-1">
          <div>
            <h2 className="text-base font-extrabold text-foreground">{t("costCenters.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("costCenters.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <GridToggle isGrid={isGridView} onToggle={toggleGridView} />
            <ExcelToolbar
              exportPath="/api/cost-centers/export"
              importPath="/api/cost-centers/import"
              canImport={canCreate}
              invalidateKeys={[getListCostCentersQueryKey()]}
            />
            {canCreate && (
              <button
                onClick={openCreateModal}
                className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" />
                {t("costCenters.addCenter")}
              </button>
            )}
          </div>
        </div>
      )}

      {embedded && (
        <div className="flex items-center justify-between px-8 pt-2 pb-1">
          <div>
            <h3 className="text-base font-extrabold text-foreground">{t("costCenters.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("costCenters.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <GridToggle isGrid={isGridView} onToggle={toggleGridView} />
            <ExcelToolbar
              exportPath="/api/cost-centers/export"
              importPath="/api/cost-centers/import"
              canImport={canCreate}
              invalidateKeys={[getListCostCentersQueryKey()]}
            />
            {canCreate && (
              <button
                onClick={openCreateModal}
                className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" />
                {t("costCenters.addCenter")}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="p-8 flex flex-col gap-6 max-w-6xl mx-auto w-full">
        {isLoading ? (
          <div className="flex items-center justify-center p-12"><Spinner className="w-8 h-8 text-primary" /></div>
        ) : centers.length === 0 ? (
          <div className="bg-card border rounded-2xl shadow-sm min-h-[300px] flex flex-col items-center justify-center p-12 text-muted-foreground gap-3">
            <p>{t("costCenters.noCenters")}</p>
            <span className="text-xs">{t("costCenters.noCentersHint")}</span>
            {canCreate && (
              <button onClick={openCreateModal} className="text-primary font-bold hover:underline">{t("costCenters.addFirst")}</button>
            )}
          </div>
        ) : isGridView ? (
          <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
            <GridTable
              rows={centers}
              columns={centerGridColumns}
              canEdit={canUpdate}
              canDelete={canDelete}
              onSave={handleCenterGridSave}
              onDeleteRows={handleCenterGridDelete}
              onCreateRows={canCreate ? handleCenterGridCreate : undefined}
              newRowTemplate={() => ({ isActive: true })}
              selectedIds={selectedCenterIds}
              onSelectionChange={setSelectedCenterIds}
              emptyMessage={t("costCenters.noCenters")}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {centers.map((c) => (
              <div key={c.id} className="group bg-card border rounded-2xl shadow-sm p-5 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0"><Building2 className="w-5 h-5" /></div>
                  <div className="flex-1">
                    <p className="font-bold text-foreground">{displayName(c, lang)}</p>
                  </div>
                  {(canUpdate || canDelete) && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      {canUpdate && (
                        <button onClick={() => openEditModal(c)} className="p-1.5 rounded-md hover:bg-primary/10 text-primary transition-colors" title={t("common.edit")}>
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => setCenterToDelete(c)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive transition-colors" title={t("common.delete")}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/40 rounded-xl p-3">
                    <p className="text-[11px] text-muted-foreground">{t("costCenters.budget")}</p>
                    <p className="font-sans text-sm font-bold tabular-nums">{c.budget === null || c.budget === undefined ? t("costCenters.noBudget") : fmt(c.budget)}</p>
                  </div>
                  <div className="bg-muted/40 rounded-xl p-3">
                    <p className="text-[11px] text-muted-foreground">{t("costCenters.status")}</p>
                    <p className={`text-sm font-bold ${c.isActive ? "text-success" : "text-muted-foreground"}`}>{c.isActive ? t("costCenters.active") : t("costCenters.inactive")}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={closeModals} />
          <form onSubmit={handleSubmit(onSubmit)} className="relative bg-card rounded-2xl shadow-2xl w-full max-w-lg border flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <Boxes className="w-5 h-5 text-primary" />
                <h2 className="text-base font-bold text-foreground">{modalMode === "create" ? t("costCenters.createTitle") : t("costCenters.editTitle")}</h2>
              </div>
              <button type="button" onClick={closeModals} className="p-1 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 flex flex-col gap-5 overflow-y-auto">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">{t("costCenters.nameAr")}</label>
                <input dir="rtl" placeholder={t("costCenters.namePlaceholder")} className="bg-background border rounded-xl h-11 px-4 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("nameAr")} />
                {errors.nameAr && <span className="text-xs text-destructive">{t(`costCenters.validation.${errors.nameAr.message}`)}</span>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">
                  {t("costCenters.nameEn")}<span className="text-xs font-medium text-muted-foreground ms-2">{t("costCenters.optional")}</span>
                </label>
                <input dir="ltr" placeholder={t("costCenters.namePlaceholderEn")} className="bg-background border rounded-xl h-11 px-4 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("nameEn")} />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">{t("costCenters.budgetLabel")}<span className="text-xs font-medium text-muted-foreground ms-2">{t("costCenters.optional")}</span></label>
                <input dir="ltr" type="number" step="0.01" placeholder={t("costCenters.budgetPlaceholder")} className="bg-background border rounded-xl h-11 px-4 text-sm font-sans text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("budget")} />
              </div>

              <div className="flex items-center justify-between bg-secondary/40 border border-secondary rounded-xl px-4 py-3 cursor-pointer" onClick={() => setValue("isActive", !isActive)}>
                <span className="text-sm font-bold text-foreground">{t("costCenters.isActive")}</span>
                <div className={`w-10 h-6 rounded-full flex items-center transition-colors px-0.5 ${isActive ? "bg-primary" : "bg-muted-foreground/30"}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${isActive ? "translate-x-4 rtl:-translate-x-4" : "translate-x-0"}`} />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/30">
              <button type="button" onClick={closeModals} className="px-5 py-2.5 rounded-full text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">{t("common.cancel")}</button>
              <button type="submit" disabled={createCenter.isPending || updateCenter.isPending} className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-5 py-2.5 rounded-full text-sm font-bold hover:opacity-90 transition-opacity">
                <Check className="w-4 h-4" />
                {createCenter.isPending || updateCenter.isPending ? t("common.saving") : t("costCenters.save")}
              </button>
            </div>
          </form>
        </div>
      )}

      <AlertDialog open={!!centerToDelete} onOpenChange={(open) => !open && setCenterToDelete(null)}>
        <AlertDialogContent className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-start">{t("costCenters.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="text-start">
              {t("costCenters.deleteBody", { name: centerToDelete ? displayName(centerToDelete, lang) : "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              {deleteCenter.isPending ? t("costCenters.deleting") : t("costCenters.confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
