import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Globe, Save, RefreshCw, Check, Sparkles, Image, BarChart3,
  MousePointer, FileText, Wrench, Headphones, Truck, Users,
  Receipt, Calculator, Shield, CreditCard, Package, Layers,
  Gauge, Handshake, Star, Zap, MessageCircle, Phone,
  Trash2, Plus, Pencil, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

/* ═══════════════════════════ API ═══════════════════════════ */

async function fetchLandingPage() {
  const res = await fetch(`/api/super-admin/landing-page`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function saveLandingPage(data: any) {
  const res = await fetch(`/api/super-admin/landing-page`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to save");
  return res.json();
}

async function fetchArticles() {
  const res = await fetch(`/api/super-admin/articles`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch articles");
  return res.json();
}

async function createArticle(data: any) {
  const res = await fetch(`/api/super-admin/articles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create");
  return res.json();
}

async function updateArticle(id: number, data: any) {
  const res = await fetch(`/api/super-admin/articles/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update");
  return res.json();
}

async function deleteArticle(id: number) {
  const res = await fetch(`/api/super-admin/articles/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to delete");
}

/* ═══════════════════════════ Editor ═══════════════════════════ */

const DEFAULT_FORM: Record<string, string> = {
  heroTitle: "برنامج محاسبة ذكي",
  heroSubtitle: "للشركات الصغيرة والمتوسطة",
  heroDescription: "نظام محاسبة سحابي متكامل عربي — سهل الاستخدام، تقارير مالية مميزة، ضرائب حسب دولتك، تقارير متعددة العملات، ودعم 24/7 من محاسبين مراجعين معتمدين.",
  ctaPrimary: "ابدأ تجربتك المجانية",
  ctaSecondary: "شوف المميزات",
  badgeText: "14 يوم تجربة مجانية — لا بطاقة ائتمان مطلوبة",
  aboutTitle: "نبذة عنا | حسابات للاستشارات المالية",
  aboutText: "تأسس حسابات لتكون واحدة من أهم صروح المجال المحاسبي والمالي في الوطن العربي.",
  metaTitle: "حسابات | برنامج محاسبة سحابي متكامل للشركات العربية",
  metaDescription: "نظام محاسبة سحابي متكامل للشركات الصغيرة والمتوسطة. فواتير، تقارير، ضرائب، موردين، مخزون، ودعم 24/7. 14 يوم تجربة مجانية.",
  keywords: "محاسبة, سحابي, برنامج محاسبة, فواتير, ضرائب, تقارير مالية, مملكيات, الوطن العربي, مصر, السعودية, الإمارات",
  ogImage: "",
  heroImage: "/hero-image.png",
  trialDays: "14",
  companyCount: "500+",
  userCount: "2000+",
  countryCount: "7",
  featureCount: "50+",
  whyUsTitle: "ليش حسابات؟",
  whyUsSubtitle: "فريق من مراجعين حسابات معتمدين بنا برنامج يحل مشاكل الشركات العربية",
  featuresTitle: "12+ ميزة في نظام واحد",
  featuresSubtitle: "اضغط على أي ميزة لمعرفة التفاصيل",
  targetAudiencesTitle: "لمن صممنا حسابات؟",
  targetAudiencesSubtitle: "نظام مرن يناسب مختلف أنواع الشركات والمؤسسات في العالم العربي",
  testimonialsTitle: "شركات تثق بنا",
  testimonialsSubtitle: "من مصر للسعودية للإمارات — شركات من كل القطاعات بتستخدم حسابات",
  pricingTitle: "اختر الباقة المناسبة",
  pricingSubtitle: "باقات مرنة تناسب كل حجم عمل — ابدأ مجاناً لـ 14 يوم",
  ctaTitle: "جاهز تبدأ مع حسابات؟",
  ctaSubtitle: "14 يوم تجربة مجانية — لا بطاقة ائتمان — انقل بياناتك مجاناً — دعم 24/7",
  supportTitle: "دعم 24/7",
  supportSubtitle: "من محاسبين مراجعين معتمدين",
};

export function SuperAdminLandingPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["super-admin-landing-page"],
    queryFn: fetchLandingPage,
  });
  const { data: articles, isLoading: articlesLoading } = useQuery({
    queryKey: ["super-admin-articles"],
    queryFn: fetchArticles,
  });

  const [form, setForm] = useState<Record<string, string>>(DEFAULT_FORM);
  const [articleModal, setArticleModal] = useState<"create" | "edit" | null>(null);
  const [editingArticle, setEditingArticle] = useState<any>(null);
  const [articleForm, setArticleForm] = useState({
    slug: "", titleAr: "", titleEn: "", excerptAr: "", excerptEn: "",
    contentAr: "", contentEn: "", image: "", date: "", categoryAr: "", categoryEn: "",
    readTimeAr: "", readTimeEn: "", published: true,
  });

  React.useEffect(() => {
    if (data) setForm((prev) => ({ ...prev, ...data }));
  }, [data]);

  const save = useMutation({
    mutationFn: saveLandingPage,
    onSuccess: () => {
      toast({ title: t("superAdmin.saveSuccess") });
      queryClient.invalidateQueries({ queryKey: ["super-admin-landing-page"] });
    },
    onError: () => toast({ title: t("superAdmin.saveError"), variant: "destructive" }),
  });

  const createArt = useMutation({
    mutationFn: createArticle,
    onSuccess: () => {
      toast({ title: t("superAdmin.articleSaved") });
      queryClient.invalidateQueries({ queryKey: ["super-admin-articles"] });
      setArticleModal(null);
      setArticleForm({ slug: "", titleAr: "", titleEn: "", excerptAr: "", excerptEn: "", contentAr: "", contentEn: "", image: "", date: "", categoryAr: "", categoryEn: "", readTimeAr: "", readTimeEn: "", published: true });
    },
    onError: () => toast({ title: t("superAdmin.saveError"), variant: "destructive" }),
  });

  const updateArt = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => updateArticle(id, data),
    onSuccess: () => {
      toast({ title: t("superAdmin.articleSaved") });
      queryClient.invalidateQueries({ queryKey: ["super-admin-articles"] });
      setArticleModal(null);
      setEditingArticle(null);
    },
    onError: () => toast({ title: t("superAdmin.saveError"), variant: "destructive" }),
  });

  const deleteArt = useMutation({
    mutationFn: deleteArticle,
    onSuccess: () => {
      toast({ title: t("superAdmin.articleDeleted") });
      queryClient.invalidateQueries({ queryKey: ["super-admin-articles"] });
    },
    onError: () => toast({ title: t("superAdmin.saveError"), variant: "destructive" }),
  });

  const updateField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const openCreateArticle = () => {
    setArticleForm({
      slug: "", titleAr: "", titleEn: "", excerptAr: "", excerptEn: "",
      contentAr: "", contentEn: "", image: "", date: new Date().toISOString().split("T")[0],
      categoryAr: "", categoryEn: "", readTimeAr: "", readTimeEn: "", published: true,
    });
    setEditingArticle(null);
    setArticleModal("create");
  };

  const openEditArticle = (article: any) => {
    setEditingArticle(article);
    setArticleForm({
      slug: article.slug,
      titleAr: article.titleAr || "",
      titleEn: article.titleEn || "",
      excerptAr: article.excerptAr || "",
      excerptEn: article.excerptEn || "",
      contentAr: article.contentAr || "",
      contentEn: article.contentEn || "",
      image: article.image || "",
      date: article.date || "",
      categoryAr: article.categoryAr || "",
      categoryEn: article.categoryEn || "",
      readTimeAr: article.readTimeAr || "",
      readTimeEn: article.readTimeEn || "",
      published: article.published ?? true,
    });
    setArticleModal("edit");
  };

  const submitArticle = () => {
    const payload = { ...articleForm };
    if (articleModal === "create") {
      createArt.mutate(payload);
    } else if (editingArticle) {
      updateArt.mutate({ id: editingArticle.id, data: payload });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("superAdmin.landingPageEditorTitle")}</h1>
          <p className="text-muted-foreground">{t("superAdmin.landingPageEditorSubtitle")}</p>
        </div>
        <Button onClick={() => save.mutate(form)} disabled={save.isPending} className="bg-[#1e3a5f] hover:bg-[#152d4d]">
          {save.isPending ? <RefreshCw className="w-4 h-4 me-2 animate-spin" /> : <Save className="w-4 h-4 me-2" />}
          {t("common.save")}
        </Button>
      </div>

      {save.isSuccess && (
        <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg border border-green-200">
          <Check className="w-5 h-5" />
          <span className="font-medium">{t("superAdmin.saveSuccess")} — {t("superAdmin.saveSuccess")}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hero */}
        <SectionCard title={t("superAdmin.heroSection")} icon={Sparkles}>
          <Field label="العنوان الرئيسي" value={form.heroTitle} onChange={(v) => updateField("heroTitle", v)} />
          <Field label="العنوان الفرعي" value={form.heroSubtitle} onChange={(v) => updateField("heroSubtitle", v)} />
          <Field label="الوصف" value={form.heroDescription} onChange={(v) => updateField("heroDescription", v)} textarea />
          <Field label="نص الوسم" value={form.badgeText} onChange={(v) => updateField("badgeText", v)} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="CTA رئيسي" value={form.ctaPrimary} onChange={(v) => updateField("ctaPrimary", v)} />
            <Field label="CTA ثانوي" value={form.ctaSecondary} onChange={(v) => updateField("ctaSecondary", v)} />
          </div>
          <Field label="صورة الخلفية (URL)" value={form.heroImage} onChange={(v) => updateField("heroImage", v)} placeholder="/hero-image.png" />
        </SectionCard>

        {/* About */}
        <SectionCard title={t("superAdmin.aboutSection")} icon={Globe}>
          <Field label="العنوان" value={form.aboutTitle} onChange={(v) => updateField("aboutTitle", v)} />
          <Field label="النص" value={form.aboutText} onChange={(v) => updateField("aboutText", v)} textarea />
        </SectionCard>

        {/* SEO */}
        <SectionCard title={t("superAdmin.seoSection")} icon={Globe}>
          <Field label="عنوان الصفحة (title)" value={form.metaTitle} onChange={(v) => updateField("metaTitle", v)} />
          <Field label="وصف (meta description)" value={form.metaDescription} onChange={(v) => updateField("metaDescription", v)} textarea />
          <Field label="الكلمات المفتاحية" value={form.keywords} onChange={(v) => updateField("keywords", v)} />
          <Field label="صورة Open Graph (URL)" value={form.ogImage} onChange={(v) => updateField("ogImage", v)} placeholder="https://..." />
        </SectionCard>

        {/* Stats */}
        <SectionCard title={t("superAdmin.statsSection")} icon={BarChart3}>
          <div className="grid grid-cols-2 gap-4">
            <Field label="أيام التجربة" value={form.trialDays} onChange={(v) => updateField("trialDays", v)} />
            <Field label="عدد الدول" value={form.countryCount} onChange={(v) => updateField("countryCount", v)} />
            <Field label="شركات" value={form.companyCount} onChange={(v) => updateField("companyCount", v)} />
            <Field label="مستخدمين" value={form.userCount} onChange={(v) => updateField("userCount", v)} />
            <Field label="مميزات" value={form.featureCount} onChange={(v) => updateField("featureCount", v)} />
          </div>
        </SectionCard>

        {/* Why Us */}
        <SectionCard title={t("superAdmin.whyUsSection")} icon={MousePointer}>
          <Field label="العنوان" value={form.whyUsTitle} onChange={(v) => updateField("whyUsTitle", v)} />
          <Field label="الوصف الفرعي" value={form.whyUsSubtitle} onChange={(v) => updateField("whyUsSubtitle", v)} textarea />
        </SectionCard>

        {/* Features */}
        <SectionCard title={t("superAdmin.featuresSection")} icon={Zap}>
          <Field label="العنوان" value={form.featuresTitle} onChange={(v) => updateField("featuresTitle", v)} />
          <Field label="الوصف الفرعي" value={form.featuresSubtitle} onChange={(v) => updateField("featuresSubtitle", v)} textarea />
        </SectionCard>

        {/* Target Audiences */}
        <SectionCard title={t("superAdmin.targetAudiencesSection")} icon={Users}>
          <Field label="العنوان" value={form.targetAudiencesTitle} onChange={(v) => updateField("targetAudiencesTitle", v)} />
          <Field label="الوصف الفرعي" value={form.targetAudiencesSubtitle} onChange={(v) => updateField("targetAudiencesSubtitle", v)} textarea />
        </SectionCard>

        {/* Testimonials */}
        <SectionCard title={t("superAdmin.testimonialsSection")} icon={Star}>
          <Field label="العنوان" value={form.testimonialsTitle} onChange={(v) => updateField("testimonialsTitle", v)} />
          <Field label="الوصف الفرعي" value={form.testimonialsSubtitle} onChange={(v) => updateField("testimonialsSubtitle", v)} textarea />
        </SectionCard>

        {/* Pricing */}
        <SectionCard title={t("superAdmin.pricingSection")} icon={CreditCard}>
          <Field label="العنوان" value={form.pricingTitle} onChange={(v) => updateField("pricingTitle", v)} />
          <Field label="الوصف الفرعي" value={form.pricingSubtitle} onChange={(v) => updateField("pricingSubtitle", v)} textarea />
        </SectionCard>

        {/* CTA */}
        <SectionCard title={t("superAdmin.ctaSection")} icon={MessageCircle}>
          <Field label="العنوان" value={form.ctaTitle} onChange={(v) => updateField("ctaTitle", v)} />
          <Field label="الوصف الفرعي" value={form.ctaSubtitle} onChange={(v) => updateField("ctaSubtitle", v)} textarea />
        </SectionCard>

        {/* Support */}
        <SectionCard title={t("superAdmin.supportSection")} icon={Headphones}>
          <Field label="العنوان" value={form.supportTitle} onChange={(v) => updateField("supportTitle", v)} />
          <Field label="الوصف الفرعي" value={form.supportSubtitle} onChange={(v) => updateField("supportSubtitle", v)} textarea />
        </SectionCard>
      </div>

      {/* ═══════════════════════════ Articles Section ═══════════════════════════ */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#c9a96e]" />
              {t("superAdmin.articles")}
            </CardTitle>
            <Button onClick={openCreateArticle} className="bg-[#1e3a5f] hover:bg-[#152d4d]">
              <Plus className="w-4 h-4 me-2" />
              {t("superAdmin.addArticle")}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{t("superAdmin.articlesSubtitle")}</p>
        </CardHeader>
        <CardContent>
          {articlesLoading ? (
            <div className="text-center py-8 text-muted-foreground">{t("common.loading")}</div>
          ) : !articles || articles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">{t("superAdmin.noArticles")}</div>
          ) : (
            <div className="space-y-3">
              {articles.map((article: any) => (
                <div key={article.id} className="flex items-center gap-4 p-3 rounded-xl border hover:bg-muted/50 transition-colors">
                  <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
                    {article.image ? (
                      <img src={article.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Image className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[#1e3a5f] truncate">{article.titleAr || article.titleEn}</div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <span>{article.date}</span>
                      {article.published ? (
                        <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50">{t("superAdmin.articlePublished")}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">مسودة</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openEditArticle(article)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => deleteArt.mutate(article.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══════════════════════════ Article Modal ═══════════════════════════ */}
      {articleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">{articleModal === "create" ? t("superAdmin.addArticle") : t("superAdmin.editArticle")}</h3>
              <Button size="sm" variant="ghost" onClick={() => setArticleModal(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium mb-1.5 block">{t("superAdmin.articleSlug")}</Label>
                <Input value={articleForm.slug} onChange={(e) => setArticleForm((p) => ({ ...p, slug: e.target.value }))} placeholder="article-slug" />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block">{t("superAdmin.articleDate")}</Label>
                <Input value={articleForm.date} onChange={(e) => setArticleForm((p) => ({ ...p, date: e.target.value }))} type="date" />
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">{t("superAdmin.articleTitle")} (AR)</Label>
              <Input value={articleForm.titleAr} onChange={(e) => setArticleForm((p) => ({ ...p, titleAr: e.target.value }))} />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">{t("superAdmin.articleTitle")} (EN)</Label>
              <Input value={articleForm.titleEn} onChange={(e) => setArticleForm((p) => ({ ...p, titleEn: e.target.value }))} />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">{t("superAdmin.articleExcerpt")} (AR)</Label>
              <Textarea value={articleForm.excerptAr} onChange={(e) => setArticleForm((p) => ({ ...p, excerptAr: e.target.value }))} className="min-h-[60px] resize-none" />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">{t("superAdmin.articleExcerpt")} (EN)</Label>
              <Textarea value={articleForm.excerptEn} onChange={(e) => setArticleForm((p) => ({ ...p, excerptEn: e.target.value }))} className="min-h-[60px] resize-none" />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">{t("superAdmin.articleContent")} (AR)</Label>
              <Textarea value={articleForm.contentAr} onChange={(e) => setArticleForm((p) => ({ ...p, contentAr: e.target.value }))} className="min-h-[120px] resize-none" />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">{t("superAdmin.articleContent")} (EN)</Label>
              <Textarea value={articleForm.contentEn} onChange={(e) => setArticleForm((p) => ({ ...p, contentEn: e.target.value }))} className="min-h-[120px] resize-none" />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">{t("superAdmin.articleImage")}</Label>
              <Input value={articleForm.image} onChange={(e) => setArticleForm((p) => ({ ...p, image: e.target.value }))} placeholder="https://..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium mb-1.5 block">{t("superAdmin.articleCategory")} (AR)</Label>
                <Input value={articleForm.categoryAr} onChange={(e) => setArticleForm((p) => ({ ...p, categoryAr: e.target.value }))} />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block">{t("superAdmin.articleCategory")} (EN)</Label>
                <Input value={articleForm.categoryEn} onChange={(e) => setArticleForm((p) => ({ ...p, categoryEn: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium mb-1.5 block">{t("superAdmin.articleReadTime")} (AR)</Label>
                <Input value={articleForm.readTimeAr} onChange={(e) => setArticleForm((p) => ({ ...p, readTimeAr: e.target.value }))} placeholder="5 دقائق" />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block">{t("superAdmin.articleReadTime")} (EN)</Label>
                <Input value={articleForm.readTimeEn} onChange={(e) => setArticleForm((p) => ({ ...p, readTimeEn: e.target.value }))} placeholder="5 min" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="published"
                checked={articleForm.published}
                onChange={(e) => setArticleForm((p) => ({ ...p, published: e.target.checked }))}
                className="w-4 h-4"
              />
              <Label htmlFor="published" className="text-sm font-medium">{t("superAdmin.articlePublished")}</Label>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setArticleModal(null)}>{t("common.cancel")}</Button>
              <Button onClick={submitArticle} className="bg-[#1e3a5f] hover:bg-[#152d4d]">
                {t("common.save")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════ Helpers ═══════════════════════════ */

function SectionCard({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-[#c9a96e]" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Field({ label, value, onChange, textarea, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; textarea?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <Label className="text-sm font-medium mb-1.5 block">{label}</Label>
      {textarea ? (
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-h-[80px] resize-none" />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  );
}
