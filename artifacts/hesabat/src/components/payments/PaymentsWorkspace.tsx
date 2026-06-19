import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import {
  useListPayments,
  useDeletePayment,
  useListCustomers,
  useListSuppliers,
  type Payment,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Spinner } from "@/components/ui/spinner";
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
import {
  ChevronDown,
  ChevronRight,
  Printer,
  Trash2,
  Filter,
  X,
  Landmark,
  Link2Off,
} from "lucide-react";

type Props = {
  kind: "collection" | "payment";
};

const METHODS: Record<string, string> = {
  cash: "نقدي",
  bank: "بنكي",
  cheque: "شيك",
  card: "بطاقة",
};
const METHODS_EN: Record<string, string> = {
  cash: "Cash",
  bank: "Bank",
  cheque: "Cheque",
  card: "Card",
};

export function PaymentsWorkspace({ kind }: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [filterPartyId, setFilterPartyId] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterCurrency, setFilterCurrency] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Payment | null>(null);

  const params = useMemo(
    () => ({
      kind,
      ...(filterPartyId ? { partyId: filterPartyId } : {}),
      ...(filterDateFrom ? { dateFrom: filterDateFrom } : {}),
      ...(filterDateTo ? { dateTo: filterDateTo } : {}),
      ...(filterCurrency ? { currency: filterCurrency } : {}),
    }),
    [kind, filterPartyId, filterDateFrom, filterDateTo, filterCurrency],
  );

  const { data: payments = [], isLoading } = useListPayments(params);

  const { data: customers = [] } = useListCustomers();
  const { data: suppliers = [] } = useListSuppliers();

  const parties = kind === "collection" ? customers : suppliers;

  const deleteMut = useDeletePayment({
    mutation: {
      onSuccess: () => {
        toast({ description: t("paymentsWorkspace.deleteSuccess") });
        qc.invalidateQueries({ queryKey: ["listPayments"] });
        setToDelete(null);
      },
      onError: () => {
        toast({ variant: "destructive", description: t("paymentsWorkspace.deleteFail") });
      },
    },
  });

  const hasFilters = filterPartyId || filterDateFrom || filterDateTo || filterCurrency;

  const clearFilters = () => {
    setFilterPartyId("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterCurrency("");
  };

  const fmt = (n: number, cur?: string | null) =>
    n.toLocaleString(isAr ? "ar-EG" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + (cur ? ` ${cur}` : "");

  const totalAmount = useMemo(
    () => payments.reduce((s, p) => s + p.amount, 0),
    [payments],
  );

  const title = kind === "collection"
    ? t("paymentsWorkspace.collectionsTitle")
    : t("paymentsWorkspace.paymentsTitle");
  const subtitle = kind === "collection"
    ? t("paymentsWorkspace.collectionsSubtitle")
    : t("paymentsWorkspace.paymentsSubtitle");

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
            showFilters || hasFilters
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Filter className="w-4 h-4" />
          {t("paymentsWorkspace.clearFilters").replace("مسح ", "")}
          {hasFilters && (
            <span className="w-5 h-5 rounded-full bg-white/30 text-[11px] flex items-center justify-center font-bold">
              !
            </span>
          )}
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("paymentsWorkspace.filterParty")}
            </label>
            <select
              value={filterPartyId}
              onChange={(e) => setFilterPartyId(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">— {t("paymentsWorkspace.filterParty")} —</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nameAr}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("paymentsWorkspace.filterDateFrom")}
            </label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("paymentsWorkspace.filterDateTo")}
            </label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("paymentsWorkspace.filterCurrency")}
            </label>
            <input
              type="text"
              placeholder="EGP / USD"
              value={filterCurrency}
              onChange={(e) => setFilterCurrency(e.target.value.toUpperCase())}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary uppercase"
            />
          </div>
          {hasFilters && (
            <div className="col-span-2 sm:col-span-4 flex justify-end">
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-700"
              >
                <X className="w-3.5 h-3.5" />
                {t("paymentsWorkspace.clearFilters")}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-card rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        ) : payments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
            <p className="text-sm">{t("paymentsWorkspace.noPayments")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <th className="w-20 px-2 py-2.5" />
                  <th className="px-3 py-2.5 text-start">{t("paymentsWorkspace.paymentNo")}</th>
                  <th className="px-3 py-2.5 text-start">{t("paymentsWorkspace.date")}</th>
                  <th className="px-3 py-2.5 text-start">{t("paymentsWorkspace.party")}</th>
                  <th className="px-3 py-2.5 text-start">{t("paymentsWorkspace.method")}</th>
                  <th className="px-3 py-2.5 text-start">{t("paymentsWorkspace.account")}</th>
                  <th className="px-3 py-2.5 text-start">{t("paymentsWorkspace.linkedMovement")}</th>
                  <th className="px-3 py-2.5 text-end">{t("paymentsWorkspace.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <React.Fragment key={p.id}>
                    <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                      {/* Actions */}
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                            className="w-7 h-7 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200"
                            title={t("paymentsWorkspace.allocations")}
                          >
                            {expandedId === p.id
                              ? <ChevronDown className="w-3.5 h-3.5" />
                              : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => navigate(`/print/payment/${p.id}`)}
                            className="w-7 h-7 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200"
                            title={t("paymentsWorkspace.printVoucher")}
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setToDelete(p)}
                            className="w-7 h-7 rounded-md bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-100"
                            title={t("paymentsWorkspace.deleteConfirmTitle")}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      {/* No */}
                      <td className="px-3 py-2.5 font-bold text-primary tabular-nums" dir="ltr">
                        #{p.paymentNo}
                      </td>
                      {/* Date */}
                      <td className="px-3 py-2.5 text-muted-foreground tabular-nums" dir="ltr">
                        {p.date}
                      </td>
                      {/* Party */}
                      <td className="px-3 py-2.5 text-start font-medium text-foreground">
                        {p.partyName ?? "—"}
                      </td>
                      {/* Method */}
                      <td className="px-3 py-2.5 text-start text-muted-foreground">
                        {isAr ? METHODS[p.method] : METHODS_EN[p.method]}
                      </td>
                      {/* Account */}
                      <td className="px-3 py-2.5 text-start text-muted-foreground text-xs">
                        {p.cashAccountName ?? "—"}
                      </td>
                      {/* Bank movement */}
                      <td className="px-3 py-2.5">
                        {p.bankMovementId ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                            <Landmark className="w-3 h-3" />
                            {t("paymentsWorkspace.linkedToMovement")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                            <Link2Off className="w-3 h-3" />
                            {t("paymentsWorkspace.notLinked")}
                          </span>
                        )}
                      </td>
                      {/* Amount */}
                      <td className="px-3 py-2.5 text-end font-bold tabular-nums text-foreground" dir="ltr">
                        {fmt(p.amount, p.currency)}
                      </td>
                    </tr>

                    {/* Expanded allocations sub-row */}
                    {expandedId === p.id && (
                      <tr className="bg-primary/5 border-b border-primary/10">
                        <td colSpan={8} className="px-6 py-3">
                          <p className="text-[11px] font-bold text-primary mb-2 uppercase tracking-wide">
                            {t("paymentsWorkspace.allocations")}
                          </p>
                          {p.allocations.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              {t("paymentsWorkspace.unallocated")}
                            </p>
                          ) : (
                            <div className="flex flex-col gap-1">
                              {p.allocations.map((a) => (
                                <div
                                  key={a.id}
                                  className="flex items-center justify-between text-xs text-muted-foreground max-w-md"
                                >
                                  <span>
                                    {t("invoices.invoiceNo")} #{a.invoiceNo ?? "—"}
                                  </span>
                                  <span className="font-mono font-bold text-foreground" dir="ltr">
                                    {fmt(a.amount, p.currency)}
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
              {/* Footer total */}
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td colSpan={7} className="px-3 py-2.5 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {t("paymentsWorkspace.totalAmount")} ({payments.length})
                  </td>
                  <td className="px-3 py-2.5 text-end font-bold tabular-nums text-foreground" dir="ltr">
                    {fmt(totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("paymentsWorkspace.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("paymentsWorkspace.deleteConfirmMsg")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && deleteMut.mutate({ id: toDelete.id })}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
