import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  X, Download, Link2, Link2Off, FileText, FileImage,
  FileSpreadsheet, Search, Check, Loader2,
  Receipt, BookOpen, Banknote, Archive, Plus,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { setPendingDocLink, type PendingDocLink } from "@/hooks/usePendingDocLink";

const BASE = "/api/documents";

type LinkType = "invoice" | "journal" | "bank" | "none";

interface DocDetail {
  id: string;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  source: "manual" | "email";
  senderName?: string | null;
  senderEmail?: string | null;
  emailSubject?: string | null;
  createdAt: string;
  invoiceId?: string | null;
  journalEntryId?: string | null;
  bankMovementId?: string | null;
  linkedLabel?: string | null;
  linkedModule?: "invoice" | "journal" | "bank" | null;
}

interface LinkCandidate {
  id: string;
  label: string;
  sublabel?: string | null;
  date: string;
  amount?: number | null;
  status?: string | null;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كب`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} مب`;
}

function FileIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <FileImage className="w-4 h-4 text-blue-500 shrink-0" />;
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime.includes("csv"))
    return <FileSpreadsheet className="w-4 h-4 text-green-600 shrink-0" />;
  return <FileText className="w-4 h-4 text-muted-foreground shrink-0" />;
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-muted-foreground shrink-0 w-14">{label}</span>
      <span className="text-foreground break-all">{value}</span>
    </div>
  );
}

type CreateAction = {
  key: string;
  label: string;
  icon: React.ElementType;
  field: PendingDocLink["field"];
  path: string;
  direction?: "in" | "out";
};

const CREATE_ACTIONS: CreateAction[] = [
  { key: "journal",      label: "قيد يومي",      icon: BookOpen, field: "journalEntryId",  path: "/journal" },
  { key: "sales-inv",   label: "فاتورة عميل",   icon: Receipt,  field: "invoiceId",        path: "/invoices/sales" },
  { key: "purchase-inv",label: "فاتورة مورد",   icon: Receipt,  field: "invoiceId",        path: "/invoices/purchases" },
  { key: "bank-in",     label: "سند استلام ↑",  icon: Banknote, field: "bankMovementId",   path: "/bank", direction: "in" },
  { key: "bank-out",    label: "سند صرف ↓",     icon: Banknote, field: "bankMovementId",   path: "/bank", direction: "out" },
];

interface Props {
  docId: string | null;
  onClose: () => void;
  prefillType?: "invoice" | "journal" | "bank";
  prefillId?: string;
}

export default function DocumentReviewPanel({ docId, onClose, prefillType, prefillId }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [linkType, setLinkType] = useState<LinkType | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleCreateNew = (action: CreateAction) => {
    if (!doc) return;
    setPendingDocLink({ docId: doc.id, docName: doc.displayName, field: action.field, direction: action.direction });
    onClose();
    setLocation(action.path);
  };

  const { data: doc, isLoading } = useQuery<DocDetail>({
    queryKey: ["doc-detail", docId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/${docId}`, { credentials: "include" });
      if (!r.ok) throw new Error("فشل تحميل المستند");
      return r.json() as Promise<DocDetail>;
    },
    enabled: !!docId,
    staleTime: 0,
  });

  useEffect(() => {
    if (!doc) return;
    if (doc.invoiceId) { setLinkType("invoice"); setSelectedId(doc.invoiceId); }
    else if (doc.journalEntryId) { setLinkType("journal"); setSelectedId(doc.journalEntryId); }
    else if (doc.bankMovementId) { setLinkType("bank"); setSelectedId(doc.bankMovementId); }
    else if (prefillType && prefillId) { setLinkType(prefillType); setSelectedId(prefillId); }
    else { setLinkType("none"); setSelectedId(null); }
  }, [doc?.id]);

  const { data: candidates = [], isFetching: searching } = useQuery<LinkCandidate[]>({
    queryKey: ["link-search", linkType, search],
    queryFn: async () => {
      if (!linkType || linkType === "none") return [];
      const r = await fetch(
        `${BASE}/link-search?type=${linkType}&q=${encodeURIComponent(search)}`,
        { credentials: "include" },
      );
      if (!r.ok) return [];
      return r.json() as Promise<LinkCandidate[]>;
    },
    enabled: !!linkType && linkType !== "none",
    staleTime: 30_000,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        invoiceId: linkType === "invoice" ? selectedId : null,
        journalEntryId: linkType === "journal" ? selectedId : null,
        bankMovementId: linkType === "bank" ? selectedId : null,
      };
      const r = await fetch(`${BASE}/${docId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? "فشل الحفظ");
      }
      return r.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["documents"] });
      void qc.invalidateQueries({ queryKey: ["doc-detail", docId] });
      void qc.invalidateQueries({ queryKey: ["docs-unlinked-count"] });
      toast({ title: linkType === "none" ? "تم فك الربط" : "تم الربط بنجاح ✓" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const isLinked = !!(doc?.invoiceId || doc?.journalEntryId || doc?.bankMovementId);
  const isPdf = doc?.mimeType === "application/pdf";
  const isImage = doc?.mimeType?.startsWith("image/");
  const canSave = linkType === "none" || (!!linkType && !!selectedId);

  const typeOptions: { type: LinkType; icon: React.ElementType; label: string }[] = [
    { type: "invoice", icon: Receipt, label: "فاتورة" },
    { type: "journal", icon: BookOpen, label: "قيد يومية" },
    { type: "bank", icon: Banknote, label: "حركة بنكية" },
    { type: "none", icon: Archive, label: "بدون ربط" },
  ];

  const navPaths: Record<string, string> = {
    invoice: "/invoices",
    journal: "/journal",
    bank: "/banks",
  };
  const navLabels: Record<string, string> = {
    invoice: "فاتورة",
    journal: "قيد يومية",
    bank: "حركة بنكية",
  };

  if (!docId) return null;

  return (
    <Dialog open={!!docId} onOpenChange={onClose}>
      <DialogContent
        className="p-0 overflow-hidden flex flex-col gap-0 rounded-xl border-0 shadow-2xl"
        style={{ maxWidth: "94vw", width: "94vw", height: "92vh", maxHeight: "92vh" }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-card shrink-0" dir="rtl">
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
          {doc && <FileIcon mime={doc.mimeType} />}
          <span className="text-sm font-medium text-foreground flex-1 truncate min-w-0">
            {doc?.displayName ?? "جاري التحميل..."}
          </span>
          {doc && (
            <a
              href={`${BASE}/${docId}/download`}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 transition-colors shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              تنزيل
            </a>
          )}
        </div>

        {/* Split body */}
        <div className="flex flex-1 overflow-hidden min-h-0" dir="ltr">

          {/* ─── Left: Document Viewer ─── */}
          <div className="flex-1 bg-zinc-100 dark:bg-zinc-900 overflow-auto flex items-center justify-center">
            {isLoading ? (
              <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
            ) : isPdf ? (
              <iframe
                src={`${BASE}/${docId}/view`}
                className="w-full h-full border-0"
                title={doc?.displayName}
              />
            ) : isImage ? (
              <img
                src={`${BASE}/${docId}/view`}
                alt={doc?.displayName}
                className="max-w-full max-h-full object-contain p-6 rounded-lg"
              />
            ) : (
              <div className="text-center space-y-4 p-8" dir="rtl">
                <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mx-auto">
                  <FileText className="w-10 h-10 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  معاينة غير متاحة لهذا النوع
                </p>
                <a
                  href={`${BASE}/${docId}/download`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  تنزيل الملف
                </a>
              </div>
            )}
          </div>

          {/* ─── Right: Action Panel ─── */}
          <div className="w-72 lg:w-80 border-l flex flex-col bg-card overflow-hidden" dir="rtl">
            {!doc ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Metadata */}
                <div className="p-4 border-b space-y-2.5 shrink-0">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    بيانات المستند
                  </p>
                  <div className="space-y-1.5">
                    {doc.source === "email" && (
                      <>
                        {doc.senderName && <MetaRow label="المُرسِل" value={doc.senderName} />}
                        {doc.senderEmail && <MetaRow label="الإيميل" value={doc.senderEmail} />}
                        {doc.emailSubject && <MetaRow label="الموضوع" value={doc.emailSubject} />}
                      </>
                    )}
                    <MetaRow label="الحجم" value={fmtSize(doc.sizeBytes)} />
                    <MetaRow
                      label="التاريخ"
                      value={new Date(doc.createdAt).toLocaleDateString("ar-EG", {
                        year: "numeric", month: "long", day: "numeric",
                      })}
                    />
                    <MetaRow
                      label="المصدر"
                      value={doc.source === "email" ? "📧 بريد إلكتروني" : "📁 رفع يدوي"}
                    />
                  </div>

                  {/* Link status */}
                  <div className="pt-0.5">
                    {isLinked ? (
                      <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950 rounded-lg px-2.5 py-2 border border-green-200 dark:border-green-800">
                        <Link2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">مرتبط بـ {doc.linkedLabel}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 rounded-lg px-2.5 py-2 border border-amber-200 dark:border-amber-800">
                        <Link2Off className="w-3.5 h-3.5 shrink-0" />
                        <span>غير مرتبط — يحتاج مراجعة</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Link form */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    ربط المستند بـ
                  </p>

                  {/* Type selector */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {typeOptions.map(({ type, icon: Icon, label }) => (
                      <button
                        key={type}
                        onClick={() => {
                          setLinkType(type);
                          if (type !== linkType) {
                            setSelectedId(null);
                            setSearch("");
                          }
                        }}
                        className={`flex items-center gap-2 text-xs px-2.5 py-2.5 rounded-lg border transition-all ${
                          linkType === type
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-card text-muted-foreground border-border hover:bg-muted"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Search + candidates */}
                  {linkType && linkType !== "none" && (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="absolute end-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                        <Input
                          className="text-xs pe-8 h-8"
                          placeholder={
                            linkType === "invoice" ? "ابحث برقم الفاتورة أو الكود..." :
                            linkType === "journal" ? "ابحث برقم القيد أو الوصف..." :
                            "ابحث في الحركات البنكية..."
                          }
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </div>

                      <div className="rounded-lg border overflow-hidden">
                        {searching ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : candidates.length === 0 ? (
                          <div className="text-xs text-muted-foreground text-center py-8 space-y-1">
                            <p>{search ? "لا توجد نتائج" : "اكتب للبحث أو اختر من الأحدث"}</p>
                          </div>
                        ) : (
                          <div className="max-h-52 overflow-y-auto divide-y">
                            {candidates.map((c) => (
                              <button
                                key={c.id}
                                onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
                                className={`w-full text-start px-3 py-2.5 text-xs hover:bg-muted transition-colors ${
                                  selectedId === c.id
                                    ? "bg-primary/10 border-e-2 border-e-primary"
                                    : ""
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  {selectedId === c.id && (
                                    <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-foreground truncate">{c.label}</p>
                                    {c.sublabel && (
                                      <p className="text-muted-foreground truncate mt-0.5">{c.sublabel}</p>
                                    )}
                                  </div>
                                  {c.amount != null && (
                                    <span className="shrink-0 text-foreground tabular-nums text-[11px]">
                                      {Number(c.amount).toLocaleString("ar-EG")}
                                    </span>
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                    </div>
                  )}
                </div>

                {/* Save footer */}
                <div className="p-4 border-t shrink-0 space-y-3">
                  <Button
                    className="w-full"
                    disabled={saveMutation.isPending || !canSave}
                    onClick={() => saveMutation.mutate()}
                  >
                    {saveMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin me-2" />
                    ) : (
                      <Check className="w-4 h-4 me-2" />
                    )}
                    {linkType === "none" ? "فك الربط وحفظ" : "حفظ الربط"}
                  </Button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                    <div className="relative flex justify-center text-[11px]">
                      <span className="bg-background px-2 text-muted-foreground">أو أنشئ جديداً وارتبط تلقائياً</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-1">
                    {CREATE_ACTIONS.map((a) => (
                      <button
                        key={a.key}
                        onClick={() => handleCreateNew(a)}
                        disabled={!doc}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border hover:border-primary/40 hover:bg-primary/5 text-xs text-muted-foreground hover:text-primary transition-all text-start disabled:opacity-40"
                      >
                        <a.icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="flex-1">{a.label}</span>
                        <Plus className="w-3 h-3 opacity-50" />
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
