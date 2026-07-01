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
  { icon: Receipt,      label: "محاسبة وفوترة إلكترونية" },
  { icon: Users,        label: "الموارد البشرية والرواتب" },
  { icon: Package,      label: "المخزون والمستودعات" },
  { icon: Sparkles,     label: "مساعد ذكي عربي/إنجليزي" },
  { icon: ShieldCheck,  label: "متوافق مع ضريبة القيمة المضافة" },
  { icon: Headphones,   label: "دعم فني 24/7" },
  { icon: Globe,        label: "تصميم عربي مع RTL" },
  { icon: Cloud,        label: "سحابي من أي مكان" },
];

const FEATURES_EN = [
  { icon: Receipt,      label: "Accounting & e-Invoicing" },
  { icon: Users,        label: "Payroll & HR" },
  { icon: Package,      label: "Inventory & Warehouses" },
  { icon: Sparkles,     label: "AI assistant (AR/EN)" },
  { icon: ShieldCheck,  label: "VAT compliant" },
  { icon: Headphones,   label: "24/7 Support" },
  { icon: Globe,        label: "Arabic-first RTL design" },
  { icon: Cloud,        label: "Cloud, from anywhere" },
];

export function AuthBrandPanel() {
  const { i18n } = useTranslation();
  const isEn = i18n.language === "en";
  const features = isEn ? FEATURES_EN : FEATURES_AR;

  return (
    <div className="hidden lg:flex flex-col justify-between bg-primary text-primary-foreground p-10 xl:p-14 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -end-32 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-24 -start-24 w-72 h-72 rounded-full bg-white/5" />
        <div className="absolute top-1/2 end-8 w-40 h-40 rounded-full bg-white/[0.03]" />
      </div>

      {/* Logo */}
      <div className="relative flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center text-xl font-bold shadow-inner">
          ح
        </div>
        <div>
          <div className="text-lg font-bold leading-none tracking-wide">حسابات</div>
          <div className="text-[11px] text-primary-foreground/60 mt-0.5 tracking-widest uppercase">
            Hesabat
          </div>
        </div>
      </div>

      {/* Headline */}
      <div className="relative flex-1 flex flex-col justify-center gap-6 py-10">
        <div>
          <h2 className="text-3xl xl:text-4xl font-extrabold leading-snug">
            {isEn ? "Manage your business\nfrom one place" : "أدر أعمالك بالكامل\nمن مكان واحد"}
          </h2>
          <p className="mt-3 text-sm xl:text-base text-primary-foreground/70 leading-relaxed max-w-xs">
            {isEn
              ? "A complete cloud accounting platform for Egyptian & Gulf SMEs"
              : "برنامج محاسبة سحابي متكامل للشركات المصرية والخليجية"}
          </p>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {features.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                <Icon className="w-3.5 h-3.5 text-primary-foreground/90" />
              </div>
              <span className="text-xs xl:text-sm text-primary-foreground/85 leading-tight">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Free trial badge */}
      <div className="relative rounded-2xl bg-white/10 border border-white/15 p-5 backdrop-blur-sm">
        <p className="font-bold text-sm xl:text-base mb-3">
          {isEn ? "14-day free trial — no credit card required" : "14 يوماً تجربة مجانية — بدون بطاقة ائتمان"}
        </p>
        <div className="flex flex-col gap-1.5">
          {[
            isEn ? "Ready to use immediately" : "جاهز للعمل فوراً",
            isEn ? "Cancel at any time" : "إلغاء في أي وقت",
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 text-xs xl:text-sm text-primary-foreground/80">
              <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <Check className="w-2.5 h-2.5" />
              </div>
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
