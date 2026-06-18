import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListInvoices,
  useListAccounts,
  useDeleteInvoice,
  useApproveInvoice,
  useRevertInvoice,
  useConvertInvoice,
  useGetCompany,
  useListCustomers,
  useListSuppliers,
  useGetCurrentUser,
  getListInvoicesQueryKey,
  type InvoiceSummary,
  type Account,
} from "@workspace/api-client-react";
import { hasCapability } from "@workspace/permissions";
import {
  FileText,
  Plus,
  Trash2,
  Edit2,
  Check,
  Printer,
  RotateCcw,
  Search,
  SlidersHorizontal,
  ArrowRightLeft,
  FileCheck,
  FileClock,
  FileX2,
  FileInput,
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

type PreKind = "quotation" | "purchase_order";

interface Props {
  kind: PreKind;
}

export function QuotationWorkspace({ kind }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const ns = kind === "quotation" ? "quotations" : "purchaseOrders";
  const partyKey = kind === "quotation" ? "customer" : "supplier";

  const [editorOpen, setEditorOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterParty, setFilterParty] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [toDelete, setToDelete] = useState<InvoiceSummary | null>(null);
  const [toConfirm, setToConfirm] = useState<InvoiceSummary | null>(null);
  const [toRevert, setToRevert] = useState<InvoiceSummary | null>(null);
  const [toConvert, setToConvert] = useState<InvoiceSummary | null>(null);

  const { data: rawDocs = [], isLoading } = useListInvoices({ kind } as any);
  const { data: customers = [] } = useListCustomers();
  const { data: suppliers = [] } = useListSuppliers();
  const { data: accounts = [] } = useListAccounts();
  const { data: user } = useGetCurrentUser();
  const { data: company } = useGetCompany();
  const postable = useMemo(() => (accounts as Account[]).filter((a) => !a.isGroup), [accounts]);
  const role = user?.role ?? "";
  const canCreate = hasCapability(role, "invoices:create");
  const canUpdate = hasCapability(role, "invoices:update");
  const canDelete = hasCapability(role, "invoices:delete");

  const deleteInvoice = useDeleteInvoice();
  const approveInvoice = useApproveInvoice();
  const revertInvoice = useRevertInvoice();
  const convertInvoice = useConvertInvoice();

  const partyOptions = useMemo(() => {
    const list = kind === "quotation" ? customers : suppliers;
    return list.map((p) => ({
      id: p.id,
      name: lang.startsWith("en") && (p as any).nameEn ? (p as any).nameEn : (p as any).nameAr,
    }));
  }, [kind, customers, suppliers, lang]);

  const docs = useMemo(() => {
    let list = rawDocs as InvoiceSummary[];
    if (filterStatus) list = list.filter((d) => d.status === filterStatus);
    if (filterParty) {
      list = list.filter((d) => d.partyId === filterParty);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (d) =>
          String(d.invoiceNo).includes(q) ||
          (d.code ?? "").toLowerCase().includes(q) ||
          (d.partyName ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [rawDocs, filterStatus, filterParty, search]);

  const summary = useMemo(() => {
    const all = rawDocs as InvoiceSummary[];
    return {
      total: all.length,
      draft: all.filter((d) => d.status === "draft").length,
      confirmed: all.filter((d) => d.status === "confirmed").length,
      converted: all.filter((d) => d.status === "converted").length,
      totalAmount: all.reduce((s, d) => s + (d.total ?? 0), 0),
    };
  }, [rawDocs]);

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang, {
      style: "currency",
      currency: company?.baseCurrency ?? "EGP",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey({ kind } as any) });

  const openCreate = () => { setEditId(null); setEditorOpen(true); };
  const openEdit = (id: string) => { setEditId(id); setEditorOpen(true); };

  const base = import.meta.env.BASE_URL;
  const printDoc = (id: string) => window.open(`${base}print/invoice/${id}`, "_blank", "noopener");

  const handleConfirm = () => {
    if (!toConfirm) return;
    approveInvoice.mutate(
      { id: toConfirm.id },
      {
        onSuccess: () => { invalidate(); toast({ title: t(`${ns}.toast.confirmed`) }); setToConfirm(null); },
        onError: (err: any) => {
          toast({ variant: "destructive", title: t("common.error"), description: err?.data?.error ?? t(`${ns}.toast.error`) });
          setToConfirm(null);
        },
      },
    );
  };

  const handleRevert = () => {
    if (!toRevert) return;
    revertInvoice.mutate(
      { id: toRevert.id },
      {
        onSuccess: () => { invalidate(); toast({ title: t(`${ns}.toast.reverted`) }); setToRevert(null); },
        onError: (err: any) => {
          toast({ variant: "destructive", title: t("common.error"), description: err?.data?.error ?? t(`${ns}.toast.error`) });
          setToRevert(null);
        },
      },
    );
  };

  const handleConvert = () => {
    if (!toConvert) return;
    convertInvoice.mutate(
      { id: toConvert.id },
      {
        onSuccess: () => {
          invalidate();
          const targetKind = kind === "quotation" ? "sales" : "purchase";
          queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey({ kind: targetKind } as any) });
          toast({ title: t(`${ns}.toast.converted`) });
          setToConvert(null);
          const targetPath = kind === "quotation" ? "/invoices/sales" : "/invoices/purchases";
          navigate(targetPath);
        },
        onError: (err: any) => {
          toast({ variant: "destructive", title: t("common.error"), description: err?.data?.error ?? t(`${ns}.toast.error`) });
          setToConvert(null);
        },
      },
    );
  };

  const handleDelete = () => {
    if (!toDelete) return;
    deleteInvoice.mutate(
      { id: toDelete.id },
      {
        onSuccess: () => { invalidate(); toast({ title: t(`${ns}.toast.deleted`) }); setToDelete(null); },
        onError: (err: any) => {
          toast({ variant: "destructive", title: t("common.error"), description: err?.data?.error ?? t(`${ns}.toast.error`) });
          setToDelete(null);
        },
      },
    );
  };

  const statusBadge = (status: string) => {
    const cfg: Record<string, { cls: string; icon: React.ReactNode }> = {
      draft: { cls: "text-muted-foreground bg-muted", icon: <FileClock className="w-3 h-3" /> },
      confirmed: { cls: "text-primary bg-primary/10", icon: <FileCheck className="w-3 h-3" /> },
      converted: { cls: "text-success bg-success/10", icon: <FileInput className="w-3 h-3" /> },
      cancelled: { cls: "text-muted-foreground bg-muted line-through", icon: <FileX2 className="w-3 h-3" /> },
    };
    const c = cfg[status] ?? cfg["draft"];
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${c.cls}`}>
        {c.icon}
        {t(`invoices.statuses.${status}`)}
      </span>
    );
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="h-20 bg-background/80 backdrop-blur-md border-b flex items-center justify-between px-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-card border shadow-sm flex items-center justify-center text-primary">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">{t(`${ns}.title`)}</h1>
            <p className="text-sm text-muted-foreground font-medium">{t(`${ns}.subtitle`)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canCreate && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              {t(`${ns}.new`)}
            </button>
          )}
        </div>
      </header>

      <div className="px-8 pt-6 pb-8 flex flex-col gap-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <div className="bg-card border rounded-xl p-3 shadow-sm flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">{t(`${ns}.summary.total`)}</p>
              <p className="text-lg font-bold">{summary.total}</p>
            </div>
          </div>
          <div className="bg-card border rounded-xl p-3 shadow-sm flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
              <FileClock className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">{t(`${ns}.summary.draft`)}</p>
              <p className="text-lg font-bold">{summary.draft}</p>
            </div>
          </div>
          <div className="bg-card border rounded-xl p-3 shadow-sm flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <FileCheck className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">{t(`${ns}.summary.confirmed`)}</p>
              <p className="text-lg font-bold">{summary.confirmed}</p>
            </div>
          </div>
          <div className="bg-card border rounded-xl p-3 shadow-sm flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center text-success">
              <FileInput className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">{t(`${ns}.summary.converted`)}</p>
              <p className="text-lg font-bold">{summary.converted}</p>
            </div>
          </div>
          <div className="bg-card border rounded-xl p-3 shadow-sm flex items-center gap-3 col-span-2 md:col-span-1 lg:col-span-1">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">{t("invoices.summary.totalAmount")}</p>
              <p className="text-base font-bold font-sans tabular-nums" dir="ltr">{fmt(summary.totalAmount)}</p>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("invoices.filter.search")}
                className="w-full ps-9 pe-4 h-10 bg-card border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`flex items-center gap-2 h-10 px-4 rounded-xl border text-sm font-bold transition-colors ${showFilters ? "bg-primary/10 text-primary border-primary/30" : "bg-card text-foreground"}`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              {t("invoices.filter.advanced")}
            </button>
          </div>
          {showFilters && (
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="h-9 px-3 rounded-xl border bg-card text-sm focus:outline-none"
              >
                <option value="">{t("invoices.filter.allStatuses")}</option>
                <option value="draft">{t("invoices.statuses.draft")}</option>
                <option value="confirmed">{t("invoices.statuses.confirmed")}</option>
                <option value="converted">{t("invoices.statuses.converted")}</option>
              </select>
              <select
                value={filterParty}
                onChange={(e) => setFilterParty(e.target.value)}
                className="h-9 px-3 rounded-xl border bg-card text-sm focus:outline-none"
              >
                <option value="">
                  {kind === "quotation" ? t("invoices.filter.allCustomers") : t("invoices.filter.allSuppliers")}
                </option>
                {partyOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {(filterStatus || filterParty) && (
                <button
                  onClick={() => { setFilterStatus(""); setFilterParty(""); }}
                  className="h-9 px-3 rounded-xl border bg-muted text-sm font-bold text-muted-foreground hover:text-foreground"
                >
                  {t("common.all")}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Documents Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Spinner className="w-8 h-8 text-primary" />
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground">
              <FileText className="w-8 h-8" />
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-foreground">{t(`${ns}.noItems`)}</p>
              <p className="text-sm text-muted-foreground mt-1">{t(`${ns}.noItemsHint`)}</p>
            </div>
            {canCreate && (
              <button
                onClick={openCreate}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-full text-sm font-bold hover:opacity-90 transition-opacity mt-2"
              >
                <Plus className="w-4 h-4" />
                {t(`${ns}.new`)}
              </button>
            )}
          </div>
        ) : (
          <div className="bg-card border rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-start px-4 py-3 font-bold text-muted-foreground text-xs uppercase tracking-wide">
                      {t("invoices.invoiceNo")}
                    </th>
                    <th className="text-start px-4 py-3 font-bold text-muted-foreground text-xs uppercase tracking-wide">
                      {t("invoices.date")}
                    </th>
                    <th className="text-start px-4 py-3 font-bold text-muted-foreground text-xs uppercase tracking-wide">
                      {t(`invoices.${partyKey}`)}
                    </th>
                    <th className="text-start px-4 py-3 font-bold text-muted-foreground text-xs uppercase tracking-wide">
                      {t("invoices.dueDate")}
                    </th>
                    <th className="text-end px-4 py-3 font-bold text-muted-foreground text-xs uppercase tracking-wide">
                      {t("invoices.total")}
                    </th>
                    <th className="text-center px-4 py-3 font-bold text-muted-foreground text-xs uppercase tracking-wide">
                      {t("invoices.status")}
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {docs.map((doc) => (
                    <tr key={doc.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-4 py-3">
                        <span className="font-sans tabular-nums font-bold text-primary" dir="ltr">
                          {doc.code ?? `#${doc.invoiceNo}`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{doc.date}</td>
                      <td className="px-4 py-3 font-medium">{doc.partyName ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{doc.dueDate ?? "—"}</td>
                      <td className="px-4 py-3 text-end">
                        <span className="font-bold font-sans tabular-nums" dir="ltr">
                          {fmt(doc.total ?? 0)}
                          {doc.currency ? <span className="text-xs text-muted-foreground ms-1">{doc.currency}</span> : null}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">{statusBadge(doc.status)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Edit — draft only */}
                          {doc.status === "draft" && canUpdate && (
                            <button
                              onClick={() => openEdit(doc.id)}
                              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              title={t("invoices.edit")}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {/* View — non-draft */}
                          {doc.status !== "draft" && (
                            <button
                              onClick={() => openEdit(doc.id)}
                              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              title={t("invoices.view")}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {/* Confirm — draft only */}
                          {doc.status === "draft" && canUpdate && (
                            <button
                              onClick={() => setToConfirm(doc)}
                              className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                              title={t(`${ns}.confirm`)}
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                          {/* Revert — confirmed only */}
                          {doc.status === "confirmed" && canUpdate && (
                            <button
                              onClick={() => setToRevert(doc)}
                              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              title={t(`${ns}.revertTitle`)}
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )}
                          {/* Convert — confirmed only */}
                          {doc.status === "confirmed" && canCreate && (
                            <button
                              onClick={() => setToConvert(doc)}
                              className="p-1.5 rounded-lg hover:bg-success/10 text-muted-foreground hover:text-success transition-colors"
                              title={t(`${ns}.convert`)}
                            >
                              <ArrowRightLeft className="w-4 h-4" />
                            </button>
                          )}
                          {/* Print */}
                          <button
                            onClick={() => printDoc(doc.id)}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title={t("print.print")}
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          {/* Delete — draft only */}
                          {doc.status === "draft" && canDelete && (
                            <button
                              onClick={() => setToDelete(doc)}
                              className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                              title={t("invoices.delete")}
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
          </div>
        )}
      </div>

      {/* InvoiceEditor */}
      {editorOpen && (
        <InvoiceEditor
          kind={kind}
          invoiceId={editId}
          isReturn={false}
          relatedSourceId={null}
          postableAccounts={postable}
          onClose={() => { setEditorOpen(false); setEditId(null); }}
          onSaved={(savedId) => {
            invalidate();
            if (savedId && !editId) {
              setEditorOpen(false);
              setViewId(savedId);
            } else {
              setEditorOpen(false);
            }
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
        />
      )}

      {/* Confirm Dialog */}
      <AlertDialog open={!!toConfirm} onOpenChange={(o) => !o && setToConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(`${ns}.confirmTitle`)}</AlertDialogTitle>
            <AlertDialogDescription>{t(`${ns}.confirmBody`)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={approveInvoice.isPending}>
              {approveInvoice.isPending ? t("common.saving") : t(`${ns}.confirm`)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revert Dialog */}
      <AlertDialog open={!!toRevert} onOpenChange={(o) => !o && setToRevert(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(`${ns}.revertTitle`)}</AlertDialogTitle>
            <AlertDialogDescription>{t(`${ns}.revertBody`)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevert} disabled={revertInvoice.isPending}>
              {revertInvoice.isPending ? t("common.saving") : t("common.back")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Convert Dialog */}
      <AlertDialog open={!!toConvert} onOpenChange={(o) => !o && setToConvert(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(`${ns}.convertTitle`)}</AlertDialogTitle>
            <AlertDialogDescription>{t(`${ns}.convertBody`)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConvert} disabled={convertInvoice.isPending}>
              {convertInvoice.isPending ? t("common.saving") : t(`${ns}.convert`)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(`${ns}.deleteTitle`)}</AlertDialogTitle>
            <AlertDialogDescription>{t(`${ns}.deleteBody`)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteInvoice.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteInvoice.isPending ? t("common.saving") : t("invoices.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
