import { Link } from "wouter";
import { useLang } from "@/lib/language";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import {
  BookOpen,
  Users,
  TrendingUp,
  Shield,
  Globe,
  Layers,
  CheckCircle,
  ArrowLeft,
  ArrowRight,
  Receipt,
  Landmark,
  FileText,
  BarChart3,
  Package,
  CreditCard,
} from "lucide-react";

const HESABAT_URL = "https://hesabat.hg-audit.com";

export default function HesabatPage() {
  const { t, lang } = useLang();
  const isAr = lang === "ar";
  const ArrowIcon = isAr ? ArrowLeft : ArrowRight;

  const features = isAr
    ? [
        { icon: FileText, title: "القيود اليومية", desc: "قيود متعددة العملات مع مرفقات وتصدير Excel" },
        { icon: BookOpen, title: "دليل الحسابات", desc: "شجرة حسابات هرمية مرنة مع رصيد افتتاحي" },
        { icon: Receipt, title: "الفواتير والمبيعات", desc: "فواتير مبيعات ومشتريات مع تتبع الدفعات وعروض الأسعار" },
        { icon: Package, title: "المخزون", desc: "تكلفة متوسطة مرجحة مع تتبع حركة البضاعة" },
        { icon: Users, title: "العملاء والموردون", desc: "دفتر أستاذ مساعد مع كشف حساب وإشعارات" },
        { icon: Landmark, title: "البنوك والخزينة", desc: "تسوية بنكية وتحويلات وربط بالحركات" },
        { icon: CreditCard, title: "الرواتب والسلف", desc: "مسير رواتب كامل مع إدارة العهد والسلف" },
        { icon: TrendingUp, title: "الأصول الثابتة", desc: "إهلاك تلقائي وبيع وخردة مع قيود مرفقة" },
        { icon: BarChart3, title: "التقارير المالية", desc: "ميزان مراجعة وقوائم مالية ومؤشرات ضريبية" },
        { icon: Layers, title: "مراكز التكلفة", desc: "تحليل التكاليف على مستوى المشاريع والأقسام" },
        { icon: Shield, title: "أدوار وصلاحيات", desc: "فريق عمل متعدد مع صلاحيات دقيقة لكل مستخدم" },
        { icon: Globe, title: "عربي وإنجليزي", desc: "واجهة RTL عربية كاملة مع دعم متعدد العملات" },
      ]
    : [
        { icon: FileText, title: "Journal Entries", desc: "Multi-currency journal entries with attachments and Excel export" },
        { icon: BookOpen, title: "Chart of Accounts", desc: "Flexible hierarchical chart of accounts with opening balances" },
        { icon: Receipt, title: "Invoicing & Sales", desc: "Sales and purchase invoices with payment tracking and quotes" },
        { icon: Package, title: "Inventory", desc: "Weighted-average costing with full stock movement tracking" },
        { icon: Users, title: "Customers & Suppliers", desc: "Subsidiary ledger with statements and credit notes" },
        { icon: Landmark, title: "Bank & Cash", desc: "Bank reconciliation, transfers, and movement linking" },
        { icon: CreditCard, title: "Payroll & Advances", desc: "Full payroll module with custody and advance management" },
        { icon: TrendingUp, title: "Fixed Assets", desc: "Automatic depreciation, disposal, and scrap with journal entries" },
        { icon: BarChart3, title: "Financial Reports", desc: "Trial balance, financial statements, and tax indicators" },
        { icon: Layers, title: "Cost Centers", desc: "Cost analysis at project and department level" },
        { icon: Shield, title: "Roles & Permissions", desc: "Multi-user team with fine-grained permissions per role" },
        { icon: Globe, title: "Arabic & English", desc: "Full RTL Arabic interface with multi-currency support" },
      ];

  return (
    <div className="min-h-screen bg-background font-sans overflow-x-hidden" dir={t.dir}>
      <Navbar />

      {/* Hero */}
      <section className="bg-[#001d56] text-white pt-32 pb-24 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 text-white text-sm font-semibold px-4 py-2 rounded-full mb-6">
            <BookOpen className="w-4 h-4" />
            {isAr ? "نظام محاسبة سحابي" : "Cloud Accounting System"}
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold mb-6 leading-tight">
            {isAr ? (
              <>حسابات — <span className="text-[#c9a84c]">Hesabat</span></>
            ) : (
              <><span className="text-[#c9a84c]">Hesabat</span> — حسابات</>
            )}
          </h1>
          <p className="text-lg md:text-xl text-white/80 max-w-3xl mx-auto mb-10 leading-relaxed">
            {isAr
              ? "نظام محاسبة سحابي متكامل للشركات الصغيرة والمتوسطة. عربي بالكامل، متعدد العملات، يشمل الفواتير والمخزون والرواتب والأصول والبنوك — كل ما تحتاجه في مكان واحد."
              : "A complete cloud accounting system for SMEs. Fully Arabic, multi-currency, covering invoicing, inventory, payroll, fixed assets, and banking — everything you need in one place."}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a
              href={HESABAT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#c9a84c] hover:bg-[#b8943d] text-white font-bold px-8 py-4 rounded-xl text-lg transition-colors shadow-lg"
            >
              {isAr ? "جرّب مجاناً" : "Try for Free"}
              <ArrowIcon className="w-5 h-5" />
            </a>
            <a
              href={HESABAT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-8 py-4 rounded-xl text-lg transition-colors border border-white/20"
            >
              {isAr ? "تسجيل الدخول" : "Sign In"}
            </a>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-white border-b border-gray-100 py-12">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {(isAr
              ? [
                  { value: "١٢+", label: "وحدة محاسبية" },
                  { value: "١٠٠٪", label: "سحابي آمن" },
                  { value: "٥", label: "لغات العملات" },
                  { value: "٢٤/٧", label: "متاح دائماً" },
                ]
              : [
                  { value: "12+", label: "Accounting modules" },
                  { value: "100%", label: "Secure cloud" },
                  { value: "5+", label: "Currency support" },
                  { value: "24/7", label: "Always available" },
                ]
            ).map((s) => (
              <div key={s.label}>
                <div className="text-3xl font-extrabold text-[#001d56] mb-1">{s.value}</div>
                <div className="text-gray-500 text-sm">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#001d56] mb-4">
              {isAr ? "وحدات شاملة لكل احتياجاتك" : "Comprehensive modules for every need"}
            </h2>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">
              {isAr
                ? "من القيد اليومي إلى الميزانية العمومية — كل شيء مترابط ومتكامل"
                : "From daily journal entries to balance sheet — everything is connected and integrated"}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md hover:border-[#001d56]/20 transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-[#001d56]/5 flex items-center justify-center mb-4 group-hover:bg-[#001d56]/10 transition-colors">
                  <f.icon className="w-6 h-6 text-[#001d56]" />
                </div>
                <h3 className="font-bold text-[#001d56] text-lg mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Hesabat */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#001d56] mb-6">
                {isAr ? "لماذا حسابات؟" : "Why Hesabat?"}
              </h2>
              <div className="space-y-4">
                {(isAr
                  ? [
                      "واجهة عربية كاملة من اليمين لليسار",
                      "يدعم المعايير المحاسبية المصرية والخليجية",
                      "سحابي بالكامل — لا تثبيت ولا صيانة",
                      "أدوار وصلاحيات دقيقة لفريق العمل",
                      "تعدد العملات مع أسعار صرف تلقائية",
                      "قفل فترة محاسبية وإغلاق سنة مالية",
                    ]
                  : [
                      "Full Arabic RTL interface",
                      "Supports Egyptian and GCC accounting standards",
                      "100% cloud — no installation or maintenance",
                      "Fine-grained roles and permissions for teams",
                      "Multi-currency with automatic exchange rates",
                      "Period locking and fiscal year close",
                    ]
                ).map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-[#c9a84c] mt-0.5 shrink-0" />
                    <span className="text-gray-700">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-[#001d56] rounded-3xl p-8 text-white text-center">
              <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-6">
                <span className="text-3xl font-bold text-white">ح</span>
              </div>
              <h3 className="text-2xl font-bold mb-4">
                {isAr ? "ابدأ الآن مجاناً" : "Start now for free"}
              </h3>
              <p className="text-white/70 mb-6 text-sm leading-relaxed">
                {isAr
                  ? "أنشئ حساب شركتك في دقائق وابدأ الاستخدام الفوري. لا بطاقة ائتمان مطلوبة."
                  : "Create your company account in minutes and start immediately. No credit card required."}
              </p>
              <a
                href={HESABAT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-[#c9a84c] hover:bg-[#b8943d] text-white font-bold px-6 py-3 rounded-xl transition-colors w-full justify-center"
              >
                {isAr ? "إنشاء حساب مجاني" : "Create Free Account"}
                <ArrowIcon className="w-4 h-4" />
              </a>
              <div className="mt-4">
                <a
                  href={HESABAT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/60 hover:text-white text-sm transition-colors"
                >
                  {isAr ? "لديك حساب؟ سجّل الدخول" : "Have an account? Sign in"}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#001d56] py-16 px-6 text-center">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-extrabold text-white mb-4">
            {isAr ? "جاهز تبدأ؟" : "Ready to get started?"}
          </h2>
          <p className="text-white/70 text-lg mb-8">
            {isAr
              ? "انضم إلى الشركات التي تدير حساباتها باحترافية مع حسابات"
              : "Join companies managing their accounts professionally with Hesabat"}
          </p>
          <a
            href={HESABAT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#c9a84c] hover:bg-[#b8943d] text-white font-bold px-8 py-4 rounded-xl text-lg transition-colors shadow-lg"
          >
            {isAr ? "ابدأ تجربتك المجانية" : "Start your free trial"}
            <ArrowIcon className="w-5 h-5" />
          </a>
        </div>
      </section>

      <Footer />
    </div>
  );
}
