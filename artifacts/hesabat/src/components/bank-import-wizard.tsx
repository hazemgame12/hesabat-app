import React, { useState, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Upload,
  X,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Account, CostCenter } from "@workspace/api-client-react";

// ============================================================
// Types
// ============================================================
type DateFmt = "auto" | "dd/mm/yyyy" | "mm/dd/yyyy" | "yyyy-mm-dd" | "excel";
type WizardStep = "mapping" | "preview" | "done";
type AmtMode = "split" | "single";

type ColMap = {
  date: number | null;
  debit: number | null;
  credit: number | null;
  amount: number | null;
  notes: number | null;
  reference: number | null;
  balance: number | null;
};

type RawData = {
  headers: string[];
  rows: Array<{ rowNo: number; cells: string[] }>;
  totalRows: number;
};

type PRow = {
  rowNo: number;
  date: string;
  dateErr: string | null;
  direction: "in" | "out";
  amount: number;
  amtErr: string | null;
  notes: string;
  reference: string;
  counterpartAccountId: string;
  costCenterId: string;
  description: string;
  ovDate?: string;
  ovDirection?: "in" | "out";
  ovAmount?: number;
};

// ============================================================
// Pure helpers
// ============================================================
function parseDate(raw: string, fmt: DateFmt): { date: string; err: string | null } {
  const s = raw.trim();
  if (!s) return { date: "", err: "التاريخ مفقود" };
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { date: s, err: null };
  const isSerial = /^\d{4,5}(\.\d*)?$/.test(s);
  if (fmt === "excel" || (fmt === "auto" && isSerial)) {
    const n = parseFloat(s);
    if (!isNaN(n) && n > 1) {
      const d = new Date(Math.round((n - 25569) * 86400000));
      if (!isNaN(d.getTime())) return { date: d.toISOString().slice(0, 10), err: null };
    }
    if (fmt === "excel") return { date: "", err: `رقم Excel غير صحيح: ${s}` };
  }
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m) {
    const [, p1, p2, p3] = m;
    const yr = p3.length === 2 ? `20${p3}` : p3;
    const mk = (day: string, mo: string): string | null => {
      const iso = `${yr}-${mo.padStart(2, "0")}-${day.padStart(2, "0")}`;
      return new Date(iso + "T00:00:00").toISOString().startsWith(iso) ? iso : null;
    };
    if (fmt === "dd/mm/yyyy") {
      const d = mk(p1, p2);
      return d ? { date: d, err: null } : { date: "", err: `تاريخ غير صحيح: ${s}` };
    }
    if (fmt === "mm/dd/yyyy") {
      const d = mk(p2, p1);
      return d ? { date: d, err: null } : { date: "", err: `تاريخ غير صحيح: ${s}` };
    }
    const dmy = mk(p1, p2);
    if (dmy) return { date: dmy, err: null };
    const mdy = mk(p2, p1);
    if (mdy) return { date: mdy, err: null };
    return { date: "", err: `تاريخ غير صحيح: ${s}` };
  }
  return { date: "", err: `صيغة غير معروفة: ${s}` };
}

function parseAmt(
  cells: string[],
  m: ColMap,
): { direction: "in" | "out"; amount: number; err: string | null } {
  const g = (idx: number | null) =>
    idx !== null ? (cells[idx] ?? "").replace(/,/g, "") : "";
  if (m.debit !== null || m.credit !== null) {
    const d = parseFloat(g(m.debit)) || 0;
    const c = parseFloat(g(m.credit)) || 0;
    if (d > 0 && c > 0) return { direction: "in", amount: 0, err: "مدين ودائن في نفس الوقت" };
    if (d === 0 && c === 0) return { direction: "in", amount: 0, err: "لا يوجد مبلغ" };
    return d > 0
      ? { direction: "in", amount: d, err: null }
      : { direction: "out", amount: c, err: null };
  }
  if (m.amount !== null) {
    const a = parseFloat(g(m.amount));
    if (!a) return { direction: "in", amount: 0, err: "المبلغ صفر أو غير صحيح" };
    return { direction: a > 0 ? "in" : "out", amount: Math.abs(a), err: null };
  }
  return { direction: "in", amount: 0, err: "لم يُحدَّد عمود المبلغ" };
}

function buildPreviewRows(
  data: RawData,
  mapping: ColMap,
  amtMode: AmtMode,
  fmt: DateFmt,
): PRow[] {
  const m: ColMap =
    amtMode === "single"
      ? { ...mapping, debit: null, credit: null }
      : { ...mapping, amount: null };
  const g = (cells: string[], idx: number | null) =>
    idx !== null ? (cells[idx] ?? "") : "";
  return data.rows.map(({ rowNo, cells }) => {
    const { date, err: dateErr } = parseDate(g(cells, m.date), fmt);
    const { direction, amount, err: amtErr } = parseAmt(cells, m);
    return {
      rowNo,
      date,
      dateErr,
      direction,
      amount,
      amtErr,
      notes: g(cells, m.notes),
      reference: g(cells, m.reference),
      counterpartAccountId: "",
      costCenterId: "",
      description: "",
    };
  });
}

function effectiveDate(r: PRow) {
  return r.ovDate ?? r.date;
}
function effectiveAmt(r: PRow) {
  return r.ovAmount ?? r.amount;
}
function effectiveDir(r: PRow) {
  return r.ovDirection ?? r.direction;
}
function isRowValid(r: PRow): boolean {
  const d = effectiveDate(r);
  const a = effectiveAmt(r);
  return !r.dateErr && !r.amtErr && /^\d{4}-\d{2}-\d{2}$/.test(d) && a > 0;
}

// ============================================================
// Main component
// ============================================================
export function BankImportWizard({
  bankAccountId,
  canImport,
  leafAccounts,
  costCenters,
  onDone,
}: {
  bankAccountId: string;
  canImport: boolean;
  leafAccounts: Account[];
  costCenters: CostCenter[];
  onDone: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const lang = i18n.language;
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>("mapping");
  const [rawData, setRawData] = useState<RawData | null>(null);
  const [mapping, setMapping] = useState<ColMap>({
    date: null,
    debit: null,
    credit: null,
    amount: null,
    notes: null,
    reference: null,
    balance: null,
  });
  const [amtMode, setAmtMode] = useState<AmtMode>("split");
  const [dateFmt, setDateFmt] = useState<DateFmt>("auto");
  const [rows, setRows] = useState<PRow[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [doneStats, setDoneStats] = useState({ imported: 0, posted: 0, pending: 0 });

  const [defAccount, setDefAccount] = useState("");
  const [defCostCenter, setDefCostCenter] = useState("");
  const [defDescription, setDefDescription] = useState("");

  // ---- Upload ----
  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `/api/bank/movements/parse-preview?bankAccountId=${bankAccountId}`,
        { method: "POST", body: form, credentials: "include" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? t("common.importError"));
      const data = body as RawData;
      setRawData(data);
      const h = data.headers;
      const fi = (...kws: string[]) =>
        h.findIndex((hdr) =>
          kws.some((k) => hdr.toLowerCase().includes(k.toLowerCase())),
        );
      const dateIdx = fi("تاريخ", "date");
      const debitIdx = fi("مدين", "debit", "وارد", "إيداع", "credit(in)");
      const creditIdx = fi("دائن", "credit", "صادر", "سحب", "debit(out)");
      const notesIdx = fi("وصف", "البيان", "ملاحظ", "notes", "desc", "narr");
      const refIdx = fi("مرجع", "ref", "reference");
      const balIdx = fi("رصيد", "balance");
      setMapping({
        date: dateIdx >= 0 ? dateIdx : 0,
        debit: debitIdx >= 0 ? debitIdx : null,
        credit: creditIdx >= 0 ? creditIdx : null,
        amount: null,
        notes: notesIdx >= 0 ? notesIdx : null,
        reference: refIdx >= 0 ? refIdx : null,
        balance: balIdx >= 0 ? balIdx : null,
      });
      setAmtMode(debitIdx >= 0 || creditIdx >= 0 ? "split" : "single");
      setStep("mapping");
      setOpen(true);
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: err instanceof Error ? err.message : t("common.importError"),
      });
    } finally {
      setUploading(false);
    }
  };

  // ---- Step 1 → 2 ----
  const handlePreview = () => {
    if (!rawData) return;
    setRows(buildPreviewRows(rawData, mapping, amtMode, dateFmt));
    setDefAccount("");
    setDefCostCenter("");
    setDefDescription("");
    setStep("preview");
  };

  // ---- Defaults ----
  const applyDefaults = useCallback(
    (overwrite: boolean) => {
      setRows((prev) =>
        prev.map((r) => ({
          ...r,
          counterpartAccountId:
            overwrite || !r.counterpartAccountId
              ? defAccount || r.counterpartAccountId
              : r.counterpartAccountId,
          costCenterId:
            overwrite || !r.costCenterId
              ? defCostCenter || r.costCenterId
              : r.costCenterId,
          description:
            overwrite || !r.description
              ? defDescription || r.description
              : r.description,
        })),
      );
    },
    [defAccount, defCostCenter, defDescription],
  );

  // ---- Stats ----
  const validRows = useMemo(() => rows.filter(isRowValid), [rows]);
  const classifiedRows = useMemo(
    () => validRows.filter((r) => !!r.counterpartAccountId),
    [validRows],
  );
  const pendingRows = useMemo(
    () => validRows.filter((r) => !r.counterpartAccountId),
    [validRows],
  );
  const errorCount = rows.length - validRows.length;

  // ---- Confirm ----
  const handleConfirm = async (onlyValid: boolean) => {
    setConfirming(true);
    try {
      const src = onlyValid ? validRows : rows.filter(isRowValid);
      const payload = src.map((r) => ({
        date: effectiveDate(r),
        direction: effectiveDir(r),
        amount: effectiveAmt(r),
        notes: r.notes || null,
        reference: r.reference || null,
        counterpartAccountId: r.counterpartAccountId || null,
        costCenterId: r.costCenterId || null,
        description: r.description || null,
      }));
      const res = await fetch(
        `/api/bank/movements/import-batch?bankAccountId=${bankAccountId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ rows: payload }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? t("common.error"));
      setDoneStats({
        imported: body.imported ?? src.length,
        posted: body.posted ?? 0,
        pending: body.pending ?? 0,
      });
      setStep("done");
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: err instanceof Error ? err.message : t("common.error"),
      });
    } finally {
      setConfirming(false);
    }
  };

  // ---- Row updates ----
  const updateRow = useCallback((idx: number, patch: Partial<PRow>) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }, []);

  const patchDate = useCallback(
    (idx: number, raw: string) => {
      const { date, err } = parseDate(raw, dateFmt);
      setRows((prev) => {
        const next = [...prev];
        const r = next[idx];
        next[idx] = {
          ...r,
          ovDate: raw,
          date: date || r.date,
          dateErr: err,
        };
        return next;
      });
    },
    [dateFmt],
  );

  // ---- Close ----
  const handleClose = () => {
    setOpen(false);
    if (step === "done") onDone();
    setTimeout(() => {
      setStep("mapping");
      setRawData(null);
      setRows([]);
    }, 300);
  };

  const acctLabel = (a: Account) =>
    `${a.code} — ${lang === "ar" ? (a.nameAr ?? a.nameEn) : (a.nameEn ?? a.nameAr)}`;
  const ccLabel = (c: CostCenter) =>
    (lang === "ar" ? c.nameAr : c.nameEn) ?? c.nameAr ?? c.nameEn ?? "";

  if (!canImport) return null;

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept=".xlsx,.xls"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) handleFile(f);
        }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-2 bg-card border px-4 py-2 rounded-full text-sm font-bold text-foreground hover:bg-muted/50 transition-colors disabled:opacity-60"
      >
        {uploading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Upload className="w-4 h-4" />
        )}
        {t("bank.wizard.importBtn")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
          <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
          <div
            className="relative bg-background rounded-2xl shadow-2xl w-full flex flex-col"
            style={{ maxWidth: "1140px", maxHeight: "93vh" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <div>
                <h2 className="text-base font-bold">{t("bank.wizard.title")}</h2>
                <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                  {(["mapping", "preview", "done"] as WizardStep[]).map((s, i) => (
                    <React.Fragment key={s}>
                      <span
                        className={
                          step === s ? "text-primary font-bold" : "text-muted-foreground/60"
                        }
                      >
                        {i + 1}. {t(`bank.wizard.steps.${s}`)}
                      </span>
                      {i < 2 && <ChevronRight className="w-3 h-3 text-muted-foreground/40" />}
                    </React.Fragment>
                  ))}
                </div>
              </div>
              <button
                onClick={handleClose}
                className="text-muted-foreground hover:text-foreground p-1 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">
              {step === "mapping" && rawData && (
                <MappingStep
                  rawData={rawData}
                  mapping={mapping}
                  setMapping={setMapping}
                  amtMode={amtMode}
                  setAmtMode={setAmtMode}
                  dateFmt={dateFmt}
                  setDateFmt={setDateFmt}
                  t={t}
                />
              )}
              {step === "preview" && (
                <PreviewStep
                  rows={rows}
                  leafAccounts={leafAccounts}
                  costCenters={costCenters}
                  validCount={validRows.length}
                  errorCount={errorCount}
                  classifiedCount={classifiedRows.length}
                  pendingCount={pendingRows.length}
                  defAccount={defAccount}
                  defCostCenter={defCostCenter}
                  defDescription={defDescription}
                  setDefAccount={setDefAccount}
                  setDefCostCenter={setDefCostCenter}
                  setDefDescription={setDefDescription}
                  onApplyDefaults={applyDefaults}
                  onUpdateRow={updateRow}
                  onPatchDate={patchDate}
                  acctLabel={acctLabel}
                  ccLabel={ccLabel}
                  lang={lang}
                  t={t}
                />
              )}
              {step === "done" && <DoneStep stats={doneStats} t={t} />}
            </div>

            {/* Footer */}
            <div className="border-t px-6 py-4 flex items-center justify-between shrink-0">
              <button
                onClick={handleClose}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {t("common.close")}
              </button>
              <div className="flex items-center gap-3">
                {step === "mapping" && (
                  <button
                    onClick={handlePreview}
                    className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2 rounded-full text-sm font-bold hover:opacity-90"
                  >
                    {t("bank.wizard.previewBtn")}
                    {lang === "ar" ? (
                      <ArrowLeft className="w-4 h-4" />
                    ) : (
                      <ArrowRight className="w-4 h-4" />
                    )}
                  </button>
                )}
                {step === "preview" && (
                  <>
                    <button
                      onClick={() => setStep("mapping")}
                      className="flex items-center gap-2 border px-4 py-2 rounded-full text-sm font-bold hover:bg-muted/50"
                    >
                      {lang === "ar" ? (
                        <ArrowRight className="w-4 h-4" />
                      ) : (
                        <ArrowLeft className="w-4 h-4" />
                      )}
                      {t("bank.wizard.backBtn")}
                    </button>
                    {errorCount > 0 && validRows.length > 0 && (
                      <button
                        onClick={() => handleConfirm(true)}
                        disabled={confirming}
                        className="border px-4 py-2 rounded-full text-sm font-bold hover:bg-muted/50 disabled:opacity-60"
                      >
                        {confirming && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin inline me-1" />
                        )}
                        {t("bank.wizard.importValidOnly", { count: validRows.length })}
                      </button>
                    )}
                    <button
                      onClick={() => handleConfirm(errorCount === 0)}
                      disabled={confirming || validRows.length === 0}
                      className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2 rounded-full text-sm font-bold hover:opacity-90 disabled:opacity-50"
                    >
                      {confirming && <Loader2 className="w-4 h-4 animate-spin" />}
                      {errorCount === 0
                        ? t("bank.wizard.confirmBtn", { count: rows.length })
                        : t("bank.wizard.confirmAllBtn", {
                            count: rows.length,
                            errors: errorCount,
                          })}
                    </button>
                  </>
                )}
                {step === "done" && (
                  <button
                    onClick={handleClose}
                    className="bg-primary text-primary-foreground px-5 py-2 rounded-full text-sm font-bold hover:opacity-90"
                  >
                    {t("common.done")}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// Step 1 — Column Mapping
// ============================================================
function MappingStep({
  rawData,
  mapping,
  setMapping,
  amtMode,
  setAmtMode,
  dateFmt,
  setDateFmt,
  t,
}: {
  rawData: RawData;
  mapping: ColMap;
  setMapping: React.Dispatch<React.SetStateAction<ColMap>>;
  amtMode: AmtMode;
  setAmtMode: React.Dispatch<React.SetStateAction<AmtMode>>;
  dateFmt: DateFmt;
  setDateFmt: React.Dispatch<React.SetStateAction<DateFmt>>;
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  const preview5 = rawData.rows.slice(0, 5);
  const setCol = (field: keyof ColMap, val: string) =>
    setMapping((prev) => ({ ...prev, [field]: val === "" ? null : Number(val) }));

  const ColSelect = ({
    field,
    label,
    optional = true,
  }: {
    field: keyof ColMap;
    label: string;
    optional?: boolean;
  }) => (
    <div className="flex items-center gap-3">
      <span className="text-sm w-32 shrink-0 text-muted-foreground">{label}</span>
      <select
        className="flex-1 text-sm border rounded-lg px-3 py-1.5 bg-background"
        value={mapping[field] ?? ""}
        onChange={(e) => setCol(field, e.target.value)}
      >
        {optional && <option value="">— {t("bank.wizard.noColumn")} —</option>}
        {rawData.headers.map((h, i) => (
          <option key={i} value={i}>
            {h}
          </option>
        ))}
      </select>
    </div>
  );

  const firstDateRaw =
    mapping.date !== null
      ? (preview5.find((r) => r.cells[mapping.date!])?.cells[mapping.date!] ?? "")
      : "";
  const { date: previewDate, err: previewDateErr } = parseDate(firstDateRaw, dateFmt);

  return (
    <div className="space-y-5">
      <div className="bg-muted/30 rounded-xl px-4 py-3 text-sm font-bold">
        {t("bank.wizard.fileInfo", {
          rows: rawData.totalRows,
          cols: rawData.headers.length,
        })}
      </div>

      {/* Mini raw preview */}
      <div>
        <p className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wide">
          {t("bank.wizard.rawPreview")}
        </p>
        <div className="overflow-x-auto rounded-xl border">
          <table className="text-xs w-full">
            <thead className="bg-muted/40">
              <tr>
                {rawData.headers.map((h, i) => (
                  <th key={i} className="px-3 py-2 text-start font-bold text-muted-foreground whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {preview5.map((r, ri) => (
                <tr key={ri}>
                  {r.cells.map((c, ci) => (
                    <td key={ci} className="px-3 py-1.5 font-mono text-muted-foreground whitespace-nowrap">
                      {c || "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Column mapping */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
            {t("bank.wizard.columnMapping")}
          </p>
          <ColSelect field="date" label={t("bank.wizard.fields.date")} optional={false} />

          <div className="flex items-center gap-2">
            <button
              onClick={() => setAmtMode("split")}
              className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${amtMode === "split" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/50"}`}
            >
              {t("bank.wizard.amtSplit")}
            </button>
            <button
              onClick={() => setAmtMode("single")}
              className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${amtMode === "single" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/50"}`}
            >
              {t("bank.wizard.amtSingle")}
            </button>
          </div>

          {amtMode === "split" ? (
            <>
              <ColSelect field="debit" label={t("bank.wizard.fields.debit")} />
              <ColSelect field="credit" label={t("bank.wizard.fields.credit")} />
            </>
          ) : (
            <ColSelect field="amount" label={t("bank.wizard.fields.amount")} />
          )}
          <ColSelect field="notes" label={t("bank.wizard.fields.notes")} />
          <ColSelect field="reference" label={t("bank.wizard.fields.reference")} />
          <ColSelect field="balance" label={t("bank.wizard.fields.balance")} />
        </div>

        {/* Date format */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
            {t("bank.wizard.dateFormat")}
          </p>
          {(["auto", "dd/mm/yyyy", "mm/dd/yyyy", "yyyy-mm-dd", "excel"] as DateFmt[]).map(
            (f) => (
              <label key={f} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="datefmt"
                  value={f}
                  checked={dateFmt === f}
                  onChange={() => setDateFmt(f)}
                  className="accent-primary"
                />
                <span className="text-sm font-mono">
                  {f === "auto" ? t("bank.wizard.dateFmtAuto") : f.toUpperCase()}
                </span>
              </label>
            ),
          )}
          {firstDateRaw && (
            <div className="mt-3 bg-muted/30 rounded-xl px-4 py-3 space-y-1">
              <p className="text-xs text-muted-foreground">{t("bank.wizard.datePreview")}</p>
              <p className="text-xs font-mono text-muted-foreground">
                {t("bank.wizard.raw")}: <strong>{firstDateRaw}</strong>
              </p>
              {previewDateErr ? (
                <p className="text-xs text-red-600">{previewDateErr}</p>
              ) : (
                <p className="text-xs text-green-700 font-bold">{previewDate}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Step 2 — Preview + Classification
// ============================================================
function PreviewStep({
  rows,
  leafAccounts,
  costCenters,
  validCount,
  errorCount,
  classifiedCount,
  pendingCount,
  defAccount,
  defCostCenter,
  defDescription,
  setDefAccount,
  setDefCostCenter,
  setDefDescription,
  onApplyDefaults,
  onUpdateRow,
  onPatchDate,
  acctLabel,
  ccLabel,
  lang,
  t,
}: {
  rows: PRow[];
  leafAccounts: Account[];
  costCenters: CostCenter[];
  validCount: number;
  errorCount: number;
  classifiedCount: number;
  pendingCount: number;
  defAccount: string;
  defCostCenter: string;
  defDescription: string;
  setDefAccount: (v: string) => void;
  setDefCostCenter: (v: string) => void;
  setDefDescription: (v: string) => void;
  onApplyDefaults: (overwrite: boolean) => void;
  onUpdateRow: (idx: number, patch: Partial<PRow>) => void;
  onPatchDate: (idx: number, raw: string) => void;
  acctLabel: (a: Account) => string;
  ccLabel: (c: CostCenter) => string;
  lang: string;
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  const fmt = (n: number) =>
    n.toLocaleString(lang === "ar" ? "ar-EG" : "en-US", { minimumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-3 items-center bg-muted/30 rounded-xl px-4 py-3 text-sm">
        <span className="font-bold">
          {rows.length} {t("bank.wizard.rows")}
        </span>
        {errorCount > 0 && (
          <span className="flex items-center gap-1 text-red-600 font-bold">
            <AlertTriangle className="w-3.5 h-3.5" />
            {errorCount} {t("bank.wizard.errors")}
          </span>
        )}
        <span className="flex items-center gap-1 text-green-700 font-bold">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {validCount} {t("bank.wizard.valid")}
        </span>
        {classifiedCount > 0 && (
          <span className="text-primary font-bold">
            {classifiedCount} {t("bank.wizard.classified")}
          </span>
        )}
        {pendingCount > 0 && (
          <span className="text-muted-foreground">
            {pendingCount} {t("bank.wizard.pendingRows")}
          </span>
        )}
      </div>

      {/* Global defaults panel */}
      <div className="border rounded-xl px-4 py-3 space-y-3 bg-muted/10">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
          {t("bank.wizard.applyAllTitle")}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select
            className="text-sm border rounded-lg px-3 py-1.5 bg-background"
            value={defAccount}
            onChange={(e) => setDefAccount(e.target.value)}
          >
            <option value="">— {t("bank.wizard.fields.counterpart")} —</option>
            {leafAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {acctLabel(a)}
              </option>
            ))}
          </select>
          <select
            className="text-sm border rounded-lg px-3 py-1.5 bg-background"
            value={defCostCenter}
            onChange={(e) => setDefCostCenter(e.target.value)}
          >
            <option value="">— {t("bank.wizard.fields.costCenter")} —</option>
            {costCenters.map((c) => (
              <option key={c.id} value={c.id}>
                {ccLabel(c)}
              </option>
            ))}
          </select>
          <input
            className="text-sm border rounded-lg px-3 py-1.5 bg-background"
            placeholder={t("bank.wizard.fields.description")}
            value={defDescription}
            onChange={(e) => setDefDescription(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onApplyDefaults(false)}
            className="text-xs font-bold text-primary hover:underline"
          >
            {t("bank.wizard.applyEmpty")}
          </button>
          <span className="text-muted-foreground/40 text-xs">|</span>
          <button
            onClick={() => onApplyDefaults(true)}
            className="text-xs font-bold text-primary hover:underline"
          >
            {t("bank.wizard.applyAll")}
          </button>
        </div>
      </div>

      {/* Preview table */}
      <div className="overflow-x-auto rounded-xl border">
        <table className="text-xs w-full" style={{ minWidth: "960px" }}>
          <thead className="bg-muted/40 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-start text-muted-foreground w-8">#</th>
              <th className="px-3 py-2 text-start text-muted-foreground whitespace-nowrap">
                {t("bank.wizard.fields.date")}
              </th>
              <th className="px-3 py-2 text-start text-muted-foreground whitespace-nowrap">
                {t("bank.wizard.fields.dir")}
              </th>
              <th className="px-3 py-2 text-end text-muted-foreground whitespace-nowrap">
                {t("bank.wizard.fields.amount")}
              </th>
              <th className="px-3 py-2 text-start text-muted-foreground whitespace-nowrap">
                {t("bank.wizard.fields.bankNotes")}
              </th>
              <th className="px-3 py-2 text-start text-muted-foreground whitespace-nowrap">
                {t("bank.wizard.fields.counterpart")}
              </th>
              <th className="px-3 py-2 text-start text-muted-foreground whitespace-nowrap">
                {t("bank.wizard.fields.costCenter")}
              </th>
              <th className="px-3 py-2 text-start text-muted-foreground whitespace-nowrap">
                {t("bank.wizard.fields.description")}
              </th>
              <th className="px-2 py-2 w-7"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r, idx) => {
              const valid = isRowValid(r);
              const errMsg = [r.dateErr, r.amtErr].filter(Boolean).join(" | ");
              const classified = valid && !!r.counterpartAccountId;
              return (
                <tr
                  key={r.rowNo}
                  className={
                    !valid
                      ? "bg-red-50 dark:bg-red-950/20"
                      : classified
                        ? "bg-green-50/40 dark:bg-green-950/10"
                        : ""
                  }
                >
                  <td className="px-3 py-1.5 text-muted-foreground font-mono">{r.rowNo}</td>
                  {/* Date */}
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      className={`w-28 font-mono text-xs border rounded px-2 py-0.5 bg-background ${r.dateErr ? "border-red-400" : ""}`}
                      value={r.ovDate ?? r.date}
                      onChange={(e) => onPatchDate(idx, e.target.value)}
                    />
                  </td>
                  {/* Direction */}
                  <td className="px-2 py-1">
                    <select
                      className="text-xs border rounded px-1 py-0.5 bg-background"
                      value={r.ovDirection ?? r.direction}
                      onChange={(e) =>
                        onUpdateRow(idx, { ovDirection: e.target.value as "in" | "out" })
                      }
                    >
                      <option value="in">↑ {t("bank.direction.in")}</option>
                      <option value="out">↓ {t("bank.direction.out")}</option>
                    </select>
                  </td>
                  {/* Amount */}
                  <td className="px-2 py-1 text-end">
                    <input
                      type="number"
                      className={`w-24 font-mono text-xs border rounded px-2 py-0.5 bg-background text-end ${r.amtErr ? "border-red-400" : ""}`}
                      value={r.ovAmount ?? r.amount}
                      min={0}
                      onChange={(e) => {
                        const n = parseFloat(e.target.value);
                        onUpdateRow(idx, {
                          ovAmount: isNaN(n) ? 0 : n,
                          amtErr: !n || n <= 0 ? "المبلغ غير صحيح" : null,
                        });
                      }}
                    />
                  </td>
                  {/* Bank notes */}
                  <td
                    className="px-2 py-1 max-w-[140px] truncate text-muted-foreground"
                    title={r.notes}
                  >
                    {r.notes || "—"}
                  </td>
                  {/* Counterpart account */}
                  <td className="px-2 py-1">
                    <select
                      className="text-xs border rounded px-1 py-0.5 bg-background w-44"
                      value={r.counterpartAccountId}
                      onChange={(e) =>
                        onUpdateRow(idx, { counterpartAccountId: e.target.value })
                      }
                    >
                      <option value="">—</option>
                      {leafAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {acctLabel(a)}
                        </option>
                      ))}
                    </select>
                  </td>
                  {/* Cost center */}
                  <td className="px-2 py-1">
                    <select
                      className="text-xs border rounded px-1 py-0.5 bg-background w-32"
                      value={r.costCenterId}
                      onChange={(e) =>
                        onUpdateRow(idx, { costCenterId: e.target.value })
                      }
                    >
                      <option value="">—</option>
                      {costCenters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {ccLabel(c)}
                        </option>
                      ))}
                    </select>
                  </td>
                  {/* Description / البيان */}
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      className="text-xs border rounded px-2 py-0.5 bg-background w-36"
                      placeholder={t("bank.wizard.fields.descPlaceholder")}
                      value={r.description}
                      onChange={(e) => onUpdateRow(idx, { description: e.target.value })}
                    />
                  </td>
                  {/* Status icon */}
                  <td className="px-2 py-1 text-center">
                    {valid ? (
                      <CheckCircle2
                        className={`w-4 h-4 inline ${classified ? "text-green-600" : "text-muted-foreground/60"}`}
                      />
                    ) : (
                      <span title={errMsg}>
                        <AlertCircle className="w-4 h-4 text-red-500 inline cursor-help" />
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-green-100 border border-green-300" />
          {t("bank.wizard.legendClassified")}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-red-100 border border-red-300" />
          {t("bank.wizard.legendError")}
        </span>
        <span className="flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3 text-muted-foreground/50" />
          {t("bank.wizard.legendPending")}
        </span>
      </div>

      {errorCount > 0 && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" />
          {t("bank.wizard.errorHint")}
        </p>
      )}
    </div>
  );
}

// ============================================================
// Step 3 — Done
// ============================================================
function DoneStep({
  stats,
  t,
}: {
  stats: { imported: number; posted: number; pending: number };
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
        <Check className="w-8 h-8 text-green-600" />
      </div>
      <p className="text-lg font-bold">{t("bank.wizard.doneTitle", { count: stats.imported })}</p>
      <div className="flex flex-wrap gap-4 justify-center text-sm text-muted-foreground">
        {stats.posted > 0 && (
          <span className="text-green-700 font-bold">
            {stats.posted} {t("bank.wizard.donePosted")}
          </span>
        )}
        {stats.pending > 0 && (
          <span>
            {stats.pending} {t("bank.wizard.donePending")}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground max-w-sm">{t("bank.wizard.doneHint")}</p>
    </div>
  );
}
