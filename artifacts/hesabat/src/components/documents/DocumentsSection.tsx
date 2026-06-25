import React, { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  FileText, Download, Upload, Link2, Link2Off,
  FileImage, FileSpreadsheet, X, Inbox, Loader2, Eye,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Spinner } from "@/components/ui/spinner";

const BASE = "/api/documents";

interface ApiDocument {
  id: string;
  displayName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  source: "manual" | "email";
  invoiceId?: string | null;
  journalEntryId?: string | null;
  bankMovementId?: string | null;
  createdAt: string;
}

async function apiFetch(path: string, init?: RequestInit): Promise<unknown> {
  const r = await fetch(path, { credentials: "include", ...init });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error ?? r.statusText);
  }
  return r.json();
}

export type DocumentEntityType = "invoice" | "journal" | "bank-movement";

function entityQueryParam(entityType: DocumentEntityType, entityId: string): string {
  if (entityType === "invoice") return `invoiceId=${entityId}`;
  if (entityType === "journal") return `journalEntryId=${entityId}`;
  return `bankMovementId=${entityId}`;
}

function entityLinkBody(entityType: DocumentEntityType, entityId: string | null): Record<string, string | null> {
  return {
    invoiceId: entityType === "invoice" ? entityId : null,
    journalEntryId: entityType === "journal" ? entityId : null,
    bankMovementId: entityType === "bank-movement" ? entityId : null,
  };
}

function FileIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <FileImage className="w-4 h-4 text-blue-500 shrink-0" />;
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime.includes("csv"))
    return <FileSpreadsheet className="w-4 h-4 text-green-600 shrink-0" />;
  return <FileText className="w-4 h-4 text-muted-foreground shrink-0" />;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface DocumentsSectionProps {
  entityType: DocumentEntityType;
  entityId: string;
  readOnly?: boolean;
}

export function DocumentsSection({ entityType, entityId, readOnly = false }: DocumentsSectionProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showInboxPicker, setShowInboxPicker] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);

  const entityQKey = ["documents", "entity", entityType, entityId];

  const { data: docs = [], isLoading } = useQuery<ApiDocument[]>({
    queryKey: entityQKey,
    queryFn: () => apiFetch(`${BASE}?${entityQueryParam(entityType, entityId)}`) as Promise<ApiDocument[]>,
    enabled: !!entityId,
  });

  const { data: inboxDocs = [], isLoading: inboxLoading } = useQuery<ApiDocument[]>({
    queryKey: ["documents", "unlinked-list"],
    queryFn: () => apiFetch(`${BASE}?filter=unlinked`) as Promise<ApiDocument[]>,
    enabled: showInboxPicker,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["documents"] });
  };

  const detach = useMutation({
    mutationFn: (docId: string) =>
      apiFetch(`${BASE}/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: null, journalEntryId: null, bankMovementId: null }),
      }),
    onSuccess: () => {
      invalidate();
      toast({ title: t("documents.detached", "تم فك الربط") });
    },
    onError: (e) => toast({ variant: "destructive", title: String((e as Error).message) }),
  });

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`${BASE}/upload`, { method: "POST", credentials: "include", body: fd });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? r.statusText);
      }
      const doc = await r.json() as ApiDocument;
      await apiFetch(`${BASE}/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entityLinkBody(entityType, entityId)),
      });
      invalidate();
      toast({ title: t("documents.uploadLinked", "تم رفع المستند وربطه") });
    } catch (e) {
      toast({ variant: "destructive", title: String((e as Error).message) });
    } finally {
      setUploading(false);
    }
  };

  const handleAttachFromInbox = async (docId: string) => {
    setLinking(docId);
    try {
      await apiFetch(`${BASE}/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entityLinkBody(entityType, entityId)),
      });
      invalidate();
      setShowInboxPicker(false);
      toast({ title: t("documents.linked", "تم ربط المستند") });
    } catch (e) {
      toast({ variant: "destructive", title: String((e as Error).message) });
    } finally {
      setLinking(null);
    }
  };

  return (
    <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div className="flex items-center gap-2 font-bold text-foreground">
          <FileText className="w-4 h-4 text-primary" />
          {t("documents.sectionTitle", "مستندات الوارد")}
          {docs.length > 0 && (
            <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
              {docs.length}
            </span>
          )}
        </div>
        {!readOnly && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowInboxPicker((p) => !p)}
              className={`flex items-center gap-1.5 text-sm font-bold transition-colors ${
                showInboxPicker ? "text-primary underline" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Inbox className="w-4 h-4" />
              {t("documents.attachFromInbox", "من الوارد")}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.xlsx,.xls,.csv,.doc,.docx,.txt"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) { void handleUpload(f); e.target.value = ""; }
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 text-primary text-sm font-bold hover:underline disabled:opacity-60"
            >
              {uploading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Upload className="w-4 h-4" />}
              {t("documents.upload", "رفع ملف")}
            </button>
          </div>
        )}
      </div>

      {showInboxPicker && !readOnly && (
        <div className="border-b bg-muted/30 px-5 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-muted-foreground">
              {t("documents.selectFromInbox", "اختر مستنداً من صندوق الوارد")}
            </p>
            <button onClick={() => setShowInboxPicker(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          {inboxLoading ? (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <Spinner className="w-4 h-4" />
              <span>...</span>
            </div>
          ) : inboxDocs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              {t("documents.inboxEmpty", "لا توجد مستندات غير مربوطة في الوارد")}
            </p>
          ) : (
            <ul className="divide-y max-h-48 overflow-y-auto rounded-lg border bg-background">
              {inboxDocs.map((d) => (
                <li key={d.id} className="flex items-center justify-between px-3 py-2 gap-3 hover:bg-muted/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileIcon mime={d.mimeType} />
                    <span className="text-sm truncate">{d.displayName}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{fmtSize(d.sizeBytes)}</span>
                  </div>
                  <button
                    onClick={() => void handleAttachFromInbox(d.id)}
                    disabled={linking === d.id}
                    className="flex items-center gap-1 text-xs font-bold text-primary hover:underline disabled:opacity-60 shrink-0"
                  >
                    {linking === d.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Link2 className="w-3 h-3" />}
                    {t("documents.attach", "ربط")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center p-6">
          <Spinner className="w-6 h-6 text-primary" />
        </div>
      ) : docs.length === 0 ? (
        <p className="px-5 py-5 text-sm text-muted-foreground">
          {t("documents.noneAttached", "لا توجد مستندات مرفقة")}
        </p>
      ) : (
        <ul className="divide-y">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between px-5 py-3 gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <FileIcon mime={d.mimeType} />
                <span className="text-sm text-foreground truncate">{d.displayName}</span>
                <span className="text-xs text-muted-foreground font-sans shrink-0">{fmtSize(d.sizeBytes)}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a
                  href={`${BASE}/${d.id}/view`}
                  className="p-1.5 rounded-md hover:bg-primary/10 text-primary transition-colors"
                  title={t("documents.view", "عرض")}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Eye className="w-4 h-4" />
                </a>
                <a
                  href={`${BASE}/${d.id}/download`}
                  className="p-1.5 rounded-md hover:bg-primary/10 text-primary transition-colors"
                  title={t("documents.download", "تنزيل")}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download className="w-4 h-4" />
                </a>
                {!readOnly && (
                  <button
                    onClick={() => detach.mutate(d.id)}
                    disabled={detach.isPending}
                    className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive transition-colors"
                    title={t("documents.detach", "فك الربط")}
                  >
                    <Link2Off className="w-4 h-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
