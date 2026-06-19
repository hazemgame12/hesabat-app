import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useCreatePayment,
  useListCustomers,
  useListSuppliers,
  useListCurrencies,
  useGetOutstandingInvoices,
  useGetCompany,
  type Account,
} from "@workspace/api-client-react";
import { X, Wallet } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { displayName } from "./InvoiceWorkspace";

type Kind = "sales" | "purchase";

interface AdvancePayment {
  id: string;
  paymentNo: number;
  date: string;
  amount: number;
  currency: string | null;
  allocated: number;
  remaining: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PaymentModal({
  kind,
  postableAccounts,
  initialInvoiceId,
  onClose,
  onSaved,
}: {
  kind: Kind;
  postableAccounts: Account[];
  initialInvoiceId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const paymentKind = kind === "sales" ? "collection" : "payment";

  const { data: customers = [] } = useListCustomers();
  const { data: suppliers = [] } = useListSuppliers();
  const { data: currencies = [] } = useListCurrencies();
  const { data: outstanding = [] } = useGetOutstandingInvoices({ kind });
  const { data: company } = useGetCompany();
  const createPayment = useCreatePayment();

  const baseCurrency = (company?.baseCurrency ?? "EGP").toUpperCase();

  const parties = kind === "sales" ? customers : suppliers;

  const currencyOptions = useMemo(() => {
    const opts: { code: string; rate: string }[] = [{ code: baseCurrency, rate: "1" }];
    for (const c of currencies) {
      if (c.isActive && c.code.toUpperCase() !== baseCurrency) {
        opts.push({ code: c.code, rate: String(c.exchangeRate) });
      }
    }
    return opts;
  }, [currencies, baseCurrency]);

  const [activeTab, setActiveTab] = useState<"new" | "advance">("new");
  const [date, setDate] = useState(today());
  const [partyId, setPartyId] = useState("");
  const [method, setMethod] = useState<"cash" | "bank" | "cheque" | "card">("cash");
  const [cashAccountId, setCashAccountId] = useState("");
  const [currency, setCurrency] = useState(baseCurrency);
  const [exchangeRate, setExchangeRate] = useState("1");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [allocs, setAllocs] = useState<Record<string, string>>({});

  const [selectedAdvanceId, setSelectedAdvanceId] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");

  useEffect(() => {
    setCurrency((prev) => (prev === "EGP" || prev === baseCurrency ? baseCurrency : prev));
  }, [baseCurrency]);

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const partyInvoices = useMemo(() => {
    if (!partyId) return [];
    return outstanding.filter(
      (inv) =>
        inv.partyId === partyId &&
        (inv.currency ?? baseCurrency).toUpperCase() === currency.toUpperCase(),
    );
  }, [outstanding, partyId, currency, baseCurrency]);

  const partyCurrencies = useMemo(() => {
    if (!partyId) return [];
    return [
      ...new Set(
        outstanding
          .filter((inv) => inv.partyId === partyId)
          .map((inv) => (inv.currency ?? baseCurrency).toUpperCase()),
      ),
    ];
  }, [outstanding, partyId, baseCurrency]);

  const isForeign = currency.toUpperCase() !== baseCurrency;

  const prefillInvoice = useMemo(() => {
    if (!initialInvoiceId) return null;
    return outstanding.find((inv) => inv.id === initialInvoiceId);
  }, [initialInvoiceId, outstanding]);

  useEffect(() => {
    if (prefillInvoice) {
      setPartyId(prefillInvoice.partyId);
      const cur = prefillInvoice.currency ?? "EGP";
      setCurrency(cur);
      const opt = currencyOptions.find((o) => o.code.toUpperCase() === cur.toUpperCase());
      setExchangeRate(cur.toUpperCase() === baseCurrency ? "1" : opt ? opt.rate : "1");
      setAmount(String(prefillInvoice.balance));
      setAllocs({ [prefillInvoice.id]: String(prefillInvoice.balance) });
    }
  }, [prefillInvoice, currencyOptions]);

  const onSelectParty = (id: string) => {
    setPartyId(id);
    setAllocs({});
    setSelectedAdvanceId("");
    setAdvanceAmount("");
    const firstCur =
      (outstanding.find((inv) => inv.partyId === id)?.currency ?? baseCurrency).toUpperCase();
    setCurrency(firstCur);
    const opt = currencyOptions.find((o) => o.code.toUpperCase() === firstCur);
    setExchangeRate(firstCur === baseCurrency ? "1" : opt ? opt.rate : "1");
  };

  const onSelectCurrency = (code: string) => {
    const upper = code.toUpperCase();
    setCurrency(upper);
    setAllocs({});
    const opt = currencyOptions.find((o) => o.code.toUpperCase() === upper);
    setExchangeRate(upper === baseCurrency ? "1" : opt ? opt.rate : "1");
  };

  const allocSum = useMemo(
    () => Object.values(allocs).reduce((s, v) => s + (Number(v) || 0), 0),
    [allocs],
  );

  const partyParam =
    partyId
      ? kind === "sales"
        ? `customerId=${partyId}`
        : `supplierId=${partyId}`
      : null;

  const { data: advances = [] } = useQuery<AdvancePayment[]>({
    queryKey: ["payments", "unallocated", paymentKind, partyId],
    queryFn: async () => {
      if (!partyId || !partyParam) return [];
      const res = await fetch(
        `/api/payments/unallocated?kind=${paymentKind}&${partyParam}`,
        { credentials: "include" },
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!partyId,
  });

  const showAdvanceTab = !!initialInvoiceId && advances.length > 0;

  const applyAdvance = useMutation({
    mutationFn: async ({
      paymentId,
      invoiceId,
      applyAmount,
    }: {
      paymentId: string;
      invoiceId: string;
      applyAmount: number;
    }) => {
      const res = await fetch(`/api/payments/${paymentId}/allocations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ invoiceId, amount: applyAmount }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("invoices.toast.advanceApplied") });
      queryClient.invalidateQueries({ queryKey: ["payments", "unallocated"] });
      onSaved();
    },
    onError: (e: any) => {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: e?.message ?? t("invoices.toast.error"),
      });
    },
  });

  const accountLabel = (a: Account) => `${a.code} · ${displayName(a, lang)}`;
  const inputCls =
    "bg-background border rounded-lg h-10 px-3 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary w-full";
  const labelCls = "text-xs font-bold text-muted-foreground mb-1 block";

  const submitNew = () => {
    if (!partyId) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t(kind === "sales" ? "invoices.validations.selectCustomer" : "invoices.validations.selectSupplier"),
      });
      return;
    }
    if (!cashAccountId) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t("invoices.validations.selectCashAccount"),
      });
      return;
    }
    if (!(Number(amount) > 0)) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t("invoices.validations.enterAmount"),
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
        description: t("invoices.validations.allocationsExceedAmount"),
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
          currency: currency || "EGP",
          exchangeRate: isForeign ? Number(exchangeRate) || 1 : 1,
          notes: notes.trim() || null,
          allocations,
        },
      },
      {
        onSuccess: () => {
          toast({ title: t("invoices.toast.paymentCreated") });
          onSaved();
        },
        onError: (e: any) => {
          const msg =
            (typeof e?.data === "object" ? e?.data?.error : null) ??
            e?.message ??
            t("invoices.toast.error");
          toast({ variant: "destructive", title: t("common.error"), description: msg });
        },
      },
    );
  };

  const submitAdvance = () => {
    if (!selectedAdvanceId) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t("invoices.validations.selectAdvance"),
      });
      return;
    }
    if (!initialInvoiceId) return;
    const amt = Number(advanceAmount);
    if (!(amt > 0)) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t("invoices.validations.enterAmount"),
      });
      return;
    }
    const adv = advances.find((a) => a.id === selectedAdvanceId);
    if (adv && amt > adv.remaining + 0.005) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t("invoices.validations.advanceExceedsBalance"),
      });
      return;
    }
    applyAdvance.mutate({
      paymentId: selectedAdvanceId,
      invoiceId: initialInvoiceId,
      applyAmount: amt,
    });
  };

  const tabCls = (tab: "new" | "advance") =>
    `px-4 py-2 text-sm font-bold rounded-t-lg border-b-2 transition-colors ${
      activeTab === tab
        ? "border-primary text-primary"
        : "border-transparent text-muted-foreground hover:text-foreground"
    }`;

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

        {showAdvanceTab && (
          <div className="flex gap-1 px-6 pt-3 border-b">
            <button className={tabCls("new")} onClick={() => setActiveTab("new")}>
              {t("invoices.advances.newPaymentTab")}
            </button>
            <button
              className={tabCls("advance")}
              onClick={() => setActiveTab("advance")}
            >
              <span className="flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5" />
                {t("invoices.advances.applyTab")}
              </span>
            </button>
          </div>
        )}

        {activeTab === "new" ? (
          <>
            <div className="overflow-y-auto p-6 flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>
                    {t(kind === "sales" ? "invoices.customer" : "invoices.supplier")}
                  </label>
                  <select
                    className={inputCls}
                    value={partyId}
                    onChange={(e) => onSelectParty(e.target.value)}
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
                  <label className={labelCls}>{t("invoices.currency")}</label>
                  <select
                    className={inputCls}
                    value={currency}
                    onChange={(e) => onSelectCurrency(e.target.value)}
                  >
                    {(partyId && partyCurrencies.length > 0
                      ? currencyOptions.filter((o) => partyCurrencies.includes(o.code))
                      : currencyOptions
                    ).map((o) => (
                      <option key={o.code} value={o.code}>
                        {o.code}
                      </option>
                    ))}
                  </select>
                </div>
                {isForeign && (
                  <div>
                    <label className={labelCls}>{t("invoices.exchangeRate")}</label>
                    <input
                      type="number"
                      className={inputCls}
                      value={exchangeRate}
                      onChange={(e) => setExchangeRate(e.target.value)}
                      dir="ltr"
                      step="0.0001"
                    />
                  </div>
                )}
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
                  <label className={labelCls}>
                    {t("invoices.amount")}{" "}
                    <span className="font-sans text-primary">({currency})</span>
                  </label>
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
                    {t("invoices.allocations.title")}
                  </h3>
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
                          <th className="text-start px-4 py-2">{t("invoices.invoiceNo")}</th>
                          <th className="text-end px-3 py-2">
                            {t("invoices.balance")}{" "}
                            <span className="font-sans text-primary">({currency})</span>
                          </th>
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
                onClick={submitNew}
                disabled={createPayment.isPending}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2 rounded-full text-sm font-bold hover:opacity-90 disabled:opacity-60"
              >
                {createPayment.isPending && <Spinner className="w-4 h-4" />}
                {t("invoices.save")}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="overflow-y-auto p-6 flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                {t("invoices.advances.description")}
              </p>
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
                      <th className="text-start px-4 py-2 w-8"></th>
                      <th className="text-start px-3 py-2">{t("invoices.advances.paymentNo")}</th>
                      <th className="text-end px-3 py-2">{t("invoices.advances.remaining")}</th>
                      <th className="text-end px-4 py-2 w-36">{t("invoices.advances.amount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {advances.map((adv) => (
                      <tr
                        key={adv.id}
                        className={`border-t cursor-pointer ${
                          selectedAdvanceId === adv.id ? "bg-primary/5" : "hover:bg-muted/30"
                        }`}
                        onClick={() => {
                          setSelectedAdvanceId(adv.id);
                          setAdvanceAmount(String(Math.min(adv.remaining, prefillInvoice?.balance ?? adv.remaining)));
                        }}
                      >
                        <td className="px-4 py-2">
                          <input
                            type="radio"
                            checked={selectedAdvanceId === adv.id}
                            onChange={() => {
                              setSelectedAdvanceId(adv.id);
                              setAdvanceAmount(String(Math.min(adv.remaining, prefillInvoice?.balance ?? adv.remaining)));
                            }}
                            className="accent-primary"
                          />
                        </td>
                        <td className="px-3 py-2 font-sans tabular-nums" dir="ltr">
                          #{adv.paymentNo}{" "}
                          <span className="text-muted-foreground text-xs ms-1">{adv.date}</span>
                        </td>
                        <td className="px-3 py-2 text-end font-sans tabular-nums text-success" dir="ltr">
                          {fmt(adv.remaining)}{" "}
                          <span className="text-xs text-muted-foreground">{adv.currency ?? baseCurrency}</span>
                        </td>
                        <td className="px-4 py-2">
                          {selectedAdvanceId === adv.id && (
                            <input
                              type="number"
                              className={`${inputCls} h-8`}
                              value={advanceAmount}
                              onChange={(e) => setAdvanceAmount(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              dir="ltr"
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-full text-sm font-bold text-muted-foreground hover:bg-muted"
              >
                {t("invoices.cancel")}
              </button>
              <button
                onClick={submitAdvance}
                disabled={applyAdvance.isPending || !selectedAdvanceId}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2 rounded-full text-sm font-bold hover:opacity-90 disabled:opacity-60"
              >
                {applyAdvance.isPending && <Spinner className="w-4 h-4" />}
                {t("invoices.advances.apply")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
