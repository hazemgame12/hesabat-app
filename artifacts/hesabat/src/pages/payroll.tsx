import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListEmployees,
  useCreateEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
  useListPayrollRuns,
  useGetPayrollRun,
  useCreatePayrollRun,
  useListCustodies,
  useListAccounts,
  useGetCurrentUser,
  getListEmployeesQueryKey,
  getListPayrollRunsQueryKey,
  getListJournalEntriesQueryKey,
  type Employee,
  type PayrollRun,
  type Account,
} from "@workspace/api-client-react";
import { hasCapability } from "@workspace/permissions";
import { useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Plus,
  X,
  Check,
  Trash2,
  Edit2,
  PlayCircle,
  Eye,
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
};

type EmployeeForm = {
  code: string;
  nameAr: string;
  nameEn: string;
  jobTitle: string;
  hireDate: string;
  baseSalary: string;
  status: "active" | "terminated";
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
    code: "",
    nameAr: "",
    nameEn: "",
    jobTitle: "",
    hireDate: today(),
    baseSalary: "",
    status: "active",
    notes: "",
    components: [],
  };
}

export function Payroll() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [tab, setTab] = useState<"employees" | "runs">("employees");

  const { data: employees = [], isLoading: employeesLoading } =
    useListEmployees();
  const { data: runs = [], isLoading: runsLoading } = useListPayrollRuns();
  const { data: custodies = [] } = useListCustodies();
  const openCustodies = useMemo(
    () => custodies.filter((c) => c.status === "open"),
    [custodies],
  );
  const { data: accounts = [] } = useListAccounts();
  const postableAccounts = useMemo(
    () => accounts.filter((a: Account) => !a.isGroup),
    [accounts],
  );

  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();
  const deleteEmployee = useDeleteEmployee();
  const createRun = useCreatePayrollRun();

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

  const [runModalOpen, setRunModalOpen] = useState(false);
  const [runPeriod, setRunPeriod] = useState(currentMonth());
  const [salaryAcc, setSalaryAcc] = useState("");
  const [netAcc, setNetAcc] = useState("");
  const [deductionsAcc, setDeductionsAcc] = useState("");
  const [runNotes, setRunNotes] = useState("");

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

  // ---- employee modal ----
  const openCreateEmp = () => {
    setForm(emptyForm());
    setEmpToEdit(null);
    setEmpModalMode("create");
  };

  const openEditEmp = (e: Employee) => {
    setForm({
      code: e.code,
      nameAr: e.nameAr,
      nameEn: e.nameEn ?? "",
      jobTitle: e.jobTitle ?? "",
      hireDate: e.hireDate,
      baseSalary: String(e.baseSalary),
      status: e.status as "active" | "terminated",
      notes: e.notes ?? "",
      components: e.components.map((c) => ({
        kind: c.kind as "allowance" | "deduction",
        nameAr: c.nameAr,
        amount: String(c.amount),
        isActive: c.isActive,
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
        { kind, nameAr: "", amount: "", isActive: true },
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
    if (!form.code.trim() || !form.nameAr.trim() || !form.hireDate) {
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
      }));
    const payload = {
      code: form.code.trim(),
      nameAr: form.nameAr.trim(),
      nameEn: form.nameEn.trim() || null,
      jobTitle: form.jobTitle.trim() || null,
      hireDate: form.hireDate,
      baseSalary: Number(form.baseSalary) || 0,
      status: form.status,
      notes: form.notes.trim() || null,
      components,
    };
    if (empModalMode === "create") {
      createEmployee.mutate(
        { data: payload },
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
        { id: empToEdit.id, data: payload },
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
    setSalaryAcc("");
    setNetAcc("");
    setDeductionsAcc("");
    setRunNotes("");
    setRunModalOpen(true);
  };

  const submitRun = () => {
    if (!runPeriod || !salaryAcc || !netAcc) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t("payroll.run.run"),
      });
      return;
    }
    createRun.mutate(
      {
        data: {
          period: runPeriod,
          salaryExpenseAccountId: salaryAcc,
          netPayableAccountId: netAcc,
          deductionsAccountId: deductionsAcc || null,
          notes: runNotes.trim() || null,
        },
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

  const empBaseAndComponents = (e: Employee) => {
    let allowances = 0;
    let deductions = 0;
    for (const c of e.components) {
      if (!c.isActive) continue;
      if (c.kind === "allowance") allowances += Number(c.amount);
      else deductions += Number(c.amount);
    }
    const gross = Number(e.baseSalary) + allowances;
    return { allowances, deductions, net: gross - deductions };
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
          ) : (
            <ExcelToolbar
              exportPath="/api/payroll/runs/export"
              invalidateKeys={[getListPayrollRunsQueryKey()]}
            />
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
          {(["employees", "runs"] as const).map((tk) => (
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
            ) : employees.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-2 text-center">
                <p className="font-bold text-foreground">
                  {t("payroll.noEmployees")}
                </p>
                <p className="text-sm max-w-md">
                  {t("payroll.noEmployeesHint")}
                </p>
                {canCreate && (
                  <button
                    onClick={openCreateEmp}
                    className="mt-2 text-primary font-bold hover:underline"
                  >
                    {t("payroll.addFirst")}
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
                    <th className="text-start px-6 py-3">{t("payroll.code")}</th>
                    <th className="text-start px-3 py-3">{t("payroll.name")}</th>
                    <th className="text-end px-3 py-3">
                      {t("payroll.baseSalary")}
                    </th>
                    <th className="text-end px-3 py-3">
                      {t("payroll.allowances")}
                    </th>
                    <th className="text-end px-3 py-3">
                      {t("payroll.deductions")}
                    </th>
                    <th className="text-end px-3 py-3">{t("payroll.net")}</th>
                    <th className="text-center px-3 py-3">
                      {t("payroll.status")}
                    </th>
                    {(canUpdate || canDelete) && (
                      <th className="w-20 px-6 py-3" />
                    )}
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e) => {
                    const calc = empBaseAndComponents(e);
                    return (
                      <tr
                        key={e.id}
                        className="group border-t hover:bg-muted/40 transition-colors"
                      >
                        <td
                          className="px-6 py-3.5 font-sans tabular-nums text-foreground/80"
                          dir="ltr"
                        >
                          {e.code}
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="font-medium text-foreground">
                            {displayName(e, lang)}
                          </div>
                          {e.jobTitle && (
                            <div className="text-xs text-muted-foreground">
                              {e.jobTitle}
                            </div>
                          )}
                        </td>
                        <td
                          className="px-3 py-3.5 text-end font-sans tabular-nums text-foreground/80"
                          dir="ltr"
                        >
                          {fmt(Number(e.baseSalary))}
                        </td>
                        <td
                          className="px-3 py-3.5 text-end font-sans tabular-nums text-success"
                          dir="ltr"
                        >
                          {fmt(calc.allowances)}
                        </td>
                        <td
                          className="px-3 py-3.5 text-end font-sans tabular-nums text-destructive"
                          dir="ltr"
                        >
                          {fmt(calc.deductions)}
                        </td>
                        <td
                          className="px-3 py-3.5 text-end font-bold font-sans tabular-nums text-foreground"
                          dir="ltr"
                        >
                          {fmt(calc.net)}
                        </td>
                        <td className="px-3 py-3.5 text-center">
                          {e.status === "active" ? (
                            <span className="text-[11px] font-bold text-success bg-success/10 px-2.5 py-1 rounded-full">
                              {t("payroll.active")}
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                              {t("payroll.terminated")}
                            </span>
                          )}
                        </td>
                        {(canUpdate || canDelete) && (
                          <td className="px-6 py-3.5">
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 justify-end">
                              {canUpdate && (
                                <button
                                  onClick={() => openEditEmp(e)}
                                  className="p-1.5 rounded-md hover:bg-primary/10 text-primary transition-colors"
                                  title={t("common.edit")}
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  onClick={() => setEmpToDelete(e)}
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
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
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
                <label className={labelCls}>{t("payroll.form.code")}</label>
                <input
                  className={inputCls}
                  placeholder={t("payroll.form.codePlaceholder")}
                  value={form.code}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, code: e.target.value }))
                  }
                />
              </div>
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
              {openCustodies.length > 0 && (
                <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  {t("payroll.run.custodyAlert", {
                    count: openCustodies.length,
                  })}
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
                <span className="text-xs text-muted-foreground">
                  {t("payroll.run.periodHint")}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>
                  {t("payroll.run.salaryExpenseAccount")}
                </label>
                <select
                  className={inputCls}
                  value={salaryAcc}
                  onChange={(e) => setSalaryAcc(e.target.value)}
                >
                  <option value="">{t("payroll.selectAccount")}</option>
                  {postableAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {accountLabel(a)}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">
                  {t("payroll.run.salaryExpenseHint")}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>
                  {t("payroll.run.netPayableAccount")}
                </label>
                <select
                  className={inputCls}
                  value={netAcc}
                  onChange={(e) => setNetAcc(e.target.value)}
                >
                  <option value="">{t("payroll.selectAccount")}</option>
                  {postableAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {accountLabel(a)}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">
                  {t("payroll.run.netPayableHint")}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>
                  {t("payroll.run.deductionsAccount")}
                  <span className="text-xs font-medium text-muted-foreground ms-2">
                    {t("payroll.optional")}
                  </span>
                </label>
                <select
                  className={inputCls}
                  value={deductionsAcc}
                  onChange={(e) => setDeductionsAcc(e.target.value)}
                >
                  <option value="">{t("payroll.selectAccount")}</option>
                  {postableAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {accountLabel(a)}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">
                  {t("payroll.run.deductionsHint")}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>
                  {t("payroll.run.notes")}
                  <span className="text-xs font-medium text-muted-foreground ms-2">
                    {t("payroll.optional")}
                  </span>
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
                  <th className="text-start px-4 py-3">
                    {t("payroll.employee")}
                  </th>
                  <th className="text-end px-3 py-3">
                    {t("payroll.baseSalary")}
                  </th>
                  <th className="text-end px-3 py-3">
                    {t("payroll.allowances")}
                  </th>
                  <th className="text-end px-3 py-3">
                    {t("payroll.deductions")}
                  </th>
                  <th className="text-end px-4 py-3">{t("payroll.net")}</th>
                </tr>
              </thead>
              <tbody>
                {(run.lines ?? []).map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {l.employeeName}
                    </td>
                    <td
                      className="px-3 py-3 text-end font-sans tabular-nums text-foreground/80"
                      dir="ltr"
                    >
                      {fmt(l.baseSalary)}
                    </td>
                    <td
                      className="px-3 py-3 text-end font-sans tabular-nums text-success"
                      dir="ltr"
                    >
                      {fmt(l.totalAllowances)}
                    </td>
                    <td
                      className="px-3 py-3 text-end font-sans tabular-nums text-destructive"
                      dir="ltr"
                    >
                      {fmt(l.totalDeductions)}
                    </td>
                    <td
                      className="px-4 py-3 text-end font-bold font-sans tabular-nums text-foreground"
                      dir="ltr"
                    >
                      {fmt(l.netPay)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-bold bg-muted/40">
                  <td className="px-4 py-3 text-foreground">
                    {t("payroll.gross")} / {t("payroll.net")}
                  </td>
                  <td
                    className="px-3 py-3 text-end font-sans tabular-nums text-foreground"
                    dir="ltr"
                  >
                    {fmt(run.totalGross)}
                  </td>
                  <td className="px-3 py-3" />
                  <td
                    className="px-3 py-3 text-end font-sans tabular-nums text-destructive"
                    dir="ltr"
                  >
                    {fmt(run.totalDeductions)}
                  </td>
                  <td
                    className="px-4 py-3 text-end font-sans tabular-nums text-foreground"
                    dir="ltr"
                  >
                    {fmt(run.totalNet)}
                  </td>
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
