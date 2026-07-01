import { useTranslation } from "react-i18next";
import {
  Receipt,
  Users,
  Package,
  Sparkles,
  ShieldCheck,
  Headphones,
  Globe,
  Cloud,
  Check,
} from "lucide-react";

const FEATURES_AR = [
  { icon: Receipt,     label: "محاسبة وفوترة إلكترونية" },
  { icon: Users,       label: "الموارد البشرية والرواتب" },
  { icon: Package,     label: "المخزون والمستودعات" },
  { icon: Sparkles,    label: "مساعد ذكي عربي/إنجليزي" },
  { icon: ShieldCheck, label: "متوافق مع ضريبة القيمة المضافة" },
  { icon: Headphones,  label: "دعم فني 24/7" },
  { icon: Globe,       label: "تصميم عربي مع RTL" },
  { icon: Cloud,       label: "سحابي من أي مكان" },
];

const FEATURES_EN = [
  { icon: Receipt,     label: "Accounting & e-Invoicing" },
  { icon: Users,       label: "Payroll & HR" },
  { icon: Package,     label: "Inventory & Warehouses" },
  { icon: Sparkles,    label: "AI assistant (AR/EN)" },
  { icon: ShieldCheck, label: "VAT compliant" },
  { icon: Headphones,  label: "24/7 Support" },
  { icon: Globe,       label: "Arabic-first RTL design" },
  { icon: Cloud,       label: "Cloud, from anywhere" },
];

export function AuthBrandPanel() {
  const { i18n } = useTranslation();
  const isEn = i18n.language === "en";
  const features = isEn ? FEATURES_EN : FEATURES_AR;

  return (
    <div className="hidden md:flex flex-col justify-between bg-white border-s border-border p-10 xl:p-14 relative overflow-hidden">
      {/* Subtle background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -end-32 w-96 h-96 rounded-full bg-primary/5" />
        <div className="absolute -bottom-24 -start-24 w-72 h-72 rounded-full bg-primary/5" />
      </div>

      {/* Logo */}
      <div className="relative flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground font-extrabold text-3xl shadow-lg">
          ح
        </div>
        <div>
          <div className="text-2xl font-extrabold text-foreground leading-none">حسابات</div>
          <div className="text-xs text-muted-foreground mt-1 tracking-widest uppercase">
            Hesabat
          </div>
        </div>
      </div>

      {/* Headline */}
      <div className="relative flex-1 flex flex-col justify-center gap-6 py-10">
        <div>
          <h2 className="text-3xl xl:text-4xl font-extrabold text-foreground leading-snug">
            {isEn ? "Manage your business\nfrom one place" : "أدر أعمالك بالكامل\nمن مكان واحد"}
          </h2>
          <p className="mt-3 text-sm xl:text-base text-muted-foreground leading-relaxed max-w-xs">
            {isEn
              ? "A complete cloud accounting platform built for Egyptian & Gulf SMEs"
              : "برنامج محاسبة سحابي متكامل مصمم للشركات المصرية والخليجية"}
          </p>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {features.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-xs xl:text-sm text-foreground/80 leading-tight">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Free trial badge */}
      <div className="relative rounded-2xl bg-primary/5 border border-primary/15 p-5">
        <p className="font-bold text-sm xl:text-base text-foreground mb-3">
          {isEn ? "14-day free trial — no credit card required" : "14 يوماً تجربة مجانية — بدون بطاقة ائتمان"}
        </p>
        <div className="flex flex-col gap-1.5">
          {[
            isEn ? "Ready to use immediately" : "جاهز للعمل فوراً",
            isEn ? "Cancel at any time" : "إلغاء في أي وقت",
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 text-xs xl:text-sm text-muted-foreground">
              <div className="w-4 h-4 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <Check className="w-2.5 h-2.5 text-primary" />
              </div>
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
