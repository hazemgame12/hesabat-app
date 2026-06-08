import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Upload, Loader2 } from "lucide-react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface ExcelToolbarProps {
  // Raw API path for the export download, e.g. "/api/customers/export".
  exportPath: string;
  // Raw API path for the import upload, e.g. "/api/customers/import".
  // When omitted, only the export button renders.
  importPath?: string;
  // Whether the current user may import (capability-gated by the caller).
  canImport?: boolean;
  // Query keys to invalidate after a successful import.
  invalidateKeys?: QueryKey[];
  // Optional callback after a successful import (e.g. custom refetch).
  onImported?: (imported: number) => void;
}

// Reusable Export/Import Excel toolbar shared across modules. Uses raw fetch /
// window.open against the /api proxy (no generated hooks), mirroring the journal
// module pattern.
export function ExcelToolbar({
  exportPath,
  importPath,
  canImport = true,
  invalidateKeys = [],
  onImported,
}: ExcelToolbarProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const onImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !importPath) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(importPath, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || t("common.importError"));
      for (const key of invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      const imported = body?.imported ?? 0;
      toast({ title: t("common.importSuccess", { count: imported }) });
      onImported?.(imported);
    } catch (err: unknown) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description:
          err instanceof Error ? err.message : t("common.importError"),
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => window.open(exportPath, "_blank")}
        className="flex items-center gap-2 bg-card border px-4 py-2 rounded-full text-sm font-bold text-foreground hover:bg-muted/50 transition-colors"
      >
        <Download className="w-4 h-4" />
        {t("common.exportExcel")}
      </button>
      {importPath && canImport && (
        <>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".xlsx,.xls"
            onChange={onImportChange}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 bg-card border px-4 py-2 rounded-full text-sm font-bold text-foreground hover:bg-muted/50 transition-colors disabled:opacity-60"
          >
            {importing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {t("common.importExcel")}
          </button>
        </>
      )}
    </div>
  );
}
