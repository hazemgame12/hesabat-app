import React from "react";
import { useTranslation } from "react-i18next";
import { ClipboardList } from "lucide-react";
import { TaxReports } from "@/components/reports/TaxReports";

export function ReportsTax() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <ClipboardList className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t("taxDeclarations.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("taxDeclarations.subtitle")}
          </p>
        </div>
      </div>

      <TaxReports fmt={fmt} lang={lang} />
    </div>
  );
}
