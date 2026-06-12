import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Globe, Save, RefreshCw, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

async function fetchLandingPage() {
  const res = await fetch(`/api/super-admin/landing-page`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch landing page");
  return res.json();
}

async function saveLandingPage(data: any) {
  const res = await fetch(`/api/super-admin/landing-page`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to save landing page");
  return res.json();
}

export function SuperAdminLandingPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["super-admin-landing-page"],
    queryFn: fetchLandingPage,
  });

  const [form, setForm] = useState({
    heroTitle: "برنامج محاسبة ذكي",
    heroSubtitle: "للشركات الصغيرة والمتوسطة",
    heroDescription:
      "نظام محاسبة سحابي متكامل عربي — سهل الاستخدام، تقارير مالية مميزة، ضرائب حسب دولتك، تقارير متعددة العملات، ودعم 24/7 من محاسبين مراجعين معتمدين.",
    ctaPrimary: "ابدأ تجربتك المجانية",
    ctaSecondary: "شوف المميزات",
    badgeText: "14 يوم تجربة مجانية — لا بطاقة ائتمان مطلوبة",
    aboutTitle: "نبذة عنا | حسابات للاستشارات المالية",
    aboutText:
      "تأسس حسابات لتكون واحدة من أهم صروح المجال المحاسبي والمالي في الوطن العربي.",
    metaTitle: "حسابات | برنامج محاسبة سحابي متكامل للشركات العربية",
    metaDescription:
      "نظام محاسبة سحابي متكامل للشركات الصغيرة والمتوسطة. فواتير، تقارير، ضرائب، موردين، مخزون، ودعم 24/7. 14 يوم تجربة مجانية.",
    keywords: "محاسبة, سحابي, برنامج محاسبة, فواتير, ضرائب, تقارير مالية, مملكيات, الوطن العربي, مصر, السعودية, الإمارات",
    ogImage: "",
    trialDays: "14",
    companyCount: "500+",
    userCount: "2000+",
    countryCount: "7",
    featureCount: "50+",
  });

  React.useEffect(() => {
    if (data) {
      setForm((prev) => ({ ...prev, ...data }));
    }
  }, [data]);

  const save = useMutation({
    mutationFn: saveLandingPage,
    onSuccess: () => {
      toast({ title: "تم الحفظ بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["super-admin-landing-page"] });
    },
    onError: () => {
      toast({ title: "فشل في الحفظ", variant: "destructive" });
    },
  });

  const updateField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            محرر صفحة الهبوف</h1>
          <p className="text-muted-foreground">
            تعديل محتوي الهيرو والميتادات والمتاللات
          </p>
        </div>
        <Button
          onClick={() => save.mutate(form)}
          disabled={save.isPending}
          className="bg-[#1e3a5f] hover:bg-[#152d4d]"
        >
          {save.isPending ? (
            <RefreshCw className="w-4 h-4 me-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 me-2" />
          )}
          حفظ
        </Button>
      </div>

      {save.isSuccess && (
        <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg border border-green-200">
          <Check className="w-5 h-5" />
          <span className="font-medium">تم الحفظ بنجاح — التغييرات ستتظهر فوراً في الصفحة الرئيسية</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hero Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#c9a96e]" />
              الهيرو
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="الشعار" value={form.heroTitle} onChange={(v) => updateField("heroTitle", v)} />
            <Field label="الفقرة الفرعية" value={form.heroSubtitle} onChange={(v) => updateField("heroSubtitle", v)} />
            <Field label="الوصف" value={form.heroDescription} onChange={(v) => updateField("heroDescription", v)} textarea />
            <Field label="نص الوسم الرئيس" value={form.badgeText} onChange={(v) => updateField("badgeText", v)} />
            <div className="grid grid-cols-2 gap-4">
              <Field label="رمز التاسر" value={form.ctaPrimary} onChange={(v) => updateField("ctaPrimary", v)} />
              <Field label="رمز التاسر الثاني" value={form.ctaSecondary} onChange={(v) => updateField("ctaSecondary", v)} />
            </div>
          </CardContent>
        </Card>

        {/* About Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-[#c9a96e]" />
              من نحن
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="العنوان" value={form.aboutTitle} onChange={(v) => updateField("aboutTitle", v)} />
            <Field label="النص" value={form.aboutText} onChange={(v) => updateField("aboutText", v)} textarea />
          </CardContent>
        </Card>

        {/* SEO Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-[#c9a96e]" />
              SEO / تحسين المحركات
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="عنوان الصفحة (title)" value={form.metaTitle} onChange={(v) => updateField("metaTitle", v)} />
            <Field label="وصف (meta description)" value={form.metaDescription} onChange={(v) => updateField("metaDescription", v)} textarea />
            <Field label="الكلمات المفتاحية (keywords)" value={form.keywords} onChange={(v) => updateField("keywords", v)} />
            <Field label="صورة Open Graph (URL)" value={form.ogImage} onChange={(v) => updateField("ogImage", v)} placeholder="https://..." />
          </CardContent>
        </Card>

        {/* Stats Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#c9a96e]" />
              الإحصائيات
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="أيام التجربة" value={form.trialDays} onChange={(v) => updateField("trialDays", v)} />
              <Field label="عدد الدول" value={form.countryCount} onChange={(v) => updateField("countryCount", v)} />
              <Field label="شركات" value={form.companyCount} onChange={(v) => updateField("companyCount", v)} />
              <Field label="مستخدمين" value={form.userCount} onChange={(v) => updateField("userCount", v)} />
              <Field label="مميزات" value={form.featureCount} onChange={(v) => updateField("featureCount", v)} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  textarea,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <Label className="text-sm font-medium mb-1.5 block">{label}</Label>
      {textarea ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-h-[80px] resize-none"
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}
