import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListInvoices,
  useDeleteInvoice,
  useApproveInvoice,
  useRevertInvoice,
  useListPayments,
  useDeletePayment,
  useListAccounts,
  useListCustomers,
  useListSuppliers,
  useListCurrencies,
  useGetCurrentUser,
  useGetCompany,
  getListInvoicesQueryKey,
  getListPaymentsQueryKey,
  getListJournalEntriesQueryKey,
  type InvoiceSummary,
  type Payment,
  type Account,
} from "@workspace/api-client-react";
import { hasCapability } from "@workspace/permissions";
import {
  FileText,
  Plus,
  Trash2,
  Edit2,
  Eye,
  Check,
  HandCoins,
  Printer,
  Undo2,
  Search,
  SlidersHorizontal,
  Clock,
  FileCheck,
  Wallet,
  XCircle,
  RotateCcw,
  ArrowDownLeft,
  ArrowUpRight,
  FileSpreadsheet,
  Copy,
  ChevronDown,
  ChevronUp,
  ChevronRight,
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
import { InvoiceEditor } from "./InvoiceEditor";
import { PaymentModal } from "./PaymentModal";
import { InvoiceReports } from "./InvoiceReports";
import { PartyView, type PartyViewParty } from "./PartyView";
import { ExcelToolbar } from "@/components/ExcelToolbar";
import { ImportWizard } from "@/components/import-wizard/ImportWizard";
import { GridTable, GridToggle, useGridView, type GridColumn } from "@/components/GridTable";
import { InvoicePaymentAllocations } from "./InvoicePaymentAllocations";

type Kind = "sales" | "purchase";
type Tab = "invoices" | "returns" | "payments" | "reports";

export function displayName(
  e: { nameAr: string; nameEn?: string | null },
  lang: string,
): string {
  return lang.startsWith("en") && e.nameEn ? e.nameEn : e.nameAr;
}

export function InvoiceWorkspace({ kind }: { kind: Kind }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const paymentKind = kind === "sales" ? "collection" : "payment";

  const returnKind = kind === "sales" ? "sales_return" : "purchase_return";

  const [tab, setTab] = useState<Tab>("invoices");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editorReturn, setEditorReturn] = useState(false);
  const [returnSourceId, setReturnSourceId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [partyView, setPartyView] = useState<PartyViewParty | null>(null);
  const [toDelete, setToDelete] = useState<InvoiceSummary | null>(null);
  const [toApprove, setToApprove] = useState<InvoiceSummary | null>(null);
  const [toRevert, setToRevert] = useState<InvoiceSummary | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | undefined>(undefined);
  const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkRevertOpen, setBulkRevertOpen] = useState(false);
  const [isBulkReverting, setIsBulkReverting] = useState(false);
  const [bulkApproveOpen, setBulkApproveOpen] = useState(false);
  const [isBulkApproving, setIsBulkApproving] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [filterParty, setFilterParty] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterCurrency, setFilterCurrency] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [invGridView, toggleInvGrid] = useGridView("invoices-" + kind);
  const [retGridView, toggleRetGrid] = useGridView("returns-" + kind);
  const [payGridView, togglePayGrid] = useGridView("payments-" + kind);
  const [expandedPaymentId, setExpandedPaymentId] = useState<string | null>(null);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);

  const { data: invoicesRaw = [], isLoading: invLoading, refetch: refetchInvoices } = useListInvoices({
    kind,
    ...(filterStatus ? { status: filterStatus } : {}),
    ...(filterDateFrom ? { dateFrom: filterDateFrom } : {}),
    ...(filterDateTo ? { dateTo: filterDateTo } : {}),
    ...(filterCurrency ? { currency: filterCurrency } : {}),
    ...(kind === "sales" && filterParty ? { customerId: filterParty } : {}),
    ...(kind === "purchase" && filterParty ? { supplierId: filterParty } : {}),
    ...(search ? { search } : {}),
  } as any);
  const { data: returns = [], isLoading: retLoading, refetch: refetchReturns } = useListInvoices({
    kind: returnKind,
  });
  const { data: payments = [], isLoading: payLoading, refetch: refetchPayments } = useListPayments({
    kind: paymentKind,
  });
  const { data: accounts = [] } = useListAccounts();
  const postable = useMemo(
    () => accounts.filter((a: Account) => !a.isGroup),
    [accounts],
  );
  const { data: customers = [] } = useListCustomers();
  const { data: suppliers = [] } = useListSuppliers();
  const { data: currencies = [] } = useListCurrencies();

  const partyOptions = useMemo(() => {
    return kind === "sales"
      ? customers.map((c) => ({ id: c.id, name: c.nameAr }))
      : suppliers.map((s) => ({ id: s.id, name: s.nameAr }));
  }, [kind, customers, suppliers]);

  const currencyOptions = useMemo(
    () => currencies.map((c) => c.code),
    [currencies],
  );

  // Summary cards data
  const invoices = invoicesRaw as InvoiceSummary[];
  const summary = useMemo(() => {
    const counts = {
      total: invoices.length,
      draft: 0,
      approved: 0,
      partially_paid: 0,
      paid: 0,
      cancelled: 0,
      totalAmount: 0,
      totalPaid: 0,
      totalBalance: 0,
    };
    for (const inv of invoices) {
      counts[inv.status as keyof typeof counts]++;
      if (inv.status !== "draft" && inv.status !== "cancelled") {
        const fx = (inv as any).exchangeRate ?? 1;
        counts.totalAmount += inv.total * fx;
        counts.totalPaid += (inv.amountPaid ?? 0) * fx;
        counts.totalBalance += inv.balance * fx;
      }
    }
    return counts;
  }, [invoices]);

  const deleteInvoice = useDeleteInvoice();
  const approveInvoice = useApproveInvoice();
  const revertInvoice = useRevertInvoice();
  const deletePayment = useDeletePayment();

  const { data: user } = useGetCurrentUser();
  const { data: company } = useGetCompany();
  const role = user?.role ?? "";
  const canCreate = hasCapability(role, "invoices:create");
  const canUpdate = hasCapability(role, "invoices:update");
  const canDelete = hasCapability(role, "invoices:delete");
  const canPay = hasCapability(role, "payments:create");
  const canDeletePay = hasCapability(role, "payments:delete");

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang, {
      style: "currency",
      currency: company?.baseCurrency ?? "EGP",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const fmtInv = (n: number, currency?: string | null) =>
    new Intl.NumberFormat(lang, {
      style: "currency",
      currency: currency || company?.baseCurrency || "EGP",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const statusCls: Record<string, string> = {
    draft: "text-muted-foreground bg-muted",
    approved: "text-primary bg-primary/10",
    partially_paid: "text-amber-600 bg-amber-500/10",
    paid: "text-success bg-success/10",
    cancelled: "text-muted-foreground bg-muted line-through",
  };

  const invGridColumns = useMemo<GridColumn<InvoiceSummary>[]>(() => [
    { key: "id", header: t("invoices.actions"), type: "readonly", align: "center",
      render: (_, row) => (
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => setViewId(row.id)}
            className="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20"
            title={t("invoices.view")}><Eye className="w-3.5 h-3.5" /></button>
          <button onClick={() => printInvoice(row.id)}
            className="w-7 h-7 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200"
            title={t("invoices.print")}><Printer className="w-3.5 h-3.5" /></button>
          {row.status === "draft" && canUpdate && (
            <button onClick={() => openEdit(row.id)}
              className="w-7 h-7 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100"
              title={t("invoices.edit")}><Edit2 className="w-3.5 h-3.5" /></button>
          )}
          {row.status === "draft" && canUpdate && (
            <button onClick={() => setToApprove(row)}
              className="w-7 h-7 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100"
              title={t("invoices.approve")}><Check className="w-3.5 h-3.5" /></button>
          )}
          {row.status !== "draft" && row.status !== "cancelled" && canCreate && (
            <button onClick={() => openCreateReturn(row.id)}
              className="w-7 h-7 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center hover:bg-amber-100"
              title={t(kind === "sales" ? "invoices.returns.newCreditNote" : "invoices.returns.newDebitNote")}>
              <Undo2 className="w-3.5 h-3.5" /></button>
          )}
          {["approved", "partially_paid", "paid"].includes(row.status) && canUpdate && (
            <button onClick={() => setToRevert(row)}
              className="w-7 h-7 rounded-md bg-orange-50 text-orange-600 flex items-center justify-center hover:bg-orange-100"
              title={t("invoices.revertToDraft", "تحويل لمسودة")}><RotateCcw className="w-3.5 h-3.5" /></button>
          )}
          {row.status === "draft" && canDelete && (
            <button onClick={() => setToDelete(row)}
              className="w-7 h-7 rounded-md bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-100"
              title={t("invoices.delete")}><Trash2 className="w-3.5 h-3.5" /></button>
          )}
          {row.balance > 0.005 && row.status !== "draft" && row.status !== "cancelled" && canPay && (
            <button onClick={() => { setPaymentInvoiceId(row.id); setPaymentOpen(true); }}
              className="w-7 h-7 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100"
              title={t("invoices.pay")}><HandCoins className="w-3.5 h-3.5" /></button>
          )}
        </div>
      ) },
    { key: "invoiceNo", header: t("invoices.invoiceNo"), type: "readonly",
      render: (v, row) => <span className="font-sans tabular-nums font-bold" dir="ltr">{row.code ?? `#${v}`}</span> },
    { key: "date", header: t("invoices.date"), type: "readonly" },
    { key: "dueDate", header: t("invoices.dueDate"), type: "readonly" },
    { key: "partyName", header: t(kind === "sales" ? "invoices.customer" : "invoices.supplier"), type: "readonly" },
    { key: "currency", header: t("invoices.currency"), type: "readonly", align: "center" },
    { key: "subtotal", header: t("invoices.subtotal"), type: "readonly", align: "end",
      render: (v, row) => <span className="font-sans tabular-nums text-foreground/80" dir="ltr">{fmtInv(Number(v ?? 0), row.currency)}</span> },
    { key: "discountTotal", header: t("invoices.discountTotal"), type: "readonly", align: "end",
      render: (v, row) => Number(v ?? 0) > 0.005
        ? <span className="font-sans tabular-nums text-amber-600" dir="ltr">{fmtInv(Number(v), row.currency)}</span>
        : <span className="text-foreground/30">—</span> },
    { key: "taxTotal", header: t("invoices.taxTotal"), type: "readonly", align: "end",
      render: (v, row) => Number(v ?? 0) > 0.005
        ? <span className="font-sans tabular-nums text-blue-600" dir="ltr">{fmtInv(Number(v), row.currency)}</span>
        : <span className="text-foreground/30">—</span> },
    { key: "total", header: t("invoices.total"), type: "readonly", align: "end",
      render: (v, row) => <span className="font-sans tabular-nums font-bold" dir="ltr">{fmtInv(Number(v ?? 0), row.currency)}</span> },
    { key: "amountPaid", header: t("invoices.paid"), type: "readonly", align: "end",
      render: (v, row) => <span className={`font-sans tabular-nums ${Number(v) > 0.005 ? "text-success" : "text-foreground/50"}`} dir="ltr">{fmtInv(Number(v ?? 0), row.currency)}</span> },
    { key: "balance", header: t("invoices.balance"), type: "readonly", align: "end",
      render: (v, row) => <span className={`font-bold font-sans tabular-nums ${Number(v) > 0 ? "" : "text-success"}`} dir="ltr">{fmtInv(Number(v ?? 0), row.currency)}</span> },
    { key: "status", header: t("invoices.status"), type: "readonly", align: "center",
      render: (_, row) => (
        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${statusCls[row.status] ?? statusCls.draft}`}>
          {t(`invoices.statuses.${row.status}`)}
          {row.overdue && row.status !== "paid" ? ` · ${t("invoices.overdue")}` : ""}
        </span>
      ) },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, kind, fmt, fmtInv, canDelete, canUpdate, canCreate, canPay]);

  const retGridColumns = useMemo<GridColumn<InvoiceSummary>[]>(() => [
    { key: "invoiceNo", header: t("invoices.invoiceNo"), type: "readonly",
      render: (v, row) => <span className="font-sans tabular-nums font-bold" dir="ltr">{row.code ?? `#${v}`}</span> },
    { key: "date", header: t("invoices.date"), type: "readonly" },
    { key: "partyName", header: t(kind === "sales" ? "invoices.customer" : "invoices.supplier"), type: "readonly" },
    { key: "relatedCode", header: t("invoices.returns.relatedInvoice"), type: "readonly" },
    { key: "total", header: t("invoices.total"), type: "readonly", align: "end",
      render: (v) => <span className="font-bold font-sans tabular-nums" dir="ltr">{fmt(Number(v ?? 0))}</span> },
    { key: "status", header: t("invoices.status"), type: "readonly", align: "center",
      render: (_, row) => (
        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${statusCls[row.status] ?? statusCls.draft}`}>
          {t(`invoices.statuses.${row.status}`)}
        </span>
      ) },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, kind, fmt]);

  const payGridColumns = useMemo<GridColumn<Payment>[]>(() => [
    { key: "paymentNo", header: t("invoices.paymentNo"), type: "readonly",
      render: (v) => <span className="font-sans tabular-nums font-bold" dir="ltr">#{v as number}</span> },
    { key: "date", header: t("invoices.date"), type: "readonly" },
    { key: "partyName", header: t("invoices.party"), type: "readonly" },
    { key: "method", header: t("invoices.method"), type: "readonly",
      render: (v) => <span>{t(`invoices.methods.${v as string}`)}</span> },
    { key: "cashAccountName", header: t("invoices.cashAccount", "الحساب"), type: "readonly" },
    { key: "amount", header: t("invoices.amount"), type: "readonly", align: "end",
      render: (v) => <span className="font-bold font-sans tabular-nums" dir="ltr">{fmt(Number(v ?? 0))}</span> },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, fmt]);

  const invalidateInvoices = () => {
    void refetchInvoices();
    void refetchReturns();
    queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
  };
  const invalidatePayments = () => {
    void refetchPayments();
    queryClient.invalidateQueries({
      queryKey: getListPaymentsQueryKey({ kind: paymentKind }),
    });
  };
  const invalidateJournal = () =>
    queryClient.invalidateQueries({
      queryKey: getListJournalEntriesQueryKey(),
    });

  const openCreate = () => {
    setEditId(null);
    setEditorReturn(false);
    setReturnSourceId(null);
    setEditorOpen(true);
  };
  const openEdit = (id: string) => {
    setEditId(id);
    setEditorReturn(false);
    setReturnSourceId(null);
    setEditorOpen(true);
  };
  const openCreateReturn = (sourceId: string | null) => {
    setEditId(null);
    setEditorReturn(true);
    setReturnSourceId(sourceId);
    setEditorOpen(true);
  };

  const base = import.meta.env.BASE_URL;
  const printInvoice = (id: string) =>
    window.open(`${base}print/invoice/${id}`, "_blank", "noopener");
  const printPayment = (id: string) =>
    window.open(`${base}print/payment/${id}`, "_blank", "noopener");

  const handleDelete = () => {
    if (!toDelete) return;
    deleteInvoice.mutate(
      { id: toDelete.id },
      {
        onSuccess: () => {
          invalidateInvoices();
          toast({ title: t("invoices.toast.deleted") });
          setToDelete(null);
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: t("common.error"),
            description: err?.data?.error || t("invoices.toast.error"),
          });
          setToDelete(null);
        },
      },
    );
  };

  const handleApprove = async () => {
    if (!toApprove) return;
    try {
      await approveInvoice.mutateAsync({ id: toApprove.id });
      await Promise.all([refetchInvoices(), refetchReturns()]);
      invalidateJournal();
      toast({ title: t("invoices.toast.approved") });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: err?.data?.error || t("invoices.toast.error"),
      });
    } finally {
      setToApprove(null);
    }
  };

  const handleRevert = async () => {
    if (!toRevert) return;
    try {
      await revertInvoice.mutateAsync({ id: toRevert.id });
      await Promise.all([refetchInvoices(), refetchReturns(), refetchPayments()]);
      invalidateJournal();
      toast({ title: t("invoices.toast.reverted", "تم تحويل الفاتورة إلى مسودة") });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: err?.data?.error || t("invoices.toast.error"),
      });
    } finally {
      setToRevert(null);
    }
  };

  const handleBulkDelete = async () => {
    setIsBulkDeleting(true);
    let successCount = 0;
    let failCount = 0;
    const draftSelected = Array.from(selectedIds).filter((id) => {
      const inv = invoices.find((i) => i.id === id);
      return inv?.status === "draft";
    });
    for (const id of draftSelected) {
      try {
        await deleteInvoice.mutateAsync({ id });
        successCount++;
      } catch {
        failCount++;
      }
    }
    setIsBulkDeleting(false);
    setBulkDeleteOpen(false);
    setSelectedIds(new Set());
    invalidateInvoices();
    if (successCount > 0) {
      toast({
        title: t("invoices.toast.bulkDeleted", `تم حذف ${successCount} فاتورة بنجاح`),
      });
    }
    if (failCount > 0) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t("invoices.toast.bulkDeletePartial", `فشل حذف ${failCount} فاتورة`),
      });
    }
  };

  const handleBulkRevert = async () => {
    setIsBulkReverting(true);
    let successCount = 0;
    let failCount = 0;
    const nonDraftSelected = Array.from(selectedIds).filter((id) => {
      const inv = invoices.find((i) => i.id === id);
      return inv && ["approved", "partially_paid", "paid"].includes(inv.status);
    });
    for (const id of nonDraftSelected) {
      try {
        await revertInvoice.mutateAsync({ id });
        successCount++;
      } catch {
        failCount++;
      }
    }
    setIsBulkReverting(false);
    setBulkRevertOpen(false);
    setSelectedIds(new Set());
    invalidatePayments();
    invalidateInvoices();
    invalidateJournal();
    if (successCount > 0) {
      toast({
        title: t("invoices.toast.bulkReverted", `تم تحويل ${successCount} فاتورة إلى مسودة`),
      });
    }
    if (failCount > 0) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t("invoices.toast.bulkRevertPartial", `فشل تحويل ${failCount} فاتورة`),
      });
    }
  };

  const handleBulkApprove = async () => {
    setIsBulkApproving(true);
    let ok = 0; let fail = 0;
    const draftSelected = Array.from(selectedIds).filter((id) => {
      const inv = invoices.find((i) => i.id === id);
      return inv?.status === "draft";
    });
    for (const id of draftSelected) {
      try { await approveInvoice.mutateAsync({ id }); ok++; }
      catch { fail++; }
    }
    setIsBulkApproving(false);
    setBulkApproveOpen(false);
    setSelectedIds(new Set());
    invalidateInvoices();
    invalidateJournal();
    if (ok > 0) toast({ title: t("invoices.toast.bulkApproved", `تم اعتماد ${ok} فاتورة بنجاح`) });
    if (fail > 0) toast({ variant: "destructive", title: t("common.error"), description: `فشل اعتماد ${fail} فاتورة` });
  };

  const handleDeletePayment = () => {
    if (!paymentToDelete) return;
    deletePayment.mutate(
      { id: paymentToDelete.id },
      {
        onSuccess: () => {
          invalidatePayments();
          invalidateInvoices();
          invalidateJournal();
          toast({ title: t("invoices.toast.paymentDeleted") });
          setPaymentToDelete(null);
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: t("common.error"),
            description: err?.data?.error || t("invoices.toast.error"),
          });
          setPaymentToDelete(null);
        },
      },
    );
  };

  const statusBadge = (inv: InvoiceSummary) => {
    const map: Record<string, { cls: string; icon: React.ReactNode }> = {
      draft: {
        cls: "text-muted-foreground bg-muted",
        icon: <RotateCcw className="w-3 h-3" />,
      },
      approved: {
        cls: "text-primary bg-primary/10",
        icon: <FileCheck className="w-3 h-3" />,
      },
      partially_paid: {
        cls: "text-amber-600 bg-amber-500/10",
        icon: <Clock className="w-3 h-3" />,
      },
      paid: {
        cls: "text-success bg-success/10",
        icon: <Wallet className="w-3 h-3" />,
      },
      cancelled: {
        cls: "text-muted-foreground bg-muted line-through",
        icon: <XCircle className="w-3 h-3" />,
      },
    };
    const cfg = map[inv.status] ?? map["draft"];
    return (
      <span
        className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${cfg.cls}`}
      >
        {cfg.icon}
        {t(`invoices.statuses.${inv.status}`)}
        {inv.overdue && inv.status !== "paid" ? ` · ${t("invoices.overdue")}` : ""}
      </span>
    );
  };

  return (
    <div className="flex flex-col">
      <header className="h-20 bg-background/80 backdrop-blur-md border-b flex items-center justify-between px-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-card border shadow-sm flex items-center justify-center text-primary">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">
              {t(kind === "sales" ? "invoices.salesTitle" : "invoices.purchasesTitle")}
            </h1>
            <p className="text-sm text-muted-foreground font-medium">
              {t(
                kind === "sales"
                  ? "invoices.salesSubtitle"
                  : "invoices.purchasesSubtitle",
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tab === "invoices" && canCreate && (
            <button
              onClick={() => setImportWizardOpen(true)}
              className="flex items-center gap-2 bg-card border px-4 py-2 rounded-full text-sm font-bold text-foreground hover:bg-muted/50 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {t("importWizard.openButton")}
            </button>
          )}
          {tab === "invoices" && (
            <ExcelToolbar
              exportPath={`/api/invoices/export?kind=${kind}`}
              canImport={false}
              invalidateKeys={[["invoices", kind]]}
            />
          )}
          {tab === "payments" && canPay && (
            <button
              onClick={() => setPaymentOpen(true)}
              className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
            >
              <HandCoins className="w-4 h-4" />
              {t(kind === "sales" ? "invoices.newCollection" : "invoices.newPaymentOut")}
            </button>
          )}
          {tab === "invoices" && canCreate && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              {t("invoices.newInvoice")}
            </button>
          )}
          {tab === "returns" && canCreate && (
            <button
              onClick={() => openCreateReturn(null)}
              className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
            >
              <Undo2 className="w-4 h-4" />
              {t(
                kind === "sales"
                  ? "invoices.returns.newCreditNote"
                  : "invoices.returns.newDebitNote",
              )}
            </button>
          )}
          {(tab === "invoices" || tab === "returns" || tab === "payments") && (
            <GridToggle
              isGrid={
                tab === "invoices" ? invGridView :
                tab === "returns" ? retGridView : payGridView
              }
              onToggle={
                tab === "invoices" ? toggleInvGrid :
                tab === "returns" ? toggleRetGrid : togglePayGrid
              }
            />
          )}
        </div>
      </header>

      <div className="px-8 pt-6">
        <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-full w-fit">
          {(["invoices", "returns", "payments", "reports"] as const).map((tk) => (
            <button
              key={tk}
              onClick={() => setTab(tk)}
              className={`px-5 py-2 rounded-full text-sm font-bold transition-colors ${
                tab === tk
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(`invoices.tabs.${tk}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="px-8 pt-4 pb-8 flex flex-col gap-6 w-full">
        {tab === "invoices" && (
          <div className="flex flex-col gap-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-card border rounded-xl p-3 shadow-sm flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{t("invoices.summary.total")}</p>
                  <p className="text-lg font-bold text-foreground">{summary.total}</p>
                </div>
              </div>
              <div className="bg-card border rounded-xl p-3 shadow-sm flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{t("invoices.statuses.draft")}</p>
                  <p className="text-lg font-bold text-foreground">{summary.draft}</p>
                </div>
              </div>
              <div className="bg-card border rounded-xl p-3 shadow-sm flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <FileCheck className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{t("invoices.statuses.approved")}</p>
                  <p className="text-lg font-bold text-foreground">{summary.approved}</p>
                </div>
              </div>
              <div className="bg-card border rounded-xl p-3 shadow-sm flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{t("invoices.statuses.partially_paid")}</p>
                  <p className="text-lg font-bold text-foreground">{summary.partially_paid}</p>
                </div>
              </div>
              <div className="bg-card border rounded-xl p-3 shadow-sm flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center text-success">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{t("invoices.statuses.paid")}</p>
                  <p className="text-lg font-bold text-foreground">{summary.paid}</p>
                </div>
              </div>
              <div className="bg-card border rounded-xl p-3 shadow-sm flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center text-destructive">
                  <XCircle className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{t("invoices.statuses.cancelled")}</p>
                  <p className="text-lg font-bold text-foreground">{summary.cancelled}</p>
                </div>
              </div>
            </div>

            {/* Monetary Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-card border rounded-xl p-3 shadow-sm flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{t("invoices.summary.totalAmount")}</p>
                  <p className="text-lg font-bold text-foreground">{fmt(summary.totalAmount)}</p>
                </div>
              </div>
              <div className="bg-card border rounded-xl p-3 shadow-sm flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center text-success">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{t("invoices.summary.totalPaid")}</p>
                  <p className="text-lg font-bold text-success">{fmt(summary.totalPaid)}</p>
                </div>
              </div>
              <div className="bg-card border rounded-xl p-3 shadow-sm flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{t("invoices.summary.totalBalance")}</p>
                  <p className="text-lg font-bold text-amber-600">{fmt(summary.totalBalance)}</p>
                </div>
              </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-card border rounded-xl shadow-sm p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder={t("invoices.filter.search")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full text-sm px-9 py-2 rounded-lg border border-border/70 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                  />
                </div>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    showFilters
                      ? "bg-primary/10 text-primary border-primary/30"
                      : "bg-background text-foreground border-border/70 hover:bg-muted/50"
                  }`}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  {t("invoices.filter.advanced")}
                </button>
              </div>
              {showFilters && (
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={filterParty}
                    onChange={(e) => setFilterParty(e.target.value)}
                    className="text-sm px-3 py-2 rounded-lg border border-border/70 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">{t(kind === "sales" ? "invoices.filter.allCustomers" : "invoices.filter.allSuppliers")}</option>
                    {partyOptions.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="text-sm px-3 py-2 rounded-lg border border-border/70 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">{t("invoices.filter.allStatuses")}</option>
                    <option value="draft">{t("invoices.statuses.draft")}</option>
                    <option value="approved">{t("invoices.statuses.approved")}</option>
                    <option value="partially_paid">{t("invoices.statuses.partially_paid")}</option>
                    <option value="paid">{t("invoices.statuses.paid")}</option>
                    <option value="cancelled">{t("invoices.statuses.cancelled")}</option>
                  </select>
                  <select
                    value={filterCurrency}
                    onChange={(e) => setFilterCurrency(e.target.value)}
                    className="text-sm px-3 py-2 rounded-lg border border-border/70 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">{t("invoices.filter.allCurrencies")}</option>
                    {currencyOptions.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    className="text-sm px-3 py-2 rounded-lg border border-border/70 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder={t("invoices.filter.dateFrom")}
                  />
                  <input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    className="text-sm px-3 py-2 rounded-lg border border-border/70 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder={t("invoices.filter.dateTo")}
                  />
                  <button
                    onClick={() => {
                      setFilterParty("");
                      setFilterStatus("");
                      setFilterCurrency("");
                      setFilterDateFrom("");
                      setFilterDateTo("");
                      setSearch("");
                    }}
                    className="text-sm px-3 py-2 rounded-lg border border-border/70 bg-background hover:bg-muted/50 text-muted-foreground"
                  >
                    {t("invoices.filter.clear")}
                  </button>
                </div>
              )}
            </div>

            {/* Bulk Action Bar */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 flex-wrap">
                <span className="text-sm font-bold text-slate-700">
                  {t("invoices.selectedCount", `تم تحديد ${selectedIds.size} فاتورة`)}
                </span>
                {/* Approve: shown when any draft selected */}
                {canUpdate && Array.from(selectedIds).some((id) => {
                  const inv = invoices.find((i) => i.id === id);
                  return inv?.status === "draft";
                }) && (
                  <button
                    onClick={() => setBulkApproveOpen(true)}
                    className="flex items-center gap-2 bg-success text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:opacity-90 transition-opacity"
                  >
                    <Check className="w-4 h-4" />
                    {t("invoices.bulkApprove", "اعتماد المحدد")}
                  </button>
                )}
                {/* Revert: shown when any non-draft selected */}
                {canUpdate && Array.from(selectedIds).some((id) => {
                  const inv = invoices.find((i) => i.id === id);
                  return inv && ["approved", "partially_paid", "paid"].includes(inv.status);
                }) && (
                  <button
                    onClick={() => setBulkRevertOpen(true)}
                    className="flex items-center gap-2 bg-orange-500 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-orange-600 transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                    {t("invoices.bulkRevert", "تحويل للمسودة")}
                  </button>
                )}
                {/* Delete: shown when any draft selected */}
                {canDelete && Array.from(selectedIds).some((id) => {
                  const inv = invoices.find((i) => i.id === id);
                  return inv?.status === "draft";
                }) && (
                  <button
                    onClick={() => setBulkDeleteOpen(true)}
                    className="flex items-center gap-2 bg-destructive text-destructive-foreground px-3 py-1.5 rounded-lg text-sm font-bold hover:opacity-90 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t("invoices.bulkDelete", "حذف المسودات")}
                  </button>
                )}
                <button
                  onClick={() => {
                    const headers = ["رقم الفاتورة", "التاريخ", "العميل/المورد", "الإجمالي", "الحالة"];
                    const rows = Array.from(selectedIds).map((id) => {
                      const inv = invoices.find((i) => i.id === id);
                      if (!inv) return "";
                      return [inv.code ?? `#${inv.invoiceNo}`, inv.date, inv.partyName ?? "", inv.total, inv.status].join("\t");
                    }).filter(Boolean);
                    const text = [headers.join("\t"), ...rows].join("\n");
                    navigator.clipboard?.writeText(text).catch(() => {
                      const ta = document.createElement("textarea");
                      ta.value = text; document.body.appendChild(ta); ta.select();
                      document.execCommand("copy"); document.body.removeChild(ta);
                    });
                  }}
                  className="flex items-center gap-2 text-sm text-slate-600 hover:bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200"
                >
                  <Copy className="w-4 h-4" />
                  {t("invoices.copy", "نسخ")}
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-sm text-slate-500 hover:underline ms-auto"
                >
                  {t("invoices.clearSelection", "إلغاء التحديد")}
                </button>
              </div>
            )}

            {/* Invoice Table */}
            <div className="bg-card border rounded-2xl shadow-sm overflow-hidden min-h-[300px]">
              {invLoading ? (
                <div className="flex items-center justify-center p-12">
                  <Spinner className="w-8 h-8 text-primary" />
                </div>
              ) : invoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-2 text-center">
                  <p className="font-bold text-foreground">
                    {t("invoices.noInvoices")}
                  </p>
                  <p className="text-sm max-w-md">{t("invoices.noInvoicesHint")}</p>
                  {canCreate && (
                    <button
                      onClick={openCreate}
                      className="mt-2 text-primary font-bold hover:underline"
                    >
                      {t("invoices.addFirst")}
                    </button>
                  )}
                </div>
              ) : invGridView ? (
              <GridTable
                rows={invoices}
                columns={invGridColumns}
                canEdit={false}
                canDelete={false}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                hideSelectionBar
                emptyMessage={t("invoices.noInvoices")}
                rowClassName={(row) =>
                  row.status === "cancelled" ? "opacity-50 line-through" :
                  row.overdue && row.status !== "paid" ? "bg-rose-50/30 dark:bg-rose-500/5" : ""
                }
              />
            ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[1000px] border-collapse">
                    <thead>
                      <tr className="text-[11px] font-bold text-muted-foreground bg-slate-50 border-b border-slate-200">
                        {(canDelete || canUpdate) && (
                          <th className="px-3 py-2 w-8 border-b border-slate-200">
                            {(() => {
                              const selectableInvs = invoices.filter((i) => i.status !== "cancelled");
                              const allSel = selectableInvs.length > 0 && selectableInvs.every((i) => selectedIds.has(i.id));
                              const someSel = selectableInvs.some((i) => selectedIds.has(i.id)) && !allSel;
                              return (
                                <input
                                  type="checkbox"
                                  checked={allSel}
                                  ref={(el) => { if (el) el.indeterminate = someSel; }}
                                  onChange={() => {
                                    if (allSel) {
                                      setSelectedIds(new Set());
                                    } else {
                                      setSelectedIds(new Set(selectableInvs.map((i) => i.id)));
                                    }
                                  }}
                                  className="w-4 h-4 accent-primary cursor-pointer"
                                  title={t("invoices.selectAll", "تحديد الكل")}
                                />
                              );
                            })()}
                          </th>
                        )}
                        <th className="text-center px-2 py-2 w-[180px] border-b border-slate-200">
                          {t("invoices.actions")}
                        </th>
                        <th className="text-start px-3 py-2 w-32 border-b border-slate-200">
                          {t("invoices.invoiceNo")}
                        </th>
                        <th className="text-start px-3 py-2 w-28 border-b border-slate-200">
                          {t("invoices.date")}
                        </th>
                        <th className="text-start px-3 py-2 w-28 border-b border-slate-200">
                          {t("invoices.dueDate")}
                        </th>
                        <th className="text-start px-3 py-2 w-44 border-b border-slate-200">
                          {t(kind === "sales" ? "invoices.customer" : "invoices.supplier")}
                        </th>
                        <th className="text-center px-3 py-2 w-20 border-b border-slate-200">
                          {t("invoices.currency")}
                        </th>
                        <th className="text-end px-3 py-2 w-32 border-b border-slate-200">
                          {t("invoices.total")}
                        </th>
                        <th className="text-end px-3 py-2 w-32 border-b border-slate-200">
                          {t("invoices.paid")}
                        </th>
                        <th className="text-end px-3 py-2 w-32 border-b border-slate-200">
                          {t("invoices.balance")}
                        </th>
                        <th className="text-center px-3 py-2 w-32 border-b border-slate-200">
                          {t("invoices.status")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => (
                        <React.Fragment key={inv.id}>
                        <tr
                          className={`border-b border-slate-100 hover:bg-slate-50/50 transition-colors ${selectedIds.has(inv.id) ? "bg-rose-50/40" : ""}`}
                        >
                          {(canDelete || canUpdate) && (
                            <td className="px-3 py-2">
                              {inv.status !== "cancelled" && (
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(inv.id)}
                                  onChange={() => {
                                    const next = new Set(selectedIds);
                                    if (next.has(inv.id)) next.delete(inv.id);
                                    else next.add(inv.id);
                                    setSelectedIds(next);
                                  }}
                                  className="w-4 h-4 accent-primary cursor-pointer"
                                />
                              )}
                            </td>
                          )}
                          {/* Actions */}
                          <td className="px-2 py-2">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => setViewId(inv.id)}
                                className="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20"
                                title={t("invoices.view")}
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => printInvoice(inv.id)}
                                className="w-7 h-7 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200"
                                title={t("invoices.print")}
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              {inv.status === "draft" && canUpdate && (
                                <button
                                  onClick={() => openEdit(inv.id)}
                                  className="w-7 h-7 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100"
                                  title={t("invoices.edit")}
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {inv.status === "draft" && canUpdate && (
                                <button
                                  onClick={() => setToApprove(inv)}
                                  className="w-7 h-7 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100"
                                  title={t("invoices.approve")}
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {inv.status !== "draft" &&
                                inv.status !== "cancelled" &&
                                canCreate && (
                                  <button
                                    onClick={() => openCreateReturn(inv.id)}
                                    className="w-7 h-7 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center hover:bg-amber-100"
                                    title={t(
                                      kind === "sales"
                                        ? "invoices.returns.newCreditNote"
                                        : "invoices.returns.newDebitNote",
                                    )}
                                  >
                                    <Undo2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              {["approved", "partially_paid", "paid"].includes(inv.status) && canUpdate && (
                                <button
                                  onClick={() => setToRevert(inv)}
                                  className="w-7 h-7 rounded-md bg-orange-50 text-orange-600 flex items-center justify-center hover:bg-orange-100"
                                  title={t("invoices.revertToDraft", "تحويل لمسودة")}
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {inv.status === "draft" && canDelete && (
                                <button
                                  onClick={() => setToDelete(inv)}
                                  className="w-7 h-7 rounded-md bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-100"
                                  title={t("invoices.delete")}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {inv.balance > 0.005 &&
                                inv.status !== "draft" &&
                                inv.status !== "cancelled" &&
                                canPay && (
                                  <button
                                    onClick={() => {
                                      setPaymentInvoiceId(inv.id);
                                      setPaymentOpen(true);
                                    }}
                                    className="w-7 h-7 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100"
                                    title={t("invoices.pay")}
                                  >
                                    <HandCoins className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              {["approved", "partially_paid", "paid"].includes(inv.status) && (
                                <button
                                  onClick={() =>
                                    setExpandedInvoiceId(
                                      expandedInvoiceId === inv.id ? null : inv.id,
                                    )
                                  }
                                  className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                                    expandedInvoiceId === inv.id
                                      ? "bg-primary/20 text-primary"
                                      : "bg-slate-100 text-slate-500 hover:bg-primary/10 hover:text-primary"
                                  }`}
                                  title={t("invoices.allocations.title")}
                                >
                                  {expandedInvoiceId === inv.id ? (
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                          {/* Invoice No */}
                          <td
                            className="px-3 py-2.5 font-sans tabular-nums font-bold text-foreground"
                            dir="ltr"
                          >
                            {inv.code ?? `#${inv.invoiceNo}`}
                          </td>
                          {/* Date */}
                          <td className="px-3 py-2.5 font-sans tabular-nums text-foreground/80" dir="ltr">
                            {inv.date}
                          </td>
                          {/* Due Date */}
                          <td className="px-3 py-2.5 font-sans tabular-nums text-foreground/80" dir="ltr">
                            {inv.dueDate ?? (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </td>
                          {/* Party */}
                          <td className="px-3 py-2.5 text-start text-foreground">
                            {inv.partyId ? (
                              <button
                                onClick={() => {
                                  const partyList = kind === "sales" ? customers : suppliers;
                                  const p = partyList.find((x: any) => x.id === inv.partyId);
                                  if (p) setPartyView(p as PartyViewParty);
                                }}
                                className="text-start hover:text-primary hover:underline transition-colors cursor-pointer"
                              >
                                {inv.partyName ?? "—"}
                              </button>
                            ) : (
                              inv.partyName ?? "—"
                            )}
                          </td>
                          {/* Currency */}
                          <td className="px-3 py-2.5 text-center font-sans text-xs font-bold text-foreground/70" dir="ltr">
                            {inv.currency ?? "EGP"}
                          </td>
                          {/* Total */}
                          <td className="px-3 py-2.5 text-end font-sans tabular-nums text-foreground/80" dir="ltr">
                            {fmtInv(inv.total, inv.currency)}
                          </td>
                          {/* Paid */}
                          <td className="px-3 py-2.5 text-end font-sans tabular-nums" dir="ltr">
                            {canPay && inv.balance > 0.005 && inv.status !== "draft" && inv.status !== "cancelled" ? (
                              <button
                                onClick={() => {
                                  setPaymentInvoiceId(inv.id);
                                  setPaymentOpen(true);
                                }}
                                className="text-success font-bold hover:underline cursor-pointer"
                                title={t("invoices.pay")}
                              >
                                {fmtInv(inv.amountPaid ?? 0, inv.currency)}
                              </button>
                            ) : (
                              <span className={inv.amountPaid && inv.amountPaid > 0.005 ? "text-success" : "text-foreground/50"}>
                                {fmtInv(inv.amountPaid ?? 0, inv.currency)}
                              </span>
                            )}
                          </td>
                          {/* Balance */}
                          <td
                            className={`px-3 py-2.5 text-end font-bold font-sans tabular-nums ${
                              inv.balance > 0 ? "text-foreground" : "text-success"
                            }`}
                            dir="ltr"
                          >
                            {fmtInv(inv.balance, inv.currency)}
                          </td>
                          {/* Status */}
                          <td className="px-3 py-2.5 text-center">
                            {statusBadge(inv)}
                          </td>
                        </tr>
                        {expandedInvoiceId === inv.id && (
                          <tr className="bg-primary/5 border-b border-primary/10">
                            <td colSpan={12} className="p-0">
                              <InvoicePaymentAllocations
                                invoiceId={inv.id}
                                invoiceKind={kind}
                                invoicePartyId={inv.partyId ?? null}
                                status={inv.status}
                                currency={inv.currency ?? null}
                                onChanged={() => refetchInvoices()}
                              />
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "returns" && (
          <div className="bg-card border rounded-2xl shadow-sm overflow-hidden min-h-[300px]">
            {retLoading ? (
              <div className="flex items-center justify-center p-12">
                <Spinner className="w-8 h-8 text-primary" />
              </div>
            ) : returns.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-2 text-center">
                <p className="font-bold text-foreground">
                  {t("invoices.returns.noReturns")}
                </p>
                <p className="text-sm max-w-md">
                  {t("invoices.returns.noReturnsHint")}
                </p>
                {canCreate && (
                  <button
                    onClick={() => openCreateReturn(null)}
                    className="mt-2 text-primary font-bold hover:underline"
                  >
                    {t(
                      kind === "sales"
                        ? "invoices.returns.newCreditNote"
                        : "invoices.returns.newDebitNote",
                    )}
                  </button>
                )}
              </div>
            ) : retGridView ? (
              <GridTable
                rows={returns}
                columns={retGridColumns}
                canEdit={false}
                canDelete={false}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                hideSelectionBar
                emptyMessage={t("invoices.returns.noReturns")}
                rowClassName={(row) =>
                  row.status === "cancelled" ? "opacity-50 line-through" : ""
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[900px] border-collapse">
                  <thead>
                    <tr className="text-[11px] font-bold text-muted-foreground bg-slate-50 border-b border-slate-200">
                      <th className="text-center px-2 py-2 w-[180px] border-b border-slate-200">
                        {t("invoices.actions")}
                      </th>
                      <th className="text-start px-3 py-2 w-32 border-b border-slate-200">
                        {t("invoices.invoiceNo")}
                      </th>
                      <th className="text-start px-3 py-2 w-28 border-b border-slate-200">
                        {t("invoices.date")}
                      </th>
                      <th className="text-start px-3 py-2 w-44 border-b border-slate-200">
                        {t(kind === "sales" ? "invoices.customer" : "invoices.supplier")}
                      </th>
                      <th className="text-start px-3 py-2 w-36 border-b border-slate-200">
                        {t("invoices.returns.relatedInvoice")}
                      </th>
                      <th className="text-end px-3 py-2 w-32 border-b border-slate-200">
                        {t("invoices.total")}
                      </th>
                      <th className="text-center px-3 py-2 w-32 border-b border-slate-200">
                        {t("invoices.status")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {returns.map((inv) => (
                      <tr
                        key={inv.id}
                        className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
                      >
                        {/* Actions */}
                        <td className="px-2 py-2">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setViewId(inv.id)}
                              className="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20"
                              title={t("invoices.view")}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => printInvoice(inv.id)}
                              className="w-7 h-7 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200"
                              title={t("invoices.print")}
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            {inv.status === "draft" && canUpdate && (
                              <button
                                onClick={() => openEdit(inv.id)}
                                className="w-7 h-7 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100"
                                title={t("invoices.edit")}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {inv.status === "draft" && canUpdate && (
                              <button
                                onClick={() => setToApprove(inv)}
                                className="w-7 h-7 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100"
                                title={t("invoices.approve")}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {["approved", "partially_paid", "paid"].includes(inv.status) && canUpdate && (
                              <button
                                onClick={() => setToRevert(inv)}
                                className="w-7 h-7 rounded-md bg-orange-50 text-orange-600 flex items-center justify-center hover:bg-orange-100"
                                title={t("invoices.revertToDraft", "تحويل لمسودة")}
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {inv.status === "draft" && canDelete && (
                              <button
                                onClick={() => setToDelete(inv)}
                                className="w-7 h-7 rounded-md bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-100"
                                title={t("invoices.delete")}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                        {/* Invoice No */}
                        <td
                          className="px-3 py-2.5 font-sans tabular-nums font-bold text-foreground"
                          dir="ltr"
                        >
                          {inv.code ?? `#${inv.invoiceNo}`}
                        </td>
                        {/* Date */}
                        <td className="px-3 py-2.5 font-sans tabular-nums text-foreground/80" dir="ltr">
                          {inv.date}
                        </td>
                        {/* Party */}
                        <td className="px-3 py-2.5 text-start text-foreground">
                          {inv.partyName ?? "—"}
                        </td>
                        {/* Related Invoice */}
                        <td className="px-3 py-2.5 text-start font-sans text-foreground/70" dir="ltr">
                          {inv.relatedCode ?? "—"}
                        </td>
                        {/* Total */}
                        <td className="px-3 py-2.5 text-end font-bold font-sans tabular-nums text-foreground" dir="ltr">
                          {fmtInv(inv.total, inv.currency)}
                        </td>
                        {/* Status */}
                        <td className="px-3 py-2.5 text-center">
                          {statusBadge(inv)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "payments" && (
          <div className="bg-card border rounded-2xl shadow-sm overflow-hidden min-h-[300px]">
            {payLoading ? (
              <div className="flex items-center justify-center p-12">
                <Spinner className="w-8 h-8 text-primary" />
              </div>
            ) : payments.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-2 text-center">
                <p className="font-bold text-foreground">
                  {t("invoices.noPayments")}
                </p>
                {canPay && (
                  <button
                    onClick={() => setPaymentOpen(true)}
                    className="mt-2 text-primary font-bold hover:underline"
                  >
                    {t(kind === "sales" ? "invoices.newCollection" : "invoices.newPaymentOut")}
                  </button>
                )}
              </div>
            ) : payGridView ? (
              <GridTable
                rows={payments}
                columns={payGridColumns}
                canEdit={false}
                canDelete={false}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                hideSelectionBar
                emptyMessage={t("invoices.noPayments")}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[700px] border-collapse">
                  <thead>
                    <tr className="text-[11px] font-bold text-muted-foreground bg-slate-50 border-b border-slate-200">
                      <th className="text-center px-2 py-2 w-[100px] border-b border-slate-200">
                        {t("invoices.actions")}
                      </th>
                      <th className="text-start px-3 py-2 w-32 border-b border-slate-200">
                        {t("invoices.paymentNo")}
                      </th>
                      <th className="text-start px-3 py-2 w-28 border-b border-slate-200">
                        {t("invoices.date")}
                      </th>
                      <th className="text-start px-3 py-2 w-44 border-b border-slate-200">
                        {t("invoices.party")}
                      </th>
                      <th className="text-start px-3 py-2 w-28 border-b border-slate-200">
                        {t("invoices.method")}
                      </th>
                      <th className="text-end px-3 py-2 w-32 border-b border-slate-200">
                        {t("invoices.amount")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <React.Fragment key={p.id}>
                      <tr
                        className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
                      >
                        {/* Actions */}
                        <td className="px-2 py-2">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setExpandedPaymentId(expandedPaymentId === p.id ? null : p.id)}
                              className="w-7 h-7 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200"
                              title={t("invoices.allocations.title")}
                            >
                              {expandedPaymentId === p.id
                                ? <ChevronDown className="w-3.5 h-3.5" />
                                : <ChevronRight className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => printPayment(p.id)}
                              className="w-7 h-7 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200"
                              title={t("invoices.print")}
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            {canDeletePay && (
                              <button
                                onClick={() => setPaymentToDelete(p)}
                                className="w-7 h-7 rounded-md bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-100"
                                title={t("invoices.delete")}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                        {/* Payment No */}
                        <td className="px-3 py-2.5 font-sans tabular-nums font-bold text-foreground" dir="ltr">
                          #{p.paymentNo}
                        </td>
                        {/* Date */}
                        <td className="px-3 py-2.5 font-sans tabular-nums text-foreground/80" dir="ltr">
                          {p.date}
                        </td>
                        {/* Party */}
                        <td className="px-3 py-2.5 text-start text-foreground">
                          {p.partyName ?? "—"}
                        </td>
                        {/* Method */}
                        <td className="px-3 py-2.5 text-start text-foreground/80">
                          {t(`invoices.methods.${p.method}`)}
                        </td>
                        {/* Amount */}
                        <td className="px-3 py-2.5 text-end font-bold font-sans tabular-nums text-foreground" dir="ltr">
                          {fmt(p.amount)}
                        </td>
                      </tr>
                      {expandedPaymentId === p.id && (
                        <tr className="bg-primary/5 border-b border-primary/10">
                          <td colSpan={6} className="px-4 py-2">
                            <p className="text-[11px] font-bold text-primary mb-1.5">
                              {t("invoices.allocations.title")}
                            </p>
                            {p.allocations.length === 0 ? (
                              <p className="text-xs text-muted-foreground">{t("invoices.allocations.none")}</p>
                            ) : (
                              <div className="flex flex-col gap-1">
                                {p.allocations.map((a) => (
                                  <div key={a.id} className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span>
                                      {t("invoices.invoiceNo")} #{a.invoiceNo ?? "—"}
                                    </span>
                                    <span className="font-mono font-bold text-foreground" dir="ltr">
                                      {a.amount.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "reports" && <InvoiceReports kind={kind} />}
      </div>

      {editorOpen && (
        <InvoiceEditor
          kind={kind}
          invoiceId={editId}
          isReturn={editorReturn}
          relatedSourceId={returnSourceId}
          postableAccounts={postable}
          onClose={() => { setEditorOpen(false); setEditId(null); }}
          onSaved={() => {
            invalidateInvoices();
            setEditorOpen(false);
            setEditId(null);
          }}
        />
      )}

      {viewId && (
        <InvoiceEditor
          kind={kind}
          invoiceId={viewId}
          readOnly
          postableAccounts={postable}
          onClose={() => setViewId(null)}
          onSaved={() => setViewId(null)}
          onEdit={() => {
            const id = viewId;
            setViewId(null);
            setEditId(id);
            setEditorOpen(true);
          }}
          onAllocated={() => {
            invalidateInvoices();
            invalidatePayments();
          }}
        />
      )}

      {partyView && (
        <PartyView
          kind={kind}
          party={partyView}
          onClose={() => setPartyView(null)}
        />
      )}

      {paymentOpen && (
        <PaymentModal
          kind={kind}
          postableAccounts={postable}
          initialInvoiceId={paymentInvoiceId}
          onClose={() => {
            setPaymentInvoiceId(undefined);
            setPaymentOpen(false);
          }}
          onSaved={() => {
            invalidatePayments();
            invalidateInvoices();
            invalidateJournal();
            setPaymentInvoiceId(undefined);
            setPaymentOpen(false);
          }}
        />
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("invoices.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("invoices.confirmDeleteInvoice")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("invoices.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("invoices.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!toApprove} onOpenChange={(o) => !o && setToApprove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("invoices.approve")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("invoices.confirmApprove")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("invoices.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove}>
              {t("invoices.approve")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!toRevert} onOpenChange={(o) => !o && setToRevert(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("invoices.revertToDraft", "تحويل لمسودة")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "invoices.confirmRevert",
                "سيتم حذف القيد المحاسبي وجميع المدفوعات المرتبطة بهذه الفاتورة وتحويلها إلى مسودة. يمكنك بعدها تعديلها وإعادة اعتمادها.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("invoices.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevert}
              className="bg-orange-600 text-white hover:bg-orange-700"
            >
              {t("invoices.revertToDraft", "تحويل لمسودة")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!paymentToDelete}
        onOpenChange={(o) => !o && setPaymentToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("invoices.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("invoices.confirmDeletePayment")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("invoices.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePayment}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("invoices.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkApproveOpen} onOpenChange={(o) => !o && setBulkApproveOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("invoices.bulkApprove", "اعتماد الفواتير المحددة")}</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const draftCount = Array.from(selectedIds).filter((id) => invoices.find((i) => i.id === id)?.status === "draft").length;
                return t("invoices.confirmBulkApprove", `سيتم اعتماد ${draftCount} فاتورة مسودة وإنشاء قيودها المحاسبية.`);
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkApproving}>{t("invoices.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleBulkApprove(); }}
              disabled={isBulkApproving}
              className="bg-success text-white hover:bg-success/90"
            >
              {isBulkApproving ? <Spinner className="w-4 h-4" /> : <>{t("invoices.approve", "اعتماد")}</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={(o) => !o && setBulkDeleteOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("invoices.bulkDelete", "حذف المسودات المحددة")}</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const draftCount = Array.from(selectedIds).filter((id) => invoices.find((i) => i.id === id)?.status === "draft").length;
                return t("invoices.confirmBulkDelete", `سيتم حذف ${draftCount} فاتورة مسودة بشكل نهائي. هذه العملية لا يمكن التراجع عنها.`);
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>
              {t("invoices.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleBulkDelete(); }}
              disabled={isBulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBulkDeleting ? <Spinner className="w-4 h-4" /> : <>{t("invoices.delete")}</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkRevertOpen} onOpenChange={(o) => !o && setBulkRevertOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("invoices.bulkRevert", "تحويل للمسودة")}</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const nonDraftCount = Array.from(selectedIds).filter((id) => {
                  const inv = invoices.find((i) => i.id === id);
                  return inv && ["approved", "partially_paid", "paid"].includes(inv.status);
                }).length;
                return t(
                  "invoices.confirmBulkRevert",
                  `سيتم تحويل ${nonDraftCount} فاتورة إلى مسودة مع حذف جميع المدفوعات والقيود المحاسبية المرتبطة بها تلقائياً.`,
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkReverting}>
              {t("invoices.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleBulkRevert(); }}
              disabled={isBulkReverting}
              className="bg-orange-500 text-white hover:bg-orange-600"
            >
              {isBulkReverting ? <Spinner className="w-4 h-4" /> : <>{t("invoices.revertToDraft", "تحويل للمسودة")}</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {importWizardOpen && (
        <ImportWizard
          moduleType={kind}
          onClose={() => setImportWizardOpen(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({
              queryKey: getListInvoicesQueryKey({ kind }),
            });
            setImportWizardOpen(false);
          }}
        />
      )}
    </div>
  );
}

