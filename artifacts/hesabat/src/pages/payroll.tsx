import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useCreateEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
  useListPayrollRuns,
  useGetPayrollRun,
  useCreatePayrollRun,
  useGetPayrollSettings,
  useUpdatePayrollSettings,
  useListCostCenters,
  useListCustodies,
  useListAccounts,
  useGetCurrentUser,
  getListEmployeesQueryKey,
  getListPayrollRunsQueryKey,
  getListJournalEntriesQueryKey,
  getGetPayrollSettingsQueryKey,
  type Employee,
  type PayrollRun,
  type Account,
  type CostCenter,
} from "@workspace/api-client-react";
import { hasCapability } from "@workspace/permissions";
import { GridTable, type GridColumn } from "@/components/GridTable";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";
import { PaginationBar } from "@/components/ui/pagination-bar";
import {
  Users,
  Plus,
  X,
  Check,
  Trash2,
  PlayCircle,
  Eye,
  Settings,
} from "lucide-react";

import { Spinner } from "@/components/ui/spinner";
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

type ComponentDraft = {
  kind: "allowance" | "deduction";
  nameAr: string;
  amount: string;
  isActive: boolean;
  linkedAccountId: string;
};

type EmployeeForm = {
  nameAr: string;
  nameEn: string;
  jobTitle: string;
  hireDate: string;
  baseSalary: string;
  status: "active" | "terminated";
  employeeType: "permanent" | "temporary";
  nationalId: string;
  costCenterId: string;
  insuranceSalary: string;
  includeInsurance: boolean;
  notes: string;
  components: ComponentDraft[];
};

function displayName(
  e: { nameAr: string; nameEn?: string | null },
  lang: string,
): string {
  return lang.startsWith("en") && e.nameEn ? e.nameEn : e.nameAr;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function emptyForm(): EmployeeForm {
  return {
    nameAr: "",
    nameEn: "",
    jobTitle: "",
    hireDate: today(),
    baseSalary: "",
    status: "active",
    employeeType: "permanent",
    nationalId: "",
    costCenterId: "",
    insuranceSalary: "",
    includeInsurance: true,
    notes: "",
    components: [],
  };
}

export function Payroll() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [tab, setTab] = useState<"employees" | "runs" | "report">("employees");

  const [employeesPage, setEmployeesPage] = useState(1);
  const { data: paginatedEmployees, isLoading: employeesLoading } =
    usePaginatedQuery<Employee>("/api/employees", employeesPage);
  const employees = paginatedEmployees?.data ?? [];
  const { data: runs = [], isLoading: runsLoading } = useListPayrollRuns();
  const { data: custodies = [] } = useListCustodies();
  const openCustodies = useMemo(
    () => custodies.filter((c) => c.status === "open"),
    [custodies],
  );
  const { data: accounts = [] } = useListAccounts();
  const { data: costCenters = [] } = useListCostCenters();
  const { data: payrollSettings } = useGetPayrollSettings();
  const postableAccounts = useMemo(
    () => accounts.filter((a: Account) => !a.isGroup),
    [accounts],
  );

  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();
  const deleteEmployee = useDeleteEmployee();
  const createRun = useCreatePayrollRun();
  const updatePayrollSettings = useUpdatePayrollSettings();

  const { data: user } = useGetCurrentUser();
  const role = user?.role ?? "";
  const canCreate = hasCapability(role, "payroll:create");
  const canUpdate = hasCapability(role, "payroll:update");
  const canDelete = hasCapability(role, "payroll:delete");

  const [empModalMode, setEmpModalMode] = useState<"create" | "edit" | null>(
    null,
  );
  const [empToEdit, setEmpToEdit] = useState<Employee | null>(null);
  const [empToDelete, setEmpToDelete] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeForm>(emptyForm());
  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const [runModalOpen, setRunModalOpen] = useState(false);
  const [runPeriod, setRunPeriod] = useState(currentMonth());
  const [empTaxes, setEmpTaxes] = useState<Map<string, string>>(new Map());
  const [runNotes, setRunNotes] = useState("");

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    salaryExpenseAccountId: "",
    netPayableAccountId: "",
    deductionsAccountId: "",
    insuranceExpenseAccountId: "",
    insuranceLiabilityAccountId: "",
    payrollTaxLiabilityAccountId: "",
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const [runToView, setRunToView] = useState<string | null>(null);

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const accountLabel = (a: Account) => `${a.code} · ${displayName(a, lang)}`;

  const invalidateEmployees = () =>
    queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
  const invalidateRuns = () =>
    queryClient.invalidateQueries({ queryKey: getListPayrollRunsQueryKey() });

  const empGridColumns: GridColumn<Employee>[] = [
    { key: "code", header: t("payroll.code"), type: "readonly", width: "90px" },
    { key: "nameAr", header: t("payroll.name") + " (ع)", type: "text", editable: canUpdate, validate: (v) => !v ? "مطلوب" : null },
    { key: "nameEn", header: t("payroll.name") + " (EN)", type: "text", editable: canUpdate },
    { key: "jobTitle", header: t("payroll.jobTitle"), type: "text", editable: canUpdate },
    { key: "hireDate", header: t("payroll.hireDate"), type: "text", editable: canUpdate, width: "130px",
      validate: (v) => !v ? "مطلوب" : null },
    { key: "baseSalary", header: t("payroll.baseSalary"), type: "number", editable: canUpdate, align: "end",
      render: (v) => <span className="font-sans tabular-nums">{fmt(Number(v ?? 0))}</span>,
      validate: (v) => Number(v) < 0 ? "يجب أن يكون موجباً" : null },
    { key: "status", header: t("payroll.status"), type: "select", editable: canUpdate, width: "110px",
      options: [
        { value: "active", label: t("payroll.active") },
        { value: "terminated", label: t("payroll.terminated") },
      ],
      render: (v) => v === "active"
        ? <span className="text-[11px] font-bold text-success bg-success/10 px-2 py-0.5 rounded-full">{t("payroll.active")}</span>
        : <span className="text-[11px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{t("payroll.terminated")}</span>
    },
    { key: "employeeType" as keyof Employee, header: "نوع التوظيف", type: "select", editable: canUpdate, width: "110px",
      options: [
        { value: "permanent", label: "دائم" },
        { value: "temporary", label: "مؤقت" },
      ],
      render: (v) => v === "temporary"
        ? <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">مؤقت</span>
        : <span className="text-[11px] font-bold text-primary/80 bg-primary/5 px-2 py-0.5 rounded-full">دائم</span>
    },
    { key: "nationalId" as keyof Employee, header: "الرقم القومي", type: "text", editable: canUpdate, width: "145px" },
    { key: "costCenterId" as keyof Employee, header: "مركز التكلفة", type: "select", editable: canUpdate, width: "150px",
      options: [
        { value: "", label: "—" },
        ...costCenters.map((c: CostCenter) => ({ value: c.id, label: (c as any).name ?? c.id })),
      ],
      render: (v) => {
        const cc = costCenters.find((c: CostCenter) => c.id === v);
        return <span>{cc ? ((cc as any).name ?? cc.id) : "—"}</span>;
      },
    },
    { key: "insuranceSalary" as keyof Employee, header: "وعاء التأمين", type: "number", editable: canUpdate, align: "end",
      render: (v) => v != null && Number(v) > 0
        ? <span className="font-sans tabular-nums">{fmt(Number(v))}</span>
        : <span className="text-muted-foreground text-xs">—</span>,
    },
    { key: "includeInsurance" as keyof Employee, header: "تأمين اجتماعي", type: "boolean", editable: canUpdate, width: "110px" },
    { key: "notes", header: "ملاحظات", type: "text", editable: canUpdate, width: "180px" },
  ];

  const handleEmpGridSave = async (changes: { id: string; field: string; oldValue: unknown; newValue: unknown }[]) => {
    const byRow = new Map<string, Record<string, unknown>>();
    for (const c of changes) { if (!byRow.has(c.id)) byRow.set(c.id, {}); byRow.get(c.id)![c.field] = c.newValue; }
    for (const [id, patch] of byRow.entries()) {
      const e = employees.find((x) => x.id === id); if (!e) continue;
      const ea = e as any;
      const data = {
        nameAr: String(patch.nameAr ?? e.nameAr),
        nameEn: patch.nameEn !== undefined ? (String(patch.nameEn) || null) : e.nameEn ?? null,
        jobTitle: patch.jobTitle !== undefined ? (String(patch.jobTitle) || null) : e.jobTitle ?? null,
        hireDate: patch.hireDate !== undefined ? String(patch.hireDate) : e.hireDate,
        baseSalary: patch.baseSalary !== undefined ? Number(patch.baseSalary) : Number(e.baseSalary),
        status: String(patch.status ?? e.status) as "active" | "terminated",
        employeeType: String(patch.employeeType ?? ea.employeeType ?? "permanent") as "permanent" | "temporary",
        nationalId: patch.nationalId !== undefined ? (String(patch.nationalId) || null) : ea.nationalId ?? null,
        costCenterId: patch.costCenterId !== undefined ? (String(patch.costCenterId) || null) : ea.costCenterId ?? null,
        insuranceSalary: patch.insuranceSalary !== undefined
          ? (patch.insuranceSalary !== "" && patch.insuranceSalary != null ? Number(patch.insuranceSalary) : null)
          : (ea.insuranceSalary != null ? Number(ea.insuranceSalary) : null),
        includeInsurance: patch.includeInsurance !== undefined ? Boolean(patch.includeInsurance) : (ea.includeInsurance ?? true),
        notes: patch.notes !== undefined ? (String(patch.notes) || null) : e.notes ?? null,
        components: (e.components ?? []).map((c) => ({ kind: c.kind, nameAr: c.nameAr, amount: Number(c.amount), isActive: c.isActive, linkedAccountId: (c as any).linkedAccountId ?? null })),
      };
      await new Promise<void>((res, rej) => updateEmployee.mutate({ id, data: data as any }, { onSuccess: () => res(), onError: rej }));
    }
    invalidateEmployees();
  };

  const handleEmpGridCreate = async (rows: Partial<Employee>[]) => {
    for (const row of rows) {
      const ra = row as any;
      const data = {
        nameAr: String(ra.nameAr ?? ""),
        nameEn: ra.nameEn ? String(ra.nameEn) : null,
        jobTitle: ra.jobTitle ? String(ra.jobTitle) : null,
        hireDate: String(ra.hireDate ?? today()),
        baseSalary: Number(ra.baseSalary ?? 0),
        status: (ra.status as "active" | "terminated") ?? "active",
        employeeType: (ra.employeeType as "permanent" | "temporary") ?? "permanent",
        nationalId: ra.nationalId ? String(ra.nationalId) : null,
        costCenterId: ra.costCenterId ? String(ra.costCenterId) : null,
        insuranceSalary: ra.insuranceSalary != null && ra.insuranceSalary !== "" ? Number(ra.insuranceSalary) : null,
        includeInsurance: ra.includeInsurance ?? true,
        notes: ra.notes ? String(ra.notes) : null,
        components: [],
      };
      await createEmployee.mutateAsync({ data: data as any });
    }
    invalidateEmployees();
  };

  const empNewRowTemplate = (): Partial<Employee> => ({
    nameAr: "",
    hireDate: today(),
    baseSalary: "0" as any,
    status: "active",
    employeeType: "permanent" as any,
    includeInsurance: true as any,
    components: [],
  });

  const handleEmpGridDelete = async (ids: string[]) => {
    for (const id of ids) await deleteEmployee.mutateAsync({ id });
    invalidateEmployees();
  };

  // ---- employee modal ----
  const openCreateEmp = () => {
    setForm(emptyForm());
    setEmpToEdit(null);
    setEmpModalMode("create");
  };

  const openEditEmp = (e: Employee) => {
    setForm({
      nameAr: e.nameAr,
      nameEn: e.nameEn ?? "",
      jobTitle: e.jobTitle ?? "",
      hireDate: e.hireDate,
      baseSalary: String(e.baseSalary),
      status: e.status as "active" | "terminated",
      employeeType: ((e as any).employeeType ?? "permanent") as "permanent" | "temporary",
      nationalId: (e as any).nationalId ?? "",
      costCenterId: (e as any).costCenterId ?? "",
      insuranceSalary: (e as any).insuranceSalary != null ? String((e as any).insuranceSalary) : "",
      includeInsurance: (e as any).includeInsurance ?? true,
      notes: e.notes ?? "",
      components: e.components.map((c) => ({
        kind: c.kind as "allowance" | "deduction",
        nameAr: c.nameAr,
        amount: String(c.amount),
        isActive: c.isActive,
        linkedAccountId: (c as any).linkedAccountId ?? "",
      })),
    });
    setEmpToEdit(e);
    setEmpModalMode("edit");
  };

  const closeEmpModal = () => {
    setEmpModalMode(null);
    setEmpToEdit(null);
  };

  const addComponent = (kind: "allowance" | "deduction") => {
    setForm((f) => ({
      ...f,
      components: [
        ...f.components,
        { kind, nameAr: "", amount: "", isActive: true, linkedAccountId: "" },
      ],
    }));
  };

  const updateComponent = (
    idx: number,
    patch: Partial<ComponentDraft>,
  ) => {
    setForm((f) => ({
      ...f,
      components: f.components.map((c, i) =>
        i === idx ? { ...c, ...patch } : c,
      ),
    }));
  };

  const removeComponent = (idx: number) => {
    setForm((f) => ({
      ...f,
      components: f.components.filter((_, i) => i !== idx),
    }));
  };

  const submitEmployee = () => {
    if (!form.nameAr.trim() || !form.hireDate) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t("payroll.form.save"),
      });
      return;
    }
    const components = form.components
      .filter((c) => c.nameAr.trim())
      .map((c) => ({
        kind: c.kind,
        nameAr: c.nameAr.trim(),
        amount: Number(c.amount) || 0,
        isActive: c.isActive,
        linkedAccountId: c.linkedAccountId || null,
      }));
    const payload: Record<string, unknown> = {
      nameAr: form.nameAr.trim(),
      nameEn: form.nameEn.trim() || null,
      jobTitle: form.jobTitle.trim() || null,
      hireDate: form.hireDate,
      baseSalary: Number(form.baseSalary) || 0,
      status: form.status,
      employeeType: form.employeeType,
      nationalId: form.nationalId.trim() || null,
      costCenterId: form.costCenterId || null,
      insuranceSalary: form.insuranceSalary ? Number(form.insuranceSalary) : null,
      includeInsurance: form.includeInsurance,
      notes: form.notes.trim() || null,
      components,
    };
    if (empModalMode === "create") {
      createEmployee.mutate(
        { data: payload as any },
        {
          onSuccess: () => {
            invalidateEmployees();
            toast({ title: t("payroll.toast.added") });
            closeEmpModal();
          },
          onError: (err: any) =>
            toast({
              variant: "destructive",
              title: t("common.error"),
              description: err?.data?.error || t("payroll.toast.addError"),
            }),
        },
      );
    } else if (empModalMode === "edit" && empToEdit) {
      updateEmployee.mutate(
        { id: empToEdit.id, data: payload as any },
        {
          onSuccess: () => {
            invalidateEmployees();
            toast({ title: t("payroll.toast.edited") });
            closeEmpModal();
          },
          onError: (err: any) =>
            toast({
              variant: "destructive",
              title: t("common.error"),
              description: err?.data?.error || t("payroll.toast.editError"),
            }),
        },
      );
    }
  };

  const handleBulkDeleteEmps = async () => {
    setIsBulkDeleting(true);
    let ok = 0; let fail = 0;
    for (const id of Array.from(selectedEmpIds)) {
      try { await deleteEmployee.mutateAsync({ id }); ok++; }
      catch { fail++; }
    }
    setIsBulkDeleting(false);
    setBulkDeleteOpen(false);
    setSelectedEmpIds(new Set());
    invalidateEmployees();
    if (ok > 0) toast({ title: `تم حذف ${ok} موظف بنجاح` });
    if (fail > 0) toast({ variant: "destructive", title: t("common.error"), description: `فشل حذف ${fail} موظف` });
  };

  const handleDeleteEmp = () => {
    if (!empToDelete) return;
    deleteEmployee.mutate(
      { id: empToDelete.id },
      {
        onSuccess: () => {
          invalidateEmployees();
          toast({ title: t("payroll.toast.deleted") });
          setEmpToDelete(null);
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: t("common.error"),
            description: err?.data?.error || t("payroll.toast.deleteError"),
          });
          setEmpToDelete(null);
        },
      },
    );
  };

  // ---- run modal ----
  const openRunModal = () => {
    setRunPeriod(currentMonth());
    setEmpTaxes(new Map());
    setRunNotes("");
    setRunModalOpen(true);
  };

  const openSettingsModal = () => {
    setSettingsForm({
      salaryExpenseAccountId: payrollSettings?.salaryExpenseAccountId ?? "",
      netPayableAccountId: payrollSettings?.netPayableAccountId ?? "",
      deductionsAccountId: payrollSettings?.deductionsAccountId ?? "",
      insuranceExpenseAccountId: payrollSettings?.insuranceExpenseAccountId ?? "",
      insuranceLiabilityAccountId: payrollSettings?.insuranceLiabilityAccountId ?? "",
      payrollTaxLiabilityAccountId: payrollSettings?.payrollTaxLiabilityAccountId ?? "",
    });
    setSettingsOpen(true);
  };

  const submitSettings = () => {
    setIsSavingSettings(true);
    updatePayrollSettings.mutate(
      {
        data: {
          salaryExpenseAccountId: settingsForm.salaryExpenseAccountId || null,
          netPayableAccountId: settingsForm.netPayableAccountId || null,
          deductionsAccountId: settingsForm.deductionsAccountId || null,
          insuranceExpenseAccountId: settingsForm.insuranceExpenseAccountId || null,
          insuranceLiabilityAccountId: settingsForm.insuranceLiabilityAccountId || null,
          payrollTaxLiabilityAccountId: settingsForm.payrollTaxLiabilityAccountId || null,
        } as any,
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPayrollSettingsQueryKey() });
          toast({ title: t("payroll.settings.saved") });
          setSettingsOpen(false);
        },
        onError: (err: any) =>
          toast({ variant: "destructive", title: t("common.error"), description: err?.data?.error || t("payroll.settings.saveError") }),
        onSettled: () => setIsSavingSettings(false),
      },
    );
  };

  const submitRun = () => {
    if (!runPeriod) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t("payroll.run.periodRequired"),
      });
      return;
    }
    const employeeTaxes = Array.from(empTaxes.entries())
      .filter(([, v]) => Number(v) > 0)
      .map(([employeeId, payrollTax]) => ({ employeeId, payrollTax: Number(payrollTax) }));
    createRun.mutate(
      {
        data: {
          period: runPeriod,
          notes: runNotes.trim() || null,
          employeeTaxes,
        } as any,
      },
      {
        onSuccess: (run) => {
          invalidateRuns();
          queryClient.invalidateQueries({
            queryKey: getListJournalEntriesQueryKey(),
          });
          toast({
            title: t("payroll.toast.runDone", { no: run.journalEntryNo }),
          });
          setRunModalOpen(false);
          setTab("runs");
        },
        onError: (err: any) =>
          toast({
            variant: "destructive",
            title: t("common.error"),
            description: err?.data?.error || t("payroll.toast.runError"),
          }),
      },
    );
  };


  const inputCls =
    "bg-background border rounded-xl h-11 px-4 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";
  const labelCls = "text-sm font-bold text-foreground";

  return (
    <div className="flex flex-col">
      <header className="h-20 bg-background/80 backdrop-blur-md border-b flex items-center justify-between px-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-card border shadow-sm flex items-center justify-center text-primary">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">
              {t("payroll.title")}
            </h1>
            <p className="text-sm text-muted-foreground font-medium">
              {t("payroll.subtitle")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tab === "employees" ? (
            <ExcelToolbar
              exportPath="/api/employees/export"
              importPath="/api/employees/import"
              canImport={canCreate}
              invalidateKeys={[getListEmployeesQueryKey()]}
            />
          ) : tab === "runs" ? (
            <ExcelToolbar
              exportPath="/api/payroll/runs/export"
              invalidateKeys={[getListPayrollRunsQueryKey()]}
            />
          ) : null}
          {canCreate && (
            <button
              onClick={openSettingsModal}
              className="flex items-center gap-2 bg-card border text-foreground px-4 py-2 rounded-full text-sm font-bold hover:bg-muted transition-colors"
            >
              <Settings className="w-4 h-4" />
              {t("payroll.settings.title")}
            </button>
          )}
          {canCreate && employees.length > 0 && (
            <button
              onClick={openRunModal}
              className="flex items-center gap-2 bg-card border text-foreground px-4 py-2 rounded-full text-sm font-bold hover:bg-muted transition-colors"
            >
              <PlayCircle className="w-4 h-4" />
              {t("payroll.runPayroll")}
            </button>
          )}
          {canCreate && (
            <button
              onClick={openCreateEmp}
              className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              {t("payroll.addEmployee")}
            </button>
          )}
        </div>
      </header>

      <div className="px-8 pt-6">
        <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-full w-fit">
          {(["employees", "runs", "report"] as const).map((tk) => (
            <button
              key={tk}
              onClick={() => setTab(tk)}
              className={`px-5 py-2 rounded-full text-sm font-bold transition-colors ${
                tab === tk
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(`payroll.tabs.${tk}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="p-8 flex flex-col gap-6 max-w-6xl mx-auto w-full">
        {tab === "employees" ? (
          <div className="bg-card border rounded-2xl shadow-sm overflow-hidden min-h-[300px]">
            {employeesLoading ? (
              <div className="flex items-center justify-center p-12">
                <Spinner className="w-8 h-8 text-primary" />
              </div>
            ) : (
              <GridTable
                rows={employees}
                columns={empGridColumns}
                canEdit={canUpdate}
                canDelete={canDelete}
                onSave={handleEmpGridSave}
                onDeleteRows={handleEmpGridDelete}
                onCreateRows={canCreate ? handleEmpGridCreate : undefined}
                newRowTemplate={canCreate ? empNewRowTemplate : undefined}
                selectedIds={selectedEmpIds}
                onSelectionChange={setSelectedEmpIds}
                emptyMessage={t("payroll.noEmployees")}
                rowClassName={(row) => row.status === "terminated" ? "opacity-60" : ""}
                defaultHiddenColumns={["notes"]}
                stickyFirstCol
              />
            )}
            {paginatedEmployees && paginatedEmployees.totalPages > 1 && (
              <PaginationBar
                page={employeesPage}
                totalPages={paginatedEmployees.totalPages}
                total={paginatedEmployees.total}
                limit={paginatedEmployees.limit}
                onPageChange={setEmployeesPage}
              />
            )}
          </div>
        ) : tab === "report" ? (
          <PayrollDetailReport />
        ) : (
          <div className="bg-card border rounded-2xl shadow-sm overflow-hidden min-h-[300px]">
            {runsLoading ? (
              <div className="flex items-center justify-center p-12">
                <Spinner className="w-8 h-8 text-primary" />
              </div>
            ) : runs.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-2 text-center">
                <p className="font-bold text-foreground">
                  {t("payroll.noRuns")}
                </p>
                <p className="text-sm max-w-md">{t("payroll.noRunsHint")}</p>
                {canCreate && employees.length > 0 && (
                  <button
                    onClick={openRunModal}
                    className="mt-2 text-primary font-bold hover:underline"
                  >
                    {t("payroll.runFirst")}
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
                    <th className="text-start px-6 py-3">
                      {t("payroll.period")}
                    </th>
                    <th className="text-end px-3 py-3">
                      {t("payroll.employeeCount")}
                    </th>
                    <th className="text-end px-3 py-3">{t("payroll.gross")}</th>
                    <th className="text-end px-3 py-3">
                      {t("payroll.deductions")}
                    </th>
                    <th className="text-end px-3 py-3">{t("payroll.net")}</th>
                    <th className="text-center px-3 py-3">
                      {t("payroll.entry")}
                    </th>
                    <th className="w-16 px-6 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr
                      key={r.id}
                      className="group border-t hover:bg-muted/40 transition-colors"
                    >
                      <td
                        className="px-6 py-3.5 font-sans tabular-nums font-bold text-foreground"
                        dir="ltr"
                      >
                        {r.period}
                      </td>
                      <td
                        className="px-3 py-3.5 text-end font-sans tabular-nums text-foreground/80"
                        dir="ltr"
                      >
                        {r.employeeCount}
                      </td>
                      <td
                        className="px-3 py-3.5 text-end font-sans tabular-nums text-foreground/80"
                        dir="ltr"
                      >
                        {fmt(r.totalGross)}
                      </td>
                      <td
                        className="px-3 py-3.5 text-end font-sans tabular-nums text-destructive"
                        dir="ltr"
                      >
                        {fmt(r.totalDeductions)}
                      </td>
                      <td
                        className="px-3 py-3.5 text-end font-bold font-sans tabular-nums text-foreground"
                        dir="ltr"
                      >
                        {fmt(r.totalNet)}
                      </td>
                      <td className="px-3 py-3.5 text-center">
                        {r.journalEntryNo != null ? (
                          <span
                            className="text-[11px] font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full font-sans tabular-nums"
                            dir="ltr"
                          >
                            #{r.journalEntryNo}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5">
                        <button
                          onClick={() => setRunToView(r.id)}
                          className="p-1.5 rounded-md hover:bg-primary/10 text-primary transition-colors opacity-0 group-hover:opacity-100"
                          title={t("payroll.detail.title")}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* employee modal */}
      {empModalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-card">
              <h2 className="text-lg font-bold text-foreground">
                {empModalMode === "create"
                  ? t("payroll.form.titleCreate")
                  : t("payroll.form.titleEdit")}
              </h2>
              <button
                onClick={closeEmpModal}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>{t("payroll.form.hireDate")}</label>
                <input
                  type="date"
                  className={inputCls}
                  dir="ltr"
                  value={form.hireDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, hireDate: e.target.value }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>{t("payroll.form.nameAr")}</label>
                <input
                  className={inputCls}
                  placeholder={t("payroll.form.nameArPlaceholder")}
                  value={form.nameAr}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nameAr: e.target.value }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>
                  {t("payroll.form.nameEn")}
                  <span className="text-xs font-medium text-muted-foreground ms-2">
                    {t("payroll.optional")}
                  </span>
                </label>
                <input
                  className={inputCls}
                  dir="ltr"
                  placeholder={t("payroll.form.nameEnPlaceholder")}
                  value={form.nameEn}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nameEn: e.target.value }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>
                  {t("payroll.form.jobTitle")}
                  <span className="text-xs font-medium text-muted-foreground ms-2">
                    {t("payroll.optional")}
                  </span>
                </label>
                <input
                  className={inputCls}
                  placeholder={t("payroll.form.jobTitlePlaceholder")}
                  value={form.jobTitle}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, jobTitle: e.target.value }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>
                  {t("payroll.form.baseSalary")}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={inputCls}
                  dir="ltr"
                  value={form.baseSalary}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, baseSalary: e.target.value }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>{t("payroll.form.status")}</label>
                <select
                  className={inputCls}
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      status: e.target.value as "active" | "terminated",
                    }))
                  }
                >
                  <option value="active">{t("payroll.active")}</option>
                  <option value="terminated">{t("payroll.terminated")}</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>{t("payroll.form.employeeType")}</label>
                <select
                  className={inputCls}
                  value={form.employeeType}
                  onChange={(e) => setForm((f) => ({ ...f, employeeType: e.target.value as "permanent" | "temporary" }))}
                >
                  <option value="permanent">{t("payroll.form.permanent")}</option>
                  <option value="temporary">{t("payroll.form.temporary")}</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>
                  {t("payroll.form.nationalId")}
                  <span className="text-xs font-medium text-muted-foreground ms-2">{t("payroll.optional")}</span>
                </label>
                <input
                  className={inputCls}
                  dir="ltr"
                  placeholder="12345678901234"
                  value={form.nationalId}
                  onChange={(e) => setForm((f) => ({ ...f, nationalId: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>
                  {t("payroll.form.costCenter")}
                  <span className="text-xs font-medium text-muted-foreground ms-2">{t("payroll.optional")}</span>
                </label>
                <select
                  className={inputCls}
                  value={form.costCenterId}
                  onChange={(e) => setForm((f) => ({ ...f, costCenterId: e.target.value }))}
                >
                  <option value="">—</option>
                  {costCenters.map((cc) => (
                    <option key={cc.id} value={cc.id}>{cc.nameAr}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>
                  {t("payroll.form.insuranceSalary")}
                  <span className="text-xs font-medium text-muted-foreground ms-2">{t("payroll.optional")}</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={inputCls}
                  dir="ltr"
                  placeholder={t("payroll.form.insuranceSalaryPlaceholder")}
                  value={form.insuranceSalary}
                  onChange={(e) => setForm((f) => ({ ...f, insuranceSalary: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-3 bg-muted/30 rounded-xl px-4 py-3 sm:col-span-2">
                <input
                  type="checkbox"
                  id="includeInsurance"
                  checked={form.includeInsurance}
                  onChange={(e) => setForm((f) => ({ ...f, includeInsurance: e.target.checked }))}
                  className="w-4 h-4 rounded border-input accent-primary"
                />
                <label htmlFor="includeInsurance" className="text-sm font-medium text-foreground cursor-pointer">
                  {t("payroll.form.includeInsurance")}
                </label>
                <span className="text-xs text-muted-foreground">{t("payroll.form.includeInsuranceHint")}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>
                  {t("payroll.form.notes")}
                  <span className="text-xs font-medium text-muted-foreground ms-2">
                    {t("payroll.optional")}
                  </span>
                </label>
                <input
                  className={inputCls}
                  placeholder={t("payroll.form.notesPlaceholder")}
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                />
              </div>

              {/* components editor */}
              <div className="sm:col-span-2 flex flex-col gap-2 border-t pt-4 mt-1">
                <div className="flex items-center justify-between">
                  <label className={labelCls}>
                    {t("payroll.form.components")}
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => addComponent("allowance")}
                      className="flex items-center gap-1 text-xs font-bold text-success bg-success/10 px-3 py-1.5 rounded-full hover:bg-success/20 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      {t("payroll.form.addAllowance")}
                    </button>
                    <button
                      type="button"
                      onClick={() => addComponent("deduction")}
                      className="flex items-center gap-1 text-xs font-bold text-destructive bg-destructive/10 px-3 py-1.5 rounded-full hover:bg-destructive/20 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      {t("payroll.form.addDeduction")}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("payroll.form.componentsHint")}
                </p>
                {form.components.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4 bg-muted/30 rounded-xl">
                    {t("payroll.form.noComponents")}
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {form.components.map((c, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 bg-muted/30 rounded-xl p-2"
                      >
                        <span
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
                            c.kind === "allowance"
                              ? "text-success bg-success/10"
                              : "text-destructive bg-destructive/10"
                          }`}
                        >
                          {c.kind === "allowance"
                            ? t("payroll.form.allowance")
                            : t("payroll.form.deduction")}
                        </span>
                        <input
                          className="flex-1 bg-background border rounded-lg h-9 px-3 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder={t("payroll.form.componentNamePlaceholder")}
                          value={c.nameAr}
                          onChange={(e) =>
                            updateComponent(idx, { nameAr: e.target.value })
                          }
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          dir="ltr"
                          className="w-28 bg-background border rounded-lg h-9 px-3 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 font-sans tabular-nums"
                          placeholder={t("payroll.form.componentAmount")}
                          value={c.amount}
                          onChange={(e) =>
                            updateComponent(idx, { amount: e.target.value })
                          }
                        />
                        {c.kind === "deduction" && (
                          <select
                            className="flex-1 min-w-[120px] bg-background border rounded-lg h-9 px-2 text-xs text-start focus:outline-none focus:ring-2 focus:ring-primary/20"
                            value={c.linkedAccountId}
                            onChange={(e) => updateComponent(idx, { linkedAccountId: e.target.value })}
                            title={t("payroll.form.linkedAccount")}
                          >
                            <option value="">{t("payroll.form.linkedAccountPlaceholder")}</option>
                            {postableAccounts.map((a) => (
                              <option key={a.id} value={a.id}>{accountLabel(a)}</option>
                            ))}
                          </select>
                        )}
                        <button
                          type="button"
                          onClick={() => removeComponent(idx)}
                          className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive transition-colors shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/30 sticky bottom-0">
              <button
                type="button"
                onClick={closeEmpModal}
                className="px-5 py-2.5 rounded-full text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
              >
                {t("payroll.form.cancel")}
              </button>
              <button
                type="button"
                onClick={submitEmployee}
                disabled={createEmployee.isPending || updateEmployee.isPending}
                className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-5 py-2.5 rounded-full text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                <Check className="w-4 h-4" />
                {createEmployee.isPending || updateEmployee.isPending
                  ? t("payroll.form.saving")
                  : t("payroll.form.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* run modal */}
      {runModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-foreground">
                {t("payroll.run.title")}
              </h2>
              <button
                onClick={() => setRunModalOpen(false)}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4">
              {!payrollSettings?.salaryExpenseAccountId && (
                <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  {t("payroll.run.noSettings")}
                  <button
                    onClick={() => { setRunModalOpen(false); openSettingsModal(); }}
                    className="font-bold underline ms-2"
                  >
                    {t("payroll.settings.title")}
                  </button>
                </div>
              )}
              {openCustodies.length > 0 && (
                <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  {t("payroll.run.custodyAlert", { count: openCustodies.length })}
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>{t("payroll.run.period")}</label>
                <input
                  type="month"
                  className={inputCls}
                  dir="ltr"
                  value={runPeriod}
                  onChange={(e) => setRunPeriod(e.target.value)}
                />
                <span className="text-xs text-muted-foreground">{t("payroll.run.periodHint")}</span>
              </div>
              {employees.filter((e) => e.status === "active").length > 0 && (
                <div className="flex flex-col gap-2">
                  <label className={labelCls}>{t("payroll.run.employeeTaxes")}</label>
                  <p className="text-xs text-muted-foreground">{t("payroll.run.employeeTaxesHint")}</p>
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/40 text-xs font-bold text-muted-foreground">
                          <th className="text-start px-4 py-2">{t("payroll.employee")}</th>
                          <th className="text-end px-4 py-2 w-36">{t("payroll.run.payrollTax")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employees.filter((e) => e.status === "active").map((e) => (
                          <tr key={e.id} className="border-t">
                            <td className="px-4 py-2 font-medium">{displayName(e, lang)}</td>
                            <td className="px-3 py-1.5">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                dir="ltr"
                                className="w-full bg-background border rounded-lg h-8 px-2 text-sm text-end font-sans tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/20"
                                placeholder="0.00"
                                value={empTaxes.get(e.id) ?? ""}
                                onChange={(ev) => {
                                  const m = new Map(empTaxes);
                                  if (ev.target.value) m.set(e.id, ev.target.value);
                                  else m.delete(e.id);
                                  setEmpTaxes(m);
                                }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>
                  {t("payroll.run.notes")}
                  <span className="text-xs font-medium text-muted-foreground ms-2">{t("payroll.optional")}</span>
                </label>
                <input
                  className={inputCls}
                  placeholder={t("payroll.run.notesPlaceholder")}
                  value={runNotes}
                  onChange={(e) => setRunNotes(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-xl px-4 py-3">
                {t("payroll.run.preview")}
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/30">
              <button
                type="button"
                onClick={() => setRunModalOpen(false)}
                className="px-5 py-2.5 rounded-full text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
              >
                {t("payroll.run.cancel")}
              </button>
              <button
                type="button"
                onClick={submitRun}
                disabled={createRun.isPending}
                className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-5 py-2.5 rounded-full text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                <PlayCircle className="w-4 h-4" />
                {createRun.isPending
                  ? t("payroll.run.running")
                  : t("payroll.run.run")}
              </button>
            </div>
          </div>
        </div>
      )}

      {runToView && (
        <RunDetailModal id={runToView} onClose={() => setRunToView(null)} />
      )}

      {/* payroll settings modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-foreground">{t("payroll.settings.title")}</h2>
              <button onClick={() => setSettingsOpen(false)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">{t("payroll.settings.hint")}</p>
              {(["salaryExpenseAccountId", "netPayableAccountId", "deductionsAccountId", "insuranceExpenseAccountId", "insuranceLiabilityAccountId", "payrollTaxLiabilityAccountId"] as const).map((key) => {
                const labelMap: Record<string, string> = {
                  salaryExpenseAccountId: t("payroll.run.salaryExpenseAccount"),
                  netPayableAccountId: t("payroll.run.netPayableAccount"),
                  deductionsAccountId: t("payroll.run.deductionsAccount"),
                  insuranceExpenseAccountId: t("payroll.run.insuranceExpenseAccount"),
                  insuranceLiabilityAccountId: t("payroll.run.insuranceLiabilityAccount"),
                  payrollTaxLiabilityAccountId: t("payroll.settings.payrollTaxLiabilityAccount"),
                };
                const required = ["salaryExpenseAccountId", "netPayableAccountId"].includes(key);
                return (
                  <div key={key} className="flex flex-col gap-1.5">
                    <label className={labelCls}>
                      {labelMap[key]}
                      {!required && <span className="text-xs font-medium text-muted-foreground ms-2">{t("payroll.optional")}</span>}
                    </label>
                    <select
                      className={inputCls}
                      value={settingsForm[key]}
                      onChange={(e) => setSettingsForm((f) => ({ ...f, [key]: e.target.value }))}
                    >
                      <option value="">—</option>
                      {postableAccounts.map((a) => (
                        <option key={a.id} value={a.id}>{accountLabel(a)}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/30">
              <button type="button" onClick={() => setSettingsOpen(false)} className="px-5 py-2.5 rounded-full text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">
                {t("payroll.form.cancel")}
              </button>
              <button type="button" onClick={submitSettings} disabled={isSavingSettings} className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-5 py-2.5 rounded-full text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60">
                <Check className="w-4 h-4" />
                {isSavingSettings ? t("payroll.settings.saving") : t("payroll.settings.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={bulkDeleteOpen} onOpenChange={(open) => !open && setBulkDeleteOpen(false)}>
        <AlertDialogContent className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-start">حذف {selectedEmpIds.size} موظف</AlertDialogTitle>
            <AlertDialogDescription className="text-start">
              سيتم حذف {selectedEmpIds.size} موظف نهائياً ولا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogCancel disabled={isBulkDeleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDeleteEmps} disabled={isBulkDeleting} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              {isBulkDeleting ? t("payroll.deleting") : "حذف المحدد"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!empToDelete}
        onOpenChange={(open) => !open && setEmpToDelete(null)}
      >
        <AlertDialogContent className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-start">
              {t("payroll.deleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-start">
              {t("payroll.deleteBody", {
                name: empToDelete ? displayName(empToDelete, lang) : "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteEmp}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {deleteEmployee.isPending
                ? t("payroll.deleting")
                : t("payroll.confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RunDetailModal({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { data: run, isLoading } = useGetPayrollRun(id);
  const fmt = (n: number) =>
    new Intl.NumberFormat(lang, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-card">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {t("payroll.detail.title")}
            </h2>
            {run && (
              <p
                className="text-sm text-muted-foreground font-sans tabular-nums"
                dir="ltr"
              >
                {run.period}
                {run.journalEntryNo != null
                  ? ` · ${t("payroll.detail.journalEntry")} #${run.journalEntryNo}`
                  : ""}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {isLoading || !run ? (
            <div className="flex items-center justify-center p-12">
              <Spinner className="w-8 h-8 text-primary" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
                  <th className="text-start px-4 py-3">{t("payroll.employee")}</th>
                  <th className="text-end px-3 py-3">{t("payroll.baseSalary")}</th>
                  <th className="text-end px-3 py-3">{t("payroll.allowances")}</th>
                  <th className="text-end px-3 py-3">{t("payroll.detail.empInsurance")}</th>
                  <th className="text-end px-3 py-3">{t("payroll.detail.coInsurance")}</th>
                  <th className="text-end px-3 py-3">{t("payroll.detail.payrollTax")}</th>
                  <th className="text-end px-3 py-3">{t("payroll.deductions")}</th>
                  <th className="text-end px-4 py-3">{t("payroll.net")}</th>
                </tr>
              </thead>
              <tbody>
                {(run.lines ?? []).map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="px-4 py-3 font-medium text-foreground">{l.employeeName}</td>
                    <td className="px-3 py-3 text-end font-sans tabular-nums text-foreground/80" dir="ltr">{fmt(l.baseSalary)}</td>
                    <td className="px-3 py-3 text-end font-sans tabular-nums text-success" dir="ltr">{fmt(l.totalAllowances)}</td>
                    <td className="px-3 py-3 text-end font-sans tabular-nums text-amber-600" dir="ltr">
                      {(l as any).employeeInsurance > 0 ? fmt((l as any).employeeInsurance) : "—"}
                    </td>
                    <td className="px-3 py-3 text-end font-sans tabular-nums text-amber-700" dir="ltr">
                      {(l as any).companyInsurance > 0 ? fmt((l as any).companyInsurance) : "—"}
                    </td>
                    <td className="px-3 py-3 text-end font-sans tabular-nums text-orange-600" dir="ltr">
                      {(l as any).payrollTax > 0 ? fmt((l as any).payrollTax) : "—"}
                    </td>
                    <td className="px-3 py-3 text-end font-sans tabular-nums text-destructive" dir="ltr">{fmt(l.totalDeductions)}</td>
                    <td className="px-4 py-3 text-end font-bold font-sans tabular-nums text-foreground" dir="ltr">{fmt(l.netPay)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-bold bg-muted/40">
                  <td className="px-4 py-3 text-foreground">{t("payroll.gross")} / {t("payroll.net")}</td>
                  <td className="px-3 py-3 text-end font-sans tabular-nums text-foreground" dir="ltr">{fmt(run.totalGross)}</td>
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3 text-end font-sans tabular-nums text-amber-600" dir="ltr">
                    {(run as any).employeeInsuranceTotal > 0 ? fmt((run as any).employeeInsuranceTotal) : "—"}
                  </td>
                  <td className="px-3 py-3 text-end font-sans tabular-nums text-amber-700" dir="ltr">
                    {(run as any).companyInsuranceTotal > 0 ? fmt((run as any).companyInsuranceTotal) : "—"}
                  </td>
                  <td className="px-3 py-3 text-end font-sans tabular-nums text-orange-600" dir="ltr">
                    {(run as any).totalPayrollTax > 0 ? fmt((run as any).totalPayrollTax) : "—"}
                  </td>
                  <td className="px-3 py-3 text-end font-sans tabular-nums text-destructive" dir="ltr">{fmt(run.totalDeductions)}</td>
                  <td className="px-4 py-3 text-end font-sans tabular-nums text-foreground" dir="ltr">{fmt(run.totalNet)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/30">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-full text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
          >
            {t("payroll.detail.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

function PayrollDetailReport() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const fmt = (n: number) =>
    new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  type DetailRow = {
    period: string;
    employeeName: string;
    costCenterName: string | null;
    baseSalary: number;
    allowances: number;
    employeeInsurance: number;
    companyInsurance: number;
    payrollTax: number;
    totalDeductions: number;
    netPay: number;
  };
  type DetailReport = {
    rows: DetailRow[];
    totals: { gross: number; payrollTax: number; totalDeductions: number; netPay: number };
  };

  const { data, isLoading } = useQuery<DetailReport>({
    queryKey: ["/api/reports/payroll-detail", from, to],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/reports/payroll-detail?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("fetch failed");
      return res.json();
    },
  });

  return (
    <div className="bg-card border rounded-2xl shadow-sm overflow-hidden min-h-[300px]">
      <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b">
        <div className="flex items-center gap-2">
          <label className="text-sm font-bold text-foreground">{t("common.from")}</label>
          <input
            type="date"
            className="bg-background border rounded-lg h-9 px-3 text-sm"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-bold text-foreground">{t("common.to")}</label>
          <input
            type="date"
            className="bg-background border rounded-lg h-9 px-3 text-sm"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-12">
          <Spinner className="w-8 h-8 text-primary" />
        </div>
      ) : !data || data.rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-2 text-center">
          <p className="font-bold text-foreground">{t("payroll.noRuns")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
                <th className="text-start px-4 py-3">{t("payroll.period")}</th>
                <th className="text-start px-3 py-3">{t("payroll.employee")}</th>
                <th className="text-start px-3 py-3">{t("payroll.form.costCenter")}</th>
                <th className="text-end px-3 py-3">{t("payroll.gross")}</th>
                <th className="text-end px-3 py-3">{t("payroll.detail.empInsurance")}</th>
                <th className="text-end px-3 py-3">{t("payroll.detail.coInsurance")}</th>
                <th className="text-end px-3 py-3">{t("payroll.detail.payrollTax")}</th>
                <th className="text-end px-3 py-3">{t("payroll.deductions")}</th>
                <th className="text-end px-4 py-3">{t("payroll.net")}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, idx) => (
                <tr key={idx} className="border-t hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-sans tabular-nums font-bold" dir="ltr">{r.period}</td>
                  <td className="px-3 py-3 font-medium">{r.employeeName}</td>
                  <td className="px-3 py-3 text-muted-foreground">{r.costCenterName ?? "—"}</td>
                  <td className="px-3 py-3 text-end font-sans tabular-nums" dir="ltr">{fmt(r.baseSalary + r.allowances)}</td>
                  <td className="px-3 py-3 text-end font-sans tabular-nums text-amber-600" dir="ltr">{r.employeeInsurance > 0 ? fmt(r.employeeInsurance) : "—"}</td>
                  <td className="px-3 py-3 text-end font-sans tabular-nums text-amber-700" dir="ltr">{r.companyInsurance > 0 ? fmt(r.companyInsurance) : "—"}</td>
                  <td className="px-3 py-3 text-end font-sans tabular-nums text-orange-600" dir="ltr">{r.payrollTax > 0 ? fmt(r.payrollTax) : "—"}</td>
                  <td className="px-3 py-3 text-end font-sans tabular-nums text-destructive" dir="ltr">{fmt(r.totalDeductions)}</td>
                  <td className="px-4 py-3 text-end font-bold font-sans tabular-nums" dir="ltr">{fmt(r.netPay)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-bold bg-muted/40">
                <td className="px-4 py-3" colSpan={3}>{t("payroll.gross")} / {t("payroll.net")}</td>
                <td className="px-3 py-3 text-end font-sans tabular-nums" dir="ltr">{fmt(data.totals.gross)}</td>
                <td className="px-3 py-3" />
                <td className="px-3 py-3" />
                <td className="px-3 py-3 text-end font-sans tabular-nums text-orange-600" dir="ltr">{fmt(data.totals.payrollTax)}</td>
                <td className="px-3 py-3 text-end font-sans tabular-nums text-destructive" dir="ltr">{fmt(data.totals.totalDeductions)}</td>
                <td className="px-4 py-3 text-end font-sans tabular-nums" dir="ltr">{fmt(data.totals.netPay)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
