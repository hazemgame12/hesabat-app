import React from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowRight, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ComingSoon() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center flex-1 h-full p-8 text-center">
      <div className="w-24 h-24 bg-secondary/30 rounded-full flex items-center justify-center mb-6">
        <Wrench className="w-12 h-12 text-secondary-foreground opacity-80" />
      </div>
      <h1 className="text-3xl font-bold text-foreground mb-3 font-sans">{t("comingSoon.title")}</h1>
      <p className="text-muted-foreground max-w-md text-lg leading-relaxed mb-8">
        {t("comingSoon.body")}
      </p>
      <Button asChild className="h-11 px-6 shadow-sm">
        <Link href="/dashboard" className="flex items-center gap-2">
          {t("comingSoon.backHome")}
          <ArrowRight className="w-4 h-4 rtl:rotate-180" />
        </Link>
      </Button>
    </div>
  );
}
