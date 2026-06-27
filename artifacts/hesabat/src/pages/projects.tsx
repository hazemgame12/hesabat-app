import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListProjects,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useGetCurrentUser,
  getListProjectsQueryKey,
  type Project,
} from "@workspace/api-client-react";
import { GridTable, GridToggle, useGridView, type GridColumn } from "@/components/GridTable";
import { hasCapability } from "@workspace/permissions";
import { useQueryClient } from "@tanstack/react-query";
import { FolderKanban, Plus, X, Check, ChevronDown, Trash2, Edit2 } from "lucide-react";
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

const PROJECT_STATUSES = ["active", "completed", "on_hold", "cancelled"] as const;
type ProjectStatus = (typeof PROJECT_STATUSES)[number];

const STATUS_STYLE: Record<ProjectStatus, string> = {
  active: "text-success bg-success/10",
  completed: "text-primary bg-primary/10",
  on_hold: "text-amber-600 bg-amber-500/10",
  cancelled: "text-muted-foreground bg-muted",
};

const projectSchema = z.object({
  nameAr: z.string().min(1, "nameRequired"),
  nameEn: z.string().optional(),
  status: z.enum(PROJECT_STATUSES).default("active"),
  budget: z.string().optional(),
  isActive: z.boolean().default(true),
});

type ProjectForm = z.input<typeof projectSchema>;

function displayName(e: { nameAr: string; nameEn?: string | null }, lang: string): string {
  return lang.startsWith("en") && e.nameEn ? e.nameEn : e.nameAr;
}

const fmt = (n: number) => n.toLocaleString("en-US");

export function Projects({ embedded = false }: { embedded?: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: projects = [], isLoading } = useListProjects();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const { data: user } = useGetCurrentUser();
  const role = user?.role ?? "";
  const canCreate = hasCapability(role, "projects:create");
  const canUpdate = hasCapability(role, "projects:update");
  const canDelete = hasCapability(role, "projects:delete");

  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isGridView, toggleGridView] = useGridView("projects");
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<ProjectForm>({
    resolver: zodResolver(projectSchema),
    defaultValues: { status: "active", isActive: true },
  });
  const isActive = watch("isActive");

  const openCreateModal = () => {
    reset({ nameAr: "", nameEn: "", status: "active", budget: "", isActive: true });
    setModalMode("create");
  };

  const openEditModal = (project: Project) => {
    reset({
      nameAr: project.nameAr,
      nameEn: project.nameEn ?? "",
      status: project.status as ProjectStatus,
      budget: project.budget === null || project.budget === undefined ? "" : String(project.budget),
      isActive: project.isActive,
    });
    setProjectToEdit(project);
    setModalMode("edit");
  };

  const closeModals = () => {
    setModalMode(null);
    setProjectToEdit(null);
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });

  const projectGridColumns: GridColumn<Project>[] = [
    { key: "nameAr", header: t("projects.nameAr"), type: "text", editable: canUpdate, validate: (v) => !v ? "مطلوب" : null },
    { key: "nameEn", header: t("projects.nameEn"), type: "text", editable: canUpdate },
    { key: "status", header: t("projects.status"), type: "select", editable: canUpdate, width: "140px",
      options: PROJECT_STATUSES.map((status) => ({ value: status, label: t(`projects.statuses.${status}`) })),
      render: (v) => <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[v as ProjectStatus]}`}>{t(`projects.statuses.${v as string}`)}</span>,
    },
    { key: "budget", header: t("projects.budget"), type: "number", editable: canUpdate, align: "end",
      render: (v) => <span className="font-sans tabular-nums">{v === null || v === undefined ? t("projects.noBudget") : fmt(Number(v))}</span>,
    },
    { key: "isActive", header: t("projects.activity"), type: "boolean", editable: canUpdate, width: "80px",
      render: (v) => v
        ? <span className="text-[11px] font-bold text-success bg-success/10 px-2 py-0.5 rounded-full">{t("projects.active")}</span>
        : <span className="text-[11px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{t("projects.inactive")}</span>,
    },
  ];

  const handleGridSave = async (changes: { id: string; field: string; oldValue: unknown; newValue: unknown }[]) => {
    const byRow = new Map<string, Record<string, unknown>>();
    for (const c of changes) { if (!byRow.has(c.id)) byRow.set(c.id, {}); byRow.get(c.id)![c.field] = c.newValue; }
    for (const [id, patch] of byRow.entries()) {
      const project = projects.find((item) => item.id === id); if (!project) continue;
      const budgetRaw = patch.budget !== undefined ? patch.budget : project.budget;
      const data = {
        nameAr: String(patch.nameAr ?? project.nameAr),
        nameEn: patch.nameEn !== undefined ? (String(patch.nameEn) || null) : project.nameEn ?? null,
        status: String(patch.status ?? project.status) as ProjectStatus,
        budget: budgetRaw === null || budgetRaw === undefined || String(budgetRaw) === "" ? null : Number(budgetRaw),
        isActive: patch.isActive !== undefined ? Boolean(patch.isActive) : project.isActive,
      };
      await new Promise<void>((res, rej) => updateProject.mutate({ id, data }, { onSuccess: () => res(), onError: rej }));
    }
    invalidate();
  };

  const handleGridDelete = async (ids: string[]) => {
    for (const id of ids) await deleteProject.mutateAsync({ id });
    invalidate();
  };

  const handleGridCreate = async (newProjects: Partial<Project>[]) => {
    for (const p of newProjects) {
      if (!String(p.nameAr ?? "").trim()) continue;
      const trimmed = String(p.budget ?? "").trim();
      const data = {
        nameAr: String(p.nameAr).trim(),
        nameEn: p.nameEn ? String(p.nameEn) : null,
        status: (p.status ?? "active") as ProjectStatus,
        budget: trimmed === "" ? null : Number(trimmed),
        isActive: true,
      };
      await new Promise<void>((res, rej) => createProject.mutate({ data }, { onSuccess: () => res(), onError: rej }));
    }
    invalidate();
  };

  const onSubmit = (form: ProjectForm) => {
    const trimmed = (form.budget ?? "").trim();
    const data = {
      nameAr: form.nameAr,
      nameEn: form.nameEn || null,
      status: form.status,
      budget: trimmed === "" ? null : Number(trimmed),
      isActive: form.isActive ?? true,
    };
    if (modalMode === "create") {
      createProject.mutate({ data }, {
        onSuccess: () => { invalidate(); toast({ title: t("projects.toast.added") }); closeModals(); },
        onError: (err: any) => toast({ variant: "destructive", title: t("common.error"), description: err?.data?.error || t("projects.toast.addError") }),
      });
    } else if (modalMode === "edit" && projectToEdit) {
      updateProject.mutate({ id: projectToEdit.id, data }, {
        onSuccess: () => { invalidate(); toast({ title: t("projects.toast.edited") }); closeModals(); },
        onError: (err: any) => toast({ variant: "destructive", title: t("common.error"), description: err?.data?.error || t("projects.toast.editError") }),
      });
    }
  };

  const handleDelete = () => {
    if (!projectToDelete) return;
    deleteProject.mutate({ id: projectToDelete.id }, {
      onSuccess: () => { invalidate(); toast({ title: t("projects.toast.deleted") }); setProjectToDelete(null); },
      onError: (err: any) => { toast({ variant: "destructive", title: t("common.error"), description: err?.data?.error || t("projects.toast.deleteError") }); setProjectToDelete(null); },
    });
  };

  return (
    <div className="flex flex-col">
      <div className={`flex items-center justify-between px-8 ${embedded ? "pt-2" : "pt-7"} pb-1`}>
        <div>
          <h3 className="text-base font-extrabold text-foreground">{t("projects.title")}</h3>
          <p className="text-sm text-muted-foreground">{t("projects.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <GridToggle isGrid={isGridView} onToggle={toggleGridView} />
          {canCreate && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              {t("projects.addProject")}
            </button>
          )}
        </div>
      </div>

      <div className="p-8 flex flex-col gap-6 max-w-6xl mx-auto w-full">
        {isLoading ? (
          <div className="flex items-center justify-center p-12"><Spinner className="w-8 h-8 text-primary" /></div>
        ) : projects.length === 0 ? (
          <div className="bg-card border rounded-2xl shadow-sm min-h-[300px] flex flex-col items-center justify-center p-12 text-muted-foreground gap-3">
            <p>{t("projects.noProjects")}</p>
            <span className="text-xs">{t("projects.noProjectsHint")}</span>
            {canCreate && (
              <button onClick={openCreateModal} className="text-primary font-bold hover:underline">{t("projects.addFirst")}</button>
            )}
          </div>
        ) : isGridView ? (
          <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
            <GridTable
              rows={projects}
              columns={projectGridColumns}
              canEdit={canUpdate}
              canDelete={canDelete}
              onSave={handleGridSave}
              onDeleteRows={handleGridDelete}
              onCreateRows={canCreate ? handleGridCreate : undefined}
              newRowTemplate={() => ({ status: "active" as ProjectStatus, isActive: true })}
              selectedIds={selectedProjectIds}
              onSelectionChange={setSelectedProjectIds}
              emptyMessage={t("projects.noProjects")}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {projects.map((project) => (
              <div key={project.id} className="group bg-card border rounded-2xl shadow-sm p-5 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0"><FolderKanban className="w-5 h-5" /></div>
                  <div className="flex-1">
                    <p className="font-bold text-foreground">{displayName(project, lang)}</p>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[project.status as ProjectStatus]}`}>{t(`projects.statuses.${project.status}`)}</span>
                  </div>
                  {(canUpdate || canDelete) && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      {canUpdate && (
                        <button onClick={() => openEditModal(project)} className="p-1.5 rounded-md hover:bg-primary/10 text-primary transition-colors" title={t("common.edit")}>
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => setProjectToDelete(project)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive transition-colors" title={t("common.delete")}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/40 rounded-xl p-3">
                    <p className="text-[11px] text-muted-foreground">{t("projects.budget")}</p>
                    <p className="font-sans text-sm font-bold tabular-nums">{project.budget === null || project.budget === undefined ? t("projects.noBudget") : fmt(project.budget)}</p>
                  </div>
                  <div className="bg-muted/40 rounded-xl p-3">
                    <p className="text-[11px] text-muted-foreground">{t("projects.activity")}</p>
                    <p className={`text-sm font-bold ${project.isActive ? "text-success" : "text-muted-foreground"}`}>{project.isActive ? t("projects.active") : t("projects.inactive")}</p>
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
                <FolderKanban className="w-5 h-5 text-primary" />
                <h2 className="text-base font-bold text-foreground">{modalMode === "create" ? t("projects.createTitle") : t("projects.editTitle")}</h2>
              </div>
              <button type="button" onClick={closeModals} className="p-1 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 flex flex-col gap-5 overflow-y-auto">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">{t("projects.nameAr")}</label>
                <input dir="rtl" placeholder={t("projects.namePlaceholder")} className="bg-background border rounded-xl h-11 px-4 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("nameAr")} />
                {errors.nameAr && <span className="text-xs text-destructive">{t(`projects.validation.${errors.nameAr.message}`)}</span>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">
                  {t("projects.nameEn")}<span className="text-xs font-medium text-muted-foreground ms-2">{t("projects.optional")}</span>
                </label>
                <input dir="ltr" placeholder={t("projects.namePlaceholderEn")} className="bg-background border rounded-xl h-11 px-4 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("nameEn")} />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">{t("projects.status")}</label>
                <div className="relative">
                  <select className="w-full appearance-none bg-background border rounded-xl h-11 ps-4 pe-10 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("status")}>
                    {PROJECT_STATUSES.map((status) => (
                      <option key={status} value={status}>{t(`projects.statuses.${status}`)}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">{t("projects.budgetLabel")}<span className="text-xs font-medium text-muted-foreground ms-2">{t("projects.optional")}</span></label>
                <input dir="ltr" type="number" step="0.01" placeholder={t("projects.budgetPlaceholder")} className="bg-background border rounded-xl h-11 px-4 text-sm font-sans text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" {...register("budget")} />
              </div>

              <div className="flex items-center justify-between bg-secondary/40 border border-secondary rounded-xl px-4 py-3 cursor-pointer" onClick={() => setValue("isActive", !isActive)}>
                <span className="text-sm font-bold text-foreground">{t("projects.isActive")}</span>
                <div className={`w-10 h-6 rounded-full flex items-center transition-colors px-0.5 ${isActive ? "bg-primary" : "bg-muted-foreground/30"}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${isActive ? "translate-x-4 rtl:-translate-x-4" : "translate-x-0"}`} />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/30">
              <button type="button" onClick={closeModals} className="px-5 py-2.5 rounded-full text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">{t("common.cancel")}</button>
              <button type="submit" disabled={createProject.isPending || updateProject.isPending} className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-5 py-2.5 rounded-full text-sm font-bold hover:opacity-90 transition-opacity">
                <Check className="w-4 h-4" />
                {createProject.isPending || updateProject.isPending ? t("common.saving") : t("projects.save")}
              </button>
            </div>
          </form>
        </div>
      )}

      <AlertDialog open={!!projectToDelete} onOpenChange={(open) => !open && setProjectToDelete(null)}>
        <AlertDialogContent className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-start">{t("projects.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="text-start">
              {t("projects.deleteBody", { name: projectToDelete ? displayName(projectToDelete, lang) : "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              {deleteProject.isPending ? t("projects.deleting") : t("projects.confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
