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
  useListProjects,
  useListBranches,
  useListCurrencies,
  useGetCompany,
  type Account,
  type InvoiceLineInput,
  type Tax,
  type InventoryItem,
} from "@workspace/api-client-react";
import { X, Plus, Trash2, ChevronDown, ChevronRight, ClipboardPaste } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { displayName } from "./InvoiceWorkspace";
import { InvoicePaymentAllocations } from "./InvoicePaymentAllocations";
import { DocumentsSection } from "@/components/documents/DocumentsSection";

type Kind = "sales" | "purchase" | "quotation" | "purchase_order";
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
  whtTaxId: string;
  costCenterId: string;
  projectId: string;
  branchId: string;
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
    whtTaxId: "",
    costCenterId: "",
    projectId: "",
    branchId: "",
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
  onEdit,
  onAllocated,
}: {
  kind: Kind;
  invoiceId: string | null;
  readOnly?: boolean;
  isReturn?: boolean;
  relatedSourceId?: string | null;
  postableAccounts: Account[];
  onClose: () => void;
  onSaved: (savedId?: string) => void;
  onEdit?: () => void;
  onAllocated?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { toast } = useToast();

  const isEdit = !!invoiceId;
  const { data: detail, isLoading: detailLoading } = useGetInvoice(
    invoiceId ?? "",
    { query: { enabled: isEdit } as any },
  );

  const { data: company } = useGetCompany();
  const baseCurrency = company?.baseCurrency ?? "EGP";
  const { data: customers = [] } = useListCustomers();
  const { data: suppliers = [] } = useListSuppliers();
  const { data: items = [] } = useListInventoryItems();
  const { data: taxes = [] } = useListTaxes();
  const { data: costCenters = [] } = useListCostCenters();
  const { data: projects = [] } = useListProjects();
  const { data: branches = [] } = useListBranches();
  const { data: currencies = [] } = useListCurrencies();

  const currencyOptions = useMemo(() => {
    const opts: { code: string; rate: string }[] = [{ code: baseCurrency, rate: "1" }];
    for (const c of currencies) {
      if (c.isActive && c.code !== baseCurrency) {
        opts.push({ code: c.code, rate: String(c.exchangeRate) });
      }
    }
    return opts;
  }, [currencies, baseCurrency]);

  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();

  const isSalesSide = kind === "sales" || kind === "quotation";
  const parties = isSalesSide ? customers : suppliers;

  // Return mode = credit note (sales_return) / debit note (purchase_return).
  // When editing, infer from the loaded document; when creating, from the prop.
  const detailIsReturn =
    detail?.kind === "sales_return" || detail?.kind === "purchase_return";
  const returnMode = isEdit ? detailIsReturn : isReturn;
  const returnKind: "sales_return" | "purchase_return" =
    isSalesSide ? "sales_return" : "purchase_return";

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
  const [projectId, setProjectId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [notes, setNotes] = useState("");
  const [currency, setCurrency] = useState(baseCurrency);
  const [exchangeRate, setExchangeRate] = useState("1");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [expandedLines, setExpandedLines] = useState<Set<number>>(new Set());

  const toggleExpand = (idx: number) => {
    setExpandedLines((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // The initial useState above uses the "EGP" fallback because company data
  // hasn't loaded yet. Once company loads and baseCurrency is known (e.g. AED),
  // reset the default currency for NEW invoices so the rate defaults to 1 and
  // the user consciously picks a foreign currency (which auto-fills the correct
  // rate). Without this, an EGP invoice created on an AED-base company would
  // store exchangeRate = 1 instead of 0.07, inflating every amount by ~14×.
  useEffect(() => {
    if (isEdit || !company) return;
    setCurrency((prev) => {
      if (prev === "EGP" && baseCurrency !== "EGP") {
        // Was initialized at the "EGP" fallback; reset to the true base.
        setExchangeRate("1");
        return baseCurrency;
      }
      // If the user already picked a non-EGP currency before company loaded,
      // look up and apply the correct market rate now.
      if (prev !== baseCurrency && prev !== "EGP") {
        const opt = currencyOptions.find((o) => o.code === prev);
        if (opt) setExchangeRate(opt.rate);
      }
      return prev;
    });
  }, [baseCurrency, isEdit, company, currencyOptions]);

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
      const cur = src.currency ?? baseCurrency;
      setCurrency(cur);
      const opt = currencyOptions.find((o) => o.code === cur);
      setExchangeRate(cur === baseCurrency ? "1" : opt?.rate ?? "1");
    }
  }, [relatedInvoiceId, returnMode, isEdit, baseInvoices, currencyOptions]);

  useEffect(() => {
    if (detail) {
      setDate(detail.date);
      setDueDate(detail.dueDate ?? "");
      setPartyId(detail.partyId ?? "");
      setRelatedInvoiceId(detail.relatedInvoiceId ?? "");
      setCostCenterId(detail.costCenterId ?? "");
      setProjectId(detail.projectId ?? "");
      setBranchId(detail.branchId ?? "");
      setNotes(detail.notes ?? "");
      setCurrency(detail.currency ?? baseCurrency);
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
          whtTaxId: l.whtTaxId ?? "",
          costCenterId: l.costCenterId ?? "",
          projectId: l.projectId ?? "",
          branchId: l.branchId ?? "",
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

  const vatTaxes = useMemo(
    () => taxes.filter((tx) => tx.isActive && tx.linkedAccountId && tx.kind !== "wht" && tx.kind !== "income" && tx.kind !== "payroll"),
    [taxes],
  );
  const whtTaxes = useMemo(
    () => taxes.filter((tx) => tx.isActive && tx.kind === "wht"),
    [taxes],
  );

  const lineCalc = (l: LineDraft) => {
    const qty = Number(l.quantity) || 0;
    const price = Number(l.unitPrice) || 0;
    const disc = Number(l.discount) || 0;
    const net = Math.max(0, qty * price - disc);
    const tax = l.taxId ? taxById.get(l.taxId) : undefined;
    const taxAmount = tax ? (net * Number(tax.rate)) / 100 : 0;
    const whtTax = l.whtTaxId ? taxById.get(l.whtTaxId) : undefined;
    const whtAmount = whtTax ? (net * Number(whtTax.rate)) / 100 : 0;
    return { net, taxAmount, whtAmount, total: net + taxAmount - whtAmount };
  };

  const totals = useMemo(() => {
    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;
    let whtTotal = 0;
    for (const l of lines) {
      const qty = Number(l.quantity) || 0;
      const price = Number(l.unitPrice) || 0;
      const disc = Number(l.discount) || 0;
      subtotal += qty * price;
      discountTotal += disc;
      const calc = lineCalc(l);
      taxTotal += calc.taxAmount;
      whtTotal += calc.whtAmount;
    }
    return {
      subtotal,
      discountTotal,
      taxTotal,
      whtTotal,
      total: subtotal - discountTotal + taxTotal - whtTotal,
    };
  }, [lines, taxById]);

  const updateLine = (idx: number, patch: Partial<LineDraft>) => {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
    if (patch.lineType && patch.lineType !== "service") {
      setExpandedLines((prev) => new Set([...prev, idx]));
    }
  };

  const onItemPicked = (idx: number, itemId: string) => {
    const it = itemById.get(itemId);
    const patch: Partial<LineDraft> = { itemId };
    if (it) {
      // Purchase inventory lines post to the item's inventory account (Dr stock),
      // so auto-fill it. Sales inventory lines credit a REVENUE account chosen by
      // the user (stock/COGS are handled server-side via the item), so leave it.
      if (!isSalesSide) patch.accountId = it.inventoryAccountId;
      if (!lines[idx]!.description) patch.description = displayName(it, lang);
      if (!isSalesSide && !lines[idx]!.unitPrice) {
        patch.unitPrice = String(it.averageCost || "");
      }
    }
    updateLine(idx, patch);
  };

  const addLine = () => setLines((ls) => [...ls, emptyLine()]);
  const removeLine = (idx: number) => {
    setLines((ls) => (ls.length > 1 ? ls.filter((_, i) => i !== idx) : ls));
    setExpandedLines((prev) => {
      const next = new Set<number>();
      prev.forEach((n) => { if (n < idx) next.add(n); else if (n > idx) next.add(n - 1); });
      return next;
    });
  };

  const parsePastedLines = (text: string): LineDraft[] =>
    text
      .trim()
      .split(/\r?\n/)
      .map((row) => {
        const cols = row.split("\t");
        const description = cols[0]?.trim() ?? "";
        const quantity = cols[1]?.replace(/,/g, "").trim() || "1";
        const unitPrice = cols[2]?.replace(/,/g, "").trim() || "";
        const discount = cols[3]?.replace(/,/g, "").trim() || "0";
        return { ...emptyLine(), description, quantity, unitPrice, discount };
      })
      .filter((l) => l.description || l.unitPrice);

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const newLines = parsePastedLines(text);
      if (newLines.length === 0) return;
      setLines((prev) => {
        const hasOnlyEmpty =
          prev.length === 1 && !prev[0]!.description && !prev[0]!.unitPrice;
        return hasOnlyEmpty ? newLines : [...prev, ...newLines];
      });
      toast({ title: t("invoices.pastedRows", { count: newLines.length }) });
    } catch {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t("invoices.clipboardError"),
      });
    }
  };

  const validate = (): string | null => {
    if (returnMode && !relatedInvoiceId)
      return t("invoices.returns.selectRelated");
    if (!partyId) return t(isSalesSide ? "invoices.selectCustomer" : "invoices.selectSupplier");
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
        l.lineType === "inventory" && isSalesSide
          ? l.cogsAccountId || null
          : null,
      quantity: Number(l.quantity) || 0,
      unitPrice: Number(l.unitPrice) || 0,
      discount: Number(l.discount) || 0,
      taxId: l.taxId || null,
      whtTaxId: l.whtTaxId || null,
      costCenterId: l.costCenterId || null,
      projectId: l.projectId || null,
      branchId: l.branchId || null,
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
      customerId: isSalesSide ? partyId : null,
      supplierId: !isSalesSide ? partyId : null,
      costCenterId: costCenterId || null,
      projectId: projectId || null,
      branchId: branchId || null,
      currency: currency || baseCurrency,
      exchangeRate: currency === baseCurrency ? 1 : Number(exchangeRate) || 1,
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
          onSuccess: (created) => {
            toast({ title: t("invoices.toast.created") });
            onSaved((created as any)?.id);
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
                  {t(isSalesSide ? "invoices.customer" : "invoices.supplier")}
                </label>
                <select
                  className={inputCls}
                  value={partyId}
                  disabled={disabled || returnMode}
                  onChange={(e) => setPartyId(e.target.value)}
                >
                  <option value="">
                    {t(isSalesSide ? "invoices.selectCustomer" : "invoices.selectSupplier")}
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
                <label className={labelCls}>{t("dimensions.project")}</label>
                <select
                  className={inputCls}
                  value={projectId}
                  disabled={disabled}
                  onChange={(e) => setProjectId(e.target.value)}
                >
                  <option value="">{t("invoices.none")}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {displayName(p, lang)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{t("dimensions.branch")}</label>
                <select
                  className={inputCls}
                  value={branchId}
                  disabled={disabled}
                  onChange={(e) => setBranchId(e.target.value)}
                >
                  <option value="">{t("invoices.none")}</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {displayName(b, lang)}
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
                    setExchangeRate(code === baseCurrency ? "1" : opt?.rate ?? "1");
                  }}
                >
                  {currencyOptions.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.code}
                    </option>
                  ))}
                </select>
              </div>
              {currency !== baseCurrency && (
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
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={pasteFromClipboard}
                      title={t("invoices.pasteExcelHint")}
                      className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
                    >
                      <ClipboardPaste className="w-4 h-4" />
                      {t("invoices.pasteExcel")}
                    </button>
                    <button
                      type="button"
                      onClick={addLine}
                      className="flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"
                    >
                      <Plus className="w-4 h-4" />
                      {t("invoices.addLine")}
                    </button>
                  </div>
                )}
              </div>

              {/* ── Inline Excel-like table ── */}
              <div className="border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[1020px] border-collapse">
                    <thead>
                      <tr className="bg-muted/50 text-[11px] font-bold text-muted-foreground border-b">
                        <th className="px-2 py-2 w-8 text-center">#</th>
                        <th className="px-2 py-2 w-28 text-start">{t("invoices.lineType")}</th>
                        <th className="px-2 py-2 text-start">{t("invoices.description")}</th>
                        <th className="px-2 py-2 w-44 text-start">{t("invoices.account")}</th>
                        <th className="px-2 py-2 w-20 text-end">{t("invoices.quantity")}</th>
                        <th className="px-2 py-2 w-24 text-end">{t("invoices.unitPrice")}</th>
                        <th className="px-2 py-2 w-20 text-end">{t("invoices.discount")}</th>
                        <th className="px-2 py-2 w-28 text-start">{t("invoices.tax")}</th>
                        <th className="px-2 py-2 w-28 text-start">{t("invoices.whtTax")}</th>
                        <th className="px-2 py-2 w-28 text-start">{t("invoices.costCenter")}</th>
                        <th className="px-2 py-2 w-24 text-end">{t("invoices.lineTotal")}</th>
                        {!disabled && <th className="w-8" />}
                      </tr>
                    </thead>
                    <tbody>
              {lines.map((l, idx) => {
                const calc = lineCalc(l);
                const isExpanded = expandedLines.has(idx);
                const needsExpand = l.lineType !== "service";
                return (
                  <React.Fragment key={idx}>
                    {/* ── main row ── */}
                    <tr className={`border-b last:border-b-0 hover:bg-muted/20 group${needsExpand && isExpanded ? " bg-primary/5" : ""}`}>
                      {/* # / expand toggle */}
                      <td className="px-2 py-1 text-center text-muted-foreground text-xs">
                        {needsExpand ? (
                          <button
                            type="button"
                            onClick={() => toggleExpand(idx)}
                            className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted mx-auto"
                          >
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </button>
                        ) : (
                          <span className="select-none">{idx + 1}</span>
                        )}
                      </td>
                      {/* Line type */}
                      <td className="px-1 py-1">
                        <select
                          className="bg-transparent w-full h-8 px-1 text-xs focus:outline-none focus:bg-background focus:ring-1 focus:ring-primary/30 rounded-md disabled:opacity-60"
                          value={l.lineType}
                          disabled={disabled || returnMode}
                          onChange={(e) => updateLine(idx, { lineType: e.target.value as LineType })}
                        >
                          {(returnMode ? (["service"] as const) : (["service", "inventory", "fixed_asset"] as const)).map((lt) => (
                            <option key={lt} value={lt}>{t(`invoices.lineTypes.${lt}`)}</option>
                          ))}
                        </select>
                      </td>
                      {/* Description */}
                      <td className="px-1 py-1">
                        <input
                          className="bg-transparent w-full h-8 px-2 text-sm focus:outline-none focus:bg-background focus:ring-1 focus:ring-primary/30 rounded-md disabled:opacity-60"
                          placeholder={t("invoices.description")}
                          value={l.description}
                          disabled={disabled}
                          onChange={(e) => updateLine(idx, { description: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && idx === lines.length - 1) {
                              e.preventDefault();
                              addLine();
                            }
                          }}
                        />
                      </td>
                      {/* Account */}
                      <td className="px-1 py-1">
                        {l.lineType === "inventory" && !isSalesSide ? (
                          <span className="text-xs text-muted-foreground px-2 italic">{t("invoices.autoFromItem")}</span>
                        ) : (
                          <select
                            className="bg-transparent w-full h-8 px-1 text-xs focus:outline-none focus:bg-background focus:ring-1 focus:ring-primary/30 rounded-md disabled:opacity-60"
                            value={l.accountId}
                            disabled={disabled}
                            onChange={(e) => updateLine(idx, { accountId: e.target.value })}
                          >
                            <option value="">{t("invoices.selectAccount")}</option>
                            {postableAccounts.map((a) => (
                              <option key={a.id} value={a.id}>{accountLabel(a)}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      {/* Quantity */}
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          className="bg-transparent w-full h-8 px-2 text-sm text-end font-sans tabular-nums focus:outline-none focus:bg-background focus:ring-1 focus:ring-primary/30 rounded-md disabled:opacity-60"
                          value={l.quantity}
                          disabled={disabled}
                          onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                          dir="ltr"
                        />
                      </td>
                      {/* Unit price */}
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          className="bg-transparent w-full h-8 px-2 text-sm text-end font-sans tabular-nums focus:outline-none focus:bg-background focus:ring-1 focus:ring-primary/30 rounded-md disabled:opacity-60"
                          value={l.unitPrice}
                          disabled={disabled}
                          onChange={(e) => updateLine(idx, { unitPrice: e.target.value })}
                          dir="ltr"
                        />
                      </td>
                      {/* Discount */}
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          className="bg-transparent w-full h-8 px-2 text-sm text-end font-sans tabular-nums focus:outline-none focus:bg-background focus:ring-1 focus:ring-primary/30 rounded-md disabled:opacity-60"
                          value={l.discount}
                          disabled={disabled}
                          onChange={(e) => updateLine(idx, { discount: e.target.value })}
                          dir="ltr"
                        />
                      </td>
                      {/* Tax (VAT / Zakat only) */}
                      <td className="px-1 py-1">
                        <select
                          className="bg-transparent w-full h-8 px-1 text-xs focus:outline-none focus:bg-background focus:ring-1 focus:ring-primary/30 rounded-md disabled:opacity-60"
                          value={l.taxId}
                          disabled={disabled}
                          onChange={(e) => updateLine(idx, { taxId: e.target.value })}
                        >
                          <option value="">{t("invoices.noTax")}</option>
                          {vatTaxes.map((tx) => (
                            <option key={tx.id} value={tx.id}>{displayName(tx, lang)} ({tx.rate}%)</option>
                          ))}
                        </select>
                      </td>
                      {/* WHT */}
                      <td className="px-1 py-1">
                        <select
                          className="bg-transparent w-full h-8 px-1 text-xs focus:outline-none focus:bg-background focus:ring-1 focus:ring-primary/30 rounded-md disabled:opacity-60"
                          value={l.whtTaxId}
                          disabled={disabled}
                          onChange={(e) => updateLine(idx, { whtTaxId: e.target.value })}
                        >
                          <option value="">{t("invoices.noTax")}</option>
                          {whtTaxes.map((tx) => (
                            <option key={tx.id} value={tx.id}>{displayName(tx, lang)} ({tx.rate}%)</option>
                          ))}
                        </select>
                      </td>
                      {/* Cost Center */}
                      <td className="px-1 py-1">
                        <select
                          className="bg-transparent w-full h-8 px-1 text-xs focus:outline-none focus:bg-background focus:ring-1 focus:ring-primary/30 rounded-md disabled:opacity-60"
                          value={l.costCenterId}
                          disabled={disabled}
                          onChange={(e) => updateLine(idx, { costCenterId: e.target.value })}
                        >
                          <option value="">{t("invoices.none")}</option>
                          {costCenters.map((cc) => (
                            <option key={cc.id} value={cc.id}>{displayName(cc, lang)}</option>
                          ))}
                        </select>
                      </td>
                      {/* Total */}
                      <td className="px-2 py-1 text-end font-bold font-sans tabular-nums text-foreground whitespace-nowrap" dir="ltr">
                        {fmt(calc.total)}
                      </td>
                      {/* Delete */}
                      {!disabled && (
                        <td className="px-1 py-1">
                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>

                    {/* ── Expanded: inventory extra fields ── */}
                    {needsExpand && isExpanded && l.lineType === "inventory" && (
                      <tr className="border-b bg-muted/10">
                        <td colSpan={disabled ? 11 : 12} className="px-4 py-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                              <label className={labelCls}>{t("invoices.item")}</label>
                              <select className={inputCls} value={l.itemId} disabled={disabled} onChange={(e) => onItemPicked(idx, e.target.value)}>
                                <option value="">{t("invoices.selectItem")}</option>
                                {items.map((it) => (
                                  <option key={it.id} value={it.id}>{it.code} · {displayName(it, lang)}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className={labelCls}>{t("invoices.warehouse")}</label>
                              <input className={inputCls} value={l.warehouse} disabled={disabled} onChange={(e) => updateLine(idx, { warehouse: e.target.value })} />
                            </div>
                            {!isSalesSide && (
                              <div>
                                <label className={labelCls}>{t("invoices.account")}</label>
                                <select className={inputCls} value={l.accountId} disabled={disabled} onChange={(e) => updateLine(idx, { accountId: e.target.value })}>
                                  <option value="">{t("invoices.selectAccount")}</option>
                                  {postableAccounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
                                </select>
                              </div>
                            )}
                            {isSalesSide && (
                              <div>
                                <label className={labelCls}>{t("invoices.cogsAccount")}</label>
                                <select className={inputCls} value={l.cogsAccountId} disabled={disabled} onChange={(e) => updateLine(idx, { cogsAccountId: e.target.value })}>
                                  <option value="">{t("invoices.selectAccount")}</option>
                                  {postableAccounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
                                </select>
                              </div>
                            )}
                            <div>
                              <label className={labelCls}>{t("dimensions.project")}</label>
                              <select className={inputCls} value={l.projectId} disabled={disabled} onChange={(e) => updateLine(idx, { projectId: e.target.value })}>
                                <option value="">{t("invoices.none")}</option>
                                {projects.map((p) => <option key={p.id} value={p.id}>{displayName(p, lang)}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className={labelCls}>{t("dimensions.branch")}</label>
                              <select className={inputCls} value={l.branchId} disabled={disabled} onChange={(e) => updateLine(idx, { branchId: e.target.value })}>
                                <option value="">{t("invoices.none")}</option>
                                {branches.map((b) => <option key={b.id} value={b.id}>{displayName(b, lang)}</option>)}
                              </select>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* ── Expanded: fixed_asset extra fields ── */}
                    {needsExpand && isExpanded && l.lineType === "fixed_asset" && (
                      <tr className="border-b bg-muted/10">
                        <td colSpan={disabled ? 11 : 12} className="px-4 py-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                              <label className={labelCls}>{t("invoices.assetName")}</label>
                              <input className={inputCls} value={l.assetNameAr} disabled={disabled} onChange={(e) => updateLine(idx, { assetNameAr: e.target.value })} />
                            </div>
                            <div>
                              <label className={labelCls}>{t("invoices.usefulLife")}</label>
                              <input type="number" className={inputCls} value={l.assetUsefulLifeMonths} disabled={disabled} onChange={(e) => updateLine(idx, { assetUsefulLifeMonths: e.target.value })} dir="ltr" />
                            </div>
                            <div>
                              <label className={labelCls}>{t("invoices.salvageValue")}</label>
                              <input type="number" className={inputCls} value={l.assetSalvageValue} disabled={disabled} onChange={(e) => updateLine(idx, { assetSalvageValue: e.target.value })} dir="ltr" />
                            </div>
                            <div>
                              <label className={labelCls}>{t("invoices.accumulatedAccount")}</label>
                              <select className={inputCls} value={l.assetAccumulatedAccountId} disabled={disabled} onChange={(e) => updateLine(idx, { assetAccumulatedAccountId: e.target.value })}>
                                <option value="">{t("invoices.selectAccount")}</option>
                                {postableAccounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className={labelCls}>{t("invoices.expenseAccount")}</label>
                              <select className={inputCls} value={l.assetExpenseAccountId} disabled={disabled} onChange={(e) => updateLine(idx, { assetExpenseAccountId: e.target.value })}>
                                <option value="">{t("invoices.selectAccount")}</option>
                                {postableAccounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className={labelCls}>{t("dimensions.project")}</label>
                              <select className={inputCls} value={l.projectId} disabled={disabled} onChange={(e) => updateLine(idx, { projectId: e.target.value })}>
                                <option value="">{t("invoices.none")}</option>
                                {projects.map((p) => <option key={p.id} value={p.id}>{displayName(p, lang)}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className={labelCls}>{t("dimensions.branch")}</label>
                              <select className={inputCls} value={l.branchId} disabled={disabled} onChange={(e) => updateLine(idx, { branchId: e.target.value })}>
                                <option value="">{t("invoices.none")}</option>
                                {branches.map((b) => <option key={b.id} value={b.id}>{displayName(b, lang)}</option>)}
                              </select>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
                      {/* ── Add row ── */}
                      {!disabled && (
                        <tr
                          className="cursor-pointer hover:bg-primary/5 transition-colors"
                          onClick={addLine}
                        >
                          <td colSpan={12} className="px-3 py-2 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <Plus className="w-3.5 h-3.5" />
                              {t("invoices.addLine")}
                            </span>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              {/* ── end inline table ── */}

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
                {totals.whtTotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("invoices.whtTotal")}</span>
                    <span className="font-sans tabular-nums text-amber-600" dir="ltr">
                      ({fmt(totals.whtTotal)})
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2 font-bold text-foreground">
                  <span>{t("invoices.grandTotal")}</span>
                  <span className="font-sans tabular-nums" dir="ltr">
                    {fmt(totals.total)}
                  </span>
                </div>
              </div>
            </div>
            {readOnly && invoiceId && detail &&
              (detail.kind === "sales" || detail.kind === "purchase") &&
              (detail.status === "approved" || detail.status === "partially_paid") && (
                <InvoicePaymentAllocations
                  invoiceId={invoiceId}
                  invoiceKind={detail.kind as "sales" | "purchase"}
                  invoicePartyId={detail.partyId ?? null}
                  status={detail.status}
                  currency={detail.currency ?? null}
                  onChanged={onAllocated ?? (() => {})}
                />
              )}
            {invoiceId && (
              <DocumentsSection
                entityType="invoice"
                entityId={invoiceId}
                readOnly={readOnly}
              />
            )}
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
        {readOnly && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-full text-sm font-bold text-muted-foreground hover:bg-muted"
            >
              {t("invoices.cancel")}
            </button>
            {onEdit && (
              <button
                onClick={onEdit}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2 rounded-full text-sm font-bold hover:opacity-90"
              >
                {t("invoices.edit")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
