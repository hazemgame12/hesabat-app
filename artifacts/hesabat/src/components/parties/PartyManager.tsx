import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type Account, useListCurrencies, useGetCompany, useUpdateCustomer, useUpdateSupplier } from "@workspace/api-client-react";
import { Plus, X, Check, Trash2, Edit2 } from "lucide-react";
import { GridTable, GridToggle, type GridColumn } from "@/components/GridTable";
import { Spinner } from "@/components/ui/spinner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { ExcelToolbar } from "@/components/ExcelToolbar";
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

export type Party = {
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
  createdAt: string;
};

export type PartyPayload = {
  nameAr: string;
  nameEn: string | null;
  type: "individual" | "company";
  taxNumber: string | null;
  commercialRegistration: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  currency: string | null;
  creditLimit?: number | null;
  creditPeriodDays: number | null;
  controlAccountId: string;
  isActive: boolean;
};

type Mutation = {
  mutate: (
    vars: { data: PartyPayload } | { id: string; data: PartyPayload },
    handlers: { onSuccess: () => void; onError: (err: unknown) => void },
  ) => void;
  isPending: boolean;
};

type DeleteMutation = {
  mutate: (
    vars: { id: string },
    handlers: { onSuccess: () => void; onError: (err: unknown) => void },
  ) => void;
  mutateAsync: (vars: { id: string }) => Promise<unknown>;
  isPending: boolean;
};

export interface PartyManagerConfig {
  /** i18n namespace ("customers" | "suppliers"). */
  ns: "customers" | "suppliers";
  icon: React.ComponentType<{ className?: string }>;
  /** Control group account code to preselect (e.g. "112" / "211"). */
  defaultControlCode: string;
  showCreditLimit: boolean;
}

interface PartyManagerProps {
  config: PartyManagerConfig;
  parties: Party[];
  partiesLoading: boolean;
  accounts: Account[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  createMut: Mutation;
  updateMut: Mutation;
  deleteMut: DeleteMutation;
  invalidate: () => void;
}

const partySchema = z.object({
  nameAr: z.string().min(1, "nameRequired"),
  nameEn: z.string().optional(),
  type: z.enum(["individual", "company"]).default("company"),
  controlAccountId: z.string().min(1, "controlRequired"),
  taxNumber: z.string().optional(),
  commercialRegistration: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  currency: z.string().optional(),
  creditLimit: z.string().optional(),
  creditPeriodDays: z.string().optional(),
  isActive: z.boolean().default(true),
});
type PartyForm = z.input<typeof partySchema>;

function displayName(
  e: { nameAr: string; nameEn?: string | null },
  lang: string,
): string {
  return lang.startsWith("en") && e.nameEn ? e.nameEn : e.nameAr;
}

export function PartyManager({
  config,
  parties,
  partiesLoading,
  accounts,
  canCreate,
  canUpdate,
  canDelete,
  createMut,
  updateMut,
  deleteMut,
  invalidate,
}: PartyManagerProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { toast } = useToast();
  const ns = config.ns;
  const Icon = config.icon;

  const { data: company } = useGetCompany();
  const baseCurrency = company?.baseCurrency ?? "EGP";
  const { data: currencies = [] } = useListCurrencies();
  const currencyCodes = useMemo(() => {
    const codes = [baseCurrency];
    for (const c of currencies) {
      if (c.isActive && c.code !== baseCurrency) codes.push(c.code);
    }
    return codes;
  }, [currencies, baseCurrency]);

  const groupAccounts = useMemo(
    () => accounts.filter((a: Account) => a.isGroup),
    [accounts],
  );
  const defaultControlId = useMemo(() => {
    const match = groupAccounts.find(
      (a) => a.code === config.defaultControlCode,
    );
    return match?.id ?? "";
  }, [groupAccounts, config.defaultControlCode]);

  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [toEdit, setToEdit] = useState<Party | null>(null);
  const [toDelete, setToDelete] = useState<Party | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isGridView, setIsGridView] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PartyForm>({
    resolver: zodResolver(partySchema),
    defaultValues: { type: "company", isActive: true },
  });
  const active = watch("isActive");

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(n);
  const accountLabel = (a: Account) => `${a.code} · ${displayName(a, lang)}`;

  const gridColumns: GridColumn<Party>[] = [
    { key: "code", header: t(`${ns}.code`), type: "readonly", width: "90px" },
    { key: "nameAr", header: t(`${ns}.name`) + " (ع)", type: "text", editable: canUpdate, validate: (v) => !v ? "مطلوب" : null },
    { key: "nameEn", header: t(`${ns}.name`) + " (EN)", type: "text", editable: canUpdate },
    { key: "phone", header: t(`${ns}.phone`), type: "text", editable: canUpdate },
    { key: "accountCode", header: t(`${ns}.account`), type: "readonly", align: "start" },
    { key: "balance", header: t(`${ns}.balance`), type: "number", align: "end", render: (v) => <span className="font-sans tabular-nums">{fmt(Number(v ?? 0))}</span> },
    { key: "isActive", header: t(`${ns}.status`), type: "boolean", editable: canUpdate, width: "80px",
      render: (v) => v
        ? <span className="text-[11px] font-bold text-success bg-success/10 px-2 py-0.5 rounded-full">{t(`${ns}.active`)}</span>
        : <span className="text-[11px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{t(`${ns}.inactive`)}</span>
    },
  ];

  const handleGridSave = async (changes: { id: string; field: string; oldValue: unknown; newValue: unknown }[]) => {
    const byRow = new Map<string, Record<string, unknown>>();
    for (const c of changes) {
      if (!byRow.has(c.id)) byRow.set(c.id, {});
      byRow.get(c.id)![c.field] = c.newValue;
    }
    for (const [id, patch] of byRow.entries()) {
      const party = parties.find((p) => p.id === id);
      if (!party) continue;
      const payload: Parameters<typeof updateMut.mutate>[0] = { id, data: {
        nameAr: String(patch.nameAr ?? party.nameAr),
        nameEn: patch.nameEn !== undefined ? (String(patch.nameEn) || null) : party.nameEn ?? null,
        type: party.type,
        taxNumber: party.taxNumber ?? null,
        commercialRegistration: party.commercialRegistration ?? null,
        phone: patch.phone !== undefined ? (String(patch.phone) || null) : party.phone ?? null,
        email: party.email ?? null,
        address: party.address ?? null,
        currency: party.currency ?? null,
        creditLimit: party.creditLimit ?? null,
        creditPeriodDays: party.creditPeriodDays ?? null,
        controlAccountId: party.controlAccountId,
        isActive: patch.isActive !== undefined ? Boolean(patch.isActive) : party.isActive,
      }};
      await new Promise<void>((res, rej) => updateMut.mutate(payload, { onSuccess: () => res(), onError: rej }));
    }
    invalidate();
  };

  const handleGridDelete = async (ids: string[]) => {
    for (const id of ids) await deleteMut.mutateAsync({ id });
    invalidate();
  };

  const openCreate = () => {
    reset({
      nameAr: "",
      nameEn: "",
      type: "company",
      controlAccountId: defaultControlId,
      taxNumber: "",
      commercialRegistration: "",
      phone: "",
      email: "",
      address: "",
      currency: "",
      creditLimit: "",
      creditPeriodDays: "",
      isActive: true,
    });
    setModalMode("create");
  };

  const openEdit = (p: Party) => {
    reset({
      nameAr: p.nameAr,
      nameEn: p.nameEn ?? "",
      type: p.type,
      controlAccountId: p.controlAccountId,
      taxNumber: p.taxNumber ?? "",
      commercialRegistration: p.commercialRegistration ?? "",
      phone: p.phone ?? "",
      email: p.email ?? "",
      address: p.address ?? "",
      currency: p.currency ?? "",
      creditLimit:
        p.creditLimit === null || p.creditLimit === undefined
          ? ""
          : String(p.creditLimit),
      creditPeriodDays:
        p.creditPeriodDays === null || p.creditPeriodDays === undefined
          ? ""
          : String(p.creditPeriodDays),
      isActive: p.isActive,
    });
    setToEdit(p);
    setModalMode("edit");
  };

  const closeModal = () => {
    setModalMode(null);
    setToEdit(null);
  };

  const handleBulkDelete = async () => {
    setIsBulkDeleting(true);
    let ok = 0; let fail = 0;
    for (const id of Array.from(selectedIds)) {
      try { await deleteMut.mutateAsync({ id }); ok++; }
      catch { fail++; }
    }
    setIsBulkDeleting(false);
    setBulkDeleteOpen(false);
    setSelectedIds(new Set());
    invalidate();
    if (ok > 0) toast({ title: `تم حذف ${ok} عنصر بنجاح` });
    if (fail > 0) toast({ variant: "destructive", title: t("common.error"), description: `فشل حذف ${fail} عنصر` });
  };

  const onSubmit = (form: PartyForm) => {
    const num = (v?: string): number | null => {
      if (v === undefined || v.trim() === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const payload: PartyPayload = {
      nameAr: form.nameAr,
      nameEn: form.nameEn?.trim() ? form.nameEn : null,
      type: form.type as "individual" | "company",
      taxNumber: form.taxNumber?.trim() ? form.taxNumber : null,
      commercialRegistration: form.commercialRegistration?.trim()
        ? form.commercialRegistration
        : null,
      phone: form.phone?.trim() ? form.phone : null,
      email: form.email?.trim() ? form.email : null,
      address: form.address?.trim() ? form.address : null,
      currency: form.currency?.trim() ? form.currency : null,
      creditPeriodDays: num(form.creditPeriodDays),
      controlAccountId: form.controlAccountId,
      isActive: form.isActive ?? true,
    };
    if (config.showCreditLimit) payload.creditLimit = num(form.creditLimit);

    if (modalMode === "create") {
      createMut.mutate(
        { data: payload },
        {
          onSuccess: () => {
            invalidate();
            toast({ title: t(`${ns}.toast.added`) });
            closeModal();
          },
          onError: (err: unknown) =>
            toast({
              variant: "destructive",
              title: t("common.error"),
              description:
                (err as { data?: { error?: string } })?.data?.error ||
                t(`${ns}.toast.addError`),
            }),
        },
      );
    } else if (modalMode === "edit" && toEdit) {
      updateMut.mutate(
        { id: toEdit.id, data: payload },
        {
          onSuccess: () => {
            invalidate();
            toast({ title: t(`${ns}.toast.edited`) });
            closeModal();
          },
          onError: (err: unknown) =>
            toast({
              variant: "destructive",
              title: t("common.error"),
              description:
                (err as { data?: { error?: string } })?.data?.error ||
                t(`${ns}.toast.editError`),
            }),
        },
      );
    }
  };

  const handleDelete = () => {
    if (!toDelete) return;
    deleteMut.mutate(
      { id: toDelete.id },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: t(`${ns}.toast.deleted`) });
          setToDelete(null);
        },
        onError: (err: unknown) => {
          toast({
            variant: "destructive",
            title: t("common.error"),
            description:
              (err as { data?: { error?: string } })?.data?.error ||
              t(`${ns}.toast.deleteError`),
          });
          setToDelete(null);
        },
      },
    );
  };

  const field = (
    name: keyof PartyForm,
    labelKey: string,
    opts: {
      optional?: boolean;
      dir?: "ltr" | "rtl";
      type?: string;
      placeholder?: string;
      colSpan?: boolean;
    } = {},
  ) => (
    <div
      className={`flex flex-col gap-1.5 ${opts.colSpan ? "sm:col-span-2" : ""}`}
    >
      <label className="text-sm font-bold text-foreground">
        {t(`${ns}.${labelKey}`)}
        {opts.optional && (
          <span className="text-xs font-medium text-muted-foreground ms-2">
            {t(`${ns}.optional`)}
          </span>
        )}
      </label>
      <input
        dir={opts.dir}
        type={opts.type ?? "text"}
        placeholder={opts.placeholder}
        className="bg-background border rounded-xl h-11 px-4 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        {...register(name)}
      />
      {errors[name] && (
        <span className="text-xs text-destructive">
          {t(`${ns}.validation.${String(errors[name]?.message)}`)}
        </span>
      )}
    </div>
  );

  return (
    <div className="flex flex-col">
      <header className="h-20 bg-background/80 backdrop-blur-md border-b flex items-center justify-between px-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-card border shadow-sm flex items-center justify-center text-primary">
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">
              {t(`${ns}.title`)}
            </h1>
            <p className="text-sm text-muted-foreground font-medium">
              {t(`${ns}.subtitle`)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <GridToggle isGrid={isGridView} onToggle={() => setIsGridView((v) => !v)} />
          <ExcelToolbar
            exportPath={`/api/${ns}/export`}
            importPath={`/api/${ns}/import`}
            canImport={canCreate}
            onImported={invalidate}
          />
          {canCreate && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              {t(`${ns}.add`)}
            </button>
          )}
        </div>
      </header>

      <div className="p-8 flex flex-col gap-6 max-w-6xl mx-auto w-full">
        <div className="bg-card border rounded-2xl shadow-sm overflow-hidden min-h-[300px]">
          {partiesLoading ? (
            <div className="flex items-center justify-center p-12">
              <Spinner className="w-8 h-8 text-primary" />
            </div>
          ) : parties.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-2 text-center">
              <p className="font-bold text-foreground">{t(`${ns}.empty`)}</p>
              <p className="text-sm max-w-md">{t(`${ns}.emptyHint`)}</p>
              {canCreate && (
                <button
                  onClick={openCreate}
                  className="mt-2 text-primary font-bold hover:underline"
                >
                  {t(`${ns}.addFirst`)}
                </button>
              )}
            </div>
          ) : isGridView ? (
            <GridTable
              rows={parties}
              columns={gridColumns}
              canEdit={canUpdate}
              canDelete={canDelete}
              onSave={handleGridSave}
              onDeleteRows={handleGridDelete}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              emptyMessage={t(`${ns}.empty`)}
            />
          ) : (
            <>
              {selectedIds.size > 0 && canDelete && (
                <div className="flex items-center gap-3 bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex-wrap">
                  <span className="text-sm font-bold text-slate-700">تم تحديد {selectedIds.size} عنصر</span>
                  <button onClick={() => setBulkDeleteOpen(true)} className="flex items-center gap-2 bg-destructive text-destructive-foreground px-3 py-1.5 rounded-lg text-sm font-bold hover:opacity-90">
                    <Trash2 className="w-4 h-4" />حذف المحدد
                  </button>
                  <button onClick={() => setSelectedIds(new Set())} className="text-sm text-slate-500 hover:underline ms-auto">إلغاء التحديد</button>
                </div>
              )}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
                    {canDelete && (
                      <th className="px-3 py-3 w-8">
                        {(() => {
                          const all = parties.length > 0 && parties.every((p) => selectedIds.has(p.id));
                          const some = parties.some((p) => selectedIds.has(p.id)) && !all;
                          return <input type="checkbox" checked={all} ref={(el) => { if (el) el.indeterminate = some; }} onChange={() => all ? setSelectedIds(new Set()) : setSelectedIds(new Set(parties.map((p) => p.id)))} className="w-4 h-4 accent-primary cursor-pointer" />;
                        })()}
                      </th>
                    )}
                    <th className="text-start px-6 py-3">{t(`${ns}.code`)}</th>
                    <th className="text-start px-3 py-3">{t(`${ns}.name`)}</th>
                    <th className="text-start px-3 py-3">{t(`${ns}.account`)}</th>
                    <th className="text-start px-3 py-3">{t(`${ns}.phone`)}</th>
                    <th className="text-end px-3 py-3">{t(`${ns}.balance`)}</th>
                    <th className="text-center px-3 py-3">{t(`${ns}.status`)}</th>
                    {(canUpdate || canDelete) && <th className="w-20 px-6 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {parties.map((p) => (
                  <tr
                    key={p.id}
                    className={`group border-t hover:bg-muted/40 transition-colors ${selectedIds.has(p.id) ? "bg-rose-50/40" : ""}`}
                  >
                    {canDelete && (
                      <td className="px-3 py-3.5">
                        <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => { const n = new Set(selectedIds); n.has(p.id) ? n.delete(p.id) : n.add(p.id); setSelectedIds(n); }} className="w-4 h-4 accent-primary cursor-pointer" />
                      </td>
                    )}
                    <td
                      className="px-6 py-3.5 font-sans tabular-nums text-foreground/80"
                      dir="ltr"
                    >
                      {p.code}
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="font-medium text-foreground">
                        {displayName(p, lang)}
                      </div>
                      {p.taxNumber && (
                        <div className="text-xs text-muted-foreground" dir="ltr">
                          {p.taxNumber}
                        </div>
                      )}
                    </td>
                    <td
                      className="px-3 py-3.5 font-sans tabular-nums text-foreground/70"
                      dir="ltr"
                    >
                      {p.accountCode}
                    </td>
                    <td className="px-3 py-3.5 text-foreground/80" dir="ltr">
                      {p.phone || "—"}
                    </td>
                    <td
                      className="px-3 py-3.5 text-end font-bold font-sans tabular-nums text-foreground"
                      dir="ltr"
                    >
                      {fmt(p.balance)}
                    </td>
                    <td className="px-3 py-3.5 text-center">
                      {p.isActive ? (
                        <span className="text-[11px] font-bold text-success bg-success/10 px-2.5 py-1 rounded-full">
                          {t(`${ns}.active`)}
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                          {t(`${ns}.inactive`)}
                        </span>
                      )}
                    </td>
                    {(canUpdate || canDelete) && (
                      <td className="px-6 py-3.5">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 justify-end">
                          {canUpdate && (
                            <button
                              onClick={() => openEdit(p)}
                              className="p-1.5 rounded-md hover:bg-primary/10 text-primary transition-colors"
                              title={t("common.edit")}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => setToDelete(p)}
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
      </div>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={(open) => !open && setBulkDeleteOpen(false)}>
        <AlertDialogContent className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-start">حذف {selectedIds.size} عنصر</AlertDialogTitle>
            <AlertDialogDescription className="text-start">
              سيتم حذف {selectedIds.size} عنصر نهائياً ولا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogCancel disabled={isBulkDeleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={isBulkDeleting} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              {isBulkDeleting ? "جارٍ الحذف..." : "حذف المحدد"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={closeModal}
          />
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="relative bg-card rounded-2xl shadow-2xl w-full max-w-2xl border flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <Icon className="w-5 h-5 text-primary" />
                <h2 className="text-base font-bold text-foreground">
                  {modalMode === "create"
                    ? t(`${ns}.createTitle`)
                    : t(`${ns}.editTitle`)}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5 overflow-y-auto">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">
                  {t(`${ns}.typeLabel`)}
                </label>
                <select
                  className="bg-background border rounded-xl h-11 px-3 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  {...register("type")}
                >
                  <option value="company">{t(`${ns}.types.company`)}</option>
                  <option value="individual">
                    {t(`${ns}.types.individual`)}
                  </option>
                </select>
              </div>

              {field("nameAr", "nameAr", { dir: "rtl" })}
              {field("nameEn", "nameEn", { dir: "ltr", optional: true })}

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-sm font-bold text-foreground">
                  {t(`${ns}.controlAccount`)}
                </label>
                <select
                  className="bg-background border rounded-xl h-11 px-3 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  {...register("controlAccountId")}
                >
                  <option value="">{t(`${ns}.selectAccount`)}</option>
                  {groupAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {accountLabel(a)}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">
                  {t(`${ns}.controlHint`)}
                </span>
                {errors.controlAccountId && (
                  <span className="text-xs text-destructive">
                    {t(
                      `${ns}.validation.${String(errors.controlAccountId.message)}`,
                    )}
                  </span>
                )}
              </div>

              {field("taxNumber", "taxNumber", { dir: "ltr", optional: true })}
              {field("commercialRegistration", "commercialRegistration", {
                dir: "ltr",
                optional: true,
              })}
              {field("phone", "phone", { dir: "ltr", optional: true })}
              {field("email", "email", {
                dir: "ltr",
                optional: true,
                type: "email",
              })}
              {field("address", "address", { optional: true, colSpan: true })}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">
                  {t(`${ns}.currency`)}
                  <span className="text-xs font-medium text-muted-foreground ms-2">
                    {t(`${ns}.optional`)}
                  </span>
                </label>
                <select
                  dir="ltr"
                  className="bg-background border rounded-xl h-11 px-4 text-sm text-start focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  {...register("currency")}
                >
                  {currencyCodes.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>
              {field("creditPeriodDays", "creditPeriodDays", {
                dir: "ltr",
                optional: true,
                type: "number",
              })}
              {config.showCreditLimit &&
                field("creditLimit", "creditLimit", {
                  dir: "ltr",
                  optional: true,
                  type: "number",
                })}

              <div
                className="flex items-center justify-between bg-secondary/40 border border-secondary rounded-xl px-4 py-3 cursor-pointer sm:col-span-2"
                onClick={() => setValue("isActive", !active)}
              >
                <span className="text-sm font-bold text-foreground">
                  {t(`${ns}.activeLabel`)}
                </span>
                <div
                  className={`w-10 h-6 rounded-full flex items-center transition-colors px-0.5 ${
                    active ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${
                      active
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
                onClick={closeModal}
                className="px-5 py-2.5 rounded-full text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={createMut.isPending || updateMut.isPending}
                className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-5 py-2.5 rounded-full text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                <Check className="w-4 h-4" />
                {createMut.isPending || updateMut.isPending
                  ? t("common.saving")
                  : t(`${ns}.save`)}
              </button>
            </div>
          </form>
        </div>
      )}

      <AlertDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
      >
        <AlertDialogContent className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-start">
              {t(`${ns}.deleteTitle`)}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-start">
              {t(`${ns}.deleteBody`, {
                name: toDelete ? displayName(toDelete, lang) : "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {deleteMut.isPending
                ? t(`${ns}.deleting`)
                : t(`${ns}.confirmDelete`)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
