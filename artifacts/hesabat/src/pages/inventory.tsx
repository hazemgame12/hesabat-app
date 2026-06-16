import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListInventoryItems,
  useCreateInventoryItem,
  useUpdateInventoryItem,
  useDeleteInventoryItem,
  useListInventoryMovements,
  useCreateInventoryMovement,
  useListAccounts,
  useGetCurrentUser,
  getListInventoryItemsQueryKey,
  getListInventoryMovementsQueryKey,
  getListJournalEntriesQueryKey,
  type InventoryItem,
  type Account,
} from "@workspace/api-client-react";
import { GridTable, GridToggle, useGridView, type GridColumn } from "@/components/GridTable";
import { hasCapability } from "@workspace/permissions";
import { useQueryClient } from "@tanstack/react-query";
import { ExcelToolbar } from "@/components/ExcelToolbar";
import {
  Package,
  Plus,
  X,
  Check,
  Trash2,
  Edit2,
  ArrowLeftRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  SlidersHorizontal,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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

const itemSchema = z.object({
  nameAr: z.string().min(1, "nameRequired"),
  nameEn: z.string().optional(),
  unit: z.string().min(1, "unitRequired"),
  category: z.string().optional(),
  inventoryAccountId: z.string().min(1, "accountRequired"),
  isActive: z.boolean().default(true),
});
type ItemForm = z.input<typeof itemSchema>;

const movementSchema = z.object({
  itemId: z.string().min(1, "itemRequired"),
  date: z.string().min(1, "dateRequired"),
  type: z.enum(["receipt", "issue", "adjustment"]).default("receipt"),
  quantity: z.coerce.number(),
  unitCost: z.coerce.number().optional(),
  inventoryAccountId: z.string().optional(),
  counterpartAccountId: z.string().min(1, "counterpartRequired"),
  notes: z.string().optional(),
});
type MovementForm = z.input<typeof movementSchema>;

function displayName(
  e: { nameAr: string; nameEn?: string | null },
  lang: string,
): string {
  return lang.startsWith("en") && e.nameEn ? e.nameEn : e.nameAr;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function Inventory() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [tab, setTab] = useState<"items" | "movements">("items");

  const { data: items = [], isLoading: itemsLoading } = useListInventoryItems();
  const { data: movements = [], isLoading: movementsLoading } =
    useListInventoryMovements();
  const { data: accounts = [] } = useListAccounts();
  const postableAccounts = useMemo(
    () => accounts.filter((a: Account) => !a.isGroup),
    [accounts],
  );

  const createItem = useCreateInventoryItem();
  const updateItem = useUpdateInventoryItem();
  const deleteItem = useDeleteInventoryItem();
  const createMovement = useCreateInventoryMovement();

  const { data: user } = useGetCurrentUser();
  const role = user?.role ?? "";
  const canCreate = hasCapability(role, "inventory:create");
  const canUpdate = hasCapability(role, "inventory:update");
  const canDelete = hasCapability(role, "inventory:delete");

  const [itemModalMode, setItemModalMode] = useState<"create" | "edit" | null>(
    null,
  );
  const [itemToEdit, setItemToEdit] = useState<InventoryItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);
  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isGridView, toggleGridView] = useGridView("inventory:items");

  const {
    register: registerItem,
    handleSubmit: handleSubmitItem,
    reset: resetItem,
    watch: watchItem,
    setValue: setItemValue,
    formState: { errors: itemErrors },
  } = useForm<ItemForm>({
    resolver: zodResolver(itemSchema),
    defaultValues: { isActive: true },
  });
  const itemActive = watchItem("isActive");

  const {
    register: registerMov,
    handleSubmit: handleSubmitMov,
    reset: resetMov,
    watch: watchMov,
    formState: { errors: movErrors },
  } = useForm<MovementForm>({
    resolver: zodResolver(movementSchema),
    defaultValues: { type: "receipt", date: today() },
  });
  const movType = watchMov("type");
  const movItemId = watchMov("itemId");
  const selectedItem = useMemo(
    () => items.find((i) => i.id === movItemId) ?? null,
    [items, movItemId],
  );

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(n);
  const fmtQty = (n: number) =>
    new Intl.NumberFormat(lang, { maximumFractionDigits: 4 }).format(n);

  const accountLabel = (a: Account) => `${a.code} · ${displayName(a, lang)}`;

  const itemGridColumns: GridColumn<InventoryItem>[] = [
    { key: "code", header: t("inventory.code"), type: "readonly", width: "90px" },
    { key: "nameAr", header: t("inventory.name") + " (ع)", type: "text", editable: canUpdate, validate: (v) => !v ? "مطلوب" : null },
    { key: "nameEn", header: t("inventory.name") + " (EN)", type: "text", editable: canUpdate },
    { key: "unit", header: t("inventory.unit"), type: "text", editable: canUpdate, validate: (v) => !v ? "مطلوب" : null },
    { key: "category", header: t("inventory.category") ?? "الفئة", type: "text", editable: canUpdate },
    { key: "quantityOnHand", header: t("inventory.quantityOnHand"), type: "readonly", align: "end", render: (v) => <span className="font-sans tabular-nums">{fmtQty(Number(v ?? 0))}</span> },
    { key: "averageCost", header: t("inventory.averageCost"), type: "readonly", align: "end", render: (v) => <span className="font-sans tabular-nums">{fmt(Number(v ?? 0))}</span> },
    { key: "stockValue", header: t("inventory.stockValue"), type: "readonly", align: "end", render: (v) => <span className="font-sans tabular-nums">{fmt(Number(v ?? 0))}</span> },
    { key: "isActive", header: t("inventory.status"), type: "boolean", editable: canUpdate, width: "80px",
      render: (v) => v
        ? <span className="text-[11px] font-bold text-success bg-success/10 px-2 py-0.5 rounded-full">{t("inventory.active")}</span>
        : <span className="text-[11px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{t("inventory.inactive")}</span>
    },
  ];

  const handleItemGridSave = async (changes: { id: string; field: string; oldValue: unknown; newValue: unknown }[]) => {
    const byRow = new Map<string, Record<string, unknown>>();
    for (const c of changes) { if (!byRow.has(c.id)) byRow.set(c.id, {}); byRow.get(c.id)![c.field] = c.newValue; }
    for (const [id, patch] of byRow.entries()) {
      const it = items.find((i) => i.id === id); if (!it) continue;
      const data = {
        nameAr: String(patch.nameAr ?? it.nameAr),
        nameEn: patch.nameEn !== undefined ? (String(patch.nameEn) || null) : it.nameEn ?? null,
        unit: String(patch.unit ?? it.unit),
        category: patch.category !== undefined ? (String(patch.category) || null) : it.category ?? null,
        inventoryAccountId: it.inventoryAccountId,
        isActive: patch.isActive !== undefined ? Boolean(patch.isActive) : it.isActive,
      };
      await new Promise<void>((res, rej) => updateItem.mutate({ id, data }, { onSuccess: () => res(), onError: rej }));
    }
    invalidateItems();
  };

  const handleItemGridDelete = async (ids: string[]) => {
    for (const id of ids) await deleteItem.mutateAsync({ id });
    invalidateItems();
  };

  const defaultInventoryAcctId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) { const id = i.inventoryAccountId; if (id) counts.set(id, (counts.get(id) ?? 0) + 1); }
    let best = postableAccounts[0]?.id ?? "";
    let bestN = 0;
    counts.forEach((n, id) => { if (n > bestN) { bestN = n; best = id; } });
    return best;
  }, [items, postableAccounts]);

  const handleItemGridCreate = async (newItems: Partial<InventoryItem>[]) => {
    for (const p of newItems) {
      if (!String(p.nameAr ?? "").trim()) continue;
      const data = {
        nameAr: String(p.nameAr).trim(),
        nameEn: p.nameEn ? String(p.nameEn) : null,
        unit: String(p.unit ?? "قطعة").trim() || "قطعة",
        category: p.category ? String(p.category) : null,
        inventoryAccountId: defaultInventoryAcctId,
        isActive: true,
      };
      await new Promise<void>((res, rej) => createItem.mutate({ data }, { onSuccess: () => res(), onError: rej }));
    }
    invalidateItems();
  };

  const invalidateItems = () =>
    queryClient.invalidateQueries({ queryKey: getListInventoryItemsQueryKey() });
  const invalidateMovements = () =>
    queryClient.invalidateQueries({
      queryKey: getListInventoryMovementsQueryKey(),
    });

  // ---- item modal ----
  const openCreateItem = () => {
    resetItem({
      nameAr: "",
      nameEn: "",
      unit: "",
      category: "",
      inventoryAccountId: "",
      isActive: true,
    });
    setItemModalMode("create");
  };

  const openEditItem = (it: InventoryItem) => {
    resetItem({
      nameAr: it.nameAr,
      nameEn: it.nameEn ?? "",
      unit: it.unit,
      category: it.category ?? "",
      inventoryAccountId: it.inventoryAccountId,
      isActive: it.isActive,
    });
    setItemToEdit(it);
    setItemModalMode("edit");
  };

  const closeItemModal = () => {
    setItemModalMode(null);
    setItemToEdit(null);
  };

  const onSubmitItem = (form: ItemForm) => {
    const base = {
      nameAr: form.nameAr,
      nameEn: form.nameEn || null,
      unit: form.unit,
      category: form.category || null,
      inventoryAccountId: form.inventoryAccountId,
      isActive: form.isActive ?? true,
    };
    if (itemModalMode === "create") {
      createItem.mutate(
        { data: base },
        {
          onSuccess: () => {
            invalidateItems();
            toast({ title: t("inventory.toast.added") });
            closeItemModal();
          },
          onError: (err: any) =>
            toast({
              variant: "destructive",
              title: t("common.error"),
              description: err?.data?.error || t("inventory.toast.addError"),
            }),
        },
      );
    } else if (itemModalMode === "edit" && itemToEdit) {
      updateItem.mutate(
        { id: itemToEdit.id, data: base },
        {
          onSuccess: () => {
            invalidateItems();
            toast({ title: t("inventory.toast.edited") });
            closeItemModal();
          },
          onError: (err: any) =>
            toast({
              variant: "destructive",
              title: t("common.error"),
              description: err?.data?.error || t("inventory.toast.editError"),
            }),
        },
      );
    }
  };

  const handleBulkDeleteItems = async () => {
    setIsBulkDeleting(true);
    let ok = 0; let fail = 0;
    for (const id of Array.from(selectedItemIds)) {
      try { await deleteItem.mutateAsync({ id }); ok++; }
      catch { fail++; }
    }
    setIsBulkDeleting(false);
    setBulkDeleteOpen(false);
    setSelectedItemIds(new Set());
    invalidateItems();
    if (ok > 0) toast({ title: `تم حذف ${ok} صنف بنجاح` });
    if (fail > 0) toast({ variant: "destructive", title: t("common.error"), description: `فشل حذف ${fail} صنف` });
  };

  const handleDeleteItem = () => {
    if (!itemToDelete) return;
    deleteItem.mutate(
      { id: itemToDelete.id },
      {
        onSuccess: () => {
          invalidateItems();
          toast({ title: t("inventory.toast.deleted") });
          setItemToDelete(null);
        },
        onError: (err: any) => {
          toast({
            variant: "destructive",
            title: t("common.error"),
            description: err?.data?.error || t("inventory.toast.deleteError"),
          });
          setItemToDelete(null);
        },
      },
    );
  };

  // ---- movement modal ----
  const openMovementModal = (presetItemId?: string) => {
    resetMov({
      itemId: presetItemId ?? "",
      date: today(),
      type: "receipt",
      quantity: undefined,
      unitCost: undefined,
      inventoryAccountId: "",
      counterpartAccountId: "",
      notes: "",
    });
    setMovementModalOpen(true);
  };

  const onSubmitMovement = (form: MovementForm) => {
    const qty = Number(form.quantity);
    if (form.type === "adjustment") {
      if (!qty || Math.abs(qty) < 0.00005) {
        toast({
          variant: "destructive",
          title: t("common.error"),
          description: t("inventory.validation.quantityNonZero"),
        });
        return;
      }
    } else if (!qty || qty <= 0) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t("inventory.validation.quantityRequired"),
      });
      return;
    }
    if (
      form.type === "receipt" &&
      (form.unitCost === undefined ||
        form.unitCost === ("" as unknown) ||
        Number(form.unitCost) < 0)
    ) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: t("inventory.validation.unitCostRequired"),
      });
      return;
    }
    const payload = {
      itemId: form.itemId,
      date: form.date,
      type: form.type as "receipt" | "issue" | "adjustment",
      quantity: qty,
      unitCost:
        form.type === "receipt" ? Number(form.unitCost) : null,
      inventoryAccountId: form.inventoryAccountId || null,
      counterpartAccountId: form.counterpartAccountId,
      notes: form.notes || null,
    };
    createMovement.mutate(
      { data: payload },
      {
        onSuccess: (mov) => {
          invalidateItems();
          invalidateMovements();
          queryClient.invalidateQueries({
            queryKey: getListJournalEntriesQueryKey(),
          });
          toast({
            title: mov.journalEntryNo
              ? t("inventory.toast.movementAdded", { no: mov.journalEntryNo })
              : t("inventory.toast.movementAddedNoEntry"),
          });
          setMovementModalOpen(false);
          setTab("movements");
        },
        onError: (err: any) =>
          toast({
            variant: "destructive",
            title: t("common.error"),
            description: err?.data?.error || t("inventory.toast.movementError"),
          }),
      },
    );
  };

  const counterpartHint =
    movType === "receipt"
      ? t("inventory.movement.counterpartHintReceipt")
      : movType === "issue"
        ? t("inventory.movement.counterpartHintIssue")
        : t("inventory.movement.counterpartHintAdjustment");

  const typeBadge = (type: string) => {
    if (type === "receipt")
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-success bg-success/10 px-2.5 py-1 rounded-full">
          <ArrowDownToLine className="w-3 h-3" />
          {t("inventory.movement.types.receipt").split(" (")[0]}
        </span>
      );
    if (type === "issue")
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-destructive bg-destructive/10 px-2.5 py-1 rounded-full">
          <ArrowUpFromLine className="w-3 h-3" />
          {t("inventory.movement.types.issue").split(" (")[0]}
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
        <SlidersHorizontal className="w-3 h-3" />
        {t("inventory.movement.types.adjustment").split(" (")[0]}
      </span>
    );
  };

  return (
    <div className="flex flex-col">
      <header className="h-20 bg-background/80 backdrop-blur-md border-b flex items-center justify-between px-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-card border shadow-sm flex items-center justify-center text-primary">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">
              {t("inventory.title")}
            </h1>
            <p className="text-sm text-muted-foreground font-medium">
              {t("inventory.subtitle")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tab === "items" && <GridToggle isGrid={isGridView} onToggle={toggleGridView} />}
          <ExcelToolbar
            exportPath="/api/inventory/items/export"
            importPath="/api/inventory/items/import"
            canImport={canCreate}
            onImported={invalidateItems}
          />
          {canCreate && items.length > 0 && (
            <button
              onClick={() => openMovementModal()}
              className="flex items-center gap-2 bg-card border text-foreground px-4 py-2 rounded-full text-sm font-bold hover:bg-muted transition-colors"
            >
              <ArrowLeftRight className="w-4 h-4" />
              {t("inventory.recordMovement")}
            </button>
          )}
          {canCreate && (
            <button
              onClick={openCreateItem}
              className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              {t("inventory.addItem")}
            </button>
          )}
        </div>
      </header>

      <div className="px-8 pt-6">
        <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-full w-fit">
          {(["items", "movements"] as const).map((tk) => (
            <button
              key={tk}
              onClick={() => setTab(tk)}
              className={`px-5 py-2 rounded-full text-sm font-bold transition-colors ${
                tab === tk
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(`inventory.tabs.${tk}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="p-8 flex flex-col gap-6 max-w-6xl mx-auto w-full">
        {tab === "items" ? (
          <div className="bg-card border rounded-2xl shadow-sm overflow-hidden min-h-[300px]">
            {itemsLoading ? (
              <div className="flex items-center justify-center p-12">
                <Spinner className="w-8 h-8 text-primary" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-2 text-center">
                <p className="font-bold text-foreground">
                  {t("inventory.noItems")}
                </p>
                <p className="text-sm max-w-md">{t("inventory.noItemsHint")}</p>
                {canCreate && (
                  <button
                    onClick={openCreateItem}
                    className="mt-2 text-primary font-bold hover:underline"
                  >
                    {t("inventory.addFirst")}
                  </button>
                )}
              </div>
            ) : isGridView ? (
              <GridTable
                rows={items}
                columns={itemGridColumns}
                canEdit={canUpdate}
                canDelete={canDelete}
                onSave={handleItemGridSave}
                onDeleteRows={handleItemGridDelete}
                onCreateRows={canCreate ? handleItemGridCreate : undefined}
                newRowTemplate={() => ({ unit: "قطعة", isActive: true })}
                selectedIds={selectedItemIds}
                onSelectionChange={setSelectedItemIds}
                emptyMessage={t("inventory.noItems")}
              />
            ) : (
              <>
                {selectedItemIds.size > 0 && canDelete && (
                  <div className="flex items-center gap-3 bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex-wrap">
                    <span className="text-sm font-bold text-slate-700">تم تحديد {selectedItemIds.size} صنف</span>
                    <button onClick={() => setBulkDeleteOpen(true)} className="flex items-center gap-2 bg-destructive text-destructive-foreground px-3 py-1.5 rounded-lg text-sm font-bold hover:opacity-90">
                      <Trash2 className="w-4 h-4" />حذف المحدد
                    </button>
                    <button onClick={() => setSelectedItemIds(new Set())} className="text-sm text-slate-500 hover:underline ms-auto">إلغاء التحديد</button>
                  </div>
                )}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
                      {canDelete && (
                        <th className="px-3 py-3 w-8">
                          {(() => {
                            const all = items.length > 0 && items.every((i) => selectedItemIds.has(i.id));
                            const some = items.some((i) => selectedItemIds.has(i.id)) && !all;
                            return <input type="checkbox" checked={all} ref={(el) => { if (el) el.indeterminate = some; }} onChange={() => all ? setSelectedItemIds(new Set()) : setSelectedItemIds(new Set(items.map((i) => i.id)))} className="w-4 h-4 accent-primary cursor-pointer" />;
                          })()}
                        </th>
                      )}
                      <th className="text-start px-6 py-3">{t("inventory.code")}</th>
                      <th className="text-start px-3 py-3">{t("inventory.name")}</th>
                      <th className="text-start px-3 py-3">{t("inventory.unit")}</th>
                      <th className="text-end px-3 py-3">{t("inventory.quantityOnHand")}</th>
                      <th className="text-end px-3 py-3">{t("inventory.averageCost")}</th>
                      <th className="text-end px-3 py-3">{t("inventory.stockValue")}</th>
                      <th className="text-center px-3 py-3">{t("inventory.status")}</th>
                      {(canUpdate || canDelete) && (<th className="w-20 px-6 py-3" />)}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                    <tr
                      key={it.id}
                      className={`group border-t hover:bg-muted/40 transition-colors ${selectedItemIds.has(it.id) ? "bg-rose-50/40" : ""}`}
                    >
                      {canDelete && (
                        <td className="px-3 py-3.5">
                          <input type="checkbox" checked={selectedItemIds.has(it.id)} onChange={() => { const n = new Set(selectedItemIds); n.has(it.id) ? n.delete(it.id) : n.add(it.id); setSelectedItemIds(n); }} className="w-4 h-4 accent-primary cursor-pointer" />
                        </td>
                      )}
                      <td
                        className="px-6 py-3.5 font-sans tabular-nums text-foreground/80"
                        dir="ltr"
                      >
                        {it.code}
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="font-medium text-foreground">
                          {displayName(it, lang)}
                        </div>
                        {it.category && (
                          <div className="text-xs text-muted-foreground">
                            {it.category}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3.5 text-foreground/80">
                        {it.unit}
                      </td>
                      <td
                        className="px-3 py-3.5 text-end font-sans tabular-nums text-foreground/80"
                        dir="ltr"
                      >
                        {fmtQty(it.quantityOnHand)}
                      </td>
                      <td
                        className="px-3 py-3.5 text-end font-sans tabular-nums text-foreground/80"
                        dir="ltr"
                      >
                        {fmt(it.averageCost)}
                      </td>
                      <td
                        className="px-3 py-3.5 text-end font-bold font-sans tabular-nums text-foreground"
                        dir="ltr"
                      >
                        {fmt(it.stockValue)}
                      </td>
                      <td className="px-3 py-3.5 text-center">
                        {it.isActive ? (
                          <span className="text-[11px] font-bold text-success bg-success/10 px-2.5 py-1 rounded-full">
                            {t("inventory.active")}
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                            {t("inventory.inactive")}
                          </span>
                        )}
                      </td>
                      {(canUpdate || canDelete) && (
                        <td className="px-6 py-3.5">
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 justify-end">
                            {canUpdate && (
                              <button
                                onClick={() => openEditItem(it)}
                                className="p-1.5 rounded-md hover:bg-primary/10 text-primary transition-colors"
                                title={t("common.edit")}
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => setItemToDelete(it)}
                                className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive transition-colors"
                                title={t("common.delete")}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              </>
            )}
          </div>
        ) : (
          <div className="bg-card border rounded-2xl shadow-sm overflow-hidden min-h-[300px]">
            {movementsLoading ? (
              <div className="flex items-center justify-center p-12">
                <Spinner className="w-8 h-8 text-primary" />
              </div>
            ) : movements.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-2 text-center">
                <p className="font-bold text-foreground">
                  {t("inventory.noMovements")}
                </p>
                <p className="text-sm max-w-md">
                  {t("inventory.noMovementsHint")}
                </p>
                {canCreate && items.length > 0 && (
                  <button
                    onClick={() => openMovementModal()}
                    className="mt-2 text-primary font-bold hover:underline"
                  >
                    {t("inventory.recordMovement")}
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
                    <th className="text-start px-6 py-3">
                      {t("inventory.movementsTable.date")}
                    </th>
                    <th className="text-start px-3 py-3">
                      {t("inventory.movementsTable.item")}
                    </th>
                    <th className="text-center px-3 py-3">
                      {t("inventory.movementsTable.type")}
                    </th>
                    <th className="text-end px-3 py-3">
                      {t("inventory.movementsTable.quantity")}
                    </th>
                    <th className="text-end px-3 py-3">
                      {t("inventory.movementsTable.unitCost")}
                    </th>
                    <th className="text-end px-3 py-3">
                      {t("inventory.movementsTable.value")}
                    </th>
                    <th className="text-center px-6 py-3">
                      {t("inventory.movementsTable.entry")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id} className="border-t hover:bg-muted/40">
                      <td
                        className="px-6 py-3.5 font-sans tabular-nums text-foreground/80"
                        dir="ltr"
                      >
                        {m.date}
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="font-medium text-foreground">
                          {displayName(
                            { nameAr: m.itemNameAr, nameEn: m.itemNameEn },
                            lang,
                          )}
                        </div>
                        <div
                          className="text-xs text-muted-foreground font-sans"
                          dir="ltr"
                        >
                          {m.itemCode}
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-center">
                        {typeBadge(m.type)}
                      </td>
                      <td
                        className="px-3 py-3.5 text-end font-sans tabular-nums text-foreground/80"
                        dir="ltr"
                      >
                        {fmtQty(m.quantity)} {m.unit}
                      </td>
                      <td
                        className="px-3 py-3.5 text-end font-sans tabular-nums text-foreground/80"
                        dir="ltr"
                      >
                        {fmt(m.unitCost)}
                      </td>
                      <td
                        className="px-3 py-3.5 text-end font-bold font-sans tabular-nums text-foreground"
                        dir="ltr"
                      >
                        {fmt(m.totalValue)}
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        {m.journalEntryNo ? (
                          <span
                            className="text-xs font-bold text-primary font-sans"
                            dir="ltr"
                          >
                            #{m.journalEntryNo}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* item modal */}
      {itemModalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={closeItemModal}
          />
          <form
            onSubmit={handleSubmitItem(onSubmitItem)}
            className="relative bg-card rounded-2xl shadow-2xl w-full max-w-2xl border flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                <h2 className="text-base font-bold text-foreground">
                  {itemModalMode === "create"
                    ? t("inventory.createTitle")
                    : t("inventory.editTitle")}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeItemModal}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5 overflow-y-auto">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">
                  {t("inventory.unitLabel")}
                </label>
                <input
                  placeholder={t("inventory.unitPlaceholder")}
                  className="bg-background border rounded-xl h-11 px-4 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  {...registerItem("unit")}
                />
                {itemErrors.unit && (
                  <span className="text-xs text-destructive">
                    {t(`inventory.validation.${itemErrors.unit.message}`)}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">
                  {t("inventory.nameAr")}
                </label>
                <input
                  dir="rtl"
                  placeholder={t("inventory.namePlaceholder")}
                  className="bg-background border rounded-xl h-11 px-4 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  {...registerItem("nameAr")}
                />
                {itemErrors.nameAr && (
                  <span className="text-xs text-destructive">
                    {t(`inventory.validation.${itemErrors.nameAr.message}`)}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">
                  {t("inventory.nameEn")}
                  <span className="text-xs font-medium text-muted-foreground ms-2">
                    {t("inventory.optional")}
                  </span>
                </label>
                <input
                  dir="ltr"
                  placeholder={t("inventory.namePlaceholderEn")}
                  className="bg-background border rounded-xl h-11 px-4 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  {...registerItem("nameEn")}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">
                  {t("inventory.category")}
                  <span className="text-xs font-medium text-muted-foreground ms-2">
                    {t("inventory.optional")}
                  </span>
                </label>
                <input
                  placeholder={t("inventory.categoryPlaceholder")}
                  className="bg-background border rounded-xl h-11 px-4 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  {...registerItem("category")}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">
                  {t("inventory.inventoryAccount")}
                </label>
                <select
                  className="bg-background border rounded-xl h-11 px-3 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  {...registerItem("inventoryAccountId")}
                >
                  <option value="">{t("inventory.selectAccount")}</option>
                  {postableAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {accountLabel(a)}
                    </option>
                  ))}
                </select>
                {itemErrors.inventoryAccountId && (
                  <span className="text-xs text-destructive">
                    {t(
                      `inventory.validation.${itemErrors.inventoryAccountId.message}`,
                    )}
                  </span>
                )}
              </div>

              <div
                className="flex items-center justify-between bg-secondary/40 border border-secondary rounded-xl px-4 py-3 cursor-pointer sm:col-span-2"
                onClick={() => setItemValue("isActive", !itemActive)}
              >
                <span className="text-sm font-bold text-foreground">
                  {t("inventory.activeLabel")}
                </span>
                <div
                  className={`w-10 h-6 rounded-full flex items-center transition-colors px-0.5 ${
                    itemActive ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${
                      itemActive
                        ? "translate-x-4 rtl:-translate-x-4"
                        : "translate-x-0"
                    }`}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/30">
              <button
                type="button"
                onClick={closeItemModal}
                className="px-5 py-2.5 rounded-full text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={createItem.isPending || updateItem.isPending}
                className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-5 py-2.5 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
              >
                <Check className="w-4 h-4" />
                {createItem.isPending || updateItem.isPending
                  ? t("common.saving")
                  : t("inventory.save")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* movement modal */}
      {movementModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => setMovementModalOpen(false)}
          />
          <form
            onSubmit={handleSubmitMov(onSubmitMovement)}
            className="relative bg-card rounded-2xl shadow-2xl w-full max-w-2xl border flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-primary" />
                <h2 className="text-base font-bold text-foreground">
                  {t("inventory.movement.title")}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setMovementModalOpen(false)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5 overflow-y-auto">
              <p className="text-sm text-muted-foreground sm:col-span-2">
                {t("inventory.movement.hint")}
              </p>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">
                  {t("inventory.movement.item")}
                </label>
                <select
                  className="bg-background border rounded-xl h-11 px-3 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  {...registerMov("itemId")}
                >
                  <option value="">
                    {t("inventory.movement.selectItem")}
                  </option>
                  {items
                    .filter((i) => i.isActive)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.code} · {displayName(i, lang)}
                      </option>
                    ))}
                </select>
                {movErrors.itemId && (
                  <span className="text-xs text-destructive">
                    {t(`inventory.validation.${movErrors.itemId.message}`)}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">
                  {t("inventory.movement.date")}
                </label>
                <input
                  dir="ltr"
                  type="date"
                  className="bg-background border rounded-xl h-11 px-4 text-sm font-sans text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  {...registerMov("date")}
                />
                {movErrors.date && (
                  <span className="text-xs text-destructive">
                    {t(`inventory.validation.${movErrors.date.message}`)}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">
                  {t("inventory.movement.type")}
                </label>
                <select
                  className="bg-background border rounded-xl h-11 px-3 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  {...registerMov("type")}
                >
                  <option value="receipt">
                    {t("inventory.movement.types.receipt")}
                  </option>
                  <option value="issue">
                    {t("inventory.movement.types.issue")}
                  </option>
                  <option value="adjustment">
                    {t("inventory.movement.types.adjustment")}
                  </option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">
                  {t("inventory.movement.quantity")}
                </label>
                <input
                  dir="ltr"
                  type="number"
                  step="0.0001"
                  className="bg-background border rounded-xl h-11 px-4 text-sm font-sans text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  {...registerMov("quantity")}
                />
                {movType === "adjustment" && (
                  <span className="text-xs text-muted-foreground">
                    {t("inventory.movement.quantityHint")}
                  </span>
                )}
              </div>

              {movType === "receipt" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-foreground">
                    {t("inventory.movement.unitCost")}
                  </label>
                  <input
                    dir="ltr"
                    type="number"
                    step="0.0001"
                    className="bg-background border rounded-xl h-11 px-4 text-sm font-sans text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    {...registerMov("unitCost")}
                  />
                  <span className="text-xs text-muted-foreground">
                    {t("inventory.movement.unitCostHint")}
                  </span>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">
                  {t("inventory.movement.counterpartAccount")}
                </label>
                <select
                  className="bg-background border rounded-xl h-11 px-3 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  {...registerMov("counterpartAccountId")}
                >
                  <option value="">{t("inventory.selectAccount")}</option>
                  {postableAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {accountLabel(a)}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">
                  {counterpartHint}
                </span>
                {movErrors.counterpartAccountId && (
                  <span className="text-xs text-destructive">
                    {t(
                      `inventory.validation.${movErrors.counterpartAccountId.message}`,
                    )}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-sm font-bold text-foreground">
                  {t("inventory.movement.inventoryAccount")}
                  <span className="text-xs font-medium text-muted-foreground ms-2">
                    {t("inventory.optional")}
                  </span>
                </label>
                <select
                  className="bg-background border rounded-xl h-11 px-3 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  {...registerMov("inventoryAccountId")}
                >
                  <option value="">{t("inventory.selectAccount")}</option>
                  {postableAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {accountLabel(a)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-sm font-bold text-foreground">
                  {t("inventory.movement.notes")}
                  <span className="text-xs font-medium text-muted-foreground ms-2">
                    {t("inventory.optional")}
                  </span>
                </label>
                <input
                  placeholder={t("inventory.movement.notesPlaceholder")}
                  className="bg-background border rounded-xl h-11 px-4 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  {...registerMov("notes")}
                />
              </div>

              {selectedItem && (
                <div
                  className="sm:col-span-2 text-xs text-muted-foreground bg-muted/40 rounded-xl px-4 py-3"
                  dir="ltr"
                >
                  {t("inventory.movement.current", {
                    qty: fmtQty(selectedItem.quantityOnHand),
                    unit: selectedItem.unit,
                    cost: fmt(selectedItem.averageCost),
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/30">
              <button
                type="button"
                onClick={() => setMovementModalOpen(false)}
                className="px-5 py-2.5 rounded-full text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={createMovement.isPending}
                className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-5 py-2.5 rounded-full text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                <Check className="w-4 h-4" />
                {createMovement.isPending
                  ? t("inventory.movement.saving")
                  : t("inventory.movement.save")}
              </button>
            </div>
          </form>
        </div>
      )}

      <AlertDialog open={bulkDeleteOpen} onOpenChange={(open) => !open && setBulkDeleteOpen(false)}>
        <AlertDialogContent className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-start">حذف {selectedItemIds.size} صنف</AlertDialogTitle>
            <AlertDialogDescription className="text-start">
              سيتم حذف {selectedItemIds.size} صنف نهائياً ولا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogCancel disabled={isBulkDeleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDeleteItems} disabled={isBulkDeleting} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              {isBulkDeleting ? t("inventory.deleting") : "حذف المحدد"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!itemToDelete}
        onOpenChange={(open) => !open && setItemToDelete(null)}
      >
        <AlertDialogContent className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-start">
              {t("inventory.deleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-start">
              {t("inventory.deleteBody", {
                name: itemToDelete ? displayName(itemToDelete, lang) : "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteItem}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {deleteItem.isPending
                ? t("inventory.deleting")
                : t("inventory.confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
