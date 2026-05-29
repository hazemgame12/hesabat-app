import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Sparkles, Wand2, Save, Loader2, Facebook, Instagram, Linkedin, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import AdminLayout from "@/components/admin-layout";
import ImageUpload from "@/components/image-upload";
import {
  adminGenerateContent, adminCreateArticle, adminCreateSocialPost,
  getAdminToken, clearAdminToken,
  type AIGeneratedArticle, type SocialPlatform, type InsertArticle, type InsertSocialPost,
} from "@/lib/api";

const PLATFORMS: { key: SocialPlatform; label: string; icon: typeof Facebook; color: string }[] = [
  { key: "facebook", label: "فيسبوك", icon: Facebook, color: "text-blue-600" },
  { key: "instagram", label: "إنستجرام", icon: Instagram, color: "text-pink-600" },
  { key: "linkedin", label: "لينكدإن", icon: Linkedin, color: "text-sky-700" },
];

type Status = "draft" | "scheduled" | "published";

interface SocialDraft {
  platform: SocialPlatform;
  captionAr: string;
  captionEn: string;
  enabled: boolean;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function statusToPublished(status: Status): boolean {
  return status === "published";
}

export default function ContentStudio() {
  const [, navigate] = useLocation();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const token = getAdminToken();

  const [topic, setTopic] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>(["facebook", "instagram", "linkedin"]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const [article, setArticle] = useState<AIGeneratedArticle | null>(null);
  const [image, setImage] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [social, setSocial] = useState<SocialDraft[]>([]);

  const [status, setStatus] = useState<Status>("draft");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState<string>("");

  useEffect(() => {
    if (!token) navigate(`${base}/admin`);
  }, []);

  const togglePlatform = (p: SocialPlatform) => {
    setSelectedPlatforms((cur) =>
      cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p],
    );
  };

  const handleGenerate = async () => {
    if (!token || topic.trim().length < 2) { setError("اكتب موضوعاً أولاً"); return; }
    setGenerating(true); setError(""); setSaved(false);
    try {
      const result = await adminGenerateContent(token, {
        topic: topic.trim(),
        platforms: selectedPlatforms.length ? selectedPlatforms : ["facebook", "instagram", "linkedin"],
      });
      setArticle(result.article);
      const drafts: SocialDraft[] = PLATFORMS.map((p) => {
        const found = result.social.find((s) => s.platform === p.key);
        return {
          platform: p.key,
          captionAr: found?.captionAr ?? "",
          captionEn: found?.captionEn ?? "",
          enabled: selectedPlatforms.includes(p.key) && !!found,
        };
      });
      setSocial(drafts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل توليد المحتوى");
    } finally {
      setGenerating(false);
    }
  };

  const setArt = (k: keyof AIGeneratedArticle, v: string) =>
    setArticle((a) => (a ? { ...a, [k]: v } : a));

  const setSoc = (platform: SocialPlatform, k: keyof SocialDraft, v: string | boolean) =>
    setSocial((cur) => cur.map((s) => (s.platform === platform ? { ...s, [k]: v } : s)));

  const copyCaption = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(""), 1500);
    } catch { /* ignore */ }
  };

  const handleSave = async () => {
    if (!token || !article) return;
    if (status === "scheduled" && !scheduledAt) { setError("اختر تاريخ ووقت الجدولة"); return; }
    if (!article.slug || !article.titleAr || !article.titleEn) { setError("العنوان و الـ slug مطلوبان"); return; }
    setSaving(true); setError("");
    try {
      const scheduledIso = status === "scheduled" && scheduledAt ? new Date(scheduledAt).toISOString() : null;
      const articlePayload: InsertArticle = {
        slug: article.slug,
        categoryAr: article.categoryAr,
        categoryEn: article.categoryEn,
        date,
        readTimeAr: article.readTimeAr,
        readTimeEn: article.readTimeEn,
        titleAr: article.titleAr,
        titleEn: article.titleEn,
        excerptAr: article.excerptAr,
        excerptEn: article.excerptEn,
        contentAr: article.contentAr,
        contentEn: article.contentEn,
        image,
        published: statusToPublished(status),
        status,
        scheduledAt: scheduledIso,
      };
      const createdArticle = await adminCreateArticle(token, articlePayload);

      const enabledSocial = social.filter((s) => s.enabled && (s.captionAr || s.captionEn));
      for (const s of enabledSocial) {
        const postPayload: InsertSocialPost = {
          platform: s.platform,
          captionAr: s.captionAr,
          captionEn: s.captionEn,
          image,
          link: createdArticle.slug,
          status: status === "published" ? "released" : status === "scheduled" ? "scheduled" : "draft",
          scheduledAt: scheduledIso,
          releasedAt: status === "published" ? new Date().toISOString() : null,
          articleId: createdArticle.id,
        };
        await adminCreateSocialPost(token, postPayload);
      }
      setSaved(true);
      setTimeout(() => navigate(`${base}/admin/content-calendar`), 900);
    } catch (e) {
      if (e instanceof Error && e.message === "Unauthorized") { clearAdminToken(); navigate(`${base}/admin`); return; }
      setError(e instanceof Error ? e.message : "حدث خطأ أثناء الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout title="استوديو المحتوى">
      <div className="max-w-5xl space-y-6">
        {/* Intro / generator */}
        <div className="bg-gradient-to-br from-[#001d56] to-primary rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5" />
            <h2 className="font-bold text-lg">توليد محتوى بالذكاء الاصطناعي</h2>
          </div>
          <p className="text-white/70 text-sm mb-5">
            اكتب موضوعاً وسيقوم الذكاء الاصطناعي بكتابة مقال احترافي ثنائي اللغة (عربي/إنجليزي) مع منشورات السوشيال ميديا الجاهزة.
          </p>
          <div className="space-y-3">
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="مثال: أهمية الفاتورة الإلكترونية للشركات في السعودية"
              className="h-12 bg-white text-gray-800 border-0"
            />
            <div className="flex flex-wrap items-center gap-2">
              {PLATFORMS.map((p) => {
                const active = selectedPlatforms.includes(p.key);
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => togglePlatform(p.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                      active ? "bg-white text-[#001d56]" : "bg-white/10 text-white/70 hover:bg-white/20"
                    }`}
                  >
                    <p.icon className="w-4 h-4" />
                    {p.label}
                  </button>
                );
              })}
              <Button
                onClick={handleGenerate}
                disabled={generating}
                className="mr-auto h-11 gap-2 bg-white text-[#001d56] hover:bg-white/90 font-bold px-6"
              >
                {generating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
                {generating ? "جاري التوليد..." : "توليد المحتوى"}
              </Button>
            </div>
          </div>
        </div>

        {error && <div className="bg-red-50 text-red-600 p-4 rounded-xl font-medium">{error}</div>}
        {saved && <div className="bg-green-50 text-green-700 p-4 rounded-xl font-medium">تم الحفظ بنجاح! جاري التحويل...</div>}

        {generating && !article && (
          <div className="text-center py-16 text-gray-400">
            <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3" />
            <p>الذكاء الاصطناعي يكتب المحتوى... قد يستغرق 10-30 ثانية</p>
          </div>
        )}

        {article && (
          <>
            {/* Article review/edit */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
              <h2 className="font-bold text-gray-800 text-lg border-b pb-3">مراجعة المقال</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="العنوان بالعربي">
                  <Input value={article.titleAr} onChange={(e) => setArt("titleAr", e.target.value)} className="h-11" />
                </Field>
                <Field label="العنوان بالإنجليزي">
                  <Input value={article.titleEn} onChange={(e) => setArt("titleEn", e.target.value)} className="h-11" dir="ltr" />
                </Field>
                <Field label="المقتطف بالعربي">
                  <Textarea value={article.excerptAr} onChange={(e) => setArt("excerptAr", e.target.value)} rows={2} />
                </Field>
                <Field label="المقتطف بالإنجليزي">
                  <Textarea value={article.excerptEn} onChange={(e) => setArt("excerptEn", e.target.value)} rows={2} dir="ltr" />
                </Field>
              </div>
              <Field label="المحتوى بالعربي (Markdown)">
                <Textarea value={article.contentAr} onChange={(e) => setArt("contentAr", e.target.value)} rows={12} className="font-mono text-sm" />
              </Field>
              <Field label="المحتوى بالإنجليزي (Markdown)">
                <Textarea value={article.contentEn} onChange={(e) => setArt("contentEn", e.target.value)} rows={12} className="font-mono text-sm" dir="ltr" />
              </Field>
              <div className="grid md:grid-cols-4 gap-4">
                <Field label="Slug">
                  <Input value={article.slug} onChange={(e) => setArt("slug", e.target.value.toLowerCase().replace(/\s+/g, "-"))} className="h-10" dir="ltr" />
                </Field>
                <Field label="التصنيف (عربي)">
                  <Input value={article.categoryAr} onChange={(e) => setArt("categoryAr", e.target.value)} className="h-10" />
                </Field>
                <Field label="التصنيف (إنجليزي)">
                  <Input value={article.categoryEn} onChange={(e) => setArt("categoryEn", e.target.value)} className="h-10" dir="ltr" />
                </Field>
                <Field label="التاريخ">
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10" />
                </Field>
              </div>
              <ImageUpload label="صورة المقال (تُستخدم أيضاً للمنشورات)" value={image} onChange={setImage} />
            </div>

            {/* Social captions */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <h2 className="font-bold text-gray-800 text-lg border-b pb-3">منشورات السوشيال ميديا</h2>
              {social.map((s) => {
                const meta = PLATFORMS.find((p) => p.key === s.platform)!;
                return (
                  <div key={s.platform} className={`rounded-xl border p-4 transition-colors ${s.enabled ? "border-gray-200" : "border-gray-100 bg-gray-50/50 opacity-70"}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 font-semibold text-gray-800">
                        <meta.icon className={`w-5 h-5 ${meta.color}`} />
                        {meta.label}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSoc(s.platform, "enabled", !s.enabled)}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full ${s.enabled ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}
                      >
                        {s.enabled ? "مُفعّل" : "متوقف"}
                      </button>
                    </div>
                    <div className="grid md:grid-cols-2 gap-3">
                      <div className="relative">
                        <Textarea value={s.captionAr} onChange={(e) => setSoc(s.platform, "captionAr", e.target.value)} rows={4} placeholder="النص بالعربي" />
                        <button type="button" onClick={() => copyCaption(`${s.platform}-ar`, s.captionAr)} className="absolute top-2 left-2 p-1.5 bg-white border border-gray-200 rounded-lg text-gray-500 hover:text-primary">
                          {copied === `${s.platform}-ar` ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                      <div className="relative">
                        <Textarea value={s.captionEn} onChange={(e) => setSoc(s.platform, "captionEn", e.target.value)} rows={4} placeholder="Caption in English" dir="ltr" />
                        <button type="button" onClick={() => copyCaption(`${s.platform}-en`, s.captionEn)} className="absolute top-2 right-2 p-1.5 bg-white border border-gray-200 rounded-lg text-gray-500 hover:text-primary">
                          {copied === `${s.platform}-en` ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Scheduling + save */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <h2 className="font-bold text-gray-800 text-lg border-b pb-3">النشر والجدولة</h2>
              <div className="flex flex-wrap gap-2">
                {([
                  { v: "draft", l: "مسودة" },
                  { v: "scheduled", l: "جدولة" },
                  { v: "published", l: "نشر فوري" },
                ] as { v: Status; l: string }[]).map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setStatus(opt.v)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                      status === opt.v ? "bg-primary text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
              {status === "scheduled" && (
                <Field label="تاريخ ووقت النشر التلقائي">
                  <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="h-11 max-w-xs" />
                </Field>
              )}
              <p className="text-gray-400 text-xs">
                {status === "draft" && "سيُحفظ كمسودة غير منشورة."}
                {status === "scheduled" && "سيُنشر المقال والمنشورات تلقائياً في الموعد المحدد."}
                {status === "published" && "سيُنشر المقال فوراً وتظهر المنشورات في قسم آخر الأخبار."}
              </p>
              <Button onClick={handleSave} disabled={saving} className="h-12 gap-2 text-base px-8">
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                {saving ? "جاري الحفظ..." : "حفظ المحتوى"}
              </Button>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
