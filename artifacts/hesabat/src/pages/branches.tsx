import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListBranches,
  useCreateBranch,
  useUpdateBranch,
  useDeleteBranch,
  useGetCurrentUser,
  getListBranchesQueryKey,
  type Branch,
} from "@workspace/api-client-react";
import { GridTable, GridToggle, useGridView, type GridColumn } from "@/components/GridTable";
import { hasCapability } from "@workspace/permissions";
import { useQueryClient } from "@tanstack/react-query";
import { GitBranch, Plus, X, Check, Trash2, Edit2 } from "lucide-react";
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

const branchSchema = z.object({
  nameAr: z.string().min(1, "nameRequired"),
  nameEn: z.string().optional(),
  budget: z.string().optional(),
  isActive: z.boolean().default(true),
});

type BranchForm = z.input<typeof branchSchema>;

function displayName(e: { nameAr: string; nameEn?: string | null }, lang: string): string {
  return lang.startsWith("en") && e.nameEn ? e.nameEn : e.nameAr;
}

const fmt = (n: number) => n.toLocaleString("en-US");

export function Branches({ embedded = false }: { embedded?: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: branches = [], isLoading } = useListBranches();
  const createBranch = useCreateBranch();
  const updateBranch = useUpdateBranch();
  const deleteBranch = useDeleteBranch();
  const { data: user } = useGetCurrentUser();
  const role = user?.role ?? "";
  const canCreate = hasCapability(role, "branches:create");
  const canUpdate = hasCapability(role, "branches:update");
  const canDelete = hasCapability(role, "branches:delete");

  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [branchToEdit, setBranchToEdit] = useState<Branch | null>(null);
  const [branchToDelete, setBranchToDelete] = useState<Branch | null>(null);
  const [isGridView, toggleGridView] = useGridView("branches");
  const [selectedBranchIds, setSelectedBranchIds] = useState<Set<string>>(new Set());

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<BranchForm>({
    resolver: zodResolver(branchSchema),
    defaultValues: { isActive: true },
  });
  const isActive = watch("isActive");

  const openCreateModal = () => {
    reset({ nameAr: "", nameEn: "", budget: "", isActive: true });
    setModalMode("create");
  };

  const openEditModal = (branch: Branch) => {
    reset({
      nameAr: branch.nameAr,
      nameEn: branch.nameEn ?? "",
      budget: branch.budget === null || branch.budget === undefined ? "" : String(branch.budget),
      isActive: branch.isActive,
    });
    setBranchToEdit(branch);
    setModalMode("edit");
  };

  const closeModals = () => {
    setModalMode(null);
    setBranchToEdit(null);
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListBranchesQueryKey() });

  const branchGridColumns: GridColumn<Branch>[] = [
    { key: "nameAr", header: t("branches.nameAr"), type: "text", editable: canUpdate, validate: (v) => !v ? "مطلوب" : null },
    { key: "nameEn", header: t("branches.nameEn"), type: "text", editable: canUpdate },
    { key: "budget", header: t("branches.budget"), type: "number", editable: canUpdate, align: "end",
      render: (v) => <span className="font-sans tabular-nums">{v === null || v === undefined ? t("branches.noBudget") : fmt(Number(v))}</span>,
    },
    { key: "isActive", header: t("branches.status"), type: "boolean", editable: canUpdate, width: "80px",
      render: (v) => v
        ? <span className="text-[11px] font-bold text-success bg-success/10 px-2 py-0.5 rounded-full">{t("branches.active")}</span>
        : <span className="text-[11px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{t("branches.inactive")}</span>,
    },
  ];

  const handleGridSave = async (changes: { id: string; field: string; oldValue: unknown; newValue: unknown }[]) => {
    const byRow = new Map<string, Record<string, unknown>>();
    for (const c of changes) { if (!byRow.has(c.id)) byRow.set(c.id, {}); byRow.get(c.id)![c.field] = c.newValue; }
    for (const [id, patch] of byRow.entries()) {
      const branch = branches.find((item) => item.id === id); if (!branch) continue;
      const budgetRaw = patch.budget !== undefined ? patch.budget : branch.budget;
      const data = {
        nameAr: String(patch.nameAr ?? branch.nameAr),
        nameEn: patch.nameEn !== undefined ? (String(patch.nameEn) || null) : branch.nameEn ?? null,
        budget: budgetRaw === null || budgetRaw === undefined || String(budgetRaw) === "" ? null : Number(budgetRaw),
        isActive: patch.isActive !== undefined ? Boolean(patch.isActive) : branch.isActive,
      };
      await new Promise<void>((res, rej) => updateBranch.mutate({ id, data }, { onSuccess: () => res(), onError: rej }));
    }
    invalidate();
  };

  const handleGridDelete = async (ids: string[]) => {
    for (const id of ids) await deleteBranch.mutateAsync({ id });
    invalidate();
  };

  const handleGridCreate = async (newBranches: Partial<Branch>[]) => {
    for (const p of newBranches) {
      if (!String(p.nameAr ?? "").trim()) continue;
      const trimmed = String(p.budget ?? "").trim();
      const data = {
        nameAr: String(p.nameAr).trim(),
        nameEn: p.nameEn ? String(p.nameEn) : null,
        budget: trimmed === "" ? null : Number(trimmed),
        isActive: true,
      };
      await new Promise<void>((res, rej) => createBranch.mutate({ data }, { onSuccess: () => res(), onError: rej }));
    }
    invalidate();
  };

  const onSubmit = (form: BranchForm) => {
    const trimmed = (form.budget ?? "").trim();
    const data = {
      nameAr: form.nameAr,
      nameEn: form.nameEn || null,
      budget: trimmed === "" ? null : Number(trimmed),
      isActive: form.isActive ?? true,
    };
    if (modalMode === "create") {
      createBranch.mutate({ data }, {
        onSuccess: () => { invalidate(); toast({ title: t("branches.toast.added") }); closeModals(); },
        onError: (err: any) => toast({ variant: "destructive", title: t("common.error"), description: err?.data?.error || t("branches.toast.addError") }),
      });
    } else if (modalMode === "edit" && branchToEdit) {
      updateBranch.mutate({ id: branchToEdit.id, data }, {
        onSuccess: () => { invalidate(); toast({ title: t("branches.toast.edited") }); closeModals(); },
        onError: (err: any) => toast({ variant: "destructive", title: t("common.error"), description: err?.data?.error || t("branches.toast.editError") }),
      });
    }
  };

  const handleDelete = () => {
    if (!branchToDelete) return;
    deleteBranch.mutate({ id: branchToDelete.id }, {
      onSuccess: () => { invalidate(); toast({ title: t("branches.toast.deleted") }); setBranchToDelete(null); },
      onError: (err: any) => { toast({ variant: "destructive", title: t("common.error"), description: err?.data?.error || t("branches.toast.deleteError") }); setBranchToDelete(null); },
    });
  };

  return (
    <div className="flex flex-col">
      <div className={`flex items-center justify-between px-8 ${embedded ? "pt-2" : "pt-7"} pb-1`}>
        <div>
          <h3 className="text-base font-extrabold text-foreground">{t("branches.title")}</h3>
          <p className="text-sm text-muted-foreground">{t("branches.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <GridToggle isGrid={isGridView} onToggle={toggleGridView} />
          {canCreate && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              {t("branches.addBranch")}
            </button>
          )}
        </div>
      </div>

      <div className="p-8 flex flex-col gap-6 max-w-6xl mx-auto w-full">
        {isLoading ? (
          <div className="flex items-center justify-center p-12"><Spinner className="w-8 h-8 text-primary" /></div>
        ) : branches.length === 0 ? (
          <div className="bg-card border rounded-2xl shadow-sm min-h-[300px] flex flex-col items-center justify-center p-12 text-muted-foreground gap-3">
            <p>{t("branches.noBranches")}</p>
            <span className="text-xs">{t("branches.noBranchesHint")}</span>
            {canCreate && (
              <button onClick={openCreateModal} className="text-primary font-bold hover:underline">{t("branches.addFirst")}</button>
            )}
          </div>
        ) : isGridView ? (
          <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
            <GridTable
              rows={branches}
              columns={branchGridColumns}
              canEdit={canUpdate}
              canDelete={canDelete}
              onSave={handleGridSave}
              onDeleteRows={handleGridDelete}
              onCreateRows={canCreate ? handleGridCreate : undefined}
              newRowTemplate={() => ({ isActive: true })}
              selectedIds={selectedBranchIds}
              onSelectionChange={setSelectedBranchIds}
              emptyMessage={t("branches.noBranches")}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {branches.map((branch) => (
              <div key={branch.id} className="group bg-card border rounded-2xl shadow-sm p-5 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0"><GitBranch className="w-5 h-5" /></div>
                  <div className="flex-1">
                    <p className="font-bold text-foreground">{displayName(branch, lang)}</p>
                  </div>
                  {(canUpdate || canDelete) && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      {canUpdate && (
                        <button onClick={() => openEditModal(branch)} className="p-1.5 rounded-md hover:bg-primary/10 text-primary transition-colors" title={t("common.edit")}>
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => setBranchToDelete(branch)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive transition-colors" title={t("common.delete")}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/40 rounded-xl p-3">
                    <p className="text-[11px] text-muted-foreground">{t("branches.budget")}</p>
                    <p className="font-sans text-sm font-bold tabular-nums">{branch.budget === null || branch.budget === undefined ? t("branches.noBudget") : fmt(branch.budget)}</p>
                  </div>
                  <div className="bg-muted/40 rounded-xl p-3">
                    <p className="text-[11px] text-muted-foreground">{t("branches.status")}</p>
                    <p className={`text-sm font-bold ${branch.isActive ? "text-success" : "text-muted-foreground"}`}>{branch.isActive ? t("branches.active") : t("branches.inactive")}</p>
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
                <GitBranch className="w-5 h-5 text-primary" />
                <h2 className="text-base font-bold text-foreground">{modalMode === "create" ? t("branches.createTitle") : t("branches.editTitle")}</h2>
              </div>
              <button type="button" onClick={closeModals} className="p-1 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 flex flex-col gap-5 overflow-y-auto">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">{t("branches.nameAr")}</label>
                <input dir="rtl" placeholder={t("branches.namePlaceholder")} className="bg-background border rounded-xl h-11 px-4 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("nameAr")} />
                {errors.nameAr && <span className="text-xs text-destructive">{t(`branches.validation.${errors.nameAr.message}`)}</span>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">
                  {t("branches.nameEn")}<span className="text-xs font-medium text-muted-foreground ms-2">{t("branches.optional")}</span>
                </label>
                <input dir="ltr" placeholder={t("branches.namePlaceholderEn")} className="bg-background border rounded-xl h-11 px-4 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("nameEn")} />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">{t("branches.budgetLabel")}<span className="text-xs font-medium text-muted-foreground ms-2">{t("branches.optional")}</span></label>
                <input dir="ltr" type="number" step="0.01" placeholder={t("branches.budgetPlaceholder")} className="bg-background border rounded-xl h-11 px-4 text-sm font-sans text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("budget")} />
              </div>

              <div className="flex items-center justify-between bg-secondary/40 border border-secondary rounded-xl px-4 py-3 cursor-pointer" onClick={() => setValue("isActive", !isActive)}>
                <span className="text-sm font-bold text-foreground">{t("branches.isActive")}</span>
                <div className={`w-10 h-6 rounded-full flex items-center transition-colors px-0.5 ${isActive ? "bg-primary" : "bg-muted-foreground/30"}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${isActive ? "translate-x-4 rtl:-translate-x-4" : "translate-x-0"}`} />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/30">
              <button type="button" onClick={closeModals} className="px-5 py-2.5 rounded-full text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">{t("common.cancel")}</button>
              <button type="submit" disabled={createBranch.isPending || updateBranch.isPending} className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-5 py-2.5 rounded-full text-sm font-bold hover:opacity-90 transition-opacity">
                <Check className="w-4 h-4" />
                {createBranch.isPending || updateBranch.isPending ? t("common.saving") : t("branches.save")}
              </button>
            </div>
          </form>
        </div>
      )}

      <AlertDialog open={!!branchToDelete} onOpenChange={(open) => !open && setBranchToDelete(null)}>
        <AlertDialogContent className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-start">{t("branches.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="text-start">
              {t("branches.deleteBody", { name: branchToDelete ? displayName(branchToDelete, lang) : "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              {deleteBranch.isPending ? t("branches.deleting") : t("branches.confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
