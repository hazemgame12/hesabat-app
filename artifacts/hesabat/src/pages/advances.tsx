import React, { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListAdvances,
  useCreateAdvance,
  useUpdateAdvance,
  useDeleteAdvance,
  useListCustodies,
  useCreateCustody,
  useUpdateCustody,
  useDeleteCustody,
  useListEmployees,
  useListAccounts,
  useGetCurrentUser,
  getListAdvancesQueryKey,
  getListCustodiesQueryKey,
  getListJournalEntriesQueryKey,
  type Advance,
  type Custody,
  type Account,
} from "@workspace/api-client-react";
import { hasCapability } from "@workspace/permissions";
import { useQueryClient } from "@tanstack/react-query";
import {
  HandCoins,
  Plus,
  X,
  Trash2,
  Edit2,
  Upload,
  Paperclip,
  Download,
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

function displayName(
  e: { nameAr: string; nameEn?: string | null },
  lang: string,
): string {
  return lang.startsWith("en") && e.nameEn ? e.nameEn : e.nameAr;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type AdvanceForm = {
  employeeId: string;
  date: string;
  amount: string;
  repaymentMonths: string;
  monthlyInstallment: string;
  startDate: string;
  endDate: string;
  status: "active" | "finished" | "suspended";
  advancesAccountId: string;
  notes: string;
};

function emptyAdvanceForm(): AdvanceForm {
  return {
    employeeId: "",
    date: today(),
    amount: "",
    repaymentMonths: "1",
    monthlyInstallment: "",
    startDate: today(),
    endDate: "",
    status: "active",
    advancesAccountId: "",
    notes: "",
  };
}

type CustodyForm = {
  employeeId: string;
  type: "cash" | "tools" | "devices" | "documents" | "other";
  amount: string;
  receiptDate: string;
  description: string;
  status: "open" | "settled" | "closed";
};

function emptyCustodyForm(): CustodyForm {
  return {
    employeeId: "",
    type: "cash",
    amount: "",
    receiptDate: today(),
    description: "",
    status: "open",
  };
}

export function Advances() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [tab, setTab] = useState<"advances" | "custodies">("advances");

  const { data: advances = [], isLoading: advancesLoading } = useListAdvances();
  const { data: custodies = [], isLoading: custodiesLoading } =
    useListCustodies();
  const { data: employees = [] } = useListEmployees();
  const { data: accounts = [] } = useListAccounts();
  const postableAccounts = useMemo(
    () => accounts.filter((a: Account) => !a.isGroup),
    [accounts],
  );

  const { data: user } = useGetCurrentUser();
  const role = user?.role ?? "";
  const canCreate = hasCapability(role, "advances:create");
  const canUpdate = hasCapability(role, "advances:update");
  const canDelete = hasCapability(role, "advances:delete");
  const canCreateCustody = hasCapability(role, "custodies:create");
  const canUpdateCustody = hasCapability(role, "custodies:update");
  const canDeleteCustody = hasCapability(role, "custodies:delete");

  const createAdvance = useCreateAdvance();
  const updateAdvance = useUpdateAdvance();
  const deleteAdvance = useDeleteAdvance();
  const createCustody = useCreateCustody();
  const updateCustody = useUpdateCustody();
  const deleteCustody = useDeleteCustody();

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const accountLabel = (a: Account) => `${a.code} · ${displayName(a, lang)}`;
  const empName = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? displayName(e, lang) : id;
  };

  const invalidateAdvances = () =>
    queryClient.invalidateQueries({ queryKey: getListAdvancesQueryKey() });
  const invalidateCustodies = () =>
    queryClient.invalidateQueries({ queryKey: getListCustodiesQueryKey() });

  const inputCls =
    "w-full px-3.5 py-2.5 rounded-xl border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30";
  const labelCls = "text-sm font-bold text-foreground";

  // ---- advance modal ----
  const [advModalMode, setAdvModalMode] = useState<"create" | "edit" | null>(
    null,
  );
  const [advToEdit, setAdvToEdit] = useState<Advance | null>(null);
  const [advToDelete, setAdvToDelete] = useState<Advance | null>(null);
  const [advForm, setAdvForm] = useState<AdvanceForm>(emptyAdvanceForm());

  const openCreateAdv = () => {
    const defaultAcc = postableAccounts.find((a) => a.code === "1131");
    setAdvForm({
      ...emptyAdvanceForm(),
      advancesAccountId: defaultAcc?.id ?? "",
    });
    setAdvToEdit(null);
    setAdvModalMode("create");
  };

  const openEditAdv = (a: Advance) => {
    setAdvForm({
      employeeId: a.employeeId,
      date: a.date,
      amount: String(a.amount),
      repaymentMonths: String(a.repaymentMonths),
      monthlyInstallment: String(a.monthlyInstallment),
      startDate: a.startDate,
      endDate: a.endDate ?? "",
      status: a.status,
      advancesAccountId: a.advancesAccountId,
      notes: a.notes ?? "",
    });
    setAdvToEdit(a);
    setAdvModalMode("edit");
  };

  const submitAdvance = () => {
    if (
      !advForm.employeeId ||
      !advForm.date ||
      !advForm.startDate ||
      !advForm.advancesAccountId
    ) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t("advances.advance.save"),
      });
      return;
    }
    const payload = {
      employeeId: advForm.employeeId,
      date: advForm.date,
      amount: Number(advForm.amount) || 0,
      repaymentMonths: Number(advForm.repaymentMonths) || 1,
      monthlyInstallment: Number(advForm.monthlyInstallment) || 0,
      startDate: advForm.startDate,
      endDate: advForm.endDate || null,
      status: advForm.status,
      advancesAccountId: advForm.advancesAccountId,
      notes: advForm.notes.trim() || null,
    };
    const onError = (err: any) =>
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: err?.data?.error || t("advances.toast.advanceError"),
      });
    if (advModalMode === "create") {
      createAdvance.mutate(
        { data: payload },
        {
          onSuccess: () => {
            invalidateAdvances();
            toast({ title: t("advances.toast.advanceAdded") });
            setAdvModalMode(null);
          },
          onError,
        },
      );
    } else if (advModalMode === "edit" && advToEdit) {
      updateAdvance.mutate(
        { id: advToEdit.id, data: payload },
        {
          onSuccess: () => {
            invalidateAdvances();
            toast({ title: t("advances.toast.advanceEdited") });
            setAdvModalMode(null);
          },
          onError,
        },
      );
    }
  };

  const handleDeleteAdvance = () => {
    if (!advToDelete) return;
    deleteAdvance.mutate(
      { id: advToDelete.id },
      {
        onSuccess: () => {
          invalidateAdvances();
          toast({ title: t("advances.toast.advanceDeleted") });
          setAdvToDelete(null);
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: t("common.error"),
            description: err?.data?.error || t("advances.toast.advanceError"),
          });
          setAdvToDelete(null);
        },
      },
    );
  };

  // ---- custody modal ----
  const [cusModalMode, setCusModalMode] = useState<"create" | "edit" | null>(
    null,
  );
  const [cusToEdit, setCusToEdit] = useState<Custody | null>(null);
  const [cusToDelete, setCusToDelete] = useState<Custody | null>(null);
  const [cusForm, setCusForm] = useState<CustodyForm>(emptyCustodyForm());
  const [custodyDetail, setCustodyDetail] = useState<Custody | null>(null);

  const openCreateCus = () => {
    setCusForm(emptyCustodyForm());
    setCusToEdit(null);
    setCusModalMode("create");
  };

  const openEditCus = (c: Custody) => {
    setCusForm({
      employeeId: c.employeeId,
      type: c.type,
      amount: String(c.amount),
      receiptDate: c.receiptDate,
      description: c.description ?? "",
      status: c.status,
    });
    setCusToEdit(c);
    setCusModalMode("edit");
  };

  const submitCustody = () => {
    if (!cusForm.employeeId || !cusForm.receiptDate) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t("advances.custody.save"),
      });
      return;
    }
    const payload = {
      employeeId: cusForm.employeeId,
      type: cusForm.type,
      amount: Number(cusForm.amount) || 0,
      receiptDate: cusForm.receiptDate,
      description: cusForm.description.trim() || null,
      status: cusForm.status,
    };
    const onError = (err: any) =>
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: err?.data?.error || t("advances.toast.custodyError"),
      });
    if (cusModalMode === "create") {
      createCustody.mutate(
        { data: payload },
        {
          onSuccess: () => {
            invalidateCustodies();
            toast({ title: t("advances.toast.custodyAdded") });
            setCusModalMode(null);
          },
          onError,
        },
      );
    } else if (cusModalMode === "edit" && cusToEdit) {
      updateCustody.mutate(
        { id: cusToEdit.id, data: payload },
        {
          onSuccess: () => {
            invalidateCustodies();
            toast({ title: t("advances.toast.custodyEdited") });
            setCusModalMode(null);
          },
          onError,
        },
      );
    }
  };

  const handleDeleteCustody = () => {
    if (!cusToDelete) return;
    deleteCustody.mutate(
      { id: cusToDelete.id },
      {
        onSuccess: () => {
          invalidateCustodies();
          toast({ title: t("advances.toast.custodyDeleted") });
          setCusToDelete(null);
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: t("common.error"),
            description: err?.data?.error || t("advances.toast.custodyError"),
          });
          setCusToDelete(null);
        },
      },
    );
  };

  // ---- custody settle / attachments (direct fetch for multipart) ----
  const [settleTarget, setSettleTarget] = useState<Custody | null>(null);
  const [settling, setSettling] = useState(false);
  const settleInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const refreshAfterSettle = () => {
    invalidateCustodies();
    queryClient.invalidateQueries({
      queryKey: getListJournalEntriesQueryKey(),
    });
  };

  const doSettle = async (file: File) => {
    if (!settleTarget) return;
    setSettling(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/custodies/${settleTarget.id}/settle`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || t("advances.toast.settleError"));
      }
      refreshAfterSettle();
      toast({
        title: t("advances.toast.settled", {
          no: body?.settlementJournalEntryNo ?? "",
        }),
      });
      setSettleTarget(null);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: err?.message || t("advances.toast.settleError"),
      });
    } finally {
      setSettling(false);
      if (settleInputRef.current) settleInputRef.current.value = "";
    }
  };

  const doUploadAttachment = async (custodyId: string, file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/custodies/${custodyId}/attachments`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || t("advances.toast.attachmentError"));
      }
      invalidateCustodies();
      const updated = custodies.find((c) => c.id === custodyId);
      if (updated)
        setCustodyDetail({
          ...updated,
          attachments: [...updated.attachments, body],
        });
      toast({ title: t("advances.toast.attachmentAdded") });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: err?.message || t("advances.toast.attachmentError"),
      });
    } finally {
      setUploading(false);
      if (attachInputRef.current) attachInputRef.current.value = "";
    }
  };

  const doDeleteAttachment = async (custodyId: string, attachmentId: string) => {
    try {
      const res = await fetch(
        `/api/custodies/${custodyId}/attachments/${attachmentId}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) throw new Error();
      invalidateCustodies();
      setCustodyDetail((d) =>
        d
          ? { ...d, attachments: d.attachments.filter((a) => a.id !== attachmentId) }
          : d,
      );
      toast({ title: t("advances.toast.attachmentDeleted") });
    } catch {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t("advances.toast.attachmentError"),
      });
    }
  };

  const statusPill = (
    status: string,
    map: Record<string, string>,
    color: Record<string, string>,
  ) => (
    <span
      className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${
        color[status] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {map[status] ?? status}
    </span>
  );

  return (
    <div className="flex flex-col">
      <header className="h-20 bg-background/80 backdrop-blur-md border-b flex items-center justify-between px-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-card border shadow-sm flex items-center justify-center text-primary">
            <HandCoins className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">
              {t("advances.title")}
            </h1>
            <p className="text-sm text-muted-foreground font-medium">
              {t("advances.subtitle")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tab === "advances" && canCreate && (
            <button
              onClick={openCreateAdv}
              className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              {t("advances.advance.add")}
            </button>
          )}
          {tab === "custodies" && canCreateCustody && (
            <button
              onClick={openCreateCus}
              className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              {t("advances.custody.add")}
            </button>
          )}
        </div>
      </header>

      <div className="px-8 pt-6">
        <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-full w-fit">
          {(["advances", "custodies"] as const).map((tk) => (
            <button
              key={tk}
              onClick={() => setTab(tk)}
              className={`px-5 py-2 rounded-full text-sm font-bold transition-colors ${
                tab === tk
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(`advances.tabs.${tk}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="p-8">
        {tab === "advances" ? (
          advancesLoading ? (
            <div className="flex justify-center py-20">
              <Spinner />
            </div>
          ) : advances.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-foreground font-bold">
                {t("advances.advance.none")}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {t("advances.advance.noneHint")}
              </p>
              {canCreate && (
                <button
                  onClick={openCreateAdv}
                  className="mt-4 inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-bold"
                >
                  <Plus className="w-4 h-4" />
                  {t("advances.advance.addFirst")}
                </button>
              )}
            </div>
          ) : (
            <div className="bg-card border rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3 text-start font-bold">
                      {t("advances.advance.employee")}
                    </th>
                    <th className="px-6 py-3 text-start font-bold">
                      {t("advances.advance.date")}
                    </th>
                    <th className="px-6 py-3 text-end font-bold">
                      {t("advances.advance.amount")}
                    </th>
                    <th className="px-6 py-3 text-end font-bold">
                      {t("advances.advance.monthlyInstallment")}
                    </th>
                    <th className="px-6 py-3 text-end font-bold">
                      {t("advances.advance.totalRepaid")}
                    </th>
                    <th className="px-6 py-3 text-end font-bold">
                      {t("advances.advance.remaining")}
                    </th>
                    <th className="px-6 py-3 text-start font-bold">
                      {t("advances.advance.status")}
                    </th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {advances.map((a) => (
                    <tr
                      key={a.id}
                      className="group border-t hover:bg-muted/40 transition-colors"
                    >
                      <td className="px-6 py-3.5 font-bold text-foreground">
                        {empName(a.employeeId)}
                      </td>
                      <td
                        className="px-6 py-3.5 text-foreground/80 tabular-nums"
                        dir="ltr"
                      >
                        {a.date}
                      </td>
                      <td className="px-6 py-3.5 text-end tabular-nums">
                        {fmt(a.amount)}
                      </td>
                      <td className="px-6 py-3.5 text-end tabular-nums">
                        {fmt(a.monthlyInstallment)}
                      </td>
                      <td className="px-6 py-3.5 text-end tabular-nums">
                        {fmt(a.totalRepaid)}
                      </td>
                      <td className="px-6 py-3.5 text-end tabular-nums font-bold">
                        {fmt(a.remaining)}
                      </td>
                      <td className="px-6 py-3.5">
                        {statusPill(
                          a.status,
                          {
                            active: t("advances.advanceStatus.active"),
                            finished: t("advances.advanceStatus.finished"),
                            suspended: t("advances.advanceStatus.suspended"),
                          },
                          {
                            active: "bg-emerald-100 text-emerald-800",
                            finished: "bg-sky-100 text-sky-800",
                            suspended: "bg-amber-100 text-amber-800",
                          },
                        )}
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {canUpdate && (
                            <button
                              onClick={() => openEditAdv(a)}
                              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => setAdvToDelete(a)}
                              className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : custodiesLoading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : custodies.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-foreground font-bold">
              {t("advances.custody.none")}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {t("advances.custody.noneHint")}
            </p>
            {canCreateCustody && (
              <button
                onClick={openCreateCus}
                className="mt-4 inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-bold"
              >
                <Plus className="w-4 h-4" />
                {t("advances.custody.addFirst")}
              </button>
            )}
          </div>
        ) : (
          <div className="bg-card border rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 text-start font-bold">
                    {t("advances.custody.employee")}
                  </th>
                  <th className="px-6 py-3 text-start font-bold">
                    {t("advances.custody.type")}
                  </th>
                  <th className="px-6 py-3 text-end font-bold">
                    {t("advances.custody.amount")}
                  </th>
                  <th className="px-6 py-3 text-start font-bold">
                    {t("advances.custody.receiptDate")}
                  </th>
                  <th className="px-6 py-3 text-start font-bold">
                    {t("advances.custody.status")}
                  </th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {custodies.map((c) => (
                  <tr
                    key={c.id}
                    className="group border-t hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-6 py-3.5 font-bold text-foreground">
                      {empName(c.employeeId)}
                    </td>
                    <td className="px-6 py-3.5 text-foreground/80">
                      {t(`advances.custodyType.${c.type}`)}
                    </td>
                    <td className="px-6 py-3.5 text-end tabular-nums">
                      {fmt(c.amount)}
                    </td>
                    <td
                      className="px-6 py-3.5 text-foreground/80 tabular-nums"
                      dir="ltr"
                    >
                      {c.receiptDate}
                    </td>
                    <td className="px-6 py-3.5">
                      {statusPill(
                        c.status,
                        {
                          open: t("advances.custodyStatus.open"),
                          settled: t("advances.custodyStatus.settled"),
                          closed: t("advances.custodyStatus.closed"),
                        },
                        {
                          open: "bg-amber-100 text-amber-800",
                          settled: "bg-emerald-100 text-emerald-800",
                          closed: "bg-muted text-muted-foreground",
                        },
                      )}
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setCustodyDetail(c)}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                          title={t("advances.custody.attachments")}
                        >
                          <Paperclip className="w-4 h-4" />
                          {c.attachments.length > 0 && (
                            <span className="text-xs ms-0.5">
                              {c.attachments.length}
                            </span>
                          )}
                        </button>
                        {canUpdateCustody && c.status === "open" && (
                          <button
                            onClick={() => setSettleTarget(c)}
                            className="px-2.5 py-1 rounded-md hover:bg-muted text-foreground text-xs font-bold flex items-center gap-1"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            {t("advances.custody.settle")}
                          </button>
                        )}
                        {canUpdateCustody && (
                          <button
                            onClick={() => openEditCus(c)}
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        {canDeleteCustody && (
                          <button
                            onClick={() => setCusToDelete(c)}
                            className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* advance modal */}
      {advModalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-foreground">
                {advModalMode === "create"
                  ? t("advances.advance.create")
                  : t("advances.advance.edit")}
              </h2>
              <button
                onClick={() => setAdvModalMode(null)}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5 col-span-2">
                <label className={labelCls}>
                  {t("advances.advance.employee")}
                </label>
                <select
                  className={inputCls}
                  value={advForm.employeeId}
                  onChange={(e) =>
                    setAdvForm((f) => ({ ...f, employeeId: e.target.value }))
                  }
                >
                  <option value="">{t("advances.selectEmployee")}</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {displayName(e, lang)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>{t("advances.advance.date")}</label>
                <input
                  type="date"
                  className={inputCls}
                  dir="ltr"
                  value={advForm.date}
                  onChange={(e) =>
                    setAdvForm((f) => ({ ...f, date: e.target.value }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>
                  {t("advances.advance.amount")}
                </label>
                <input
                  type="number"
                  className={inputCls}
                  dir="ltr"
                  value={advForm.amount}
                  onChange={(e) =>
                    setAdvForm((f) => ({ ...f, amount: e.target.value }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>
                  {t("advances.advance.repaymentMonths")}
                </label>
                <input
                  type="number"
                  className={inputCls}
                  dir="ltr"
                  value={advForm.repaymentMonths}
                  onChange={(e) =>
                    setAdvForm((f) => ({
                      ...f,
                      repaymentMonths: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>
                  {t("advances.advance.monthlyInstallment")}
                </label>
                <input
                  type="number"
                  className={inputCls}
                  dir="ltr"
                  value={advForm.monthlyInstallment}
                  onChange={(e) =>
                    setAdvForm((f) => ({
                      ...f,
                      monthlyInstallment: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>
                  {t("advances.advance.startDate")}
                </label>
                <input
                  type="date"
                  className={inputCls}
                  dir="ltr"
                  value={advForm.startDate}
                  onChange={(e) =>
                    setAdvForm((f) => ({ ...f, startDate: e.target.value }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>
                  {t("advances.advance.endDate")}
                  <span className="text-xs font-medium text-muted-foreground ms-2">
                    {t("advances.optional")}
                  </span>
                </label>
                <input
                  type="date"
                  className={inputCls}
                  dir="ltr"
                  value={advForm.endDate}
                  onChange={(e) =>
                    setAdvForm((f) => ({ ...f, endDate: e.target.value }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>
                  {t("advances.advance.status")}
                </label>
                <select
                  className={inputCls}
                  value={advForm.status}
                  onChange={(e) =>
                    setAdvForm((f) => ({
                      ...f,
                      status: e.target.value as AdvanceForm["status"],
                    }))
                  }
                >
                  <option value="active">
                    {t("advances.advanceStatus.active")}
                  </option>
                  <option value="finished">
                    {t("advances.advanceStatus.finished")}
                  </option>
                  <option value="suspended">
                    {t("advances.advanceStatus.suspended")}
                  </option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5 col-span-2">
                <label className={labelCls}>
                  {t("advances.advance.advancesAccount")}
                </label>
                <select
                  className={inputCls}
                  value={advForm.advancesAccountId}
                  onChange={(e) =>
                    setAdvForm((f) => ({
                      ...f,
                      advancesAccountId: e.target.value,
                    }))
                  }
                >
                  <option value="">{t("advances.selectAccount")}</option>
                  {postableAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {accountLabel(a)}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">
                  {t("advances.advance.advancesAccountHint")}
                </span>
              </div>
              <div className="flex flex-col gap-1.5 col-span-2">
                <label className={labelCls}>
                  {t("advances.advance.notes")}
                  <span className="text-xs font-medium text-muted-foreground ms-2">
                    {t("advances.optional")}
                  </span>
                </label>
                <input
                  className={inputCls}
                  value={advForm.notes}
                  onChange={(e) =>
                    setAdvForm((f) => ({ ...f, notes: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">
              <button
                onClick={() => setAdvModalMode(null)}
                className="px-4 py-2 rounded-full text-sm font-bold text-muted-foreground hover:bg-muted"
              >
                {t("advances.advance.cancel")}
              </button>
              <button
                onClick={submitAdvance}
                disabled={createAdvance.isPending || updateAdvance.isPending}
                className="px-4 py-2 rounded-full text-sm font-bold bg-primary text-primary-foreground disabled:opacity-60"
              >
                {createAdvance.isPending || updateAdvance.isPending
                  ? t("advances.advance.saving")
                  : t("advances.advance.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* custody modal */}
      {cusModalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-foreground">
                {cusModalMode === "create"
                  ? t("advances.custody.create")
                  : t("advances.custody.edit")}
              </h2>
              <button
                onClick={() => setCusModalMode(null)}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5 col-span-2">
                <label className={labelCls}>
                  {t("advances.custody.employee")}
                </label>
                <select
                  className={inputCls}
                  value={cusForm.employeeId}
                  onChange={(e) =>
                    setCusForm((f) => ({ ...f, employeeId: e.target.value }))
                  }
                >
                  <option value="">{t("advances.selectEmployee")}</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {displayName(e, lang)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>
                  {t("advances.custody.type")}
                </label>
                <select
                  className={inputCls}
                  value={cusForm.type}
                  onChange={(e) =>
                    setCusForm((f) => ({
                      ...f,
                      type: e.target.value as CustodyForm["type"],
                    }))
                  }
                >
                  {(
                    [
                      "cash",
                      "tools",
                      "devices",
                      "documents",
                      "other",
                    ] as const
                  ).map((tp) => (
                    <option key={tp} value={tp}>
                      {t(`advances.custodyType.${tp}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>
                  {t("advances.custody.amount")}
                </label>
                <input
                  type="number"
                  className={inputCls}
                  dir="ltr"
                  value={cusForm.amount}
                  onChange={(e) =>
                    setCusForm((f) => ({ ...f, amount: e.target.value }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>
                  {t("advances.custody.receiptDate")}
                </label>
                <input
                  type="date"
                  className={inputCls}
                  dir="ltr"
                  value={cusForm.receiptDate}
                  onChange={(e) =>
                    setCusForm((f) => ({ ...f, receiptDate: e.target.value }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>
                  {t("advances.custody.status")}
                </label>
                <select
                  className={inputCls}
                  value={cusForm.status}
                  onChange={(e) =>
                    setCusForm((f) => ({
                      ...f,
                      status: e.target.value as CustodyForm["status"],
                    }))
                  }
                >
                  <option value="open">
                    {t("advances.custodyStatus.open")}
                  </option>
                  {cusForm.status === "settled" && (
                    <option value="settled">
                      {t("advances.custodyStatus.settled")}
                    </option>
                  )}
                  <option value="closed">
                    {t("advances.custodyStatus.closed")}
                  </option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5 col-span-2">
                <label className={labelCls}>
                  {t("advances.custody.description")}
                  <span className="text-xs font-medium text-muted-foreground ms-2">
                    {t("advances.optional")}
                  </span>
                </label>
                <input
                  className={inputCls}
                  value={cusForm.description}
                  onChange={(e) =>
                    setCusForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">
              <button
                onClick={() => setCusModalMode(null)}
                className="px-4 py-2 rounded-full text-sm font-bold text-muted-foreground hover:bg-muted"
              >
                {t("advances.custody.cancel")}
              </button>
              <button
                onClick={submitCustody}
                disabled={createCustody.isPending || updateCustody.isPending}
                className="px-4 py-2 rounded-full text-sm font-bold bg-primary text-primary-foreground disabled:opacity-60"
              >
                {createCustody.isPending || updateCustody.isPending
                  ? t("advances.custody.saving")
                  : t("advances.custody.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* settle modal */}
      {settleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-foreground">
                {t("advances.custody.settleTitle")}
              </h2>
              <button
                onClick={() => setSettleTarget(null)}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                {t("advances.custody.settleHint")}
              </p>
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-xl px-4 py-3 font-mono" dir="ltr">
                {t("advances.custody.settleColumns")}
              </p>
              <input
                ref={settleInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void doSettle(f);
                }}
              />
              <button
                onClick={() => settleInputRef.current?.click()}
                disabled={settling}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed text-sm font-bold text-foreground hover:bg-muted disabled:opacity-60"
              >
                <Upload className="w-4 h-4" />
                {settling
                  ? t("advances.custody.settling")
                  : t("advances.custody.uploadFile")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* custody detail / attachments modal */}
      {custodyDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-foreground">
                {t("advances.custody.attachments")} —{" "}
                {empName(custodyDetail.employeeId)}
              </h2>
              <button
                onClick={() => setCustodyDetail(null)}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              {custodyDetail.settlementJournalEntryNo != null && (
                <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                  {t("advances.custody.settlementEntry")}{" "}
                  {custodyDetail.settlementJournalEntryNo}
                </p>
              )}
              {custodyDetail.attachments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t("advances.custody.noAttachments")}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {custodyDetail.attachments.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border"
                    >
                      <span className="text-sm text-foreground truncate">
                        {a.fileName}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <a
                          href={`/api/custodies/${custodyDetail.id}/attachments/${a.id}/download`}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                          title={t("advances.custody.download")}
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        {canUpdateCustody && (
                          <button
                            onClick={() =>
                              doDeleteAttachment(custodyDetail.id, a.id)
                            }
                            className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"
                            title={t("advances.custody.removeAttachment")}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {canUpdateCustody && (
                <>
                  <input
                    ref={attachInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void doUploadAttachment(custodyDetail.id, f);
                    }}
                  />
                  <button
                    onClick={() => attachInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed text-sm font-bold text-foreground hover:bg-muted disabled:opacity-60"
                  >
                    <Plus className="w-4 h-4" />
                    {uploading
                      ? t("advances.custody.uploading")
                      : t("advances.custody.addAttachment")}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* delete advance dialog */}
      <AlertDialog
        open={!!advToDelete}
        onOpenChange={(o) => !o && setAdvToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("advances.deleteAdvanceTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("advances.deleteAdvanceBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("advances.advance.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAdvance}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteAdvance.isPending
                ? t("advances.deleting")
                : t("advances.confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* delete custody dialog */}
      <AlertDialog
        open={!!cusToDelete}
        onOpenChange={(o) => !o && setCusToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("advances.deleteCustodyTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("advances.deleteCustodyBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("advances.custody.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCustody}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteCustody.isPending
                ? t("advances.deleting")
                : t("advances.confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
