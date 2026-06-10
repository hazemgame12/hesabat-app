import React from "react";
import { useTranslation } from "react-i18next";
import {
  useListInvoices,
  useListPayments,
  type InvoiceSummary,
} from "@workspace/api-client-react";
import { Spinner } from "@/components/ui/spinner";
import {
  X,
  Phone,
  Mail,
  MapPin,
  Building,
  Receipt,
  User,
  CreditCard,
  FileText,
  Wallet,
  Clock,
  RotateCcw,
  FileCheck,
  ArrowUpRight,
} from "lucide-react";

export type PartyViewParty = {
  id: string;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  type: "individual" | "company";
  taxNumber?: string | null;
  commercialRegistration?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  currency?: string | null;
  creditLimit?: number | null;
  creditPeriodDays?: number | null;
  controlAccountId: string;
  accountId: string;
  accountCode: string;
  balance: number;
  isActive: boolean;
};

type Kind = "sales" | "purchase";

export function PartyView({
  kind,
  party,
  onClose,
}: {
  kind: Kind;
  party: PartyViewParty;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const isSales = kind === "sales";

  const { data: invoices = [], isLoading: invLoading } = useListInvoices({
    kind: isSales ? "sales" : "purchase",
    ...(isSales ? { customerId: party.id } : { supplierId: party.id }),
  } as any);

  const paymentKind = isSales ? "collection" : "payment";
  const { data: paymentsAll = [], isLoading: payLoading } = useListPayments({
    kind: paymentKind,
  });

  // Filter payments for this party
  const payments = React.useMemo(() => {
    return paymentsAll.filter(
      (p: any) => p.customerId === party.id || p.supplierId === party.id,
    );
  }, [paymentsAll, party.id]);

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const isLoading = invLoading || payLoading;

  const summary = React.useMemo(() => {
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

  const statusBadge = (status: string) => {
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
        icon: <X className="w-3 h-3" />,
      },
    };
    const cfg = map[status] ?? map["draft"];
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${cfg.cls}`}>
        {cfg.icon}
        {t(`invoices.statuses.${status}`)}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      {/* Panel */}
      <div className="relative z-10 w-full max-w-3xl bg-background h-full overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-background/95 backdrop-blur border-b px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                {party.nameAr}
              </h2>
              <p className="text-sm text-muted-foreground">
                {isSales ? t("invoices.customer") : t("invoices.supplier")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner className="w-8 h-8 text-primary" />
            </div>
          ) : (
            <>
              {/* Contact Info Card */}
              <div className="bg-card border rounded-xl shadow-sm p-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="flex items-center gap-2">
                    <Building className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium">{t("customers.code")}</p>
                      <p className="text-sm font-bold font-sans tabular-nums" dir="ltr">{party.code}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium">{t("customers.taxNumber")}</p>
                      <p className="text-sm font-bold font-sans tabular-nums" dir="ltr">{party.taxNumber ?? "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium">{t("customers.commercialRegistration")}</p>
                      <p className="text-sm font-bold font-sans tabular-nums" dir="ltr">{party.commercialRegistration ?? "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium">{t("customers.phone")}</p>
                      <p className="text-sm font-bold" dir="ltr">{party.phone ?? "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium">{t("customers.email")}</p>
                      <p className="text-sm font-bold" dir="ltr">{party.email ?? "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium">{t("customers.address")}</p>
                      <p className="text-sm font-bold">{party.address ?? "—"}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium">{t("customers.account")}</p>
                      <p className="text-sm font-bold font-sans tabular-nums" dir="ltr">{party.accountCode}</p>
                    </div>
                  </div>
                  <div className="text-end">
                    <p className="text-[11px] text-muted-foreground font-medium">{t("customers.balance")}</p>
                    <p className="text-lg font-bold font-sans tabular-nums" dir="ltr">{fmt(party.balance)}</p>
                  </div>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-card border rounded-xl p-3 shadow-sm flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">{t("invoices.summary.totalAmount")}</p>
                    <p className="text-lg font-bold text-foreground font-sans tabular-nums" dir="ltr">{fmt(summary.totalAmount)}</p>
                  </div>
                </div>
                <div className="bg-card border rounded-xl p-3 shadow-sm flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center text-success">
                    <Wallet className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">{t("invoices.summary.totalPaid")}</p>
                    <p className="text-lg font-bold text-success font-sans tabular-nums" dir="ltr">{fmt(summary.totalPaid)}</p>
                  </div>
                </div>
                <div className="bg-card border rounded-xl p-3 shadow-sm flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">{t("invoices.summary.totalBalance")}</p>
                    <p className="text-lg font-bold text-amber-600 font-sans tabular-nums" dir="ltr">{fmt(summary.totalBalance)}</p>
                  </div>
                </div>
              </div>

              {/* Invoice History */}
              <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    {t("invoices.partyInvoices")}
                    <span className="text-xs text-muted-foreground font-medium">({invoices.length})</span>
                  </h3>
                </div>
                {invoices.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    {t("invoices.noInvoices")}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="text-[11px] font-bold text-muted-foreground bg-slate-50 border-b border-slate-200">
                          <th className="text-start px-3 py-2 w-32 border-b border-slate-200">{t("invoices.invoiceNo")}</th>
                          <th className="text-start px-3 py-2 w-28 border-b border-slate-200">{t("invoices.date")}</th>
                          <th className="text-end px-3 py-2 w-28 border-b border-slate-200">{t("invoices.total")}</th>
                          <th className="text-end px-3 py-2 w-28 border-b border-slate-200">{t("invoices.paid")}</th>
                          <th className="text-end px-3 py-2 w-28 border-b border-slate-200">{t("invoices.balance")}</th>
                          <th className="text-center px-3 py-2 w-32 border-b border-slate-200">{t("invoices.status")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.map((inv: InvoiceSummary) => (
                          <tr key={inv.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                            <td className="px-3 py-2.5 font-sans tabular-nums font-bold text-foreground" dir="ltr">
                              {inv.code ?? `#${inv.invoiceNo}`}
                            </td>
                            <td className="px-3 py-2.5 font-sans tabular-nums text-foreground/80" dir="ltr">
                              {inv.date}
                            </td>
                            <td className="px-3 py-2.5 text-end font-sans tabular-nums text-foreground/80" dir="ltr">
                              {fmt(inv.total)}
                            </td>
                            <td className="px-3 py-2.5 text-end font-sans tabular-nums text-success" dir="ltr">
                              {fmt(inv.amountPaid ?? 0)}
                            </td>
                            <td className="px-3 py-2.5 text-end font-bold font-sans tabular-nums text-foreground" dir="ltr">
                              {fmt(inv.balance)}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {statusBadge(inv.status)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Payment History */}
              <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-muted-foreground" />
                    {t("invoices.partyPayments")}
                    <span className="text-xs text-muted-foreground font-medium">({payments.length})</span>
                  </h3>
                </div>
                {payments.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    {t("invoices.noPayments")}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="text-[11px] font-bold text-muted-foreground bg-slate-50 border-b border-slate-200">
                          <th className="text-start px-3 py-2 w-32 border-b border-slate-200">{t("invoices.voucherNo")}</th>
                          <th className="text-start px-3 py-2 w-28 border-b border-slate-200">{t("invoices.date")}</th>
                          <th className="text-end px-3 py-2 w-28 border-b border-slate-200">{t("invoices.amount")}</th>
                          <th className="text-start px-3 py-2 w-32 border-b border-slate-200">{t("invoices.method")}</th>
                          <th className="text-start px-3 py-2 border-b border-slate-200">{t("invoices.cashAccount")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((pay: any) => (
                          <tr key={pay.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                            <td className="px-3 py-2.5 font-sans tabular-nums font-bold text-foreground" dir="ltr">
                              {pay.paymentNo}
                            </td>
                            <td className="px-3 py-2.5 font-sans tabular-nums text-foreground/80" dir="ltr">
                              {pay.date}
                            </td>
                            <td className="px-3 py-2.5 text-end font-bold font-sans tabular-nums text-success" dir="ltr">
                              {fmt(pay.amount)}
                            </td>
                            <td className="px-3 py-2.5 text-start text-foreground">
                              {t(`invoices.methods.${pay.method}`)}
                            </td>
                            <td className="px-3 py-2.5 text-start text-foreground">
                              {pay.cashAccountName ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
