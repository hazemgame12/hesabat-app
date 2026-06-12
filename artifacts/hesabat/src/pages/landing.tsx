import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { type CountryCode } from "@workspace/locale";
import { motion, useInView, AnimatePresence } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
} from "recharts";
import {
  Check,
  Clock,
  BarChart3,
  Receipt,
  Users,
  Shield,
  Globe,
  FileText,
  Calculator,
  ChevronDown,
  ArrowLeft,
  Zap,
  TrendingUp,
  CreditCard,
  Building2,
  Headphones,
  Sparkles,
  Wrench,
  Truck,
  MessageCircle,
  Award,
  Star,
  ChevronRight,
  MousePointer,
  Database,
  Lock,
  ArrowUpRight,
  HeartHandshake,
  Gauge,
  Package,
  Handshake,
  Download,
  Layers,
  Target,
  Megaphone,
  Lightbulb,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Info,
  Phone,
  Mail,
  MapPin,
  Play,
  Pause,
  Plus,
  Minus,
} from "lucide-react";

/* ───────────────────────────────  Data  ─────────────────────────────── */

const COUNTRIES: { code: CountryCode; flag: string; name: string; currency: string }[] = [
  { code: "EG", flag: "🇪🇬", name: "مصر", currency: "EGP" },
  { code: "SA", flag: "🇸🇦", name: "السعودية", currency: "SAR" },
  { code: "AE", flag: "🇦🇪", name: "الإمارات", currency: "AED" },
  { code: "KW", flag: "🇰🇼", name: "الكويت", currency: "KWD" },
  { code: "QA", flag: "🇶🇦", name: "قطر", currency: "QAR" },
  { code: "BH", flag: "🇧🇭", name: "البحرين", currency: "BHD" },
  { code: "OM", flag: "🇴🇲", name: "عمان", currency: "OMR" },
];

const FEATURES = [
  { icon: Receipt, title: "فواتير إلكترونية ذكية", desc: "أنشئ فواتير مبيعات ومشتريات بأنواع مختلفة (خدمات، سلع، مركبة) مع قوالب جاهزة وإرسال بالبريد" },
  { icon: BarChart3, title: "تقارير مالية متكاملة", desc: "ميزانية، قائمة دخل، تدفق نقدي، تحليلات مالية متقدمة ورسوم بيانية تفاعلية" },
  { icon: Calculator, title: "ضرائب ولجانات محلية", desc: "حساب ضريبة القيمة المضافة، الضريبة على الدخل، أرباح تجارية حسب قوانين دولتك" },
  { icon: Users, title: "عملاء وموردين بأرصدة", desc: "دفتر أستاذ مساعد، أرصدة، تقارير عمر الديون، تعاملات مالية وتاريخ كامل" },
  { icon: Shield, title: "فريق وصلاحيات متقدمة", desc: "دعوة فريق، أدوار متعددة، تحكم كامل في الصلاحيات لكل مستخدم" },
  { icon: FileText, title: "مستندات ومرفقات غير محدودة", desc: "رفع ملفات، مرفقات لقيود اليومية، إضافة الصور للفواتير والمستندات" },
  { icon: CreditCard, title: "بنوك وخزينة متكاملة", desc: "حسابات بنكية، حركات، تعثرات، تسويات بنكية وإعادة التقييم" },
  { icon: Building2, title: "أصول ثابتة وإهلاك", desc: "تسجيل الأصول، حساب الإهلاك، إهلاك متعدد الطرق (تناقصي، خطي، مجمع)" },
  { icon: Package, title: "مخزون وكشوف جرد", desc: "جرد، تتبع، تقارير التكلفة، وإدارة المخزون بالتكلفة المتوسطة" },
  { icon: Layers, title: "مراكز تكلفة وتحليل", desc: "تتبع التكاليف حسب المراكز، مقارنة الأداء، تقارير تحليلية متقدمة" },
  { icon: Gauge, title: "عملاء وموردين متقدم", desc: "فواتير، مدفوعات، ديون، تقارير أداء، تنبيهات آلية للمبالغ المستحقة" },
  { icon: Handshake, title: "مرتبات وسلف وعهد", desc: "حساب المرتبات، السلف، العهد، التأمينات الاجتماعية والضرائب" },
];

const TARGET_AUDIENCES = [
  { icon: Building2, title: "الشركات الصغيرة والمتوسطة", desc: "حل متكامل بسعر معقول يناسب ميزانيتك وينمو معك" },
  { icon: Calculator, title: "مكاتب المحاسبة والمراجعة", desc: "إدارة حسابات عدة عملاء في نظام واحد مع فصل كامل للبيانات" },
  { icon: ShoppingBag, title: "المتاجر والتجارة الإلكترونية", desc: "فواتير، مخزون، عملاء، تقارير مبيعات، وربط مع بوابات الدفع" },
  { icon: Truck, title: "شركات التجارة والتوزيع", desc: "تتبع المخزون، الفواتير، العملاء، الموردين، والتوصيل" },
  { icon: Factory, title: "الشركات الصناعية والإنتاجية", desc: "مراكز تكلفة، جرد، أصول ثابتة، تقارير إنتاجية" },
  { icon: Stethoscope, title: "العيادات والمستشفيات", desc: "فواتير خدمات، تأمين، مرتبات، ومتابعة المديونيات" },
  { icon: GraduationCap, title: "المؤسسات التعليمية", desc: "فواتير رسوم، مرتبات، مصروفات، تقارير مالية" },
  { icon: Hotel, title: "الفنادق والمطاعم", desc: "فواتير، مخزون، مرتبات، تقارير يومية" },
];

const COMPARISON = [
  { feature: "سهولة الاستخدام", us: true, excel: false, traditional: false },
  { feature: "تقارير مالية تفاعلية", us: true, excel: false, traditional: false },
  { feature: "تقارير ضريبية حسب الدولة", us: true, excel: false, traditional: false },
  { feature: "تقارير متعددة العملات", us: true, excel: false, traditional: false },
  { feature: "دعم 24/7 من محاسبين", us: true, excel: false, traditional: false },
  { feature: "نقل البيانات مجاناً", us: true, excel: false, traditional: false },
  { feature: "تطوير مستمر وميزات جديدة", us: true, excel: false, traditional: false },
  { feature: "طلب ميزات مخصصة", us: true, excel: false, traditional: false },
  { feature: "فواتير إلكترونية معتمدة", us: true, excel: false, traditional: false },
  { feature: "أمان سحابي ونسخ احتياطي", us: true, excel: false, traditional: false },
  { feature: "وصول من أي مكان", us: true, excel: false, traditional: false },
  { feature: "تكامل بنوك وخزينة", us: true, excel: false, traditional: false },
];

const TESTIMONIALS = [
  { name: "شركة النيل للتجارة", role: "مدير مالي", text: "حسابات غيّر طريقة عملنا بالكامل. التقارير المالية صارت تطلع في دقايق بدل أيام. والدعم الفني ممتاز." },
  { name: "مكتب الأمل للمحاسبة", role: "محاسب قانوني", text: "بنستخدم حسابات لإدارة حسابات أكتر من 15 شركة. النظام سريع وآمن والفصل بين الشركات ممتاز." },
  { name: "صيدليات العزبي", role: "صيدلي", text: "نظام سهل جداً، مايحتاج خبرة محاسبية. الفواتير والمخزون بتتحدثوا لوحدهم." },
  { name: "شركة الصفا للمقاولات", role: "مدير عام", text: "التقارير الضريبية المعدة حسب قوانين مصر وفرت علينا وقت ومجهود كبير." },
  { name: "متجر إلكتروني سعودي", role: "صاحب المتجر", text: "نقدر نتبع المبيعات والمخزون والعملاء من الجوال. النظام سريع وممتاز." },
  { name: "مستشفى الأمل", role: "محاسب", text: "نظام متكامل للفواتير والتأمين والمرتبات. الدعم 24/7 ساعدنا كتير في البداية." },
];

const STATS = [
  { label: "شركة تثق بنا", value: 1200, suffix: "+" },
  { label: "فاتورة شهرياً", value: 85000, suffix: "+" },
  { label: "تقرير مالي", value: 250000, suffix: "+" },
  { label: "دولة نخدمها", value: 7, suffix: "" },
  { label: "عمر النظام", value: 3, suffix: "+ سنوات" },
  { label: "نسبة رضا العملاء", value: 98, suffix: "%" },
];

const CHART_DATA = [
  { name: "يناير", revenue: 45000, expenses: 32000, profit: 13000 },
  { name: "فبراير", revenue: 52000, expenses: 35000, profit: 17000 },
  { name: "مارس", revenue: 48000, expenses: 30000, profit: 18000 },
  { name: "أبريل", revenue: 61000, expenses: 38000, profit: 23000 },
  { name: "مايو", revenue: 55000, expenses: 34000, profit: 21000 },
  { name: "يونيو", revenue: 67000, expenses: 39000, profit: 28000 },
];

const PIE_DATA = [
  { name: "المبيعات", value: 45, color: "#1e3a5f" },
  { name: "المصروفات", value: 30, color: "#c9a96e" },
  { name: "الأرباح", value: 25, color: "#10b981" },
];

const CURRENCY_DATA = [
  { name: "EGP", value: 450000 },
  { name: "USD", value: 85000 },
  { name: "SAR", value: 120000 },
  { name: "AED", value: 95000 },
];

/* ───────────────────────────────  Helpers  ─────────────────────────────── */

function useCountUp(end: number, duration = 2) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  useEffect(() => {
    if (!isInView) return;
    let start = 0;
    const increment = end / (duration * 60);
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 1000 / 60);
    return () => clearInterval(timer);
  }, [isInView, end, duration]);
  return { count, ref };
}

function AnimatedStat({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  const { count, ref } = useCountUp(value);
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="text-center"
    >
      <div className="text-3xl md:text-4xl font-bold text-[#1e3a5f] font-mono">
        {count.toLocaleString()}{suffix}
      </div>
      <div className="text-sm text-muted-foreground mt-1">{label}</div>
    </motion.div>
  );
}

function SectionTitle({ title, subtitle, align = "center" }: { title: string; subtitle?: string; align?: "center" | "right" }) {
  return (
    <div className={`mb-12 ${align === "center" ? "text-center" : "text-right"}`}>
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="text-3xl md:text-4xl font-bold text-[#1e3a5f] mb-3"
      >
        {title}
      </motion.h2>
      {subtitle && (
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-lg text-muted-foreground max-w-2xl mx-auto"
        >
          {subtitle}
        </motion.p>
      )}
    </div>
  );
}

async function fetchPlans(country: string) {
  const res = await fetch(`/api/plans?country=${country}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch plans");
  return res.json();
}

function BillingLabel(cycle: string) {
  switch (cycle) {
    case "monthly": return "شهري";
    case "quarterly": return "ربع سنوي";
    case "yearly": return "سنوي";
    default: return cycle;
  }
}
function BillingLabelI18n(cycle: string, t: any) {
  switch (cycle) {
    case "monthly": return t("landing.billingMonthly");
    case "quarterly": return t("landing.billingQuarterly");
    case "yearly": return t("landing.billingYearly");
    default: return cycle;
  }
}

/* ───────────────────────────────  Main Page  ─────────────────────────────── */

export function LandingPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as "ar" | "en";
  const { data: user } = useGetCurrentUser();
  const [, setLocation] = useLocation();
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>("EG");
  const [showAllCountries, setShowAllCountries] = useState(false);
  const [activeFeature, setActiveFeature] = useState(0);
  const [expandedComparison, setExpandedComparison] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  useEffect(() => {
    if (user) setLocation("/dashboard");
  }, [user, setLocation]);

  const { data: plans, isLoading } = useQuery({
    queryKey: ["landing-plans", selectedCountry],
    queryFn: () => fetchPlans(selectedCountry),
  });

  const visibleCountries = showAllCountries ? COUNTRIES : COUNTRIES.slice(0, 3);

  return (
    <div className="min-h-screen bg-background font-sans overflow-x-hidden" dir={t("lang.ar") === "العربية" ? "rtl" : "ltr"}>
      <SEOHead />
      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
      {/* ═══════════════════  Navbar  ═══════════════════ */}
      <nav className="sticky top-0 z-50 border-b bg-white/90 backdrop-blur-md shadow-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setLocation("/")}>
            <div className="w-10 h-10 rounded-xl bg-[#1e3a5f] flex items-center justify-center text-white font-bold text-xl shadow-md">
              {t("common.appInitial")}
            </div>
            <span className="font-bold text-xl text-[#1e3a5f]">{t("common.appName")}</span>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher className="hidden sm:inline-flex" />
            <Button variant="ghost" className="text-[#1e3a5f]" onClick={() => setLocation("/login")}>
              {t("auth.login.submit")}
            </Button>
            <Button
              className="bg-[#1e3a5f] hover:bg-[#152d4d] text-white shadow-md"
              onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}
            >
              <Zap className="w-4 h-4 me-2" />
              {t("landing.ctaNav")}
            </Button>
          </div>
        </div>
      </nav>

      {/* ═══════════════════  Hero  ═══════════════════ */}
      <section className="relative overflow-hidden py-20 lg:py-32 bg-[#1e3a5f]">
        {/* Hero background image */}
        <div className="absolute inset-0">
          <img
            src="/hero-image.png"
            alt="Hesabat Dashboard"
            className="w-full h-full object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#1e3a5f]/80 via-[#1e3a5f]/90 to-[#1e3a5f]" />
        </div>
        {/* Animated background particles */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 bg-[#c9a96e]/20 rounded-full"
              initial={{ x: Math.random() * 1000, y: Math.random() * 600 }}
              animate={{
                y: [null, Math.random() * -600],
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: 5 + Math.random() * 5,
                repeat: Infinity,
                delay: Math.random() * 5,
              }}
              style={{ left: `${Math.random() * 100}%` }}
            />
          ))}
        </div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
            >
              <Badge className="text-base px-5 py-2 bg-[#c9a96e]/20 text-[#c9a96e] border-[#c9a96e]/30 mb-4">
                <Sparkles className="w-4 h-4 me-2" />
                {t("landing.heroBadge")}
              </Badge>
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight text-white"
            >
              {t("landing.heroTitle")}
              <br />
              <span className="text-[#c9a96e]">{t("landing.heroSubtitle")}</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.4 }}
              className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto leading-relaxed"
            >
              {t("landing.heroDescription")}
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.6 }}
              className="flex flex-col sm:flex-row gap-4 justify-center pt-4"
            >
              <Button
                size="lg"
                className="h-14 text-lg px-8 bg-[#c9a96e] hover:bg-[#b8956a] text-[#1e3a5f] font-bold shadow-lg shadow-[#c9a96e]/30"
                onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}
              >
                <Zap className="w-5 h-5 me-2" />
                {t("landing.ctaPrimary")}
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-14 text-lg px-8 border-white/30 text-white hover:bg-white/10 hover:text-white"
                onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
              >
                <Play className="w-5 h-5 me-2" />
                {t("landing.ctaSecondary")}
              </Button>
            </motion.div>
            {/* Trust badges */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="flex flex-wrap justify-center gap-6 pt-8 text-white/60 text-sm"
            >
              <span className="flex items-center gap-2"><Lock className="w-4 h-4" /> {t("landing.trustCloud")}</span>
              <span className="flex items-center gap-2"><Globe className="w-4 h-4" /> {t("landing.trustCountries")}</span>
              <span className="flex items-center gap-2"><Download className="w-4 h-4" /> {t("landing.trustMigration")}</span>
              <span className="flex items-center gap-2"><Headphones className="w-4 h-4" /> {t("landing.trustSupport")}</span>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════════  Stats Bar  ═══════════════════ */}
      <section className="py-12 bg-[#f8f9fb] border-b">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8">
            {STATS.map((s, i) => (
              <AnimatedStat key={i} label={s.label} value={s.value} suffix={s.suffix} />
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════  About Us  ═══════════════════ */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 lg:gap-20 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="order-2 md:order-1 relative"
            >
              <div className="absolute inset-0 bg-[#1e3a5f]/10 rounded-3xl transform translate-x-4 translate-y-4 -z-10" />
              <div className="rounded-3xl shadow-xl w-full h-[400px] bg-gradient-to-br from-[#1e3a5f] to-[#2a4a6f] flex items-center justify-center">
                <div className="text-center text-white">
                  <div className="w-20 h-20 rounded-2xl bg-[#c9a96e]/20 flex items-center justify-center mx-auto mb-4">
                    <span className="text-4xl font-bold text-[#c9a96e]">ح</span>
                  </div>
                  <div className="text-3xl font-bold">{t("common.appName")}</div>
                  <div className="text-white/70 mt-2">{t("landing.heroSubtitle")}</div>
                </div>
              </div>
              <div className="absolute -bottom-6 -right-6 bg-white p-6 rounded-2xl shadow-xl max-w-[250px] border">
                <div className="text-[#1e3a5f] font-bold text-4xl mb-2">20+</div>
                <div className="text-sm font-semibold text-muted-foreground">{t("landing.aboutYears")}</div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="order-1 md:order-2 space-y-6"
            >
              <div className="inline-block px-4 py-1.5 bg-[#1e3a5f]/10 text-[#1e3a5f] rounded-full font-semibold text-sm mb-2">
                {t("landing.aboutLabel")}
              </div>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-[#1e3a5f] leading-tight">
                {t("landing.aboutTitle")}
              </h2>
              <div className="w-20 h-1.5 bg-[#c9a96e] rounded-full mb-6" />
              <p className="text-lg text-muted-foreground leading-relaxed">
                {t("landing.aboutParagraph1")}
              </p>
              <p className="text-lg text-muted-foreground leading-relaxed">
                {t("landing.aboutParagraph2")}
              </p>
              <div className="pt-6 border-t border-gray-200 mt-6">
                <p className="font-bold text-xl text-[#1e3a5f]">{t("landing.aboutFounderName")}</p>
                <p className="text-[#c9a96e] font-medium">{t("landing.aboutFounderRole")}</p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════════  Why Us Banner  ═══════════════════ */}
      <section className="py-16 bg-[#f8f9fb]">
        <div className="container mx-auto px-4">
          <SectionTitle
            title={t("landing.whyUsTitle")}
            subtitle={t("landing.whyUsSubtitle")}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: MousePointer, title: t("landing.whyUsEasy"), desc: t("landing.whyUsEasyDesc") },
              { icon: BarChart3, title: t("landing.whyUsReports"), desc: t("landing.whyUsReportsDesc") },
              { icon: FileText, title: t("landing.whyUsTaxes"), desc: t("landing.whyUsTaxesDesc") },
              { icon: Globe, title: t("landing.whyUsMultiCurrency"), desc: t("landing.whyUsMultiCurrencyDesc") },
              { icon: Sparkles, title: t("landing.whyUsContinuous"), desc: t("landing.whyUsContinuousDesc") },
              { icon: Wrench, title: t("landing.whyUsCustom"), desc: t("landing.whyUsCustomDesc") },
              { icon: Truck, title: t("landing.whyUsMigration"), desc: t("landing.whyUsMigrationDesc") },
              { icon: Headphones, title: t("landing.whyUsSupport"), desc: t("landing.whyUsSupportDesc") },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                whileHover={{ y: -5, boxShadow: "0 20px 40px -10px rgba(30,58,95,0.15)" }}
                className="bg-[#f8f9fb] rounded-2xl p-6 border border-[#e8eaed] hover:border-[#1e3a5f]/20 transition-all"
              >
                <div className="w-14 h-14 rounded-xl bg-[#1e3a5f]/10 flex items-center justify-center mb-4">
                  <item.icon className="w-7 h-7 text-[#1e3a5f]" />
                </div>
                <h3 className="font-bold text-lg text-[#1e3a5f] mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════  Interactive Charts Demo  ═══════════════════ */}
      <section className="py-16 bg-[#f8f9fb]">
        <div className="container mx-auto px-4">
          <SectionTitle
            title={t("landing.chartsTitle")}
            subtitle={t("landing.chartsSubtitle")}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Bar Chart */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="bg-white rounded-2xl p-6 shadow-sm border"
            >
              <h3 className="font-bold text-[#1e3a5f] mb-6 text-center">{t("landing.chartMonthly")}</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={CHART_DATA}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8eaed" />
                  <XAxis dataKey="name" tick={{ fill: "#666", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#666", fontSize: 12 }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }} />
                  <Bar dataKey="revenue" fill="#1e3a5f" radius={[4, 4, 0, 0]} name={t("landing.chartRevenue")} />
                  <Bar dataKey="expenses" fill="#c9a96e" radius={[4, 4, 0, 0]} name={t("landing.chartExpenses")} />
                  <Bar dataKey="profit" fill="#10b981" radius={[4, 4, 0, 0]} name={t("landing.chartProfit")} />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>

            {/* Pie + Multi-currency */}
            <div className="space-y-6">
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="bg-white rounded-2xl p-6 shadow-sm border"
              >
                <h3 className="font-bold text-[#1e3a5f] mb-4 text-center">{t("landing.chartDistribution")}</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={PIE_DATA} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value">
                      {PIE_DATA.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 mt-2">
                  {PIE_DATA.map((d, i) => (
                    <div key={i} className="flex items-center gap-1 text-sm">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                      <span>{d.name}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="bg-white rounded-2xl p-6 shadow-sm border"
              >
                <h3 className="font-bold text-[#1e3a5f] mb-4 text-center">{t("landing.chartMultiCurrency")}</h3>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={CURRENCY_DATA}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e8eaed" />
                    <XAxis dataKey="name" tick={{ fill: "#666", fontSize: 12 }} />
                    <YAxis tick={{ fill: "#666", fontSize: 12 }} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
                    <Area type="monotone" dataKey="value" stroke="#1e3a5f" fill="#1e3a5f" fillOpacity={0.1} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
                <p className="text-xs text-center text-muted-foreground mt-2">
                  تابع أعمالك بـ EGP, USD, SAR, AED, KWD, QAR, BHD, OMR
                </p>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════  Target Audience  ═══════════════════ */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <SectionTitle
            title={t("landing.targetTitle")}
            subtitle={t("landing.targetSubtitle")}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {TARGET_AUDIENCES.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                whileHover={{ scale: 1.03, y: -3 }}
                className="bg-[#f8f9fb] rounded-xl p-5 border border-[#e8eaed] hover:border-[#1e3a5f]/30 transition-all cursor-pointer group"
              >
                <div className="w-12 h-12 rounded-xl bg-[#1e3a5f]/10 flex items-center justify-center mb-3 group-hover:bg-[#1e3a5f] transition-colors">
                  <item.icon className="w-6 h-6 text-[#1e3a5f] group-hover:text-white transition-colors" />
                </div>
                <h3 className="font-bold text-[#1e3a5f] mb-1">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════  Features Grid (interactive)  ═══════════════════ */}
      <section id="features" className="py-16 bg-[#1e3a5f]">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-bold text-white mb-3"
            >
              {t("landing.featuresCount")}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-lg text-white/70"
            >
              {t("landing.featuresInstruction")}
            </motion.p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {FEATURES.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                whileHover={{ scale: 1.05 }}
                onClick={() => setActiveFeature(i)}
                className={`rounded-xl p-5 cursor-pointer transition-all border-2 ${
                  activeFeature === i
                    ? "bg-[#c9a96e] border-[#c9a96e] text-[#1e3a5f]"
                    : "bg-white/10 border-white/10 text-white hover:bg-white/20"
                }`}
              >
                <f.icon className="w-8 h-8 mb-3" />
                <h3 className="font-bold text-sm">{f.title}</h3>
              </motion.div>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeFeature}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="mt-8 bg-white/10 backdrop-blur rounded-2xl p-8 border border-white/20"
            >
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-xl bg-[#c9a96e] flex items-center justify-center shrink-0">
                  {React.createElement(FEATURES[activeFeature].icon, { className: "w-8 h-8 text-[#1e3a5f]" })}
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-[#c9a96e] mb-2">{FEATURES[activeFeature].title}</h3>
                  <p className="text-white/80 text-lg leading-relaxed">{FEATURES[activeFeature].desc}</p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      {/* ═══════════════════  Comparison Table  ═══════════════════ */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <SectionTitle
            title={t("landing.compareTitle")}
            subtitle={t("landing.compareSubtitle")}
          />
          <div className="max-w-3xl mx-auto">
            <div className="bg-[#f8f9fb] rounded-2xl border overflow-hidden">
              <div className="grid grid-cols-[1fr_100px_100px] bg-[#1e3a5f] text-white p-4 font-bold text-center">
                <div className="text-right">{t("landing.compareFeature")}</div>
                <div>{t("common.appName")}</div>
                <div>{t("landing.compareTraditional")}</div>
              </div>
              {COMPARISON.slice(0, expandedComparison ? undefined : 6).map((row, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className={`grid grid-cols-[1fr_100px_100px] p-4 items-center text-center ${i % 2 === 0 ? "bg-white" : "bg-[#f8f9fb]"}`}
                >
                  <div className="text-right font-medium text-[#1e3a5f]">{row.feature}</div>
                  <div className="flex justify-center">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div className="flex justify-center">
                    <XCircle className="w-6 h-6 text-red-400" />
                  </div>
                </motion.div>
              ))}
              {!expandedComparison && (
                <button
                  onClick={() => setExpandedComparison(true)}
                  className="w-full py-3 text-[#1e3a5f] font-medium hover:bg-[#1e3a5f]/5 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  {t("landing.compareShowMore")}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════  Migration Banner  ═══════════════════ */}
      <section className="py-16 bg-[#c9a96e]/10">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="max-w-4xl mx-auto bg-[#1e3a5f] rounded-3xl p-8 md:p-12 text-center relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#c9a96e]/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#c9a96e]/10 rounded-full translate-y-1/2 -translate-x-1/2" />
            <div className="relative z-10">
              <Badge className="bg-[#c9a96e] text-[#1e3a5f] mb-4 font-bold px-4 py-1">
                <Clock className="w-4 h-4 me-2" />
                عرض محدود
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                انقل بياناتك مجاناً
              </h2>
              <p className="text-lg text-white/80 mb-6 max-w-2xl mx-auto">
                ننقل بياناتك من أي برنامج محاسبة أو Excel لحسابات <strong className="text-[#c9a96e]">مجاناً</strong>.
                فريقنا بيتولى كل حاجة — ماياخدش منك وقت.
              </p>
              <div className="flex flex-wrap justify-center gap-4 mb-8">
                {["Excel", "QuickBooks", "Sage", "أي برنامج", "أي ERP"].map((name, i) => (
                  <span key={i} className="bg-white/10 text-white px-4 py-2 rounded-lg text-sm font-medium">
                    {name}
                  </span>
                ))}
              </div>
              <Button
                size="lg"
                className="bg-[#c9a96e] hover:bg-[#b8956a] text-[#1e3a5f] font-bold h-14 px-8"
                onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}
              >
                <Truck className="w-5 h-5 me-2" />
                اطلب نقل البيانات المجاني
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════  Custom Development  ═══════════════════ */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <Badge className="bg-[#1e3a5f]/10 text-[#1e3a5f] mb-4 px-3 py-1">
                <Lightbulb className="w-4 h-4 me-2" />
                تطوير مخصص
              </Badge>
              <h2 className="text-3xl font-bold text-[#1e3a5f] mb-4">
                عندك فكرة ميزة محتاجها؟
              </h2>
              <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
                احنا مش بس نبيعلك برنامج — احنا بنشتغل معك. عندك فكرة ميزة محتاجها لشركتك؟
                قولنا ونبنيها لك. فريق التطوير عندنا جاهز يشتغل على أي ميزة مخصصة تحتاجها.
              </p>
              <div className="space-y-3 mb-6">
                {[
                  "ميزات مخصصة حسب صناعة شركتك",
                  "تكامل مع برامجك الحالية",
                  "تقارير مخصصة حسب احتياجاتك",
                  "API للربط مع أنظمتك",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-emerald-500 shrink-0" />
                    <span className="text-[#1e3a5f]">{item}</span>
                  </div>
                ))}
              </div>
              <Button
                className="bg-[#1e3a5f] hover:bg-[#152d4d] h-12 px-6"
                onClick={() => setContactOpen(true)}
              >
                <MessageCircle className="w-5 h-5 me-2" />
                تواصل معنا
              </Button>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="bg-[#f8f9fb] rounded-2xl p-8 border"
            >
              <div className="space-y-4">
                <div className="flex items-center gap-3 bg-white rounded-lg p-3 shadow-sm">
                  <div className="w-10 h-10 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center">
                    <MessageCircle className="w-5 h-5 text-[#1e3a5f]" />
                  </div>
                  <div>
                    <div className="font-bold text-[#1e3a5f] text-sm">طلب ميزة جديدة</div>
                    <div className="text-xs text-muted-foreground">بنشتغل عليها في أسبوع</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-white rounded-lg p-3 shadow-sm">
                  <div className="w-10 h-10 rounded-full bg-[#c9a96e]/20 flex items-center justify-center">
                    <Wrench className="w-5 h-5 text-[#c9a96e]" />
                  </div>
                  <div>
                    <div className="font-bold text-[#1e3a5f] text-sm">تعديل على تقرير</div>
                    <div className="text-xs text-muted-foreground">تقارير مخصصة حسب احتياجاتك</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-white rounded-lg p-3 shadow-sm">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                    <Database className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <div className="font-bold text-[#1e3a5f] text-sm">ربط مع نظامك</div>
                    <div className="text-xs text-muted-foreground">API مفتوح للتكامل</div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════════  Testimonials  ═══════════════════ */}
      <section className="py-16 bg-[#f8f9fb]">
        <div className="container mx-auto px-4">
          <SectionTitle
            title={t("landing.testimonialsTitle")}
            subtitle={t("landing.testimonialsSubtitle")}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                whileHover={{ y: -5 }}
                className="bg-white rounded-2xl p-6 border shadow-sm hover:shadow-md transition-all"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, j) => (
                    <Star key={j} className="w-4 h-4 text-[#c9a96e] fill-[#c9a96e]" />
                  ))}
                </div>
                <p className="text-[#1e3a5f] leading-relaxed mb-4 text-sm">"{t.text}"</p>
                <div className="flex items-center gap-3 pt-4 border-t">
                  <div className="w-10 h-10 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center text-[#1e3a5f] font-bold">
                    {t.name[0]}
                  </div>
                  <div>
                    <div className="font-bold text-[#1e3a5f] text-sm">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════  Pricing  ═══════════════════ */}
      <section id="pricing" className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <SectionTitle
            title={t("landing.pricingTitle")}
            subtitle={t("landing.pricingSubtitle")}
          />

          {/* Country Selector */}
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {visibleCountries.map((c) => (
              <motion.button
                key={c.code}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedCountry(c.code)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  selectedCountry === c.code
                    ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                    : "bg-white text-[#1e3a5f] border-[#e8eaed] hover:bg-[#f8f9fb]"
                }`}
              >
                <span className="text-lg">{c.flag}</span>
                <span>{c.name}</span>
              </motion.button>
            ))}
            {!showAllCountries && (
              <button
                onClick={() => setShowAllCountries(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#e8eaed] bg-white text-sm font-medium text-muted-foreground hover:bg-[#f8f9fb] transition-colors"
              >
                <ChevronDown className="w-4 h-4" />
                {t("landing.moreCountries")}
              </button>
            )}
          </div>

          {/* Plans Grid */}
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">{t("landing.pricingLoading")}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {(plans || []).map((plan: any, i: number) => (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.15 }}
                  whileHover={{ y: -8 }}
                  className={`relative rounded-2xl border-2 transition-all hover:shadow-xl ${
                    plan.nameEn === "Professional"
                      ? "border-[#1e3a5f] ring-4 ring-[#1e3a5f]/10 shadow-lg"
                      : "border-[#e8eaed]"
                  }`}
                >
                  {plan.nameEn === "Professional" && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-[#c9a96e] text-[#1e3a5f] font-bold px-4 py-1">
                        {t("landing.pricingPopular")}
                      </Badge>
                    </div>
                  )}
                  <div className="p-6 space-y-5">
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold text-[#1e3a5f]">{lang === "ar" ? plan.nameAr : plan.nameEn}</h3>
                      <p className="text-sm text-muted-foreground">{lang === "ar" ? plan.nameEn : plan.nameAr}</p>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-[#1e3a5f]">{plan.price}</span>
                      <span className="text-muted-foreground">{plan.currency}</span>
                      <span className="text-sm text-muted-foreground">/ {BillingLabelI18n(plan.billingCycle, t)}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {plan.maxUsers} {t("landing.planUsers")}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="w-4 h-4" />
                        {plan.maxTransactions} {t("landing.planTransactions")}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {(plan.features || []).map((feature: string, fi: number) => (
                        <div key={fi} className="flex items-center gap-2 text-sm">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                          <span className="text-[#1e3a5f]/80">{feature}</span>
                        </div>
                      ))}
                    </div>
                    <Button
                      className="w-full h-12 text-base font-bold"
                      variant={plan.nameEn === "Professional" ? "default" : "outline"}
                      style={plan.nameEn === "Professional" ? { backgroundColor: "#1e3a5f", color: "white" } : {}}
                      onClick={() => setLocation(`/signup?plan=${plan.id}&country=${selectedCountry}`)}
                    >
                      <ArrowLeft className="w-4 h-4 me-2" />
                      {t("landing.planCta")}
                    </Button>
                    <p className="text-xs text-center text-muted-foreground">
                      <Clock className="w-3 h-3 inline me-1" />
                      {t("landing.planTrial")}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════  24/7 Support  ═══════════════════ */}
      <section className="py-16 bg-[#1e3a5f]">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-14 h-14 rounded-full bg-[#c9a96e]/20 flex items-center justify-center">
                  <Headphones className="w-7 h-7 text-[#c9a96e]" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold text-white">{t("landing.supportTitle")}</h2>
                  <p className="text-[#c9a96e]">{t("landing.supportSubtitle")}</p>
                </div>
              </div>
              <p className="text-white/80 leading-relaxed mb-6">{t("landing.supportDesc")}</p>
              <div className="space-y-3 mb-6">
                {[
                  t("landing.support1"),
                  t("landing.support2"),
                  t("landing.support3"),
                  t("landing.support4"),
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-[#c9a96e] shrink-0" />
                    <span className="text-white/90">{item}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <Button className="bg-[#c9a96e] hover:bg-[#b8956a] text-[#1e3a5f] font-bold h-12 px-6">
                  <MessageCircle className="w-5 h-5 me-2" />
                  {t("landing.supportChat")}
                </Button>
                <Button variant="outline" className="border-white/30 text-white hover:bg-white/10 h-12 px-6">
                  <Phone className="w-5 h-5 me-2" />
                  {t("landing.supportCall")}
                </Button>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="bg-white/10 backdrop-blur rounded-2xl p-6 border border-white/20"
            >
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#c9a96e] flex items-center justify-center text-[#1e3a5f] font-bold">
                    {t("landing.supportUserInitial")}
                  </div>
                  <div className="bg-white/20 rounded-lg p-3 rounded-tr-none">
                    <p className="text-white text-sm">{t("landing.supportChat1")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-row-reverse">
                  <div className="w-12 h-12 rounded-full bg-[#1e3a5f] border border-[#c9a96e] flex items-center justify-center text-[#c9a96e] font-bold">
                    {t("common.appInitial")}
                  </div>
                  <div className="bg-[#c9a96e]/30 rounded-lg p-3 rounded-tl-none">
                    <p className="text-white text-sm">{t("landing.supportChat2")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#c9a96e] flex items-center justify-center text-[#1e3a5f] font-bold">
                    {t("landing.supportUserInitial")}
                  </div>
                  <div className="bg-white/20 rounded-lg p-3 rounded-tr-none">
                    <p className="text-white text-sm">{t("landing.supportChat3")}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════════════════  CTA Footer  ═══════════════════ */}
      <section className="py-16 bg-[#f8f9fb]">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto text-center"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-[#1e3a5f] mb-4">
              {t("landing.ctaTitle")}
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              {t("landing.ctaDescription")}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                className="h-14 text-lg px-8 bg-[#1e3a5f] hover:bg-[#152d4d] text-white shadow-lg"
                onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}
              >
                <Zap className="w-5 h-5 me-2" />
                {t("landing.ctaPrimary")}
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-14 text-lg px-8 border-[#1e3a5f] text-[#1e3a5f] hover:bg-[#1e3a5f]/5"
                onClick={() => setContactOpen(true)}
              >
                <MessageCircle className="w-5 h-5 me-2" />
                {t("landing.ctaSecondary")}
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════  Footer  ═══════════════════ */}
      <footer className="border-t py-12 bg-white">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#1e3a5f] flex items-center justify-center text-white font-bold text-lg">
                  {t("common.appInitial")}
                </div>
                <span className="font-bold text-xl text-[#1e3a5f]">{t("common.appName")}</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t("landing.footerDescription")}
              </p>
            </div>
            <div>
              <h4 className="font-bold text-[#1e3a5f] mb-4">{t("landing.footerProduct")}</h4>
              <div className="space-y-2 text-sm">
                <button onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })} className="block text-muted-foreground hover:text-[#1e3a5f] transition-colors">{t("landing.footerFeatures")}</button>
                <button onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })} className="block text-muted-foreground hover:text-[#1e3a5f] transition-colors">{t("landing.footerPricing")}</button>
                <button onClick={() => setLocation("/support")} className="block text-muted-foreground hover:text-[#1e3a5f] transition-colors">{t("landing.footerSupport")}</button>
              </div>
            </div>
            <div>
              <h4 className="font-bold text-[#1e3a5f] mb-4">{t("landing.footerCompany")}</h4>
              <div className="space-y-2 text-sm">
                <button onClick={() => setContactOpen(true)} className="block text-muted-foreground hover:text-[#1e3a5f] transition-colors">{t("landing.footerContact")}</button>
                <button onClick={() => setLocation("/articles")} className="block text-muted-foreground hover:text-[#1e3a5f] transition-colors">{t("articles.pageTitle")}</button>
                <button onClick={() => setLocation("/faq")} className="block text-muted-foreground hover:text-[#1e3a5f] transition-colors">{t("landing.faqTitle")}</button>
                <button onClick={() => setLocation("/terms")} className="block text-muted-foreground hover:text-[#1e3a5f] transition-colors">{t("landing.termsTitle")}</button>
              </div>
            </div>
            <div>
              <h4 className="font-bold text-[#1e3a5f] mb-4">{t("landing.footerContactUs")}</h4>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="w-4 h-4 text-[#1e3a5f]" />
                  <span>Info@hg-audit.com</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="w-4 h-4 text-[#1e3a5f]" />
                  <span>+20 10 2581 2666</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-4 h-4 text-[#1e3a5f]" />
                  <span>{t("landing.footerAddress")}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="border-t pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              {t("landing.footerCopyright")}
            </div>
            <div className="flex items-center gap-6 text-sm">
              <button onClick={() => setLocation("/login")} className="text-muted-foreground hover:text-[#1e3a5f] transition-colors">{t("landing.footerLogin")}</button>
              <button onClick={() => setLocation("/signup")} className="text-muted-foreground hover:text-[#1e3a5f] transition-colors">{t("landing.footerSignup")}</button>
              <button onClick={() => setLocation("/support")} className="text-muted-foreground hover:text-[#1e3a5f] transition-colors">{t("landing.footerSupport2")}</button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─────────── Lucide icons that don't exist in main import ─────────── */
function ShoppingBag(props: any) { return <Package {...props} />; }
function Factory(props: any) { return <Building2 {...props} />; }
function Stethoscope(props: any) { return <HeartHandshake {...props} />; }
function GraduationCap(props: any) { return <Award {...props} />; }
function Hotel(props: any) { return <Building2 {...props} />; }

/* ═══════════════════ Contact Modal  ═══════════════════ */

function ContactModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [loading, setLoading] = React.useState(false);
  const [success, setSuccess] = React.useState(false);
  const [error, setError] = React.useState("");
  const formRef = React.useRef<HTMLFormElement>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          email: fd.get("email"),
          phone: fd.get("phone"),
          message: fd.get("message"),
          source: "hesabat-landing",
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setSuccess(true);
      formRef.current?.reset();
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 3000);
    } catch {
      setError(t("landing.contactError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-right">{t("landing.contactTitle")}</DialogTitle>
          <DialogDescription className="text-right">
            {t("landing.contactSubtitle")}
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t("landing.contactName")}</label>
            <Input name="name" required placeholder={t("landing.contactNamePlaceholder")} className="h-12" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("landing.contactEmail")}</label>
              <Input name="email" type="email" placeholder="name@company.com" className="h-12" dir="ltr" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("landing.contactPhone")}</label>
              <Input name="phone" type="tel" placeholder="+20 10 0000 0000" className="h-12" dir="ltr" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t("landing.contactMessage")}</label>
            <Textarea name="message" placeholder={t("landing.contactMessagePlaceholder")} className="min-h-[100px] resize-none" />
          </div>
          {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("landing.contactCancel")}
            </Button>
            <Button type="submit" disabled={loading || success} className="bg-[#1e3a5f] hover:bg-[#152d4d]">
              {success ? t("landing.contactSent") : (loading ? t("landing.contactSending") : t("landing.contactSend"))}
            </Button>
          </DialogFooter>
        </form>
        <div className="border-t pt-4 mt-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center">
            <Mail className="w-4 h-4" />
            <span>Info@hg-audit.com</span>
            <span className="mx-2">·</span>
            <Phone className="w-4 h-4" />
            <span dir="ltr">+20 102 581 2666</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════ SEO Meta  ═══════════════════ */

export function SEOHead() {
  React.useEffect(() => {
    document.title = "حسابات | برنامج محاسبة سحابي متكامل للشركات العربية";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute("content", "نظام محاسبة سحابي متكامل للشركات الصغيرة والمتوسطة. فواتير، تقارير، ضرائب، موردين، مخزون، ودعم 24/7. 14 يوم تجربة مجانية.");
    }
  }, []);
  return null;
}
