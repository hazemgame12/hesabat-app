import React from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Download, Database } from "lucide-react";

export function Backup() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/company/export", {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || t("settings.backup.error"));
      }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hesabat-backup-${data.company?.name ?? "company"}-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: t("settings.backup.success") });
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message || t("settings.backup.error") });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-xl">
      <Card className="p-6 shadow-sm border-border">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">{t("settings.backup.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("settings.backup.subtitle")}</p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
            <p className="mb-2">{t("settings.backup.description")}</p>
            <ul className="list-disc list-inside space-y-1">
              <li>{t("settings.backup.includes.company")}</li>
              <li>{t("settings.backup.includes.accounts")}</li>
              <li>{t("settings.backup.includes.journal")}</li>
              <li>{t("settings.backup.includes.customers")}</li>
              <li>{t("settings.backup.includes.suppliers")}</li>
              <li>{t("settings.backup.includes.invoices")}</li>
              <li>{t("settings.backup.includes.inventory")}</li>
              <li>{t("settings.backup.includes.fixedAssets")}</li>
              <li>{t("settings.backup.includes.payroll")}</li>
              <li>{t("settings.backup.includes.bank")}</li>
              <li>{t("settings.backup.includes.currencies")}</li>
              <li>{t("settings.backup.includes.taxes")}</li>
              <li>{t("settings.backup.includes.costCenters")}</li>
              <li>{t("settings.backup.includes.fiscalYears")}</li>
              <li>{t("settings.backup.includes.team")}</li>
            </ul>
          </div>

          <Button
            onClick={handleExport}
            disabled={loading}
            className="w-fit h-10 text-sm font-bold shadow-md hover:opacity-90"
          >
            {loading ? (
              <>
                <Spinner className="w-4 h-4 me-2" />
                {t("settings.backup.exporting")}
              </>
            ) : (
              <>
                <Download className="w-4 h-4 me-2" />
                {t("settings.backup.export")}
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
