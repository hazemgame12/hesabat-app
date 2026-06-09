import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useGetInvoice,
  useCreateInvoice,
  useUpdateInvoice,
  useListInvoices,
  useListCustomers,
  useListSuppliers,
  useListInventoryItems,
  useListTaxes,
  useListCostCenters,
  useListCurrencies,
  type Account,
  type InvoiceLineInput,
  type Tax,
  type InventoryItem,
} from "@workspace/api-client-react";
import { X, Plus, Trash2 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { displayName } from "./InvoiceWorkspace";

type Kind = "sales" | "purchase";
type LineType = "service" | "inventory" | "fixed_asset";

type LineDraft = {
  lineType: LineType;
  description: string;
  accountId: string;
  itemId: string;
  warehouse: string;
  cogsAccountId: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxId: string;
  costCenterId: string;
  assetNameAr: string;
  assetUsefulLifeMonths: string;
  assetSalvageValue: string;
  assetAccumulatedAccountId: string;
  assetExpenseAccountId: string;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyLine(): LineDraft {
  return {
    lineType: "service",
    description: "",
    accountId: "",
    itemId: "",
    warehouse: "",
    cogsAccountId: "",
    quantity: "1",
    unitPrice: "",
    discount: "0",
    taxId: "",
    costCenterId: "",
    assetNameAr: "",
    assetUsefulLifeMonths: "",
    assetSalvageValue: "",
    assetAccumulatedAccountId: "",
    assetExpenseAccountId: "",
  };
}

export function InvoiceEditor({
  kind,
  invoiceId,
  readOnly = false,
  isReturn = false,
  relatedSourceId = null,
  postableAccounts,
  onClose,
  onSaved,
}: {
  kind: Kind;
  invoiceId: string | null;
  readOnly?: boolean;
  isReturn?: boolean;
  relatedSourceId?: string | null;
  postableAccounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { toast } = useToast();

  const isEdit = !!invoiceId;
  const { data: detail, isLoading: detailLoading } = useGetInvoice(
    invoiceId ?? "",
    { query: { enabled: isEdit } as any },
  );

  const { data: customers = [] } = useListCustomers();
  const { data: suppliers = [] } = useListSuppliers();
  const { data: items = [] } = useListInventoryItems();
  const { data: taxes = [] } = useListTaxes();
  const { data: costCenters = [] } = useListCostCenters();
  const { data: currencies = [] } = useListCurrencies();

  const currencyOptions = useMemo(() => {
    const opts: { code: string; rate: string }[] = [{ code: "EGP", rate: "1" }];
    for (const c of currencies) {
      if (c.isActive && c.code !== "EGP") {
        opts.push({ code: c.code, rate: String(c.exchangeRate) });
      }
    }
    return opts;
  }, [currencies]);

  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();

  const parties = kind === "sales" ? customers : suppliers;

  // Return mode = credit note (sales_return) / debit note (purchase_return).
  // When editing, infer from the loaded document; when creating, from the prop.
  const detailIsReturn =
    detail?.kind === "sales_return" || detail?.kind === "purchase_return";
  const returnMode = isEdit ? detailIsReturn : isReturn;
  const returnKind: "sales_return" | "purchase_return" =
    kind === "sales" ? "sales_return" : "purchase_return";

  // Source invoices available to attach a note to: approved (non-draft,
  // non-cancelled) invoices of the same base kind. Only fetched in return mode.
  const { data: baseInvoices = [] } = useListInvoices(
    { kind },
    { query: { enabled: returnMode && !readOnly } as any },
  );
  const relatedOptions = useMemo(
    () =>
      baseInvoices.filter(
        (inv) => inv.status !== "draft" && inv.status !== "cancelled",
      ),
    [baseInvoices],
  );

  const [date, setDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [partyId, setPartyId] = useState("");
  const [relatedInvoiceId, setRelatedInvoiceId] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [notes, setNotes] = useState("");
  const [currency, setCurrency] = useState("EGP");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  // Preselect the source invoice when creating a note from an approved invoice.
  useEffect(() => {
    if (!isEdit && isReturn && relatedSourceId) {
      setRelatedInvoiceId(relatedSourceId);
    }
  }, [isEdit, isReturn, relatedSourceId]);

  // When the source invoice is chosen (create mode), lock party + currency to it.
  useEffect(() => {
    if (isEdit || !returnMode || !relatedInvoiceId) return;
    const src = baseInvoices.find((i) => i.id === relatedInvoiceId);
    if (src) {
      setPartyId(src.partyId ?? "");
      const cur = src.currency ?? "EGP";
      setCurrency(cur);
      const opt = currencyOptions.find((o) => o.code === cur);
      setExchangeRate(cur === "EGP" ? "1" : opt?.rate ?? "1");
    }
  }, [relatedInvoiceId, returnMode, isEdit, baseInvoices, currencyOptions]);

  useEffect(() => {
    if (detail) {
      setDate(detail.date);
      setDueDate(detail.dueDate ?? "");
      setPartyId(detail.partyId ?? "");
      setRelatedInvoiceId(detail.relatedInvoiceId ?? "");
      setCostCenterId(detail.costCenterId ?? "");
      setNotes(detail.notes ?? "");
      setCurrency(detail.currency ?? "EGP");
      setExchangeRate(
        detail.exchangeRate != null ? String(detail.exchangeRate) : "1",
      );
      setLines(
        detail.lines.map((l) => ({
          lineType: l.lineType,
          description: l.description ?? "",
          accountId: l.accountId,
          itemId: l.itemId ?? "",
          warehouse: l.warehouse ?? "",
          cogsAccountId: l.cogsAccountId ?? "",
          quantity: String(l.quantity),
          unitPrice: String(l.unitPrice),
          discount: String(l.discount),
          taxId: l.taxId ?? "",
          costCenterId: l.costCenterId ?? "",
          assetNameAr: l.assetNameAr ?? "",
          assetUsefulLifeMonths:
            l.assetUsefulLifeMonths != null ? String(l.assetUsefulLifeMonths) : "",
          assetSalvageValue:
            l.assetSalvageValue != null ? String(l.assetSalvageValue) : "",
          assetAccumulatedAccountId: l.assetAccumulatedAccountId ?? "",
          assetExpenseAccountId: l.assetExpenseAccountId ?? "",
        })),
      );
    }
  }, [detail]);

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const taxById = useMemo(() => {
    const m = new Map<string, Tax>();
    for (const tx of taxes) m.set(tx.id, tx);
    return m;
  }, [taxes]);
  const itemById = useMemo(() => {
    const m = new Map<string, InventoryItem>();
    for (const it of items) m.set(it.id, it);
    return m;
  }, [items]);

  const lineCalc = (l: LineDraft) => {
    const qty = Number(l.quantity) || 0;
    const price = Number(l.unitPrice) || 0;
    const disc = Number(l.discount) || 0;
    const net = Math.max(0, qty * price - disc);
    const tax = l.taxId ? taxById.get(l.taxId) : undefined;
    const taxAmount = tax ? (net * Number(tax.rate)) / 100 : 0;
    return { net, taxAmount, total: net + taxAmount };
  };

  const totals = useMemo(() => {
    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;
    for (const l of lines) {
      const qty = Number(l.quantity) || 0;
      const price = Number(l.unitPrice) || 0;
      const disc = Number(l.discount) || 0;
      subtotal += qty * price;
      discountTotal += disc;
      taxTotal += lineCalc(l).taxAmount;
    }
    return {
      subtotal,
      discountTotal,
      taxTotal,
      total: subtotal - discountTotal + taxTotal,
    };
  }, [lines, taxById]);

  const updateLine = (idx: number, patch: Partial<LineDraft>) => {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const onItemPicked = (idx: number, itemId: string) => {
    const it = itemById.get(itemId);
    const patch: Partial<LineDraft> = { itemId };
    if (it) {
      // Purchase inventory lines post to the item's inventory account (Dr stock),
      // so auto-fill it. Sales inventory lines credit a REVENUE account chosen by
      // the user (stock/COGS are handled server-side via the item), so leave it.
      if (kind === "purchase") patch.accountId = it.inventoryAccountId;
      if (!lines[idx]!.description) patch.description = displayName(it, lang);
      if (kind === "purchase" && !lines[idx]!.unitPrice) {
        patch.unitPrice = String(it.averageCost || "");
      }
    }
    updateLine(idx, patch);
  };

  const addLine = () => setLines((ls) => [...ls, emptyLine()]);
  const removeLine = (idx: number) =>
    setLines((ls) => (ls.length > 1 ? ls.filter((_, i) => i !== idx) : ls));

  const validate = (): string | null => {
    if (returnMode && !relatedInvoiceId)
      return t("invoices.returns.selectRelated");
    if (!partyId) return t(kind === "sales" ? "invoices.selectCustomer" : "invoices.selectSupplier");
    if (!date) return t("invoices.date");
    if (lines.length === 0) return t("invoices.toast.unbalanced");
    for (const l of lines) {
      if (!l.accountId) return t("invoices.selectAccount");
      if ((Number(l.quantity) || 0) <= 0) return t("invoices.quantity");
      if (l.lineType === "inventory" && !l.itemId)
        return t("invoices.selectItem");
      if (l.lineType === "fixed_asset" && !l.assetNameAr.trim())
        return t("invoices.assetName");
    }
    return null;
  };

  const buildPayload = () => {
    const payloadLines: InvoiceLineInput[] = lines.map((l) => ({
      lineType: l.lineType,
      description: l.description.trim() || null,
      accountId: l.accountId,
      itemId: l.lineType === "inventory" ? l.itemId || null : null,
      warehouse: l.lineType === "inventory" ? l.warehouse.trim() || null : null,
      cogsAccountId:
        l.lineType === "inventory" && kind === "sales"
          ? l.cogsAccountId || null
          : null,
      quantity: Number(l.quantity) || 0,
      unitPrice: Number(l.unitPrice) || 0,
      discount: Number(l.discount) || 0,
      taxId: l.taxId || null,
      costCenterId: l.costCenterId || null,
      assetNameAr:
        l.lineType === "fixed_asset" ? l.assetNameAr.trim() || null : null,
      assetUsefulLifeMonths:
        l.lineType === "fixed_asset" && l.assetUsefulLifeMonths
          ? Number(l.assetUsefulLifeMonths)
          : null,
      assetSalvageValue:
        l.lineType === "fixed_asset" && l.assetSalvageValue
          ? Number(l.assetSalvageValue)
          : null,
      assetAccumulatedAccountId:
        l.lineType === "fixed_asset" ? l.assetAccumulatedAccountId || null : null,
      assetExpenseAccountId:
        l.lineType === "fixed_asset" ? l.assetExpenseAccountId || null : null,
    }));
    return {
      kind: returnMode ? returnKind : kind,
      relatedInvoiceId: returnMode ? relatedInvoiceId || null : null,
      date,
      dueDate: dueDate || null,
      customerId: kind === "sales" ? partyId : null,
      supplierId: kind === "purchase" ? partyId : null,
      costCenterId: costCenterId || null,
      currency: currency || "EGP",
      exchangeRate: currency === "EGP" ? 1 : Number(exchangeRate) || 1,
      notes: notes.trim() || null,
      lines: payloadLines,
    };
  };

  const submit = () => {
    const err = validate();
    if (err) {
      toast({ variant: "destructive", title: t("common.error"), description: err });
      return;
    }
    const data = buildPayload();
    if (isEdit && invoiceId) {
      updateInvoice.mutate(
        { id: invoiceId, data },
        {
          onSuccess: () => {
            toast({ title: t("invoices.toast.updated") });
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
    } else {
      createInvoice.mutate(
        { data },
        {
          onSuccess: () => {
            toast({ title: t("invoices.toast.created") });
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
    }
  };

  const inputCls =
    "bg-background border rounded-lg h-10 px-3 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary w-full";
  const labelCls = "text-xs font-bold text-muted-foreground mb-1 block";
  const accountLabel = (a: Account) => `${a.code} · ${displayName(a, lang)}`;
  const saving = createInvoice.isPending || updateInvoice.isPending;
  const disabled = readOnly;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-foreground">
            {returnMode
              ? t(
                  returnKind === "sales_return"
                    ? "invoices.returns.creditNote"
                    : "invoices.returns.debitNote",
                )
              : readOnly
                ? t("invoices.invoiceDetails")
                : isEdit
                  ? t("invoices.edit")
                  : t("invoices.newInvoice")}
            {detail ? ` #${detail.invoiceNo}` : ""}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isEdit && detailLoading ? (
          <div className="flex items-center justify-center p-12">
            <Spinner className="w-8 h-8 text-primary" />
          </div>
        ) : (
          <div className="overflow-y-auto p-6 flex flex-col gap-5">
            {returnMode && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <label className={labelCls}>
                  {t("invoices.returns.relatedInvoice")}
                </label>
                <select
                  className={inputCls}
                  value={relatedInvoiceId}
                  disabled={disabled || isEdit}
                  onChange={(e) => setRelatedInvoiceId(e.target.value)}
                >
                  <option value="">
                    {t("invoices.returns.selectRelated")}
                  </option>
                  {detail?.relatedInvoiceId &&
                    !relatedOptions.some(
                      (o) => o.id === detail.relatedInvoiceId,
                    ) && (
                      <option value={detail.relatedInvoiceId}>
                        {detail.relatedCode ?? detail.relatedInvoiceId}
                      </option>
                    )}
                  {relatedOptions.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.code ?? `#${inv.invoiceNo}`} —{" "}
                      {inv.partyName ?? ""} ({fmt(Number(inv.total))})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-2">
                  {t("invoices.returns.serviceOnlyHint")}
                </p>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className={labelCls}>
                  {t(kind === "sales" ? "invoices.customer" : "invoices.supplier")}
                </label>
                <select
                  className={inputCls}
                  value={partyId}
                  disabled={disabled || returnMode}
                  onChange={(e) => setPartyId(e.target.value)}
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
                  disabled={disabled}
                  onChange={(e) => setDate(e.target.value)}
                  dir="ltr"
                />
              </div>
              <div>
                <label className={labelCls}>{t("invoices.dueDate")}</label>
                <input
                  type="date"
                  className={inputCls}
                  value={dueDate}
                  disabled={disabled}
                  onChange={(e) => setDueDate(e.target.value)}
                  dir="ltr"
                />
              </div>
              <div>
                <label className={labelCls}>{t("invoices.costCenter")}</label>
                <select
                  className={inputCls}
                  value={costCenterId}
                  disabled={disabled}
                  onChange={(e) => setCostCenterId(e.target.value)}
                >
                  <option value="">{t("invoices.none")}</option>
                  {costCenters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {displayName(c, lang)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{t("invoices.currency")}</label>
                <select
                  className={inputCls}
                  value={currency}
                  disabled={disabled || returnMode}
                  dir="ltr"
                  onChange={(e) => {
                    const code = e.target.value;
                    setCurrency(code);
                    const opt = currencyOptions.find((o) => o.code === code);
                    setExchangeRate(code === "EGP" ? "1" : opt?.rate ?? "1");
                  }}
                >
                  {currencyOptions.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.code}
                    </option>
                  ))}
                </select>
              </div>
              {currency !== "EGP" && (
                <div>
                  <label className={labelCls}>{t("invoices.exchangeRate")}</label>
                  <input
                    type="number"
                    className={inputCls}
                    value={exchangeRate}
                    disabled={disabled}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    dir="ltr"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-foreground">{t("invoices.lines")}</h3>
                {!disabled && (
                  <button
                    onClick={addLine}
                    className="flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"
                  >
                    <Plus className="w-4 h-4" />
                    {t("invoices.addLine")}
                  </button>
                )}
              </div>

              {lines.map((l, idx) => {
                const calc = lineCalc(l);
                return (
                  <div
                    key={idx}
                    className="border rounded-xl p-4 flex flex-col gap-3 bg-muted/20"
                  >
                    <div className="flex items-center gap-3">
                      <select
                        className={`${inputCls} max-w-[160px]`}
                        value={l.lineType}
                        disabled={disabled || returnMode}
                        onChange={(e) =>
                          updateLine(idx, { lineType: e.target.value as LineType })
                        }
                      >
                        {(returnMode
                          ? (["service"] as const)
                          : (["service", "inventory", "fixed_asset"] as const)
                        ).map((lt) => (
                          <option key={lt} value={lt}>
                            {t(`invoices.lineTypes.${lt}`)}
                          </option>
                        ))}
                      </select>
                      <input
                        className={inputCls}
                        placeholder={t("invoices.description")}
                        value={l.description}
                        disabled={disabled}
                        onChange={(e) =>
                          updateLine(idx, { description: e.target.value })
                        }
                      />
                      {!disabled && lines.length > 1 && (
                        <button
                          onClick={() => removeLine(idx)}
                          className="p-2 rounded-lg hover:bg-destructive/10 text-destructive shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {l.lineType === "inventory" && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className={labelCls}>{t("invoices.item")}</label>
                          <select
                            className={inputCls}
                            value={l.itemId}
                            disabled={disabled}
                            onChange={(e) => onItemPicked(idx, e.target.value)}
                          >
                            <option value="">{t("invoices.selectItem")}</option>
                            {items.map((it) => (
                              <option key={it.id} value={it.id}>
                                {it.code} · {displayName(it, lang)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={labelCls}>{t("invoices.warehouse")}</label>
                          <input
                            className={inputCls}
                            value={l.warehouse}
                            disabled={disabled}
                            onChange={(e) =>
                              updateLine(idx, { warehouse: e.target.value })
                            }
                          />
                        </div>
                        {kind === "sales" && (
                          <div>
                            <label className={labelCls}>{t("invoices.cogsAccount")}</label>
                            <select
                              className={inputCls}
                              value={l.cogsAccountId}
                              disabled={disabled}
                              onChange={(e) =>
                                updateLine(idx, { cogsAccountId: e.target.value })
                              }
                            >
                              <option value="">{t("invoices.selectAccount")}</option>
                              {postableAccounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {accountLabel(a)}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )}

                    {l.lineType === "fixed_asset" && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className={labelCls}>{t("invoices.assetName")}</label>
                          <input
                            className={inputCls}
                            value={l.assetNameAr}
                            disabled={disabled}
                            onChange={(e) =>
                              updateLine(idx, { assetNameAr: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <label className={labelCls}>{t("invoices.usefulLife")}</label>
                          <input
                            type="number"
                            className={inputCls}
                            value={l.assetUsefulLifeMonths}
                            disabled={disabled}
                            onChange={(e) =>
                              updateLine(idx, {
                                assetUsefulLifeMonths: e.target.value,
                              })
                            }
                            dir="ltr"
                          />
                        </div>
                        <div>
                          <label className={labelCls}>{t("invoices.salvageValue")}</label>
                          <input
                            type="number"
                            className={inputCls}
                            value={l.assetSalvageValue}
                            disabled={disabled}
                            onChange={(e) =>
                              updateLine(idx, { assetSalvageValue: e.target.value })
                            }
                            dir="ltr"
                          />
                        </div>
                        <div>
                          <label className={labelCls}>
                            {t("invoices.accumulatedAccount")}
                          </label>
                          <select
                            className={inputCls}
                            value={l.assetAccumulatedAccountId}
                            disabled={disabled}
                            onChange={(e) =>
                              updateLine(idx, {
                                assetAccumulatedAccountId: e.target.value,
                              })
                            }
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
                          <label className={labelCls}>{t("invoices.expenseAccount")}</label>
                          <select
                            className={inputCls}
                            value={l.assetExpenseAccountId}
                            disabled={disabled}
                            onChange={(e) =>
                              updateLine(idx, {
                                assetExpenseAccountId: e.target.value,
                              })
                            }
                          >
                            <option value="">{t("invoices.selectAccount")}</option>
                            {postableAccounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {accountLabel(a)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
                      {!(l.lineType === "inventory" && kind === "purchase") && (
                        <div className="col-span-2">
                          <label className={labelCls}>
                            {l.lineType === "inventory" && kind === "sales"
                              ? t("invoices.revenueAccount")
                              : t("invoices.account")}
                          </label>
                          <select
                            className={inputCls}
                            value={l.accountId}
                            disabled={disabled}
                            onChange={(e) =>
                              updateLine(idx, { accountId: e.target.value })
                            }
                          >
                            <option value="">{t("invoices.selectAccount")}</option>
                            {postableAccounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {accountLabel(a)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className={labelCls}>{t("invoices.quantity")}</label>
                        <input
                          type="number"
                          className={inputCls}
                          value={l.quantity}
                          disabled={disabled}
                          onChange={(e) =>
                            updateLine(idx, { quantity: e.target.value })
                          }
                          dir="ltr"
                        />
                      </div>
                      <div>
                        <label className={labelCls}>{t("invoices.unitPrice")}</label>
                        <input
                          type="number"
                          className={inputCls}
                          value={l.unitPrice}
                          disabled={disabled}
                          onChange={(e) =>
                            updateLine(idx, { unitPrice: e.target.value })
                          }
                          dir="ltr"
                        />
                      </div>
                      <div>
                        <label className={labelCls}>{t("invoices.discount")}</label>
                        <input
                          type="number"
                          className={inputCls}
                          value={l.discount}
                          disabled={disabled}
                          onChange={(e) =>
                            updateLine(idx, { discount: e.target.value })
                          }
                          dir="ltr"
                        />
                      </div>
                      <div>
                        <label className={labelCls}>{t("invoices.tax")}</label>
                        <select
                          className={inputCls}
                          value={l.taxId}
                          disabled={disabled}
                          onChange={(e) => updateLine(idx, { taxId: e.target.value })}
                        >
                          <option value="">{t("invoices.noTax")}</option>
                          {taxes
                            .filter((tx) => tx.isActive && tx.linkedAccountId)
                            .map((tx) => (
                              <option key={tx.id} value={tx.id}>
                                {displayName(tx, lang)} ({tx.rate}%)
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>

                    <div
                      className="text-end text-sm font-bold text-foreground font-sans tabular-nums"
                      dir="ltr"
                    >
                      {t("invoices.lineTotal")}: {fmt(calc.total)}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>{t("invoices.notes")}</label>
                <textarea
                  className={`${inputCls} h-24 py-2`}
                  value={notes}
                  disabled={disabled}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="bg-muted/30 rounded-xl p-4 flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("invoices.subtotal")}</span>
                  <span className="font-sans tabular-nums" dir="ltr">
                    {fmt(totals.subtotal)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("invoices.discountTotal")}</span>
                  <span className="font-sans tabular-nums text-destructive" dir="ltr">
                    {fmt(totals.discountTotal)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("invoices.taxTotal")}</span>
                  <span className="font-sans tabular-nums" dir="ltr">
                    {fmt(totals.taxTotal)}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-2 font-bold text-foreground">
                  <span>{t("invoices.grandTotal")}</span>
                  <span className="font-sans tabular-nums" dir="ltr">
                    {fmt(totals.total)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {!readOnly && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-full text-sm font-bold text-muted-foreground hover:bg-muted"
            >
              {t("invoices.cancel")}
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2 rounded-full text-sm font-bold hover:opacity-90 disabled:opacity-60"
            >
              {saving && <Spinner className="w-4 h-4" />}
              {t("invoices.save")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
