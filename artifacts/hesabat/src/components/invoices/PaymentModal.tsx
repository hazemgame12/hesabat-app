import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useCreatePayment,
  useListCustomers,
  useListSuppliers,
  useGetOutstandingInvoices,
  type Account,
} from "@workspace/api-client-react";
import { X } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { displayName } from "./InvoiceWorkspace";

type Kind = "sales" | "purchase";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PaymentModal({
  kind,
  postableAccounts,
  onClose,
  onSaved,
}: {
  kind: Kind;
  postableAccounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { toast } = useToast();

  const paymentKind = kind === "sales" ? "collection" : "payment";

  const { data: customers = [] } = useListCustomers();
  const { data: suppliers = [] } = useListSuppliers();
  const { data: outstanding = [] } = useGetOutstandingInvoices({ kind });
  const createPayment = useCreatePayment();

  const parties = kind === "sales" ? customers : suppliers;

  const [date, setDate] = useState(today());
  const [partyId, setPartyId] = useState("");
  const [method, setMethod] = useState<"cash" | "bank" | "cheque" | "card">("cash");
  const [cashAccountId, setCashAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [allocs, setAllocs] = useState<Record<string, string>>({});

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  // Filter outstanding invoices to those of the selected party (by stable id,
  // never by localized display name).
  const partyInvoices = useMemo(() => {
    if (!partyId) return [];
    return outstanding.filter((inv) => inv.partyId === partyId);
  }, [outstanding, partyId]);

  const allocSum = useMemo(
    () =>
      Object.values(allocs).reduce((s, v) => s + (Number(v) || 0), 0),
    [allocs],
  );

  const accountLabel = (a: Account) => `${a.code} · ${displayName(a, lang)}`;
  const inputCls =
    "bg-background border rounded-lg h-10 px-3 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary w-full";
  const labelCls = "text-xs font-bold text-muted-foreground mb-1 block";

  const submit = () => {
    if (!partyId || !cashAccountId || !(Number(amount) > 0)) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t("invoices.toast.error"),
      });
      return;
    }
    const allocations = Object.entries(allocs)
      .filter(([, v]) => Number(v) > 0)
      .map(([invoiceId, v]) => ({ invoiceId, amount: Number(v) }));
    if (allocSum > Number(amount) + 0.005) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t("invoices.unallocated"),
      });
      return;
    }
    createPayment.mutate(
      {
        data: {
          kind: paymentKind,
          date,
          customerId: kind === "sales" ? partyId : null,
          supplierId: kind === "purchase" ? partyId : null,
          method,
          cashAccountId,
          amount: Number(amount),
          notes: notes.trim() || null,
          allocations,
        },
      },
      {
        onSuccess: () => {
          toast({ title: t("invoices.toast.paymentCreated") });
          onSaved();
        },
        onError: (e: any) =>
          toast({
            variant: "destructive",
            title: t("common.error"),
            description: e?.data?.error || t("invoices.toast.error"),
          }),
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-foreground">
            {t(kind === "sales" ? "invoices.newCollection" : "invoices.newPaymentOut")}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>
                {t(kind === "sales" ? "invoices.customer" : "invoices.supplier")}
              </label>
              <select
                className={inputCls}
                value={partyId}
                onChange={(e) => {
                  setPartyId(e.target.value);
                  setAllocs({});
                }}
              >
                <option value="">
                  {t(kind === "sales" ? "invoices.selectCustomer" : "invoices.selectSupplier")}
                </option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {displayName(p, lang)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("invoices.date")}</label>
              <input
                type="date"
                className={inputCls}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                dir="ltr"
              />
            </div>
            <div>
              <label className={labelCls}>{t("invoices.method")}</label>
              <select
                className={inputCls}
                value={method}
                onChange={(e) => setMethod(e.target.value as typeof method)}
              >
                {(["cash", "bank", "cheque", "card"] as const).map((m) => (
                  <option key={m} value={m}>
                    {t(`invoices.methods.${m}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("invoices.cashAccount")}</label>
              <select
                className={inputCls}
                value={cashAccountId}
                onChange={(e) => setCashAccountId(e.target.value)}
              >
                <option value="">{t("invoices.selectAccount")}</option>
                {postableAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {accountLabel(a)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("invoices.amount")}</label>
              <input
                type="number"
                className={inputCls}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                dir="ltr"
              />
            </div>
            <div>
              <label className={labelCls}>{t("invoices.notes")}</label>
              <input
                className={inputCls}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {partyId && partyInvoices.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="font-bold text-foreground text-sm">
                {t("invoices.allocations")}
              </h3>
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
                      <th className="text-start px-4 py-2">{t("invoices.invoiceNo")}</th>
                      <th className="text-end px-3 py-2">{t("invoices.balance")}</th>
                      <th className="text-end px-4 py-2 w-36">{t("invoices.allocate")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partyInvoices.map((inv) => (
                      <tr key={inv.id} className="border-t">
                        <td className="px-4 py-2 font-sans tabular-nums" dir="ltr">
                          #{inv.invoiceNo}
                        </td>
                        <td className="px-3 py-2 text-end font-sans tabular-nums" dir="ltr">
                          {fmt(inv.balance)}
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            className={`${inputCls} h-8`}
                            value={allocs[inv.id] ?? ""}
                            onChange={(e) =>
                              setAllocs((a) => ({ ...a, [inv.id]: e.target.value }))
                            }
                            dir="ltr"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-end text-sm text-muted-foreground" dir="ltr">
                {t("invoices.unallocated")}:{" "}
                {fmt(Math.max(0, (Number(amount) || 0) - allocSum))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full text-sm font-bold text-muted-foreground hover:bg-muted"
          >
            {t("invoices.cancel")}
          </button>
          <button
            onClick={submit}
            disabled={createPayment.isPending}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2 rounded-full text-sm font-bold hover:opacity-90 disabled:opacity-60"
          >
            {createPayment.isPending && <Spinner className="w-4 h-4" />}
            {t("invoices.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
