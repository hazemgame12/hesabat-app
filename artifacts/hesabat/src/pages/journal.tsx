import React, { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListJournalEntries,
  useGetJournalEntry,
  useCreateJournalEntry,
  useUpdateJournalEntry,
  usePostJournalEntry,
  useDeleteJournalEntry,
  useDeleteJournalAttachment,
  useListAccounts,
  useListTaxes,
  useListCostCenters,
  useGetCurrentUser,
  useGetCompany,
  getListJournalEntriesQueryKey,
  getGetJournalEntryQueryKey,
  type JournalEntry,
  type JournalEntryAttachment,
  type Account,
} from "@workspace/api-client-react";
import { hasCapability } from "@workspace/permissions";
import { useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Plus,
  Trash2,
  Check,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Lock,
  Eye,
  Pencil,
  Paperclip,
  Download,
  Upload,
  Loader2,
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

const num = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

type LineDraft = {
  key: string;
  accountId: string;
  description: string;
  currency: string;
  exchangeRate: string;
  debit: string;
  credit: string;
  taxId: string;
  costCenterId: string;
};

function emptyLine(baseCurrency: string): LineDraft {
  return {
    key: Math.random().toString(36).slice(2),
    accountId: "",
    description: "",
    currency: baseCurrency,
    exchangeRate: "1",
    debit: "",
    credit: "",
    taxId: "",
    costCenterId: "",
  };
}

const toNum = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

export function Journal() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: entries = [], isLoading } = useListJournalEntries();
  const { data: user } = useGetCurrentUser();
  const role = user?.role ?? "";
  const canCreate = hasCapability(role, "journal:create");
  const canUpdate = hasCapability(role, "journal:update");
  const canDelete = hasCapability(role, "journal:delete");
  const canPost = hasCapability(role, "journal:post");

  const [mode, setMode] = useState<"list" | "editor">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<JournalEntry | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const onImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/journal/import", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || t("journal.excel.importError"));
      queryClient.invalidateQueries({ queryKey: getListJournalEntriesQueryKey() });
      toast({
        title: t("journal.excel.imported", { count: body?.imported ?? 0 }),
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: err?.message || t("journal.excel.importError"),
      });
    } finally {
      setImporting(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setMode("editor");
  };
  const openEntry = (id: string) => {
    setEditingId(id);
    setMode("editor");
  };
  const backToList = () => {
    setMode("list");
    setEditingId(null);
  };

  const deleteEntry = useDeleteJournalEntry();
  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: getListJournalEntriesQueryKey() });

  const handleDelete = () => {
    if (!entryToDelete) return;
    deleteEntry.mutate(
      { id: entryToDelete.id },
      {
        onSuccess: () => {
          invalidateList();
          toast({ title: t("journal.toast.deleted") });
          setEntryToDelete(null);
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: t("common.error"),
            description: err?.data?.error || t("journal.toast.deleteError"),
          });
          setEntryToDelete(null);
        },
      },
    );
  };

  if (mode === "editor") {
    return (
      <JournalEditor
        entryId={editingId}
        onBack={backToList}
        canUpdate={canUpdate}
        canPost={canPost}
      />
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="h-20 bg-background/80 backdrop-blur-md border-b sticky top-0 z-10 flex items-center justify-between px-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-card border shadow-sm flex items-center justify-center text-primary">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">{t("journal.title")}</h1>
            <p className="text-sm text-muted-foreground font-medium">{t("journal.subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.open("/api/journal/export", "_blank")}
            className="flex items-center gap-2 bg-card border px-4 py-2 rounded-full text-sm font-bold text-foreground hover:bg-muted/50 transition-colors"
          >
            <Download className="w-4 h-4" />
            {t("journal.excel.export")}
          </button>
          {canCreate && (
            <>
              <input
                ref={importInputRef}
                type="file"
                className="hidden"
                accept=".xlsx,.xls"
                onChange={onImportChange}
              />
              <button
                onClick={() => importInputRef.current?.click()}
                disabled={importing}
                className="flex items-center gap-2 bg-card border px-4 py-2 rounded-full text-sm font-bold text-foreground hover:bg-muted/50 transition-colors disabled:opacity-60"
              >
                {importing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {t("journal.excel.import")}
              </button>
              <button
                onClick={openCreate}
                className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" />
                {t("journal.addEntry")}
              </button>
            </>
          )}
        </div>
      </header>

      <div className="p-8 max-w-6xl mx-auto w-full">
        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <Spinner className="w-8 h-8 text-primary" />
          </div>
        ) : entries.length === 0 ? (
          <div className="bg-card border rounded-2xl shadow-sm min-h-[300px] flex flex-col items-center justify-center p-12 text-muted-foreground gap-3">
            <p>{t("journal.noEntries")}</p>
            <span className="text-xs">{t("journal.noEntriesHint")}</span>
            {canCreate && (
              <button onClick={openCreate} className="text-primary font-bold hover:underline">
                {t("journal.addFirst")}
              </button>
            )}
          </div>
        ) : (
          <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground text-xs">
                  <th className="text-start font-bold px-4 py-3">{t("journal.entryNo")}</th>
                  <th className="text-start font-bold px-4 py-3">{t("journal.date")}</th>
                  <th className="text-start font-bold px-4 py-3">{t("journal.reference")}</th>
                  <th className="text-start font-bold px-4 py-3">{t("journal.notes")}</th>
                  <th className="text-end font-bold px-4 py-3 font-sans">{t("journal.totalDebit")}</th>
                  <th className="text-start font-bold px-4 py-3">{t("journal.status")}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t hover:bg-muted/30 transition-colors group">
                    <td className="px-4 py-3 font-bold text-foreground font-sans">#{e.entryNo}</td>
                    <td className="px-4 py-3 text-muted-foreground font-sans">{e.date}</td>
                    <td className="px-4 py-3 text-foreground/80">{e.reference || "—"}</td>
                    <td className="px-4 py-3 text-foreground/80 max-w-[200px] truncate">{e.notes || "—"}</td>
                    <td className="px-4 py-3 text-end font-sans font-bold tabular-nums">{num(e.totalDebitBase)}</td>
                    <td className="px-4 py-3">
                      {e.status === "posted" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-success/10 text-success">
                          <CheckCircle2 className="w-3 h-3" />
                          {t("journal.posted")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
                          {t("journal.draft")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEntry(e.id)}
                          className="p-1.5 rounded-md hover:bg-primary/10 text-primary transition-colors"
                          title={e.status === "posted" ? t("common.view") : t("common.edit")}
                        >
                          {e.status === "posted" ? <Eye className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => setEntryToDelete(e)}
                            className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive transition-colors"
                            title={t("common.delete")}
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

      <AlertDialog open={!!entryToDelete} onOpenChange={(open) => !open && setEntryToDelete(null)}>
        <AlertDialogContent className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-start">{t("journal.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="text-start">
              {t("journal.deleteBody", { no: entryToDelete?.entryNo ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              {deleteEntry.isPending ? t("journal.deleting") : t("journal.confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function JournalEditor({
  entryId,
  onBack,
  canUpdate,
  canPost,
}: {
  entryId: string | null;
  onBack: () => void;
  canUpdate: boolean;
  canPost: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: company } = useGetCompany();
  const baseCurrency = company?.baseCurrency || "EGP";

  const { data: accounts = [] } = useListAccounts();
  const { data: taxes = [] } = useListTaxes();
  const { data: costCenters = [] } = useListCostCenters();
  const postableAccounts = useMemo(
    () => accounts.filter((a: Account) => !a.isGroup),
    [accounts],
  );

  const { data: existing, isLoading: loadingEntry } = useGetJournalEntry(
    entryId ?? "",
    { query: { enabled: !!entryId, queryKey: getGetJournalEntryQueryKey(entryId ?? "") } },
  );

  const isPosted = existing?.status === "posted";
  const readOnly = isPosted || !canUpdate;

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>(() => [
    emptyLine(baseCurrency),
    emptyLine(baseCurrency),
  ]);
  const [hydrated, setHydrated] = useState(false);

  React.useEffect(() => {
    if (existing && !hydrated) {
      setDate(existing.date);
      setReference(existing.reference ?? "");
      setNotes(existing.notes ?? "");
      setLines(
        existing.lines.map((l) => ({
          key: l.id,
          accountId: l.accountId,
          description: l.description ?? "",
          currency: l.currency,
          exchangeRate: String(l.exchangeRate),
          debit: l.debit ? String(l.debit) : "",
          credit: l.credit ? String(l.credit) : "",
          taxId: l.taxId ?? "",
          costCenterId: l.costCenterId ?? "",
        })),
      );
      setHydrated(true);
    }
  }, [existing, hydrated]);

  const createEntry = useCreateJournalEntry();
  const updateEntry = useUpdateJournalEntry();
  const postEntry = usePostJournalEntry();
  const deleteAttachment = useDeleteJournalAttachment();

  const attachments: JournalEntryAttachment[] = existing?.attachments ?? [];
  const attachInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const refreshEntry = () => {
    if (entryId)
      queryClient.invalidateQueries({
        queryKey: getGetJournalEntryQueryKey(entryId),
      });
  };

  const onAttachmentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !entryId) return;
    setUploadingAttachment(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/journal/${entryId}/attachments`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t("journal.attachments.uploadError"));
      }
      refreshEntry();
      toast({ title: t("journal.attachments.uploaded") });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: err?.message || t("journal.attachments.uploadError"),
      });
    } finally {
      setUploadingAttachment(false);
    }
  };

  const onDeleteAttachment = (attachmentId: string) => {
    if (!entryId) return;
    deleteAttachment.mutate(
      { id: entryId, attachmentId },
      {
        onSuccess: () => {
          refreshEntry();
          toast({ title: t("journal.attachments.deleted") });
        },
        onError: (err: any) =>
          toast({
            variant: "destructive",
            title: t("common.error"),
            description: err?.data?.error || t("journal.attachments.deleteError"),
          }),
      },
    );
  };

  const updateLine = (key: string, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => setLines((prev) => [...prev, emptyLine(baseCurrency)]);
  const removeLine = (key: string) =>
    setLines((prev) => (prev.length <= 2 ? prev : prev.filter((l) => l.key !== key)));

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const l of lines) {
      const rate = toNum(l.exchangeRate) || 1;
      debit += toNum(l.debit) * rate;
      credit += toNum(l.credit) * rate;
    }
    const diff = Math.round((debit - credit) * 100) / 100;
    return { debit, credit, diff, balanced: Math.abs(diff) < 0.005 };
  }, [lines]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListJournalEntriesQueryKey() });
  };

  const buildPayload = () => ({
    date,
    reference: reference || null,
    notes: notes || null,
    lines: lines.map((l) => ({
      accountId: l.accountId,
      description: l.description || null,
      currency: l.currency || baseCurrency,
      exchangeRate: toNum(l.exchangeRate) || 1,
      debit: toNum(l.debit),
      credit: toNum(l.credit),
      taxId: l.taxId || null,
      costCenterId: l.costCenterId || null,
    })),
  });

  const validateClient = (): string | null => {
    if (lines.length < 2) return t("journal.minLines");
    for (const l of lines) {
      if (!l.accountId) return t("journal.validation.accountRequired");
      if (toNum(l.debit) <= 0 && toNum(l.credit) <= 0)
        return t("journal.validation.amountRequired");
    }
    if (!totals.balanced) return t("journal.notBalanced");
    return null;
  };

  const doSave = (then?: (id: string) => void) => {
    const err = validateClient();
    if (err) {
      toast({ variant: "destructive", title: t("common.error"), description: err });
      return;
    }
    const data = buildPayload();
    if (entryId) {
      updateEntry.mutate(
        { id: entryId, data },
        {
          onSuccess: (res) => {
            invalidate();
            toast({ title: t("journal.toast.edited") });
            if (then) then(res.id);
            else onBack();
          },
          onError: (e: any) =>
            toast({ variant: "destructive", title: t("common.error"), description: e?.data?.error || t("journal.toast.saveError") }),
        },
      );
    } else {
      createEntry.mutate(
        { data },
        {
          onSuccess: (res) => {
            invalidate();
            toast({ title: t("journal.toast.added") });
            if (then) then(res.id);
            else onBack();
          },
          onError: (e: any) =>
            toast({ variant: "destructive", title: t("common.error"), description: e?.data?.error || t("journal.toast.saveError") }),
        },
      );
    }
  };

  const doSaveAndPost = () => {
    doSave((id) => {
      postEntry.mutate(
        { id },
        {
          onSuccess: () => {
            invalidate();
            toast({ title: t("journal.toast.posted") });
            onBack();
          },
          onError: (e: any) =>
            toast({ variant: "destructive", title: t("common.error"), description: e?.data?.error || t("journal.toast.postError") }),
        },
      );
    });
  };

  const saving = createEntry.isPending || updateEntry.isPending || postEntry.isPending;

  if (entryId && loadingEntry) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner className="w-8 h-8 text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="h-20 bg-background/80 backdrop-blur-md border-b sticky top-0 z-10 flex items-center justify-between px-8">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="w-10 h-10 rounded-xl bg-card border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <ArrowRight className="w-5 h-5 rtl:rotate-0 rotate-180" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              {isPosted ? t("journal.viewTitle") : entryId ? t("journal.editTitle") : t("journal.createTitle")}
              {existing && <span className="font-sans text-muted-foreground">#{existing.entryNo}</span>}
              {isPosted && <Lock className="w-4 h-4 text-muted-foreground" />}
            </h1>
            {isPosted && <p className="text-xs text-muted-foreground">{t("journal.postedLockHint")}</p>}
          </div>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => doSave()}
              disabled={saving}
              className="flex items-center gap-2 bg-secondary text-secondary-foreground border px-4 py-2 rounded-full text-sm font-bold hover:bg-secondary/70 transition-colors disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {t("journal.save")}
            </button>
            {canPost && (
              <button
                onClick={doSaveAndPost}
                disabled={saving || !totals.balanced}
                className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {t("journal.saveAndPost")}
              </button>
            )}
          </div>
        )}
      </header>

      <div className="p-8 flex flex-col gap-6 max-w-[1400px] mx-auto w-full">
        {/* header fields */}
        <div className="bg-card border rounded-2xl shadow-sm p-6 grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-foreground">{t("journal.date")}</label>
            <input
              type="date"
              value={date}
              disabled={readOnly}
              onChange={(e) => setDate(e.target.value)}
              className="bg-background border rounded-xl h-11 px-4 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-60"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-foreground">{t("journal.reference")}</label>
            <input
              value={reference}
              disabled={readOnly}
              onChange={(e) => setReference(e.target.value)}
              placeholder={t("journal.referencePlaceholder")}
              className="bg-background border rounded-xl h-11 px-4 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-60"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-foreground">{t("journal.notes")}</label>
            <input
              value={notes}
              disabled={readOnly}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("journal.notesPlaceholder")}
              className="bg-background border rounded-xl h-11 px-4 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-60"
            />
          </div>
        </div>

        {/* line grid */}
        <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b flex items-center justify-between">
            <h3 className="font-bold text-sm text-foreground">{t("journal.lines")}</h3>
            <span className="text-xs text-muted-foreground">{t("journal.baseCurrencyNote")}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead>
                <tr className="bg-muted/40 text-muted-foreground text-[11px]">
                  <th className="text-start font-bold px-3 py-2 min-w-[160px]">{t("journal.colDescription")}</th>
                  <th className="text-start font-bold px-3 py-2 min-w-[180px]">{t("journal.colAccount")}</th>
                  <th className="text-start font-bold px-3 py-2 w-[90px]">{t("journal.colCurrency")}</th>
                  <th className="text-end font-bold px-3 py-2 w-[100px]">{t("journal.colRate")}</th>
                  <th className="text-end font-bold px-3 py-2 w-[120px]">{t("journal.colDebit")}</th>
                  <th className="text-end font-bold px-3 py-2 w-[120px]">{t("journal.colCredit")}</th>
                  <th className="text-end font-bold px-3 py-2 w-[120px] bg-muted/60">{t("journal.colDebitBase")}</th>
                  <th className="text-end font-bold px-3 py-2 w-[120px] bg-muted/60">{t("journal.colCreditBase")}</th>
                  <th className="text-start font-bold px-3 py-2 min-w-[130px]">{t("journal.colTax")}</th>
                  <th className="text-start font-bold px-3 py-2 min-w-[140px]">{t("journal.colCostCenter")}</th>
                  <th className="px-2 py-2 w-[40px]"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const rate = toNum(l.exchangeRate) || 1;
                  const dBase = toNum(l.debit) * rate;
                  const cBase = toNum(l.credit) * rate;
                  return (
                    <tr key={l.key} className="border-t">
                      <td className="px-2 py-1.5">
                        <input
                          value={l.description}
                          disabled={readOnly}
                          onChange={(e) => updateLine(l.key, { description: e.target.value })}
                          className="w-full bg-background border rounded-lg h-9 px-2 text-xs text-start focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-60"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={l.accountId}
                          disabled={readOnly}
                          onChange={(e) => updateLine(l.key, { accountId: e.target.value })}
                          className="w-full bg-background border rounded-lg h-9 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-60"
                        >
                          <option value="">{t("journal.selectAccount")}</option>
                          {postableAccounts.map((a: Account) => (
                            <option key={a.id} value={a.id}>
                              {a.code} - {displayName(a, lang)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={l.currency}
                          disabled={readOnly}
                          onChange={(e) => updateLine(l.key, { currency: e.target.value.toUpperCase() })}
                          className="w-full bg-background border rounded-lg h-9 px-2 text-xs font-sans text-center focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-60"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          step="0.000001"
                          value={l.exchangeRate}
                          disabled={readOnly}
                          onChange={(e) => updateLine(l.key, { exchangeRate: e.target.value })}
                          className="w-full bg-background border rounded-lg h-9 px-2 text-xs font-sans text-end focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-60"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={l.debit}
                          disabled={readOnly}
                          onChange={(e) => updateLine(l.key, { debit: e.target.value, credit: e.target.value ? "" : l.credit })}
                          className="w-full bg-background border rounded-lg h-9 px-2 text-xs font-sans text-end focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-60"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={l.credit}
                          disabled={readOnly}
                          onChange={(e) => updateLine(l.key, { credit: e.target.value, debit: e.target.value ? "" : l.debit })}
                          className="w-full bg-background border rounded-lg h-9 px-2 text-xs font-sans text-end focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-60"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-end font-sans text-xs tabular-nums text-muted-foreground bg-muted/20">
                        {dBase ? num(dBase) : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-end font-sans text-xs tabular-nums text-muted-foreground bg-muted/20">
                        {cBase ? num(cBase) : "—"}
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={l.taxId}
                          disabled={readOnly}
                          onChange={(e) => updateLine(l.key, { taxId: e.target.value })}
                          className="w-full bg-background border rounded-lg h-9 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-60"
                        >
                          <option value="">{t("journal.selectTax")}</option>
                          {taxes.map((tx) => (
                            <option key={tx.id} value={tx.id}>
                              {displayName(tx, lang)} ({tx.rate}%)
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={l.costCenterId}
                          disabled={readOnly}
                          onChange={(e) => updateLine(l.key, { costCenterId: e.target.value })}
                          className="w-full bg-background border rounded-lg h-9 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-60"
                        >
                          <option value="">{t("journal.selectCostCenter")}</option>
                          {costCenters.map((c) => (
                            <option key={c.id} value={c.id}>
                              {displayName(c, lang)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {!readOnly && lines.length > 2 && (
                          <button
                            onClick={() => removeLine(l.key)}
                            className="p-1 rounded-md hover:bg-destructive/10 text-destructive transition-colors"
                            title={t("journal.removeLine")}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-muted/30 font-bold">
                  <td colSpan={6} className="px-3 py-3 text-end text-xs text-muted-foreground">
                    {t("journal.totalDebit")} / {t("journal.totalCredit")}
                  </td>
                  <td className="px-3 py-3 text-end font-sans tabular-nums">{num(totals.debit)}</td>
                  <td className="px-3 py-3 text-end font-sans tabular-nums">{num(totals.credit)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
          {!readOnly && (
            <div className="px-5 py-3 border-t">
              <button
                onClick={addLine}
                className="flex items-center gap-2 text-primary text-sm font-bold hover:underline"
              >
                <Plus className="w-4 h-4" />
                {t("journal.addLine")}
              </button>
            </div>
          )}
        </div>

        {/* balance indicator */}
        <div
          className={`flex items-center justify-between rounded-2xl border px-6 py-4 ${
            totals.balanced
              ? "bg-success/5 border-success/30 text-success"
              : "bg-destructive/5 border-destructive/30 text-destructive"
          }`}
        >
          <div className="flex items-center gap-2 font-bold">
            {totals.balanced ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            {totals.balanced ? t("journal.balanced") : t("journal.notBalanced")}
          </div>
          {!totals.balanced && (
            <div className="font-sans text-sm">
              {t("journal.difference")}: <span className="font-bold tabular-nums">{num(Math.abs(totals.diff))}</span>
            </div>
          )}
        </div>

        {/* attachments */}
        <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div className="flex items-center gap-2 font-bold text-foreground">
              <Paperclip className="w-4 h-4 text-primary" />
              {t("journal.attachments.title")}
            </div>
            {entryId && !readOnly && (
              <>
                <input
                  ref={attachInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.xlsx,.xls,.csv,.doc,.docx,.txt"
                  onChange={onAttachmentChange}
                />
                <button
                  onClick={() => attachInputRef.current?.click()}
                  disabled={uploadingAttachment}
                  className="flex items-center gap-2 text-primary text-sm font-bold hover:underline disabled:opacity-60"
                >
                  {uploadingAttachment ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  {t("journal.attachments.upload")}
                </button>
              </>
            )}
          </div>
          {!entryId ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">
              {t("journal.attachments.saveFirst")}
            </p>
          ) : attachments.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">
              {t("journal.attachments.none")}
            </p>
          ) : (
            <ul className="divide-y">
              {attachments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between px-5 py-3 gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm text-foreground truncate">
                      {a.fileName}
                    </span>
                    <span className="text-xs text-muted-foreground font-sans shrink-0">
                      {fmtSize(a.size ?? 0)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <a
                      href={`/api/journal/${entryId}/attachments/${a.id}/download`}
                      className="p-1.5 rounded-md hover:bg-primary/10 text-primary transition-colors"
                      title={t("journal.attachments.download")}
                    >
                      <Download className="w-4 h-4" />
                    </a>
                    {!readOnly && (
                      <button
                        onClick={() => onDeleteAttachment(a.id)}
                        className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive transition-colors"
                        title={t("common.delete")}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
