import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useGetOpeningBalances,
  useSaveOpeningBalances,
  useListAccounts,
  useListBankAccounts,
  useListCustomers,
  useListSuppliers,
  useListInventoryItems,
  useGetCurrentUser,
  getGetOpeningBalancesQueryKey,
  getListBankAccountsQueryKey,
  getListInventoryItemsQueryKey,
  getListJournalEntriesQueryKey,
  type Account,
  type BankAccount,
  type Customer,
  type Supplier,
  type InventoryItem,
} from "@workspace/api-client-react";
import { hasCapability } from "@workspace/permissions";
import { useQueryClient } from "@tanstack/react-query";
import {
  Scale,
  ListTree,
  Landmark,
  Users,
  Receipt,
  Package,
  Save,
  CheckCircle2,
  AlertTriangle,
  Upload,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { ImportWizard } from "@/components/import-wizard/ImportWizard";

function displayName(
  e: { nameAr: string; nameEn?: string | null },
  lang: string,
): string {
  return lang.startsWith("en") && e.nameEn ? e.nameEn : e.nameAr;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

// Parses a possibly-empty / partial numeric input into a finite number (0 on
// blank or invalid) so totals stay stable while the user types.
function num(v: string | undefined): number {
  if (v === undefined || v.trim() === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

type AccountRow = { debit: string; credit: string };

export function OpeningBalances() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: user } = useGetCurrentUser();
  const canEdit = hasCapability(user?.role ?? "", "journal:create");

  const { data: saved, isLoading: savedLoading } = useGetOpeningBalances();
  const { data: accounts = [], isLoading: accLoading } = useListAccounts();
  const { data: banks = [], isLoading: bankLoading } = useListBankAccounts();
  const { data: customers = [], isLoading: custLoading } = useListCustomers();
  const { data: suppliers = [], isLoading: suppLoading } = useListSuppliers();
  const { data: items = [], isLoading: itemLoading } = useListInventoryItems();

  const save = useSaveOpeningBalances();

  const loading =
    savedLoading ||
    accLoading ||
    bankLoading ||
    custLoading ||
    suppLoading ||
    itemLoading;

  const [date, setDate] = useState(today());
  // Maps keyed by the entity id; values are raw input strings.
  const [accountRows, setAccountRows] = useState<Record<string, AccountRow>>({});
  const [bankRows, setBankRows] = useState<Record<string, string>>({});
  const [custRows, setCustRows] = useState<Record<string, string>>({});
  const [suppRows, setSuppRows] = useState<Record<string, string>>({});
  const [invQty, setInvQty] = useState<Record<string, string>>({});
  const [invCost, setInvCost] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);
  const [importWizardOpen, setImportWizardOpen] = useState(false);

  // Leaf, non-bank, non-control accounts: bank/customer/supplier/inventory
  // balances are entered in their own dedicated sections.
  const bankAccountIds = useMemo(
    () => new Set(banks.map((b: BankAccount) => b.accountId)),
    [banks],
  );
  const subsidiaryAccountIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of customers as Customer[]) {
      s.add(c.accountId);
      s.add(c.controlAccountId);
    }
    for (const sp of suppliers as Supplier[]) {
      s.add(sp.accountId);
      s.add(sp.controlAccountId);
    }
    return s;
  }, [customers, suppliers]);
  const inventoryAccountIds = useMemo(
    () => new Set(items.map((i: InventoryItem) => i.inventoryAccountId)),
    [items],
  );
  const ledgerAccounts = useMemo(
    () =>
      (accounts as Account[])
        .filter((a) => !a.isGroup)
        .filter((a) => a.code !== "313")
        .filter(
          (a) =>
            !bankAccountIds.has(a.id) &&
            !subsidiaryAccountIds.has(a.id) &&
            !inventoryAccountIds.has(a.id),
        ),
    [accounts, bankAccountIds, subsidiaryAccountIds, inventoryAccountIds],
  );

  // Hydrate the form once from the saved opening entry.
  useEffect(() => {
    if (hydrated || loading || !saved) return;
    if (saved.date) setDate(saved.date);
    const ar: Record<string, AccountRow> = {};
    for (const l of saved.accounts) {
      ar[l.accountId] = {
        debit: l.debit ? String(l.debit) : "",
        credit: l.credit ? String(l.credit) : "",
      };
    }
    setAccountRows(ar);
    const br: Record<string, string> = {};
    for (const b of saved.banks) br[b.bankAccountId] = String(b.balance);
    setBankRows(br);
    const cr: Record<string, string> = {};
    for (const c of saved.customers) cr[c.customerId] = String(c.balance);
    setCustRows(cr);
    const sr: Record<string, string> = {};
    for (const s of saved.suppliers) sr[s.supplierId] = String(s.balance);
    setSuppRows(sr);
    const q: Record<string, string> = {};
    const cst: Record<string, string> = {};
    for (const it of saved.inventory) {
      q[it.itemId] = String(it.quantity);
      cst[it.itemId] = String(it.unitCost);
    }
    setInvQty(q);
    setInvCost(cst);
    setHydrated(true);
  }, [saved, loading, hydrated]);

  // Running totals: assets/expenses entered as debit, liabilities/equity/income
  // as credit. The opening-balance equity account absorbs the difference, shown
  // to the user so they understand what is being booked.
  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;

    for (const a of ledgerAccounts) {
      const row = accountRows[a.id];
      if (!row) continue;
      debit += num(row.debit);
      credit += num(row.credit);
    }
    for (const b of banks as BankAccount[]) {
      const v = num(bankRows[b.id]);
      if (v >= 0) debit += v;
      else credit += -v;
    }
    for (const c of customers as Customer[]) {
      const v = num(custRows[c.id]);
      if (v >= 0) debit += v;
      else credit += -v;
    }
    for (const s of suppliers as Supplier[]) {
      const v = num(suppRows[s.id]);
      if (v >= 0) credit += v;
      else debit += -v;
    }
    for (const it of items as InventoryItem[]) {
      const value = num(invQty[it.id]) * num(invCost[it.id]);
      if (value >= 0) debit += value;
      else credit += -value;
    }

    const d = round2(debit);
    const c = round2(credit);
    const diff = round2(d - c);
    return { debit: d, credit: c, diff, equityAbsorbs: round2(-diff) };
  }, [
    ledgerAccounts,
    accountRows,
    banks,
    bankRows,
    customers,
    custRows,
    suppliers,
    suppRows,
    items,
    invQty,
    invCost,
  ]);

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const handleSave = () => {
    const accountLines = ledgerAccounts
      .map((a) => {
        const row = accountRows[a.id];
        return {
          accountId: a.id,
          debit: round2(num(row?.debit)),
          credit: round2(num(row?.credit)),
        };
      })
      .filter((l) => l.debit !== 0 || l.credit !== 0);

    // Banks and inventory store opening state on their own rows, so send the
    // full snapshot (including zeros) to allow resetting a previously saved
    // balance. Customers/suppliers/accounts are rebuilt from the journal entry,
    // so omitting their zeros already resets them.
    const bankLines = (banks as BankAccount[]).map((b) => ({
      bankAccountId: b.id,
      balance: round2(num(bankRows[b.id])),
    }));

    const customerLines = (customers as Customer[])
      .map((c) => ({ customerId: c.id, balance: round2(num(custRows[c.id])) }))
      .filter((l) => l.balance !== 0);

    const supplierLines = (suppliers as Supplier[])
      .map((s) => ({ supplierId: s.id, balance: round2(num(suppRows[s.id])) }))
      .filter((l) => l.balance !== 0);

    const inventoryLines = (items as InventoryItem[]).map((it) => ({
      itemId: it.id,
      quantity: round4(num(invQty[it.id])),
      unitCost: round4(num(invCost[it.id])),
    }));

    save.mutate(
      {
        data: {
          date,
          accounts: accountLines,
          banks: bankLines,
          customers: customerLines,
          suppliers: supplierLines,
          inventory: inventoryLines,
        },
      },
      {
        onSuccess: () => {
          toast({ title: t("openingBalances.saved") });
          queryClient.invalidateQueries({
            queryKey: getGetOpeningBalancesQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getListBankAccountsQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getListInventoryItemsQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getListJournalEntriesQueryKey(),
          });
        },
        onError: () => {
          toast({
            title: t("openingBalances.saveError"),
            variant: "destructive",
          });
        },
      },
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    );
  }

  const inputCls =
    "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-end tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60";

  return (
    <div className="max-w-5xl mx-auto pb-32">
      {importWizardOpen && (
        <ImportWizard
          moduleType="opening-balances"
          onClose={() => setImportWizardOpen(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({
              queryKey: getGetOpeningBalancesQueryKey(),
            });
            setImportWizardOpen(false);
          }}
        />
      )}
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Scale className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {t("openingBalances.title")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("openingBalances.subtitle")}
            </p>
          </div>
        </div>
        {canEdit && (
          <button
            onClick={() => setImportWizardOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border border-primary/40 text-primary bg-primary/5 hover:bg-primary/10 transition-colors"
          >
            <Upload className="w-4 h-4" />
            {t("importWizard.openButton")}
          </button>
        )}
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 mb-6 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm font-semibold">
          {t("openingBalances.date")}
          <input
            type="date"
            value={date}
            disabled={!canEdit}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        {saved?.hasOpeningEntry && (
          <span className="text-xs px-2.5 py-1 rounded-full bg-secondary/15 text-secondary-foreground border border-border">
            {t("openingBalances.existingNote")}
          </span>
        )}
      </div>

      {/* Ledger accounts */}
      <Section icon={ListTree} title={t("openingBalances.sections.accounts")}>
        {ledgerAccounts.length === 0 ? (
          <Empty text={t("openingBalances.empty.accounts")} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-xs">
                <th className="text-start font-semibold py-2 px-2">
                  {t("openingBalances.cols.account")}
                </th>
                <th className="text-end font-semibold py-2 px-2 w-40">
                  {t("openingBalances.cols.debit")}
                </th>
                <th className="text-end font-semibold py-2 px-2 w-40">
                  {t("openingBalances.cols.credit")}
                </th>
              </tr>
            </thead>
            <tbody>
              {ledgerAccounts.map((a) => {
                const row = accountRows[a.id] ?? { debit: "", credit: "" };
                return (
                  <tr key={a.id} className="border-t border-border">
                    <td className="py-1.5 px-2">
                      <span className="text-muted-foreground tabular-nums me-2">
                        {a.code}
                      </span>
                      {displayName(a, lang)}
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        disabled={!canEdit}
                        className={inputCls}
                        value={row.debit}
                        onChange={(e) =>
                          setAccountRows((p) => ({
                            ...p,
                            [a.id]: { ...row, debit: e.target.value },
                          }))
                        }
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        disabled={!canEdit}
                        className={inputCls}
                        value={row.credit}
                        onChange={(e) =>
                          setAccountRows((p) => ({
                            ...p,
                            [a.id]: { ...row, credit: e.target.value },
                          }))
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* Banks / cash */}
      <Section icon={Landmark} title={t("openingBalances.sections.banks")}>
        {banks.length === 0 ? (
          <Empty text={t("openingBalances.empty.banks")} />
        ) : (
          <BalanceTable
            label={t("openingBalances.cols.account")}
            hint={t("openingBalances.cols.balance")}
            rows={(banks as BankAccount[]).map((b) => ({
              id: b.id,
              name: displayName(b, lang),
              meta: b.bankName ?? undefined,
            }))}
            values={bankRows}
            setValues={setBankRows}
            disabled={!canEdit}
            inputCls={inputCls}
          />
        )}
      </Section>

      {/* Customers */}
      <Section icon={Users} title={t("openingBalances.sections.customers")}>
        {customers.length === 0 ? (
          <Empty text={t("openingBalances.empty.customers")} />
        ) : (
          <BalanceTable
            label={t("openingBalances.cols.customer")}
            hint={t("openingBalances.cols.receivable")}
            rows={(customers as Customer[]).map((c) => ({
              id: c.id,
              name: displayName(c, lang),
              meta: c.code,
            }))}
            values={custRows}
            setValues={setCustRows}
            disabled={!canEdit}
            inputCls={inputCls}
          />
        )}
      </Section>

      {/* Suppliers */}
      <Section icon={Receipt} title={t("openingBalances.sections.suppliers")}>
        {suppliers.length === 0 ? (
          <Empty text={t("openingBalances.empty.suppliers")} />
        ) : (
          <BalanceTable
            label={t("openingBalances.cols.supplier")}
            hint={t("openingBalances.cols.payable")}
            rows={(suppliers as Supplier[]).map((s) => ({
              id: s.id,
              name: displayName(s, lang),
              meta: s.code,
            }))}
            values={suppRows}
            setValues={setSuppRows}
            disabled={!canEdit}
            inputCls={inputCls}
          />
        )}
      </Section>

      {/* Inventory */}
      <Section icon={Package} title={t("openingBalances.sections.inventory")}>
        {items.length === 0 ? (
          <Empty text={t("openingBalances.empty.inventory")} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-xs">
                <th className="text-start font-semibold py-2 px-2">
                  {t("openingBalances.cols.item")}
                </th>
                <th className="text-end font-semibold py-2 px-2 w-32">
                  {t("openingBalances.cols.quantity")}
                </th>
                <th className="text-end font-semibold py-2 px-2 w-40">
                  {t("openingBalances.cols.unitCost")}
                </th>
                <th className="text-end font-semibold py-2 px-2 w-40">
                  {t("openingBalances.cols.value")}
                </th>
              </tr>
            </thead>
            <tbody>
              {(items as InventoryItem[]).map((it) => {
                const value = num(invQty[it.id]) * num(invCost[it.id]);
                return (
                  <tr key={it.id} className="border-t border-border">
                    <td className="py-1.5 px-2">
                      <span className="text-muted-foreground tabular-nums me-2">
                        {it.code}
                      </span>
                      {displayName(it, lang)}
                      <span className="text-muted-foreground text-xs ms-1">
                        ({it.unit})
                      </span>
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        type="number"
                        step="0.0001"
                        inputMode="decimal"
                        disabled={!canEdit}
                        className={inputCls}
                        value={invQty[it.id] ?? ""}
                        onChange={(e) =>
                          setInvQty((p) => ({ ...p, [it.id]: e.target.value }))
                        }
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        type="number"
                        step="0.0001"
                        inputMode="decimal"
                        disabled={!canEdit}
                        className={inputCls}
                        value={invCost[it.id] ?? ""}
                        onChange={(e) =>
                          setInvCost((p) => ({ ...p, [it.id]: e.target.value }))
                        }
                      />
                    </td>
                    <td className="py-1.5 px-2 text-end tabular-nums text-muted-foreground">
                      {fmt(round2(value))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* Sticky footer: balance summary + save */}
      <div className="fixed bottom-0 start-64 end-0 bg-card/95 backdrop-blur border-t border-border px-6 py-3 z-10">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-5 text-sm tabular-nums">
            <span className="text-muted-foreground">
              {t("openingBalances.cols.debit")}:{" "}
              <span className="font-bold text-foreground">
                {fmt(totals.debit)}
              </span>
            </span>
            <span className="text-muted-foreground">
              {t("openingBalances.cols.credit")}:{" "}
              <span className="font-bold text-foreground">
                {fmt(totals.credit)}
              </span>
            </span>
            {Math.abs(totals.diff) < 0.005 ? (
              <span className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                {t("openingBalances.balanced")}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-amber-600 font-semibold">
                <AlertTriangle className="w-4 h-4" />
                {t("openingBalances.equityAbsorbs", {
                  amount: fmt(Math.abs(totals.equityAbsorbs)),
                })}
              </span>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={!canEdit || save.isPending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-md shadow-primary/20 hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {save.isPending ? (
              <Spinner className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {t("openingBalances.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card border border-border rounded-2xl p-4 mb-5">
      <h2 className="flex items-center gap-2 text-base font-bold text-foreground mb-3">
        <Icon className="w-5 h-5 text-primary" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground py-2 px-2">{text}</p>;
}

function BalanceTable({
  label,
  hint,
  rows,
  values,
  setValues,
  disabled,
  inputCls,
}: {
  label: string;
  hint: string;
  rows: { id: string; name: string; meta?: string }[];
  values: Record<string, string>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  disabled: boolean;
  inputCls: string;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-muted-foreground text-xs">
          <th className="text-start font-semibold py-2 px-2">{label}</th>
          <th className="text-end font-semibold py-2 px-2 w-48">{hint}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-border">
            <td className="py-1.5 px-2">
              {r.meta && (
                <span className="text-muted-foreground tabular-nums me-2">
                  {r.meta}
                </span>
              )}
              {r.name}
            </td>
            <td className="py-1.5 px-2">
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                disabled={disabled}
                className={inputCls}
                value={values[r.id] ?? ""}
                onChange={(e) =>
                  setValues((p) => ({ ...p, [r.id]: e.target.value }))
                }
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
