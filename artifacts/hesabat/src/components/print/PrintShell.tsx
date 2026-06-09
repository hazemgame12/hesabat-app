import React from "react";
import { useTranslation } from "react-i18next";
import { Printer, ArrowRight, FileDown } from "lucide-react";

/**
 * Full-page wrapper for printable documents. Renders on-screen toolbar buttons
 * (back / print / save-as-PDF) that are hidden when printing, and constrains the
 * document body to a centered A4 sheet. Both Print and "Save PDF" trigger the
 * browser print dialog (the user chooses "Save as PDF" as the destination).
 */
export function PrintShell({
  children,
  onBack,
}: {
  children: React.ReactNode;
  onBack: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="print-root min-h-screen bg-muted/40">
      <style>{printCss}</style>

      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 bg-card/95 backdrop-blur border-b px-4 py-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-2 rounded-full text-sm font-bold text-muted-foreground hover:bg-muted"
        >
          <ArrowRight className="w-4 h-4" />
          {t("print.back")}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border bg-card hover:bg-muted"
          >
            <FileDown className="w-4 h-4" />
            {t("print.savePdf")}
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-bold hover:opacity-90"
          >
            <Printer className="w-4 h-4" />
            {t("print.print")}
          </button>
        </div>
      </div>

      <div className="flex justify-center py-8 px-4 no-print-pad">
        <div className="sheet bg-white text-black shadow-lg">{children}</div>
      </div>
    </div>
  );
}

const printCss = `
.sheet {
  width: 210mm;
  min-height: 297mm;
  padding: 16mm 14mm;
  box-sizing: border-box;
}
@media print {
  @page { size: A4; margin: 0; }
  html, body { background: #fff !important; }
  .no-print { display: none !important; }
  .no-print-pad { padding: 0 !important; }
  .print-root { background: #fff !important; }
  .sheet {
    box-shadow: none !important;
    width: 210mm;
    min-height: 297mm;
  }
}
`;
