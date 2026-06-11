import React from "react";
import { useTranslation } from "react-i18next";
import { FileText, Zap, Globe, Lock } from "lucide-react";

export function EInvoice() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col">
      <header className="h-20 bg-background/80 backdrop-blur-md border-b flex items-center px-8">
        <div>
          <h1 className="text-lg font-bold text-foreground">{t("eInvoice.title")}</h1>
          <p className="text-sm text-muted-foreground font-medium">{t("eInvoice.subtitle")}</p>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-2xl w-full text-center">
          <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <FileText className="w-10 h-10 text-primary" />
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-3">{t("eInvoice.comingSoonTitle")}</h2>
          <p className="text-muted-foreground text-lg leading-relaxed mb-10 max-w-lg mx-auto">
            {t("eInvoice.comingSoonBody")}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-start">
            <div className="bg-card border rounded-xl p-5 flex flex-col gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-bold text-sm text-foreground">{t("eInvoice.feature1Title")}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{t("eInvoice.feature1Body")}</p>
            </div>
            <div className="bg-card border rounded-xl p-5 flex flex-col gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <Globe className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-bold text-sm text-foreground">{t("eInvoice.feature2Title")}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{t("eInvoice.feature2Body")}</p>
            </div>
            <div className="bg-card border rounded-xl p-5 flex flex-col gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <Lock className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-bold text-sm text-foreground">{t("eInvoice.feature3Title")}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{t("eInvoice.feature3Body")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
