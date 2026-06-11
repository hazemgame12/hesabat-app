import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { COUNTRY_INFO, type CountryCode } from "@workspace/locale";
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
  ArrowRight,
  Zap,
  TrendingUp,
  CreditCard,
  Building2,
} from "lucide-react";

const FEATURES = [
  { icon: Receipt, title: "فواتير إلكترونية", desc: "إنشاء فواتير مبيعات ومشتريات بأنواع مختلفة (خدمات، سلع، مركبة)" },
  { icon: BarChart3, title: "تقارير مالية متكاملة", desc: "ميزانية، قائمة دخل، تدفق نقدي، تحليلات مالية متقدمة" },
  { icon: Calculator, title: "ضرائب ولجانات", desc: "حساب ضريبة القيمة المضافة، الضريبة على الدخل، أرباح تجارية" },
  { icon: Users, title: "عملاء وموردين", desc: "دفتر أستاذ مساعد، أرصدة، تقارير عمر الديون، تعاملات مالية" },
  { icon: Shield, title: "فريق عمل وصلاحيات", desc: "دعوة فريق، أدوار متعددة، تحكم كامل في الصلاحيات" },
  { icon: FileText, title: "مستندات ومرفقات", desc: "رفع ملفات، مرفقات لقيود اليومية، إضافة الصور للفواتير" },
  { icon: CreditCard, title: "بنوك وخزينة", desc: "حسابات بنكية، حركات، تعثرات، تسويات بنكية" },
  { icon: Building2, title: "أصول ثابتة وإهلاك", desc: "تسجيل الأصول، حساب الإهلاك، إهلاك متعدد الطرق" },
];

const COUNTRIES: { code: CountryCode; flag: string; name: string; currency: string }[] = [
  { code: "EG", flag: "🇪🇬", name: "مصر", currency: "EGP" },
  { code: "SA", flag: "🇸🇦", name: "السعودية", currency: "SAR" },
  { code: "AE", flag: "🇦🇪", name: "الإمارات", currency: "AED" },
  { code: "KW", flag: "🇰🇼", name: "الكويت", currency: "KWD" },
  { code: "QA", flag: "🇶🇦", name: "قطر", currency: "QAR" },
  { code: "BH", flag: "🇧🇭", name: "البحرين", currency: "BHD" },
  { code: "OM", flag: "🇴🇲", name: "عمان", currency: "OMR" },
];

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

export function LandingPage() {
  const { t } = useTranslation();
  const { data: user } = useGetCurrentUser();
  const [, setLocation] = useLocation();
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>("EG");
  const [showAllCountries, setShowAllCountries] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      setLocation("/dashboard");
    }
  }, [user, setLocation]);

  const { data: plans, isLoading } = useQuery({
    queryKey: ["landing-plans", selectedCountry],
    queryFn: () => fetchPlans(selectedCountry),
  });

  const visibleCountries = showAllCountries ? COUNTRIES : COUNTRIES.slice(0, 3);

  return (
    <div className="min-h-screen bg-background font-sans" dir="rtl">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl shadow-sm">
              ح
            </div>
            <span className="font-bold text-xl text-foreground">حسابات</span>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher className="hidden sm:inline-flex" />
            <Button variant="ghost" onClick={() => setLocation("/login")}>
              {t("auth.login.submit")}
            </Button>
            <Button onClick={() => {
              const el = document.getElementById("pricing");
              el?.scrollIntoView({ behavior: "smooth" });
            }}>
              <Zap className="w-4 h-4 me-2" />
              جرب مجاناً
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden py-20 lg:py-28">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/20" />
        <div className="container mx-auto px-4 relative">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <Badge variant="outline" className="text-base px-4 py-1.5 bg-primary/10 text-primary border-primary/20">
              <TrendingUp className="w-4 h-4 me-2" />
              14 يوم تجربة مجانية — لا يوجد بطاقة ائتمان مطلوبة
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold leading-tight text-foreground">
              برنامج محاسبة ذكي
              <br />
              <span className="text-primary">للشركات الصغيرة والمتوسطة</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              نظام محاسبة متكامل عربي بمعايير عالمية — فواتير، تقارير، ضرائب، جرد، عملاء، موردين، بنوك، أصول ثابتة، وكل ما تحتاجه في مكان واحد.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button size="lg" className="h-14 text-lg px-8 shadow-lg" onClick={() => {
                const el = document.getElementById("pricing");
                el?.scrollIntoView({ behavior: "smooth" });
              }}>
                <Zap className="w-5 h-5 me-2" />
                ابدأ تجربتك المجانية
              </Button>
              <Button size="lg" variant="outline" className="h-14 text-lg px-8" onClick={() => {
                const el = document.getElementById("features");
                el?.scrollIntoView({ behavior: "smooth" });
              }}>
                تعرف على المميزات
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-3">كل ما تحتاجه في نظام واحد</h2>
            <p className="text-muted-foreground">حلول محاسبة متكاملة مصممة خصيصاً للشركات العربية</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((f, i) => (
              <Card key={i} className="border-0 shadow-sm hover:shadow-md transition-shadow bg-card">
                <CardContent className="p-6 space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <f.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-bold text-lg">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-foreground mb-3">اختر الباقة المناسبة</h2>
            <p className="text-muted-foreground">باقات مرنة تناسب كل حجم عمل</p>
          </div>

          {/* Country Selector */}
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {visibleCountries.map((c) => (
              <button
                key={c.code}
                onClick={() => setSelectedCountry(c.code)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  selectedCountry === c.code
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground border-border hover:bg-muted"
                }`}
              >
                <span className="text-lg">{c.flag}</span>
                <span>{c.name}</span>
              </button>
            ))}
            {!showAllCountries && (
              <button
                onClick={() => setShowAllCountries(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                <ChevronDown className="w-4 h-4" />
                المزيد
              </button>
            )}
          </div>

          {/* Plans Grid */}
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">جاري تحميل الباقات...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {(plans || []).map((plan: any) => (
                <Card
                  key={plan.id}
                  className={`relative border-2 transition-all hover:shadow-lg ${
                    plan.nameEn === "Professional" ? "border-primary/50 ring-4 ring-primary/10" : "border-border"
                  }`}
                >
                  {plan.nameEn === "Professional" && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary text-primary-foreground">الأكثر شيوعاً</Badge>
                    </div>
                  )}
                  <CardContent className="p-6 space-y-5">
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold">{plan.nameAr}</h3>
                      <p className="text-sm text-muted-foreground">{plan.nameEn}</p>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-primary">{plan.price}</span>
                      <span className="text-muted-foreground">{plan.currency}</span>
                      <span className="text-sm text-muted-foreground">/ {BillingLabel(plan.billingCycle)}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {plan.maxUsers} مستخدم
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="w-4 h-4" />
                        {plan.maxTransactions} عملية
                      </span>
                    </div>
                    <div className="space-y-2">
                      {(plan.features || []).map((feature: string, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <Check className="w-4 h-4 text-primary shrink-0" />
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>
                    <Button
                      className="w-full h-11"
                      variant={plan.nameEn === "Professional" ? "default" : "outline"}
                      onClick={() => setLocation(`/signup?plan=${plan.id}&country=${selectedCountry}`)}
                    >
                      <ArrowLeft className="w-4 h-4 me-2" />
                      ابدأ التجربة المجانية
                    </Button>
                    <p className="text-xs text-center text-muted-foreground">
                      <Clock className="w-3 h-3 inline me-1" />
                      14 يوم مجاناً — لا بطاقة ائتمان
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-10 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
                ح
              </div>
              <span className="font-bold text-foreground">حسابات</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <button onClick={() => setLocation("/login")} className="hover:text-primary transition-colors">تسجيل الدخول</button>
              <button onClick={() => setLocation("/signup")} className="hover:text-primary transition-colors">إنشاء حساب</button>
              <button onClick={() => setLocation("/support")} className="hover:text-primary transition-colors">الدعم</button>
            </div>
            <div className="text-sm text-muted-foreground">
              © 2026 حسابات. جميع الحقوق محفوظة.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
