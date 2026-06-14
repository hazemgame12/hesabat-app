import React, { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
  ArrowRight,
  ArrowLeft,
  Loader2,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// =====================================================================
// Types
// =====================================================================
export type ImportModuleType = "journal" | "sales" | "purchase" | "opening-balances" | "bank-statement";
type WizardStep = 1 | 2 | 3 | 4 | 5;

interface FieldDef {
  key: string;
  labelAr: string;
  labelEn: string;
  required: boolean;
  hint?: string;
}

interface ModuleConfig {
  titleAr: string;
  titleEn: string;
  groupLabelAr: string;
  groupLabelEn: string;
  fields: FieldDef[];
  autoMap: Record<string, string[]>;
  previewCols: Array<{ key: string; labelAr: string; labelEn: string }>;
  showDateFormat?: boolean;
}

interface ValidationGroup {
  key: string;
  date: string | null;
  ref?: string;
  notes?: string;
  partyName?: string;
  lineCount: number;
  total?: number;
  _status: "ok" | "warning" | "error";
  _errors: string[];
  rows: Array<Record<string, unknown>>;
}

interface ValidationResult {
  groups: ValidationGroup[];
  summary: {
    total: number;
    ok: number;
    warning: number;
    error: number;
    totalRows: number;
  };
}

// =====================================================================
// Module Configurations
// =====================================================================
const MODULE_CONFIGS: Record<ImportModuleType, ModuleConfig> = {
  journal: {
    titleAr: "استيراد قيود يومية",
    titleEn: "Import Journal Entries",
    groupLabelAr: "قيد",
    groupLabelEn: "Entry",
    fields: [
      { key: "entryRef", labelAr: "رقم / مرجع القيد", labelEn: "Entry Reference", required: false, hint: "يُجمِّع الصفوف في قيد واحد" },
      { key: "date", labelAr: "التاريخ", labelEn: "Date", required: true },
      { key: "notes", labelAr: "وصف القيد", labelEn: "Entry Notes", required: false },
      { key: "accountCode", labelAr: "كود الحساب", labelEn: "Account Code", required: true },
      { key: "description", labelAr: "البيان (السطر)", labelEn: "Line Description", required: false },
      { key: "debit", labelAr: "مدين", labelEn: "Debit", required: false },
      { key: "credit", labelAr: "دائن", labelEn: "Credit", required: false },
      { key: "currency", labelAr: "العملة", labelEn: "Currency", required: false },
      { key: "exchangeRate", labelAr: "سعر الصرف", labelEn: "Exchange Rate", required: false },
      { key: "costCenterName", labelAr: "اسم مركز التكلفة", labelEn: "Cost Center Name", required: false },
    ],
    autoMap: {
      entryRef: ["رقم القيد", "Entry No", "EntryNo", "Reference", "Ref", "المرجع", "Entry Number", "رقم المرجع"],
      date: ["التاريخ", "Date", "تاريخ القيد", "Transaction Date", "Trans Date", "Entry Date"],
      notes: ["الملاحظات", "Notes", "وصف القيد", "Entry Notes", "ملاحظات"],
      accountCode: ["كود الحساب", "Account Code", "كود حساب", "الكود", "Code", "AccountCode", "Acct Code"],
      description: ["البيان", "Line Description", "وصف", "Narration", "Details"],
      debit: ["مدين", "Debit", "Dr", "المدين", "Debit Amount"],
      credit: ["دائن", "Credit", "Cr", "الدائن", "Credit Amount"],
      currency: ["العملة", "Currency", "Curr", "CCY"],
      exchangeRate: ["سعر الصرف", "Exchange Rate", "Rate", "Ex Rate", "FX Rate"],
      costCenterName: ["مركز التكلفة", "Cost Center", "CostCenter", "CC", "Cost Centre"],
    },
    previewCols: [
      { key: "date", labelAr: "التاريخ", labelEn: "Date" },
      { key: "accountCode", labelAr: "كود الحساب", labelEn: "Account" },
      { key: "debit", labelAr: "مدين", labelEn: "Debit" },
      { key: "credit", labelAr: "دائن", labelEn: "Credit" },
      { key: "currency", labelAr: "العملة", labelEn: "Cur" },
    ],
  },
  sales: {
    titleAr: "استيراد فواتير مبيعات",
    titleEn: "Import Sales Invoices",
    groupLabelAr: "فاتورة",
    groupLabelEn: "Invoice",
    fields: [
      { key: "invoiceNo", labelAr: "رقم الفاتورة", labelEn: "Invoice Number", required: false, hint: "يُجمِّع الأسطر في فاتورة واحدة" },
      { key: "date", labelAr: "التاريخ", labelEn: "Date", required: true },
      { key: "partyName", labelAr: "اسم العميل", labelEn: "Customer Name", required: true },
      { key: "currency", labelAr: "العملة", labelEn: "Currency", required: false },
      { key: "exchangeRate", labelAr: "سعر الصرف", labelEn: "Exchange Rate", required: false },
      { key: "accountCode", labelAr: "كود حساب الإيراد", labelEn: "Revenue Account Code", required: true },
      { key: "description", labelAr: "الوصف / الخدمة", labelEn: "Description", required: false },
      { key: "quantity", labelAr: "الكمية", labelEn: "Quantity", required: true },
      { key: "unitPrice", labelAr: "سعر الوحدة", labelEn: "Unit Price", required: true },
      { key: "discount", labelAr: "الخصم %", labelEn: "Discount %", required: false },
      { key: "taxName", labelAr: "الضريبة (اسم)", labelEn: "Tax Name", required: false },
      { key: "costCenterName", labelAr: "اسم مركز التكلفة", labelEn: "Cost Center Name", required: false },
    ],
    autoMap: {
      invoiceNo: ["رقم الفاتورة", "Invoice No", "Invoice Number", "InvoiceNo", "Inv No"],
      date: ["التاريخ", "Date", "Invoice Date", "تاريخ الفاتورة", "Trans Date"],
      partyName: ["العميل", "Customer", "Customer Name", "اسم العميل", "Client", "Party Name"],
      currency: ["العملة", "Currency", "Curr", "CCY"],
      exchangeRate: ["سعر الصرف", "Exchange Rate", "Rate", "FX Rate"],
      accountCode: ["كود الحساب", "Account Code", "كود حساب", "Revenue Account", "Revenue Acct"],
      description: ["الوصف", "Description", "Item", "Service", "المنتج", "البيان"],
      quantity: ["الكمية", "Qty", "Quantity", "Qty."],
      unitPrice: ["السعر", "Price", "Unit Price", "Unit Cost", "سعر الوحدة"],
      discount: ["الخصم", "Discount", "Disc %", "Discount %"],
      taxName: ["الضريبة", "Tax", "Tax Name", "VAT"],
      costCenterName: ["مركز التكلفة", "Cost Center", "CC", "Cost Centre"],
    },
    previewCols: [
      { key: "date", labelAr: "التاريخ", labelEn: "Date" },
      { key: "partyName", labelAr: "العميل", labelEn: "Customer" },
      { key: "accountCode", labelAr: "الحساب", labelEn: "Account" },
      { key: "quantity", labelAr: "الكمية", labelEn: "Qty" },
      { key: "unitPrice", labelAr: "السعر", labelEn: "Price" },
    ],
  },
  purchase: {
    titleAr: "استيراد فواتير مشتريات",
    titleEn: "Import Purchase Invoices",
    groupLabelAr: "فاتورة",
    groupLabelEn: "Invoice",
    fields: [
      { key: "invoiceNo", labelAr: "رقم فاتورة المورد", labelEn: "Supplier Invoice No", required: false, hint: "يُجمِّع الأسطر في فاتورة واحدة" },
      { key: "date", labelAr: "التاريخ", labelEn: "Date", required: true },
      { key: "partyName", labelAr: "اسم المورد", labelEn: "Supplier Name", required: true },
      { key: "currency", labelAr: "العملة", labelEn: "Currency", required: false },
      { key: "exchangeRate", labelAr: "سعر الصرف", labelEn: "Exchange Rate", required: false },
      { key: "accountCode", labelAr: "كود حساب المصروف / الأصل", labelEn: "Expense/Asset Account", required: true },
      { key: "description", labelAr: "الوصف / المنتج", labelEn: "Description", required: false },
      { key: "quantity", labelAr: "الكمية", labelEn: "Quantity", required: true },
      { key: "unitPrice", labelAr: "سعر الوحدة", labelEn: "Unit Price", required: true },
      { key: "discount", labelAr: "الخصم %", labelEn: "Discount %", required: false },
      { key: "taxName", labelAr: "الضريبة (اسم)", labelEn: "Tax Name", required: false },
      { key: "costCenterName", labelAr: "اسم مركز التكلفة", labelEn: "Cost Center Name", required: false },
    ],
    autoMap: {
      invoiceNo: ["رقم الفاتورة", "Invoice No", "Supplier Invoice", "Sup Inv"],
      date: ["التاريخ", "Date", "Invoice Date", "تاريخ الفاتورة"],
      partyName: ["المورد", "Supplier", "Supplier Name", "اسم المورد", "Vendor"],
      currency: ["العملة", "Currency", "Curr", "CCY"],
      exchangeRate: ["سعر الصرف", "Exchange Rate", "Rate"],
      accountCode: ["كود الحساب", "Account Code", "كود حساب", "Expense Account", "Expense Acct"],
      description: ["الوصف", "Description", "Item", "Product", "المنتج", "Service", "الخدمة"],
      quantity: ["الكمية", "Qty", "Quantity"],
      unitPrice: ["السعر", "Price", "Unit Price", "Unit Cost", "سعر الوحدة", "Amount"],
      discount: ["الخصم", "Discount", "Disc %"],
      taxName: ["الضريبة", "Tax", "Tax Name", "VAT"],
      costCenterName: ["مركز التكلفة", "Cost Center", "CC"],
    },
    previewCols: [
      { key: "date", labelAr: "التاريخ", labelEn: "Date" },
      { key: "partyName", labelAr: "المورد", labelEn: "Supplier" },
      { key: "accountCode", labelAr: "الحساب", labelEn: "Account" },
      { key: "quantity", labelAr: "الكمية", labelEn: "Qty" },
      { key: "unitPrice", labelAr: "السعر", labelEn: "Price" },
    ],
  },
  "opening-balances": {
    titleAr: "استيراد أرصدة افتتاحية",
    titleEn: "Import Opening Balances",
    groupLabelAr: "حساب",
    groupLabelEn: "Account",
    showDateFormat: false,
    fields: [
      { key: "accountCode", labelAr: "كود الحساب", labelEn: "Account Code", required: true, hint: "كود الحساب الدفتري (حسابات مستوى التفصيل فقط)" },
      { key: "debit", labelAr: "مدين (رصيد مدين)", labelEn: "Debit Balance", required: false },
      { key: "credit", labelAr: "دائن (رصيد دائن)", labelEn: "Credit Balance", required: false },
    ],
    autoMap: {
      accountCode: ["كود الحساب", "Account Code", "Account", "الكود", "Code", "AccountCode", "Acct Code"],
      debit: ["مدين", "Debit", "Dr", "المدين", "Debit Balance", "رصيد مدين"],
      credit: ["دائن", "Credit", "Cr", "الدائن", "Credit Balance", "رصيد دائن"],
    },
    previewCols: [
      { key: "accountCode", labelAr: "كود الحساب", labelEn: "Account Code" },
      { key: "debit", labelAr: "مدين", labelEn: "Debit" },
      { key: "credit", labelAr: "دائن", labelEn: "Credit" },
    ],
  },
  "bank-statement": {
    titleAr: "استيراد كشف حساب بنكي",
    titleEn: "Import Bank Statement",
    groupLabelAr: "حركة",
    groupLabelEn: "Movement",
    fields: [
      { key: "date", labelAr: "التاريخ", labelEn: "Date", required: true },
      { key: "debit", labelAr: "وارد (إيداع)", labelEn: "In (Deposit)", required: false, hint: "المبالغ الواردة للحساب" },
      { key: "credit", labelAr: "صادر (سحب)", labelEn: "Out (Withdrawal)", required: false, hint: "المبالغ الصادرة من الحساب" },
      { key: "notes", labelAr: "البيان / الوصف", labelEn: "Description", required: false },
      { key: "reference", labelAr: "المرجع", labelEn: "Reference", required: false },
    ],
    autoMap: {
      date: ["التاريخ", "Date", "Transaction Date", "Trans Date", "Value Date"],
      debit: ["وارد", "Debit", "Dr", "إيداع", "Deposit", "Credit Amount", "In", "Inflow"],
      credit: ["صادر", "Credit", "Cr", "سحب", "Withdrawal", "Debit Amount", "Out", "Outflow"],
      notes: ["البيان", "Description", "Details", "Narration", "الوصف", "ملاحظات"],
      reference: ["المرجع", "Reference", "Ref", "Trans Ref", "Cheque No"],
    },
    previewCols: [
      { key: "date", labelAr: "التاريخ", labelEn: "Date" },
      { key: "direction", labelAr: "النوع", labelEn: "Type" },
      { key: "amount", labelAr: "المبلغ", labelEn: "Amount" },
      { key: "notes", labelAr: "البيان", labelEn: "Description" },
    ],
  },
};

const DATE_FORMAT_OPTIONS = [
  { value: "auto", labelAr: "كشف تلقائي", labelEn: "Auto Detect" },
  { value: "DD/MM/YYYY", labelAr: "DD/MM/YYYY  (يوم/شهر/سنة)", labelEn: "DD/MM/YYYY" },
  { value: "MM/DD/YYYY", labelAr: "MM/DD/YYYY  (شهر/يوم/سنة)", labelEn: "MM/DD/YYYY" },
  { value: "YYYY-MM-DD", labelAr: "YYYY-MM-DD  (سنة-شهر-يوم)", labelEn: "YYYY-MM-DD" },
  { value: "DD-MM-YYYY", labelAr: "DD-MM-YYYY", labelEn: "DD-MM-YYYY" },
  { value: "excel-serial", labelAr: "Excel Serial Date (رقم تسلسلي)", labelEn: "Excel Serial Date" },
];

const STEP_LABELS = [
  { labelAr: "رفع الملف", labelEn: "Upload" },
  { labelAr: "ربط الأعمدة", labelEn: "Mapping" },
  { labelAr: "مراجعة البيانات", labelEn: "Preview" },
  { labelAr: "تأكيد الاستيراد", labelEn: "Confirm" },
  { labelAr: "تم", labelEn: "Done" },
];

// =====================================================================
// Main Component
// =====================================================================
export interface ImportWizardProps {
  moduleType: ImportModuleType;
  onClose: () => void;
  onSuccess?: () => void;
  extraContext?: Record<string, unknown>;
}

export function ImportWizard({ moduleType, onClose, onSuccess, extraContext }: ImportWizardProps) {
  const { i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");
  const { toast } = useToast();
  const config = MODULE_CONFIGS[moduleType];

  const [step, setStep] = useState<WizardStep>(1);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [dateFormat, setDateFormat] = useState("auto");
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    total: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewFilter, setPreviewFilter] = useState<"all" | "ok" | "warning" | "error">("all");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Auto-map ----
  function buildAutoMap(heads: string[]): Record<string, string> {
    const mapped: Record<string, string> = {};
    for (const field of config.fields) {
      const synonyms = config.autoMap[field.key] ?? [];
      // exact match first
      let found = heads.find((h) => synonyms.includes(h.trim()));
      // case-insensitive fallback
      if (!found) {
        const lower = synonyms.map((s) => s.toLowerCase());
        found = heads.find((h) => lower.includes(h.toLowerCase().trim()));
      }
      if (found) mapped[field.key] = found;
    }
    return mapped;
  }

  // ---- Step 1: upload & parse ----
  async function handleFile(f: File) {
    if (!f.name.match(/\.(xlsx|xls)$/i)) {
      setError("يرجى رفع ملف Excel بصيغة .xlsx");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/import/parse-preview", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "تعذّر قراءة الملف");
      setFile(f);
      setHeaders(data.headers ?? []);
      setRawRows(data.rows ?? []);
      setColumnMap(buildAutoMap(data.headers ?? []));
      setStep(2);
    } catch (err: unknown) {
      setError((err as Error)?.message ?? "تعذّر قراءة الملف");
    } finally {
      setLoading(false);
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  // ---- Step 2 → 3: validate ----
  async function handleValidate() {
    const missingRequired = config.fields.filter(
      (f) => f.required && !columnMap[f.key],
    );
    if (missingRequired.length > 0) {
      setError(
        `الحقول المطلوبة التالية لم تُربط: ${missingRequired
          .map((f) => (isAr ? f.labelAr : f.labelEn))
          .join("، ")}`,
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/import/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: moduleType,
          columnMap,
          rows: rawRows,
          dateFormat,
          dryRun: true,
          ...(extraContext ?? {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "حدث خطأ في التحقق");
      setValidationResult(data as ValidationResult);
      setPreviewFilter("all");
      setExpandedGroups(new Set());
      setStep(3);
    } catch (err: unknown) {
      setError((err as Error)?.message ?? "حدث خطأ في التحقق");
    } finally {
      setLoading(false);
    }
  }

  // ---- Step 4 → 5: execute ----
  async function handleExecute() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/import/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: moduleType,
          columnMap,
          rows: rawRows,
          dateFormat,
          dryRun: false,
          ...(extraContext ?? {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "حدث خطأ في الاستيراد");
      setImportResult(data as { imported: number; skipped: number; total: number });
      setStep(5);
      onSuccess?.();
    } catch (err: unknown) {
      setError((err as Error)?.message ?? "حدث خطأ في الاستيراد");
    } finally {
      setLoading(false);
    }
  }

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const filteredGroups =
    validationResult?.groups.filter(
      (g) => previewFilter === "all" || g._status === previewFilter,
    ) ?? [];

  const summary = validationResult?.summary ?? { total: 0, ok: 0, warning: 0, error: 0, totalRows: 0 };
  const validPlusWarn = summary.ok + summary.warning;

  // =====================================================================
  // RENDER
  // =====================================================================
  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col" dir="rtl">
      {/* ---- Header ---- */}
      <div className="border-b bg-card px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground">
            {isAr ? config.titleAr : config.titleEn}
          </h1>
          {file && step > 1 && step < 5 && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
              {file.name}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded hover:bg-muted"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ---- Step Indicator ---- */}
      <div className="bg-muted/20 border-b px-6 py-3 shrink-0">
        <div className="flex items-center max-w-2xl gap-0">
          {STEP_LABELS.map((s, idx) => (
            <React.Fragment key={idx}>
              <div className="flex flex-col items-center gap-1 shrink-0">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                    step === idx + 1
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/30"
                      : step > idx + 1
                        ? "bg-primary/20 text-primary border border-primary/30"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {step > idx + 1 ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>
                <span
                  className={`text-[11px] whitespace-nowrap ${
                    step === idx + 1
                      ? "text-primary font-semibold"
                      : "text-muted-foreground"
                  }`}
                >
                  {isAr ? s.labelAr : s.labelEn}
                </span>
              </div>
              {idx < STEP_LABELS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 mb-4 transition-colors ${
                    step > idx + 1 ? "bg-primary/40" : "bg-muted-foreground/20"
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ---- Content ---- */}
      <div className="flex-1 overflow-auto p-6">
        {/* Error Banner */}
        {error && (
          <div className="mb-5 p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-2 text-sm text-destructive max-w-3xl mx-auto">
            <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ==================== STEP 1: UPLOAD ==================== */}
        {step === 1 && (
          <div className="max-w-xl mx-auto">
            <div className="mb-8 text-center">
              <h2 className="text-xl font-bold mb-2">ارفع ملف Excel</h2>
              <p className="text-muted-foreground text-sm">
                اسحب الملف هنا أو اضغط لاختياره من جهازك. الصيغة المدعومة:{" "}
                <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">.xlsx</span>
              </p>
            </div>

            <div
              className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
                isDragging
                  ? "border-primary bg-primary/5 scale-[1.01]"
                  : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/20"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              {loading ? (
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="w-12 h-12 text-primary animate-spin" />
                  <p className="text-muted-foreground">جاري قراءة الملف...</p>
                </div>
              ) : file ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 bg-green-100 dark:bg-green-950/40 rounded-full flex items-center justify-center">
                    <FileSpreadsheet className="w-8 h-8 text-green-600" />
                  </div>
                  <p className="font-semibold text-foreground">{file.name}</p>
                  <p className="text-sm text-muted-foreground">{rawRows.length} صف تم قراءتها</p>
                  <button
                    className="text-sm text-primary hover:underline mt-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                  >
                    تغيير الملف
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                    <Upload className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-lg">اسحب الملف هنا</p>
                    <p className="text-muted-foreground text-sm mt-1">أو اضغط لاختياره من جهازك</p>
                  </div>
                  <p className="text-xs text-muted-foreground/70 bg-muted px-3 py-1 rounded-full">
                    Excel .xlsx فقط — حجم أقصى 10 ميجابايت
                  </p>
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) handleFile(f);
              }}
            />

            {file && !loading && (
              <div className="mt-8 flex justify-end">
                <button
                  onClick={() => setStep(2)}
                  className="bg-primary text-primary-foreground px-7 py-2.5 rounded-xl font-semibold hover:opacity-90 flex items-center gap-2 shadow-md shadow-primary/20"
                >
                  التالي — ربط الأعمدة
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ==================== STEP 2: MAPPING ==================== */}
        {step === 2 && (
          <div className="max-w-3xl mx-auto">
            <div className="mb-6">
              <h2 className="text-xl font-bold mb-1">ربط الأعمدة</h2>
              <p className="text-muted-foreground text-sm">
                حدد الأعمدة في الملف المقابلة لكل حقل في النظام.{" "}
                الحقول المطلوبة مؤشر عليها بـ{" "}
                <span className="text-destructive font-bold">*</span>
              </p>
            </div>

            {/* Date format — hidden for modules that have no date column */}
            {config.showDateFormat !== false && (
              <div className="mb-6 p-4 bg-muted/30 rounded-xl border">
                <label className="flex items-center gap-2 text-sm font-semibold mb-2">
                  <Info className="w-4 h-4 text-primary" />
                  صيغة التاريخ في الملف
                </label>
                <select
                  value={dateFormat}
                  onChange={(e) => setDateFormat(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {DATE_FORMAT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {isAr ? opt.labelAr : opt.labelEn}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Field mapping table */}
            <div className="border rounded-xl overflow-hidden">
              <div className="grid grid-cols-[2fr_2fr_1fr] bg-muted/50 px-4 py-2.5 text-xs font-semibold text-muted-foreground border-b">
                <div>حقل النظام</div>
                <div>عمود الملف</div>
                <div>تلميح</div>
              </div>
              {config.fields.map((field) => {
                const isMissing = field.required && !columnMap[field.key];
                return (
                  <div
                    key={field.key}
                    className={`grid grid-cols-[2fr_2fr_1fr] px-4 py-3 border-b last:border-0 items-center gap-3 ${
                      isMissing ? "bg-destructive/5" : ""
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">
                        {isAr ? field.labelAr : field.labelEn}
                      </span>
                      {field.required && (
                        <span className="text-destructive text-base font-bold leading-none">*</span>
                      )}
                    </div>
                    <select
                      value={columnMap[field.key] ?? ""}
                      onChange={(e) =>
                        setColumnMap((prev) => {
                          const next = { ...prev };
                          if (e.target.value) next[field.key] = e.target.value;
                          else delete next[field.key];
                          return next;
                        })
                      }
                      className={`border rounded-lg px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary ${
                        isMissing
                          ? "border-destructive/60 bg-destructive/5"
                          : columnMap[field.key]
                            ? "border-primary/40 bg-primary/5"
                            : "border-border"
                      }`}
                    >
                      <option value="">— لا تربط —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <div>
                      {field.hint && (
                        <span className="text-xs text-muted-foreground italic">
                          {field.hint}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Sample preview */}
            {rawRows.length > 0 && (
              <div className="mt-6">
                <h3 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                  عينة من بيانات الملف — أول 3 صفوف
                </h3>
                <div className="overflow-x-auto border rounded-xl">
                  <table className="text-xs w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-2 text-right font-semibold text-muted-foreground">#</th>
                        {headers.map((h) => (
                          <th
                            key={h}
                            className="px-3 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rawRows.slice(0, 3).map((row, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                          {headers.map((h) => (
                            <td
                              key={h}
                              className="px-3 py-1.5 whitespace-nowrap max-w-[150px] truncate"
                            >
                              {row[h] ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-8 flex items-center justify-between">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 rounded-xl border text-sm hover:bg-muted flex items-center gap-2"
              >
                <ArrowRight className="w-4 h-4" />
                السابق
              </button>
              <button
                onClick={handleValidate}
                disabled={loading}
                className="bg-primary text-primary-foreground px-7 py-2.5 rounded-xl font-semibold hover:opacity-90 flex items-center gap-2 shadow-md shadow-primary/20 disabled:opacity-50"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                مراجعة البيانات
                <ArrowLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ==================== STEP 3: PREVIEW ==================== */}
        {step === 3 && validationResult && (
          <div className="max-w-4xl mx-auto">
            <div className="mb-6">
              <h2 className="text-xl font-bold mb-1">نتائج المراجعة</h2>
              <p className="text-muted-foreground text-sm">
                {rawRows.length} صف في الملف →{" "}
                <span className="font-medium text-foreground">{summary.total}</span>{" "}
                {isAr ? config.groupLabelAr : config.groupLabelEn}
              </p>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-4 gap-3 mb-6">
              {[
                {
                  label: "الإجمالي",
                  value: summary.total,
                  cls: "bg-card border",
                },
                {
                  label: "صحيح",
                  value: summary.ok,
                  cls: "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800",
                  textCls: "text-green-700 dark:text-green-400",
                },
                {
                  label: "تحذيرات",
                  value: summary.warning,
                  cls: "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800",
                  textCls: "text-yellow-700 dark:text-yellow-400",
                },
                {
                  label: "أخطاء",
                  value: summary.error,
                  cls: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800",
                  textCls: "text-red-700 dark:text-red-400",
                },
              ].map((card) => (
                <div
                  key={card.label}
                  className={`border rounded-xl p-4 text-center ${card.cls}`}
                >
                  <div className={`text-2xl font-bold ${card.textCls ?? ""}`}>
                    {card.value}
                  </div>
                  <div
                    className={`text-xs font-medium mt-1 ${card.textCls ?? "text-muted-foreground"}`}
                  >
                    {card.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Filter tabs */}
            <div className="flex gap-0.5 mb-4 border-b">
              {(
                [
                  { key: "all", label: "الكل" },
                  { key: "ok", label: "✓ صحيح" },
                  { key: "warning", label: "⚠ تحذير" },
                  { key: "error", label: "✗ خطأ" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setPreviewFilter(tab.key)}
                  className={`px-4 py-2.5 text-sm rounded-t transition-colors border-b-2 ${
                    previewFilter === tab.key
                      ? "border-primary text-primary font-semibold"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                  {tab.key !== "all" && (
                    <span className="mr-1 text-xs opacity-60">
                      ({summary[tab.key]})
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Groups list */}
            <div className="space-y-2">
              {filteredGroups.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  لا توجد نتائج
                </div>
              )}
              {filteredGroups.map((group) => {
                const isExpanded = expandedGroups.has(group.key);
                const borderCls =
                  group._status === "error"
                    ? "border-red-200 dark:border-red-800"
                    : group._status === "warning"
                      ? "border-yellow-200 dark:border-yellow-800"
                      : "border-green-200 dark:border-green-800";
                const headerBg =
                  group._status === "error"
                    ? "bg-red-50 dark:bg-red-950/30"
                    : group._status === "warning"
                      ? "bg-yellow-50 dark:bg-yellow-950/30"
                      : "bg-green-50 dark:bg-green-950/30";

                return (
                  <div
                    key={group.key}
                    className={`border rounded-xl overflow-hidden ${borderCls}`}
                  >
                    <div
                      className={`flex items-start justify-between px-4 py-3 cursor-pointer select-none ${headerBg}`}
                      onClick={() => toggleGroup(group.key)}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {group._status === "ok" && (
                          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                        )}
                        {group._status === "warning" && (
                          <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0" />
                        )}
                        {group._status === "error" && (
                          <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap text-sm">
                            <span className="font-medium">
                              {group.key.startsWith("__auto__")
                                ? `(تلقائي)`
                                : group.key}
                            </span>
                            {group.date && (
                              <span className="text-muted-foreground text-xs">
                                {group.date}
                              </span>
                            )}
                            {group.partyName && (
                              <span className="text-muted-foreground text-xs">
                                • {group.partyName}
                              </span>
                            )}
                            <span className="text-muted-foreground text-xs">
                              • {group.lineCount} سطر
                            </span>
                            {group.total !== undefined && group.total > 0 && (
                              <span className="text-muted-foreground text-xs">
                                • {group.total.toLocaleString("ar-EG")}
                              </span>
                            )}
                          </div>
                          {!isExpanded && group._errors.length > 0 && (
                            <p className="text-xs mt-0.5 text-muted-foreground truncate">
                              {group._errors[0]}
                              {group._errors.length > 1 &&
                                ` (+${group._errors.length - 1} أخرى)`}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 mr-2">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="bg-card border-t px-4 py-3">
                        {group._errors.length > 0 && (
                          <div className="mb-3 space-y-1">
                            {group._errors.map((err, i) => (
                              <p
                                key={i}
                                className={`text-xs flex items-start gap-1.5 ${
                                  group._status === "error"
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-yellow-700 dark:text-yellow-400"
                                }`}
                              >
                                <span className="shrink-0 mt-0.5">•</span>
                                {err}
                              </p>
                            ))}
                          </div>
                        )}
                        {group.rows.length > 0 && (
                          <div className="overflow-x-auto rounded-lg border">
                            <table className="text-xs w-full">
                              <thead className="bg-muted/40">
                                <tr>
                                  {config.previewCols.map((col) => (
                                    <th
                                      key={col.key}
                                      className="px-3 py-2 text-right font-semibold text-muted-foreground"
                                    >
                                      {isAr ? col.labelAr : col.labelEn}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {group.rows.slice(0, 15).map((row, i) => (
                                  <tr key={i} className="border-t">
                                    {config.previewCols.map((col) => (
                                      <td key={col.key} className="px-3 py-1.5">
                                        {String(row[col.key] ?? "")}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {group.rows.length > 15 && (
                              <p className="text-xs text-muted-foreground px-3 py-2 border-t bg-muted/20">
                                ... و {group.rows.length - 15} سطر آخر
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-8 flex items-center justify-between">
              <button
                onClick={() => setStep(2)}
                className="px-4 py-2 rounded-xl border text-sm hover:bg-muted flex items-center gap-2"
              >
                <ArrowRight className="w-4 h-4" />
                السابق
              </button>
              <div className="flex items-center gap-4">
                {summary.error > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {summary.error} {config.groupLabelAr} بها أخطاء — سيتم تخطيها
                  </p>
                )}
                <button
                  onClick={() => setStep(4)}
                  disabled={validPlusWarn === 0}
                  className="bg-primary text-primary-foreground px-7 py-2.5 rounded-xl font-semibold hover:opacity-90 flex items-center gap-2 shadow-md shadow-primary/20 disabled:opacity-50"
                >
                  التالي — تأكيد الاستيراد
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== STEP 4: CONFIRM ==================== */}
        {step === 4 && validationResult && (
          <div className="max-w-xl mx-auto">
            <div className="mb-8 text-center">
              <h2 className="text-xl font-bold mb-2">تأكيد الاستيراد</h2>
              <p className="text-muted-foreground text-sm">
                راجع الملخص التالي قبل الحفظ النهائي
              </p>
            </div>

            {/* Summary */}
            <div className="border rounded-xl overflow-hidden mb-6">
              <div className="bg-muted/30 px-5 py-3 border-b">
                <h3 className="font-semibold text-sm">ملخص عملية الاستيراد</h3>
              </div>
              <div className="divide-y">
                {[
                  {
                    label: `إجمالي ${config.groupLabelAr} في الملف`,
                    value: summary.total,
                    cls: "",
                  },
                  {
                    label: "صحيح (سيتم استيرادها)",
                    value: summary.ok,
                    cls: "text-green-600 font-bold",
                  },
                  {
                    label: "تحذيرات (سيتم استيرادها)",
                    value: summary.warning,
                    cls: "text-yellow-600 font-bold",
                  },
                  {
                    label: "أخطاء (سيتم تخطيها)",
                    value: summary.error,
                    cls: "text-red-600 font-bold",
                  },
                  {
                    label: "إجمالي الصفوف في الملف",
                    value: summary.totalRows,
                    cls: "",
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between px-5 py-3"
                  >
                    <span className="text-sm text-muted-foreground">{row.label}</span>
                    <span className={`text-sm ${row.cls || "font-medium"}`}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {summary.error > 0 && (
              <div className="mb-5 p-3.5 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-xl flex items-start gap-2 text-sm text-yellow-800 dark:text-yellow-400">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  سيتم تخطي{" "}
                  <strong>{summary.error}</strong>{" "}
                  {config.groupLabelAr} تحتوي على أخطاء. يمكنك مراجعتها في الخطوة السابقة.
                </span>
              </div>
            )}

            <div className="mb-6 p-3.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl text-sm text-blue-800 dark:text-blue-400 flex items-start gap-2">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                جميع السجلات المستوردة ستكون بحالة{" "}
                <strong>مسودة</strong> ويمكنك اعتمادها لاحقاً من القائمة الرئيسية.
              </span>
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep(3)}
                className="px-4 py-2 rounded-xl border text-sm hover:bg-muted flex items-center gap-2"
              >
                <ArrowRight className="w-4 h-4" />
                السابق
              </button>
              <button
                onClick={handleExecute}
                disabled={loading || validPlusWarn === 0}
                className="bg-primary text-primary-foreground px-7 py-2.5 rounded-xl font-bold hover:opacity-90 flex items-center gap-2 shadow-md shadow-primary/20 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    جاري الاستيراد...
                  </>
                ) : (
                  <>
                    استيراد {validPlusWarn} {config.groupLabelAr}
                    <ArrowLeft className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ==================== STEP 5: DONE ==================== */}
        {step === 5 && importResult && (
          <div className="max-w-lg mx-auto text-center py-8">
            <div className="mb-6 flex justify-center">
              <div className="w-24 h-24 bg-green-100 dark:bg-green-950/40 rounded-full flex items-center justify-center shadow-lg">
                <CheckCircle2 className="w-12 h-12 text-green-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold mb-3">تم الاستيراد بنجاح!</h2>
            <p className="text-muted-foreground text-base mb-8 leading-relaxed">
              تم استيراد{" "}
              <span className="font-bold text-foreground text-lg">
                {importResult.imported}
              </span>{" "}
              {config.groupLabelAr} بنجاح
              {importResult.skipped > 0 && (
                <>
                  {" "}
                  — وتم تخطي{" "}
                  <span className="font-bold text-red-600">
                    {importResult.skipped}
                  </span>{" "}
                  بسبب أخطاء
                </>
              )}
            </p>
            <div className="p-4 bg-muted rounded-xl text-sm text-muted-foreground mb-8 text-right">
              <strong>تنبيه:</strong> جميع السجلات المستوردة بحالة{" "}
              <strong>مسودة</strong>، يمكنك اعتمادها من القائمة الرئيسية.
            </div>
            <button
              onClick={onClose}
              className="bg-primary text-primary-foreground px-10 py-3 rounded-xl font-semibold hover:opacity-90 shadow-md shadow-primary/20"
            >
              إغلاق وعرض البيانات
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
