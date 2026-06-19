import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetInvoiceQueryKey,
  getListInvoicesQueryKey,
  getListPaymentsQueryKey,
} from "@workspace/api-client-react";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { Trash2, CreditCard, Pencil, Link2, Check, X } from "lucide-react";

type ExistingAllocation = {
  id: string;
  paymentId: string;
  paymentNo: number | null;
  date: string | null;
  currency: string | null;
  amount: number;
};

type AvailablePayment = {
  id: string;
  paymentNo: number;
  date: string;
  amount: number;
  currency: string | null;
  exchangeRate: number;
  totalAllocated: number;
  unallocatedAmount: number;
  bankMovementId: string | null;
};

type AvailableMovement = {
  id: string;
  date: string;
  amount: number;
  currency: string | null;
  reference: string | null;
  notes: string | null;
  bankAccountName: string | null;
};

const MONEY_EPS = 0.005;
const r2 = (n: number) => Math.round(n * 100) / 100;

function fmtNum(n: number): string {
  return n.toLocaleString("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function InvoicePaymentAllocations({
  invoiceId,
  invoiceKind,
  invoicePartyId,
  status,
  currency,
  onChanged,
}: {
  invoiceId: string;
  invoiceKind: "sales" | "purchase";
  invoicePartyId: string | null;
  status: string;
  currency: string | null;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [existingAllocations, setExistingAllocations] = useState<ExistingAllocation[]>([]);
  const [availablePayments, setAvailablePayments] = useState<AvailablePayment[]>([]);
  const [availableMovements, setAvailableMovements] = useState<AvailableMovement[]>([]);
  const [loading, setLoading] = useState(false);

  // allocate-payment form
  const [selectedPaymentId, setSelectedPaymentId] = useState("");
  const [allocAmount, setAllocAmount] = useState("");
  const [saving, setSaving] = useState(false);

  // delete
  const [deleting, setDeleting] = useState<string | null>(null);

  // edit allocation inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // link movement form
  const [selectedMovId, setSelectedMovId] = useState("");
  const [movAmount, setMovAmount] = useState("");
  const [movSaving, setMovSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [paymentsRes, movementsRes] = await Promise.all([
        fetch(`/api/invoices/${invoiceId}/available-payments`),
        fetch(`/api/invoices/${invoiceId}/available-movements`),
      ]);
      if (paymentsRes.ok) {
        const data = await paymentsRes.json();
        setExistingAllocations(data.existingAllocations ?? []);
        setAvailablePayments(data.availablePayments ?? []);
      }
      if (movementsRes.ok) {
        setAvailableMovements(await movementsRes.json());
      }
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => { load(); }, [load]);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetInvoiceQueryKey(invoiceId) });
    queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey({ kind: invoiceKind }) });
    queryClient.invalidateQueries({
      queryKey: getListPaymentsQueryKey({
        kind: invoiceKind === "sales" ? "collection" : "payment",
      }),
    });
  }, [queryClient, invoiceId, invoiceKind]);

  const selectedPayment = availablePayments.find((p) => p.id === selectedPaymentId);
  const selectedMovement = availableMovements.find((m) => m.id === selectedMovId);

  // ── Allocate existing payment ──────────────────────────────────────────────
  const handleAllocate = async () => {
    const amount = parseFloat(allocAmount);
    if (!selectedPaymentId || isNaN(amount) || amount <= MONEY_EPS) {
      toast({ title: t("invoices.allocations.invalidAmount"), variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/allocate-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: selectedPaymentId, allocatedAmount: amount }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast({ title: d.error ?? t("invoices.allocations.error"), variant: "destructive" });
        return;
      }
      toast({ title: t("invoices.allocations.allocated") });
      setSelectedPaymentId("");
      setAllocAmount("");
      await load();
      invalidate();
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  // ── Delete allocation ──────────────────────────────────────────────────────
  const handleDelete = async (allocationId: string) => {
    setDeleting(allocationId);
    try {
      const res = await fetch(
        `/api/invoices/${invoiceId}/allocations/${allocationId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const d = await res.json();
        toast({ title: d.error ?? t("invoices.allocations.error"), variant: "destructive" });
        return;
      }
      toast({ title: t("invoices.allocations.removed") });
      await load();
      invalidate();
      onChanged();
    } finally {
      setDeleting(null);
    }
  };

  // ── Edit allocation inline ─────────────────────────────────────────────────
  const startEdit = (a: ExistingAllocation) => {
    setEditingId(a.id);
    setEditAmount(String(r2(a.amount)));
  };
  const cancelEdit = () => { setEditingId(null); setEditAmount(""); };
  const handleEditSave = async (allocationId: string) => {
    const amount = parseFloat(editAmount);
    if (isNaN(amount) || amount <= MONEY_EPS) {
      toast({ title: t("invoices.allocations.invalidAmount"), variant: "destructive" });
      return;
    }
    setEditSaving(true);
    try {
      const res = await fetch(
        `/api/invoices/${invoiceId}/allocations/${allocationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allocatedAmount: amount }),
        },
      );
      if (!res.ok) {
        const d = await res.json();
        toast({ title: d.error ?? t("invoices.allocations.error"), variant: "destructive" });
        return;
      }
      toast({ title: t("invoices.allocations.updated") });
      cancelEdit();
      await load();
      invalidate();
      onChanged();
    } finally {
      setEditSaving(false);
    }
  };

  // ── Link bank movement ─────────────────────────────────────────────────────
  const handleLinkMovement = async () => {
    const amount = parseFloat(movAmount);
    if (!selectedMovId || isNaN(amount) || amount <= MONEY_EPS) {
      toast({ title: t("invoices.allocations.invalidAmount"), variant: "destructive" });
      return;
    }
    setMovSaving(true);
    try {
      const body: Record<string, unknown> = {
        allocations: [{ invoiceId, allocatedAmount: amount }],
      };
      if (invoiceKind === "sales") body.customerId = invoicePartyId;
      else body.supplierId = invoicePartyId;

      const res = await fetch(`/api/bank/movements/${selectedMovId}/link-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        toast({ title: d.error ?? t("invoices.allocations.error"), variant: "destructive" });
        return;
      }
      toast({ title: t("invoices.allocations.linked") });
      setSelectedMovId("");
      setMovAmount("");
      await load();
      invalidate();
      onChanged();
    } finally {
      setMovSaving(false);
    }
  };

  const canAllocate = status === "approved" || status === "partially_paid";

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm font-bold text-primary">
        <CreditCard className="w-4 h-4" />
        <span>{t("invoices.allocations.title")}</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-2">
          <Spinner className="w-5 h-5 text-primary" />
        </div>
      ) : (
        <>
          {/* ── Existing allocations ── */}
          {existingAllocations.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {existingAllocations.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between bg-background/80 rounded-lg px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-3 text-muted-foreground text-xs">
                    <span>{t("invoices.paymentNo")} {a.paymentNo ?? "—"}</span>
                    {a.date && <span>{a.date}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {editingId === a.id ? (
                      <>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          className="w-28 rounded-md border border-input bg-background px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                          dir="ltr"
                          autoFocus
                        />
                        <button
                          onClick={() => handleEditSave(a.id)}
                          disabled={editSaving}
                          className="p-1 rounded hover:bg-primary/10 text-primary disabled:opacity-40"
                          title={t("invoices.allocations.save")}
                        >
                          {editSaving ? <Spinner className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={editSaving}
                          className="p-1 rounded hover:bg-muted text-muted-foreground"
                          title={t("invoices.allocations.cancel")}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="font-mono font-bold text-primary text-sm" dir="ltr">
                          {fmtNum(a.amount)} {a.currency ?? currency ?? ""}
                        </span>
                        {canAllocate && (
                          <>
                            <button
                              onClick={() => startEdit(a)}
                              className="p-1 rounded hover:bg-primary/10 text-primary"
                              title={t("invoices.allocations.edit")}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(a.id)}
                              disabled={deleting === a.id}
                              className="p-1 rounded hover:bg-destructive/10 text-destructive disabled:opacity-40"
                              title={t("invoices.allocations.remove")}
                            >
                              {deleting === a.id ? (
                                <Spinner className="w-3.5 h-3.5" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("invoices.allocations.none")}</p>
          )}

          {canAllocate && (
            <>
              {/* ── Allocate existing payment ── */}
              <div className="border-t pt-3 flex flex-col gap-2">
                {availablePayments.length > 0 ? (
                  <>
                    <p className="text-xs font-semibold text-muted-foreground">
                      {t("invoices.allocations.addNew")}
                    </p>
                    <div className="flex gap-2 flex-wrap items-end">
                      <div className="flex-1 min-w-[180px]">
                        <label className="block text-xs text-muted-foreground mb-1">
                          {t("invoices.allocations.selectPayment")}
                        </label>
                        <select
                          value={selectedPaymentId}
                          onChange={(e) => {
                            setSelectedPaymentId(e.target.value);
                            const p = availablePayments.find((x) => x.id === e.target.value);
                            if (p) setAllocAmount(String(r2(p.unallocatedAmount)));
                            else setAllocAmount("");
                          }}
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          <option value="">
                            {t("invoices.allocations.selectPaymentPlaceholder")}
                          </option>
                          {availablePayments.map((p) => (
                            <option key={p.id} value={p.id}>
                              #{p.paymentNo} — {p.date} — {fmtNum(p.unallocatedAmount)}{" "}
                              {p.currency ?? currency ?? ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="w-36">
                        <label className="block text-xs text-muted-foreground mb-1">
                          {t("invoices.allocations.amount")}
                        </label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={allocAmount}
                          onChange={(e) => setAllocAmount(e.target.value)}
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                          dir="ltr"
                        />
                      </div>
                      <button
                        onClick={handleAllocate}
                        disabled={saving || !selectedPaymentId || !allocAmount}
                        className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
                      >
                        {saving && <Spinner className="w-3.5 h-3.5" />}
                        {t("invoices.allocations.allocate")}
                      </button>
                    </div>
                    {selectedPayment && (
                      <p className="text-xs text-muted-foreground">
                        {t("invoices.allocations.available")}:{" "}
                        <span className="font-mono" dir="ltr">
                          {fmtNum(selectedPayment.unallocatedAmount)}{" "}
                          {selectedPayment.currency ?? currency ?? ""}
                        </span>
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t("invoices.allocations.noPayments")}
                  </p>
                )}
              </div>

              {/* ── Link bank movement ── */}
              <div className="border-t pt-3 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <Link2 className="w-3.5 h-3.5" />
                  <span>{t("invoices.allocations.linkMovement")}</span>
                </div>
                {availableMovements.length > 0 ? (
                  <div className="flex gap-2 flex-wrap items-end">
                    <div className="flex-1 min-w-[180px]">
                      <label className="block text-xs text-muted-foreground mb-1">
                        {t("invoices.allocations.selectMovement")}
                      </label>
                      <select
                        value={selectedMovId}
                        onChange={(e) => {
                          setSelectedMovId(e.target.value);
                          const m = availableMovements.find((x) => x.id === e.target.value);
                          if (m) setMovAmount(String(r2(m.amount)));
                          else setMovAmount("");
                        }}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <option value="">
                          {t("invoices.allocations.selectMovementPlaceholder")}
                        </option>
                        {availableMovements.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.date} — {fmtNum(m.amount)} {m.currency ?? currency ?? ""}
                            {m.bankAccountName ? ` — ${m.bankAccountName}` : ""}
                            {m.reference ? ` (${m.reference})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-36">
                      <label className="block text-xs text-muted-foreground mb-1">
                        {t("invoices.allocations.amount")}
                      </label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={movAmount}
                        onChange={(e) => setMovAmount(e.target.value)}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        dir="ltr"
                      />
                    </div>
                    <button
                      onClick={handleLinkMovement}
                      disabled={movSaving || !selectedMovId || !movAmount}
                      className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
                    >
                      {movSaving && <Spinner className="w-3.5 h-3.5" />}
                      {t("invoices.allocations.linkMovement")}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t("invoices.allocations.noMovements")}
                  </p>
                )}
                {selectedMovement && (
                  <p className="text-xs text-muted-foreground">
                    {t("invoices.allocations.available")}:{" "}
                    <span className="font-mono" dir="ltr">
                      {fmtNum(selectedMovement.amount)}{" "}
                      {selectedMovement.currency ?? currency ?? ""}
                    </span>
                  </p>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
