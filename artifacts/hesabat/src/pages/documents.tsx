import React, { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload, Search, Download, Link2, Link2Off, Trash2,
  MoreHorizontal, Mail, HardDrive, File, FileImage,
  FileSpreadsheet, FileText, Pencil, Check, X,
  Receipt, BookOpen, ChevronDown, Inbox, AlertCircle, Eye,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ApiDocument {
  id: string;
  displayName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  source: "manual" | "email";
  senderEmail?: string | null;
  emailSubject?: string | null;
  invoiceId?: string | null;
  journalEntryId?: string | null;
  bankMovementId?: string | null;
  linkedLabel?: string | null;
  linkedModule?: "invoice" | "journal" | "bank" | null;
  createdAt: string;
}

type FilterKey = "all" | "unlinked" | "invoices" | "journal" | "bank";
type LinkModule = "invoice" | "journal";

const BASE = "/api/documents";

async function apiFetch(path: string, init?: RequestInit) {
  const r = await fetch(path, { credentials: "include", ...init });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error ?? r.statusText);
  }
  return r.json();
}

function useDocuments(filter: FilterKey) {
  return useQuery<ApiDocument[]>({
    queryKey: ["documents", filter],
    queryFn: () => apiFetch(`${BASE}${filter !== "all" ? `?filter=${filter}` : ""}`),
  });
}

function useUnlinkedCount() {
  return useQuery<{ count: number }>({
    queryKey: ["documents", "unlinked-count"],
    queryFn: () => apiFetch(`${BASE}/unlinked-count`),
    refetchInterval: 60_000,
  });
}

function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`${BASE}/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["documents"] }); },
  });
}

function usePatchDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiFetch(`${BASE}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["documents"] }); },
  });
}

interface InvoiceItem { id: string; entryNo: number; kind: string; partyName?: string | null }
interface JournalItem { id: string; entryNo: number; notes?: string | null; date: string }

function useLinkSearch(module: LinkModule, search: string) {
  return useQuery<InvoiceItem[] | JournalItem[]>({
    queryKey: ["link-search", module, search],
    queryFn: async () => {
      if (module === "invoice") {
        const r = await apiFetch("/api/invoices") as InvoiceItem[];
        const q = search.toLowerCase();
        return r.filter((inv) =>
          q === "" ||
          String(inv.entryNo).includes(q) ||
          (inv.partyName ?? "").toLowerCase().includes(q),
        ).slice(0, 20);
      } else {
        const r = await apiFetch("/api/journal") as JournalItem[];
        const q = search.toLowerCase();
        return r.filter((je) =>
          q === "" ||
          String(je.entryNo).includes(q) ||
          (je.notes ?? "").toLowerCase().includes(q),
        ).slice(0, 20);
      }
    },
    enabled: true,
  });
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
}

function DocIcon({ mime }: { mime: string }) {
  if (mime === "application/pdf") return <File className="w-5 h-5 text-red-500" />;
  if (mime.startsWith("image/")) return <FileImage className="w-5 h-5 text-blue-500" />;
  if (mime.includes("sheet") || mime.includes("excel") || mime.includes("csv"))
    return <FileSpreadsheet className="w-5 h-5 text-emerald-500" />;
  return <FileText className="w-5 h-5 text-slate-400" />;
}

const MODULE_BADGE: Record<NonNullable<ApiDocument["linkedModule"]>, string> = {
  invoice: "bg-violet-50 text-violet-700 border border-violet-200",
  journal: "bg-sky-50 text-sky-700 border border-sky-200",
  bank: "bg-teal-50 text-teal-700 border border-teal-200",
};
const MODULE_LABEL_AR: Record<NonNullable<ApiDocument["linkedModule"]>, string> = {
  invoice: "فاتورة",
  journal: "قيد يومي",
  bank: "حركة بنكية",
};

function UploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFile = (f: File) => {
    setFile(f);
    setDisplayName(f.name);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("displayName", displayName.trim() || file.name);
      const r = await fetch(BASE + "/upload", { method: "POST", credentials: "include", body: fd });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "فشل الرفع");
      }
      await qc.invalidateQueries({ queryKey: ["documents"] });
      toast({ title: "تم رفع المستند بنجاح" });
      onClose();
      setFile(null);
      setDisplayName("");
    } catch (err) {
      toast({ title: "خطأ في الرفع", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" dir="rtl">
        <h2 className="text-base font-bold text-foreground mb-4">رفع مستند جديد</h2>

        <div
          className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-primary transition-colors mb-4"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        >
          <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          {file
            ? <p className="text-sm font-semibold text-foreground">{file.name}</p>
            : <p className="text-sm text-muted-foreground">اسحب الملف هنا أو اضغط للاختيار</p>
          }
          <p className="text-[11px] text-muted-foreground mt-1">PDF · صور · Excel · Word · CSV — حتى 20 MB</p>
          <input ref={fileRef} type="file" className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.xlsx,.xls,.docx,.doc,.csv,.txt"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>

        <div className="mb-5">
          <label className="block text-sm font-semibold text-foreground mb-1.5">اسم العرض</label>
          <input
            className="w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="اسم يظهر في القائمة (اختياري)"
          />
          <p className="text-[11px] text-muted-foreground mt-1">إذا تركته فارغاً سيُستخدم اسم الملف</p>
        </div>

        <div className="flex gap-2">
          <button onClick={handleUpload} disabled={!file || loading}
            className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50 hover:opacity-90 transition-opacity">
            {loading ? "جاري الرفع..." : "رفع المستند"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

function LinkDialog({ doc, onClose }: { doc: ApiDocument; onClose: () => void }) {
  const [module, setModule] = useState<LinkModule>("invoice");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading } = useLinkSearch(module, search);
  const patch = usePatchDocument();
  const { toast } = useToast();

  const handleLink = async () => {
    if (!selectedId) return;
    try {
      await patch.mutateAsync({
        id: doc.id,
        body: module === "invoice"
          ? { invoiceId: selectedId, journalEntryId: null, bankMovementId: null }
          : { journalEntryId: selectedId, invoiceId: null, bankMovementId: null },
      });
      toast({ title: "تم ربط المستند بنجاح" });
      onClose();
    } catch (e) {
      toast({ title: "خطأ", description: String(e instanceof Error ? e.message : e), variant: "destructive" });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6" dir="rtl">
        <h2 className="text-base font-bold text-foreground mb-1">ربط المستند بـ</h2>
        <p className="text-[12px] text-muted-foreground mb-4 truncate">{doc.displayName}</p>

        <div className="flex gap-2 mb-4">
          {(["invoice", "journal"] as const).map((m) => (
            <button key={m} onClick={() => { setModule(m); setSelectedId(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-sm font-semibold transition-all ${
                module === m ? "bg-primary text-white border-transparent" : "text-muted-foreground hover:border-primary/40"
              }`}>
              {m === "invoice" ? <Receipt className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
              {m === "invoice" ? "فاتورة" : "قيد يومي"}
            </button>
          ))}
        </div>

        <div className="relative mb-3">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input className="w-full pr-9 pl-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder={module === "invoice" ? "ابحث برقم الفاتورة أو العميل..." : "ابحث برقم القيد أو البيان..."}
            value={search} onChange={(e) => { setSearch(e.target.value); setSelectedId(null); }} />
        </div>

        <div className="max-h-52 overflow-y-auto space-y-1 mb-4">
          {isLoading && <p className="text-sm text-muted-foreground text-center py-4">جاري البحث...</p>}
          {!isLoading && (!data || data.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-4">لا توجد نتائج</p>
          )}
          {(data as (InvoiceItem | JournalItem)[])?.map((item) => {
            const isInv = module === "invoice";
            const inv = item as InvoiceItem;
            const je = item as JournalItem;
            const label = isInv
              ? `${inv.kind?.startsWith("sales") ? "SI" : "PI"}-${String(inv.entryNo).padStart(5, "0")}`
              : `JE-${String(je.entryNo).padStart(5, "0")}`;
            const sub = isInv ? inv.partyName : (je.notes || je.date);
            return (
              <button key={item.id} onClick={() => setSelectedId(item.id)}
                className={`w-full text-right flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all ${
                  selectedId === item.id ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted"
                }`}>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  selectedId === item.id ? "border-primary bg-primary" : "border-slate-300"
                }`}>
                  {selectedId === item.id && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">{label}</div>
                  {sub && <div className="text-[11px] text-muted-foreground truncate max-w-[320px]">{sub}</div>}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex gap-2">
          <button onClick={handleLink} disabled={!selectedId || patch.isPending}
            className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50 hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5">
            <Link2 className="w-4 h-4" /> ربط المستند
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

const TABS: { key: FilterKey; labelAr: string }[] = [
  { key: "all", labelAr: "الكل" },
  { key: "unlinked", labelAr: "غير مربوط" },
  { key: "invoices", labelAr: "فواتير" },
  { key: "journal", labelAr: "قيود يومية" },
  { key: "bank", labelAr: "بنك" },
];

export function DocumentsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [linkDoc, setLinkDoc] = useState<ApiDocument | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const { data: docs = [], isLoading } = useDocuments(filter);
  const { data: unlinkedData } = useUnlinkedCount();
  const deleteDoc = useDeleteDocument();
  const patchDoc = usePatchDocument();

  const filtered = docs.filter((d) =>
    search === "" || d.displayName.toLowerCase().includes(search.toLowerCase()),
  );

  const counts = {
    all: docs.length,
    unlinked: docs.filter((d) => !d.invoiceId && !d.journalEntryId && !d.bankMovementId).length,
    invoices: docs.filter((d) => !!d.invoiceId).length,
    journal: docs.filter((d) => !!d.journalEntryId).length,
    bank: docs.filter((d) => !!d.bankMovementId).length,
  };

  const handleDelete = async (doc: ApiDocument) => {
    if (!confirm(`حذف "${doc.displayName}"?`)) return;
    try {
      await deleteDoc.mutateAsync(doc.id);
      toast({ title: "تم حذف المستند" });
    } catch (e) {
      toast({ title: "خطأ", description: String(e instanceof Error ? e.message : e), variant: "destructive" });
    }
  };

  const handleUnlink = async (doc: ApiDocument) => {
    try {
      await patchDoc.mutateAsync({ id: doc.id, body: { invoiceId: null, journalEntryId: null, bankMovementId: null } });
      toast({ title: "تم إزالة الربط" });
    } catch (e) {
      toast({ title: "خطأ", description: String(e instanceof Error ? e.message : e), variant: "destructive" });
    }
  };

  const startRename = (doc: ApiDocument) => {
    setRenameId(doc.id);
    setRenameDraft(doc.displayName);
    setMenuId(null);
  };

  const commitRename = async (id: string) => {
    const name = renameDraft.trim();
    if (!name) { setRenameId(null); return; }
    try {
      await patchDoc.mutateAsync({ id, body: { displayName: name } });
    } catch (e) {
      toast({ title: "خطأ", description: String(e instanceof Error ? e.message : e), variant: "destructive" });
    }
    setRenameId(null);
  };

  return (
    <div className="flex flex-col h-full" dir="rtl">
      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center justify-between shrink-0 bg-white">
        <div>
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Inbox className="w-5 h-5 text-primary" />
            صندوق المستندات
            {(unlinkedData?.count ?? 0) > 0 && (
              <span className="bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {unlinkedData!.count} غير مربوط
              </span>
            )}
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">رفع واستقبال وربط مستندات الشركة</p>
        </div>
        <button onClick={() => setUploadOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 shadow-sm transition-opacity">
          <Upload className="w-4 h-4" /> رفع مستند
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b bg-white px-6 shrink-0">
        <div className="flex gap-0">
          {TABS.map((tab) => (
            <button key={tab.key} onClick={() => setFilter(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 transition-all -mb-px ${
                filter === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              {tab.labelAr}
              {filter !== "all" && tab.key !== "all" && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  filter === tab.key ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                }`}>{counts[tab.key]}</span>
              )}
              {tab.key === "all" && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  filter === "all" ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                }`}>{counts.all}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Search bar */}
      <div className="px-6 py-3 border-b bg-muted/30 shrink-0">
        <div className="relative max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input className="w-full pr-9 pl-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="ابحث في المستندات..."
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto bg-white" onClick={() => setMenuId(null)}>
        {isLoading && (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">جاري التحميل...</div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <Inbox className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-muted-foreground text-sm">لا توجد مستندات</p>
            <button onClick={() => setUploadOpen(true)}
              className="text-primary text-sm font-semibold hover:underline">
              ارفع أول مستند
            </button>
          </div>
        )}
        {!isLoading && filtered.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b">
                <th className="text-right px-6 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">المستند</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-24">المصدر</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-24">الحجم</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-32">التاريخ</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide w-44">مربوط بـ</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((doc) => {
                const isLinked = !!(doc.invoiceId || doc.journalEntryId || doc.bankMovementId);
                return (
                  <tr key={doc.id} className="hover:bg-muted/20 transition-colors group">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <DocIcon mime={doc.mimeType} />
                        <div className="min-w-0">
                          {renameId === doc.id ? (
                            <div className="flex items-center gap-1">
                              <input autoFocus className="border rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary w-48"
                                value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") commitRename(doc.id); if (e.key === "Escape") setRenameId(null); }} />
                              <button onClick={() => commitRename(doc.id)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"><Check className="w-3.5 h-3.5" /></button>
                              <button onClick={() => setRenameId(null)} className="p-1 text-muted-foreground hover:bg-muted rounded"><X className="w-3.5 h-3.5" /></button>
                            </div>
                          ) : (
                            <div className="font-semibold text-foreground text-sm leading-snug truncate max-w-xs">{doc.displayName}</div>
                          )}
                          {doc.source === "email" && doc.senderEmail && (
                            <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Mail className="w-3 h-3" /> {doc.senderEmail}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {doc.source === "email"
                        ? <span className="flex items-center gap-1 text-[11px] text-sky-600 font-semibold"><Mail className="w-3.5 h-3.5" /> إيميل</span>
                        : <span className="flex items-center gap-1 text-[11px] text-slate-500 font-semibold"><HardDrive className="w-3.5 h-3.5" /> يدوي</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">{formatSize(doc.sizeBytes)}</td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">{formatDate(doc.createdAt)}</td>
                    <td className="px-4 py-3">
                      {isLinked && doc.linkedModule ? (
                        <div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${MODULE_BADGE[doc.linkedModule]}`}>
                            {MODULE_LABEL_AR[doc.linkedModule]}
                          </span>
                          {doc.linkedLabel && (
                            <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[140px]">{doc.linkedLabel}</div>
                          )}
                        </div>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] text-amber-600 font-semibold">
                          <Link2Off className="w-3.5 h-3.5" /> غير مربوط
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="relative flex items-center gap-1">
                        <a href={`${BASE}/${doc.id}/view`}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 transition-all"
                          title="عرض"
                          target="_blank" rel="noopener noreferrer">
                          <Eye className="w-4 h-4" />
                        </a>
                        <a href={`${BASE}/${doc.id}/download`}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 transition-all"
                          title="تحميل">
                          <Download className="w-4 h-4" />
                        </a>
                        <button onClick={(e) => { e.stopPropagation(); setMenuId(menuId === doc.id ? null : doc.id); }}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {menuId === doc.id && (
                          <div className="absolute top-full left-0 bg-white border rounded-xl shadow-lg py-1 z-20 min-w-[140px]"
                            onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => startRename(doc)}
                              className="w-full text-right flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted">
                              <Pencil className="w-3.5 h-3.5" /> تعديل الاسم
                            </button>
                            <button onClick={() => { setLinkDoc(doc); setMenuId(null); }}
                              className="w-full text-right flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted">
                              <Link2 className="w-3.5 h-3.5" /> ربط بـ...
                            </button>
                            {isLinked && (
                              <button onClick={() => { handleUnlink(doc); setMenuId(null); }}
                                className="w-full text-right flex items-center gap-2 px-3 py-2 text-sm text-amber-600 hover:bg-amber-50">
                                <Link2Off className="w-3.5 h-3.5" /> إزالة الربط
                              </button>
                            )}
                            <div className="border-t my-1" />
                            <button onClick={() => { handleDelete(doc); setMenuId(null); }}
                              className="w-full text-right flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-red-50">
                              <Trash2 className="w-3.5 h-3.5" /> حذف
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer stats */}
      <div className="border-t bg-white px-6 py-2 flex items-center gap-4 text-[11px] text-muted-foreground shrink-0">
        <span>{filtered.length} مستند</span>
        <span>·</span>
        <span className="flex items-center gap-1 text-amber-600">
          <Link2Off className="w-3.5 h-3.5" /> {counts.unlinked} غير مربوط
        </span>
        <span>·</span>
        <span className="flex items-center gap-1 text-sky-600">
          <Mail className="w-3.5 h-3.5" /> {docs.filter((d) => d.source === "email").length} من إيميل
        </span>
      </div>

      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
      {linkDoc && <LinkDialog doc={linkDoc} onClose={() => setLinkDoc(null)} />}
    </div>
  );
}
