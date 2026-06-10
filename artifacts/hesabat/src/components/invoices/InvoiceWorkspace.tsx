import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListInvoices,
  useDeleteInvoice,
  useApproveInvoice,
  useListPayments,
  useDeletePayment,
  useListAccounts,
  useListCustomers,
  useListSuppliers,
  useListCurrencies,
  useGetCurrentUser,
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
import { ExcelToolbar } from "@/components/ExcelToolbar";

type Kind = "sales" | "purchase";
type Tab = "invoices" | "returns" | "payments" | "reports";

function displayName(
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
  const [toDelete, setToDelete] = useState<InvoiceSummary | null>(null);
  const [toApprove, setToApprove] = useState<InvoiceSummary | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | undefined>(undefined);
  const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [filterParty, setFilterParty] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterCurrency, setFilterCurrency] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const { data: invoicesRaw = [], isLoading: invLoading } = useListInvoices({
    kind,
    ...(filterStatus ? { status: filterStatus } : {}),
    ...(filterDateFrom ? { dateFrom: filterDateFrom } : {}),
    ...(filterDateTo ? { dateTo: filterDateTo } : {}),
    ...(filterCurrency ? { currency: filterCurrency } : {}),
    ...(kind === "sales" && filterParty ? { customerId: filterParty } : {}),
    ...(kind === "purchase" && filterParty ? { supplierId: filterParty } : {}),
    ...(search ? { search } : {}),
  } as any);
  const { data: returns = [], isLoading: retLoading } = useListInvoices({
    kind: returnKind,
  });
  const { data: payments = [], isLoading: payLoading } = useListPayments({
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
      counts.totalAmount += inv.total;
      counts.totalPaid += inv.amountPaid ?? 0;
      counts.totalBalance += inv.balance;
    }
    return counts;
  }, [invoices]);

  const deleteInvoice = useDeleteInvoice();
  const approveInvoice = useApproveInvoice();
  const deletePayment = useDeletePayment();

  const { data: user } = useGetCurrentUser();
  const role = user?.role ?? "";
  const canCreate = hasCapability(role, "invoices:create");
  const canUpdate = hasCapability(role, "invoices:update");
  const canDelete = hasCapability(role, "invoices:delete");
  const canPay = hasCapability(role, "payments:create");
  const canDeletePay = hasCapability(role, "payments:delete");

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const invalidateInvoices = () => {
    queryClient.invalidateQueries({
      queryKey: getListInvoicesQueryKey({ kind }),
    });
    queryClient.invalidateQueries({
      queryKey: getListInvoicesQueryKey({ kind: returnKind }),
    });
  };
  const invalidatePayments = () =>
    queryClient.invalidateQueries({
      queryKey: getListPaymentsQueryKey({ kind: paymentKind }),
    });
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

  const handleApprove = () => {
    if (!toApprove) return;
    approveInvoice.mutate(
      { id: toApprove.id },
      {
        onSuccess: () => {
          invalidateInvoices();
          invalidateJournal();
          toast({ title: t("invoices.toast.approved") });
          setToApprove(null);
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: t("common.error"),
            description: err?.data?.error || t("invoices.toast.error"),
          });
          setToApprove(null);
        },
      },
    );
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
    const map: Record<string, string> = {
      draft: "text-muted-foreground bg-muted",
      approved: "text-primary bg-primary/10",
      partially_paid: "text-amber-600 bg-amber-500/10",
      paid: "text-success bg-success/10",
      cancelled: "text-muted-foreground bg-muted line-through",
    };
    return (
      <span
        className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
          map[inv.status] ?? "text-muted-foreground bg-muted"
        }`}
      >
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
          {tab === "invoices" && (
            <ExcelToolbar
              exportPath={`/api/invoices/export?kind=${kind}`}
              importPath={`/api/invoices/import?kind=${kind}`}
              canImport={canCreate}
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
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[1000px]">
                    <thead>
                      <tr className="text-xs font-bold text-muted-foreground bg-muted/50 border-b">
                        <th className="text-center px-4 py-2.5 w-24">
                          {t("invoices.actions")}
                        </th>
                        <th className="text-start px-3 py-2.5 w-32">
                          {t("invoices.invoiceNo")}
                        </th>
                        <th className="text-start px-3 py-2.5 w-28">
                          {t("invoices.date")}
                        </th>
                        <th className="text-start px-3 py-2.5 w-28">
                          {t("invoices.dueDate")}
                        </th>
                        <th className="text-start px-3 py-2.5 w-44">
                          {t(kind === "sales" ? "invoices.customer" : "invoices.supplier")}
                        </th>
                        <th className="text-center px-3 py-2.5 w-20">
                          {t("invoices.currency")}
                        </th>
                        <th className="text-end px-3 py-2.5 w-32">
                          {t("invoices.total")}
                        </th>
                        <th className="text-end px-3 py-2.5 w-32">
                          {t("invoices.paid")}
                        </th>
                        <th className="text-end px-3 py-2.5 w-32">
                          {t("invoices.balance")}
                        </th>
                        <th className="text-center px-3 py-2.5 w-32">
                          {t("invoices.status")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => (
                        <tr
                          key={inv.id}
                          className="group border-b border-border/50 hover:bg-muted/30 transition-colors"
                        >
                          {/* Actions */}
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-center gap-0.5">
                              <button
                                onClick={() => setViewId(inv.id)}
                                className="p-1.5 rounded-md hover:bg-primary/10 text-primary"
                                title={t("invoices.view")}
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => printInvoice(inv.id)}
                                className="p-1.5 rounded-md hover:bg-primary/10 text-primary"
                                title={t("invoices.print")}
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                              {inv.status === "draft" && canUpdate && (
                                <button
                                  onClick={() => openEdit(inv.id)}
                                  className="p-1.5 rounded-md hover:bg-primary/10 text-primary"
                                  title={t("invoices.edit")}
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                              )}
                              {inv.status === "draft" && canUpdate && (
                                <button
                                  onClick={() => setToApprove(inv)}
                                  className="p-1.5 rounded-md hover:bg-success/10 text-success"
                                  title={t("invoices.approve")}
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                              )}
                              {inv.status !== "draft" &&
                                inv.status !== "cancelled" &&
                                canCreate && (
                                  <button
                                    onClick={() => openCreateReturn(inv.id)}
                                    className="p-1.5 rounded-md hover:bg-amber-500/10 text-amber-600"
                                    title={t(
                                      kind === "sales"
                                        ? "invoices.returns.newCreditNote"
                                        : "invoices.returns.newDebitNote",
                                    )}
                                  >
                                    <Undo2 className="w-4 h-4" />
                                  </button>
                                )}
                              {inv.status === "draft" && canDelete && (
                                <button
                                  onClick={() => setToDelete(inv)}
                                  className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"
                                  title={t("invoices.delete")}
                                >
                                  <Trash2 className="w-4 h-4" />
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
                                    className="p-1.5 rounded-md hover:bg-success/10 text-success"
                                    title={t("invoices.pay")}
                                  >
                                    <HandCoins className="w-4 h-4" />
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
                            {inv.partyName ?? "—"}
                          </td>
                          {/* Currency */}
                          <td className="px-3 py-2.5 text-center font-sans text-xs font-bold text-foreground/70" dir="ltr">
                            {inv.currency ?? "EGP"}
                          </td>
                          {/* Total */}
                          <td className="px-3 py-2.5 text-end font-sans tabular-nums text-foreground/80" dir="ltr">
                            {fmt(inv.total)}
                          </td>
                          {/* Paid */}
                          <td className="px-3 py-2.5 text-end font-sans tabular-nums text-success" dir="ltr">
                            {fmt(inv.amountPaid ?? 0)}
                          </td>
                          {/* Balance */}
                          <td
                            className={`px-3 py-2.5 text-end font-bold font-sans tabular-nums ${
                              inv.balance > 0 ? "text-foreground" : "text-success"
                            }`}
                            dir="ltr"
                          >
                            {fmt(inv.balance)}
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
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead>
                    <tr className="text-xs font-bold text-muted-foreground bg-muted/50 border-b">
                      <th className="text-center px-4 py-2.5 w-24">
                        {t("invoices.actions")}
                      </th>
                      <th className="text-start px-3 py-2.5 w-32">
                        {t("invoices.invoiceNo")}
                      </th>
                      <th className="text-start px-3 py-2.5 w-28">
                        {t("invoices.date")}
                      </th>
                      <th className="text-start px-3 py-2.5 w-44">
                        {t(kind === "sales" ? "invoices.customer" : "invoices.supplier")}
                      </th>
                      <th className="text-start px-3 py-2.5 w-36">
                        {t("invoices.returns.relatedInvoice")}
                      </th>
                      <th className="text-end px-3 py-2.5 w-32">
                        {t("invoices.total")}
                      </th>
                      <th className="text-center px-3 py-2.5 w-32">
                        {t("invoices.status")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {returns.map((inv) => (
                      <tr
                        key={inv.id}
                        className="group border-b border-border/50 hover:bg-muted/30 transition-colors"
                      >
                        {/* Actions */}
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-center gap-0.5">
                            <button
                              onClick={() => setViewId(inv.id)}
                              className="p-1.5 rounded-md hover:bg-primary/10 text-primary"
                              title={t("invoices.view")}
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => printInvoice(inv.id)}
                              className="p-1.5 rounded-md hover:bg-primary/10 text-primary"
                              title={t("invoices.print")}
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            {inv.status === "draft" && canUpdate && (
                              <button
                                onClick={() => openEdit(inv.id)}
                                className="p-1.5 rounded-md hover:bg-primary/10 text-primary"
                                title={t("invoices.edit")}
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            )}
                            {inv.status === "draft" && canUpdate && (
                              <button
                                onClick={() => setToApprove(inv)}
                                className="p-1.5 rounded-md hover:bg-success/10 text-success"
                                title={t("invoices.approve")}
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            {inv.status === "draft" && canDelete && (
                              <button
                                onClick={() => setToDelete(inv)}
                                className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"
                                title={t("invoices.delete")}
                              >
                                <Trash2 className="w-4 h-4" />
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
                          {fmt(inv.total)}
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
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr className="text-xs font-bold text-muted-foreground bg-muted/50 border-b">
                      <th className="text-center px-4 py-2.5 w-24">
                        {t("invoices.actions")}
                      </th>
                      <th className="text-start px-3 py-2.5 w-32">
                        {t("invoices.paymentNo")}
                      </th>
                      <th className="text-start px-3 py-2.5 w-28">
                        {t("invoices.date")}
                      </th>
                      <th className="text-start px-3 py-2.5 w-44">
                        {t("invoices.party")}
                      </th>
                      <th className="text-start px-3 py-2.5 w-28">
                        {t("invoices.method")}
                      </th>
                      <th className="text-end px-3 py-2.5 w-32">
                        {t("invoices.amount")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr
                        key={p.id}
                        className="group border-b border-border/50 hover:bg-muted/30 transition-colors"
                      >
                        {/* Actions */}
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-center gap-0.5">
                            <button
                              onClick={() => printPayment(p.id)}
                              className="p-1.5 rounded-md hover:bg-primary/10 text-primary"
                              title={t("invoices.print")}
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            {canDeletePay && (
                              <button
                                onClick={() => setPaymentToDelete(p)}
                                className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"
                                title={t("invoices.delete")}
                              >
                                <Trash2 className="w-4 h-4" />
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
          onClose={() => setEditorOpen(false)}
          onSaved={() => {
            invalidateInvoices();
            setEditorOpen(false);
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
    </div>
  );
}

export { displayName };
