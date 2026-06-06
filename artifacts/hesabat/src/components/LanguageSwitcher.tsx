import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import type { Lang } from "@workspace/locale";
import { changeLanguage, SUPPORTED_LANGS } from "@/i18n";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const current = (i18n.language === "en" ? "en" : "ar") as Lang;
  const next: Lang = current === "ar" ? "en" : "ar";

  return (
    <button
      type="button"
      onClick={() => changeLanguage(next)}
      aria-label={t("lang.switch")}
      title={t("lang.switch")}
      className={`inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted transition-colors ${className}`}
    >
      <Languages className="w-4 h-4 shrink-0" />
      <span>{t(`lang.${next}`)}</span>
    </button>
  );
}

export { SUPPORTED_LANGS };
