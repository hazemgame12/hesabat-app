import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { Save, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import AdminLayout from "@/components/admin-layout";
import ImageUpload from "@/components/image-upload";
import {
  adminFetchArticles, adminCreateArticle, adminUpdateArticle,
  getAdminToken, clearAdminToken, type InsertArticle, type ArticleRecord,
} from "@/lib/api";

const empty: InsertArticle = {
  slug: "", categoryAr: "", categoryEn: "", date: new Date().toISOString().slice(0, 10),
  readTimeAr: "", readTimeEn: "", titleAr: "", titleEn: "",
  excerptAr: "", excerptEn: "", contentAr: "", contentEn: "",
  image: "", published: true, status: "published", scheduledAt: null,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export default function ArticleForm() {
  const { id } = useParams<{ id?: string }>();
  const [, navigate] = useLocation();
  const isEdit = !!id;
  const [form, setForm] = useState<InsertArticle>(empty);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const token = getAdminToken();

  useEffect(() => {
    if (!token) { navigate(`${base}/admin`); return; }
    if (!isEdit) return;
    setLoading(true);
    adminFetchArticles(token)
      .then((articles) => {
        const found = articles.find((a: ArticleRecord) => a.id === parseInt(id!));
        if (found) { const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = found; setForm(rest); }
      })
      .catch(() => { clearAdminToken(); navigate(`${base}/admin`); })
      .finally(() => setLoading(false));
  }, [id]);

  const set = (key: keyof InsertArticle, val: string | boolean) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true); setError("");
    try {
      if (isEdit) { await adminUpdateArticle(token, parseInt(id!), form); }
      else { await adminCreateArticle(token, form); }
      navigate(`${base}/admin/articles`);
    } catch { setError("حدث خطأ أثناء الحفظ. تأكد من ملء جميع الحقول."); }
    finally { setSaving(false); }
  };

  if (loading) return <AdminLayout title={isEdit ? "تعديل مقال" : "مقال جديد"}><div className="text-center py-20 text-gray-400">جاري التحميل...</div></AdminLayout>;

  return (
    <AdminLayout title={isEdit ? "تعديل مقال" : "مقال جديد"}>
      <form id="article-form" onSubmit={handleSubmit} className="max-w-5xl">
        {error && <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6 font-medium">{error}</div>}

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
              <h2 className="font-bold text-gray-800 text-lg border-b pb-3">العنوان والمحتوى</h2>
              <Field label="العنوان بالعربي *">
                <Input value={form.titleAr} onChange={e => set("titleAr", e.target.value)} required placeholder="عنوان المقال بالعربي" className="h-11" />
              </Field>
              <Field label="العنوان بالإنجليزي *">
                <Input value={form.titleEn} onChange={e => set("titleEn", e.target.value)} required placeholder="Article title in English" className="h-11" dir="ltr" />
              </Field>
              <Field label="المقتطف بالعربي">
                <Textarea value={form.excerptAr} onChange={e => set("excerptAr", e.target.value)} placeholder="وصف مختصر للمقال..." rows={2} />
              </Field>
              <Field label="المقتطف بالإنجليزي">
                <Textarea value={form.excerptEn} onChange={e => set("excerptEn", e.target.value)} placeholder="Short article description..." rows={2} dir="ltr" />
              </Field>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
              <h2 className="font-bold text-gray-800 text-lg border-b pb-3">المحتوى الكامل</h2>
              <Field label="المحتوى بالعربي (Markdown مدعوم)">
                <Textarea value={form.contentAr} onChange={e => set("contentAr", e.target.value)} placeholder="## عنوان&#10;&#10;محتوى المقال هنا..." rows={14} className="font-mono text-sm" />
              </Field>
              <Field label="المحتوى بالإنجليزي">
                <Textarea value={form.contentEn} onChange={e => set("contentEn", e.target.value)} placeholder="## Heading&#10;&#10;Article content here..." rows={14} dir="ltr" className="font-mono text-sm" />
              </Field>
            </div>
          </div>

          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              <h2 className="font-bold text-gray-800 border-b pb-3">الإعدادات</h2>
              <Field label="Slug (رابط المقال) *">
                <Input value={form.slug} onChange={e => set("slug", e.target.value.toLowerCase().replace(/\s+/g, "-"))} required placeholder="article-slug" className="h-10" dir="ltr" />
              </Field>
              <Field label="التاريخ">
                <Input type="date" value={form.date} onChange={e => set("date", e.target.value)} className="h-10" />
              </Field>
              <Field label="وقت القراءة (عربي)">
                <Input value={form.readTimeAr} onChange={e => set("readTimeAr", e.target.value)} placeholder="5 دقائق" className="h-10" />
              </Field>
              <Field label="وقت القراءة (إنجليزي)">
                <Input value={form.readTimeEn} onChange={e => set("readTimeEn", e.target.value)} placeholder="5 min read" className="h-10" dir="ltr" />
              </Field>
              <ImageUpload label="صورة المقال" value={form.image} onChange={(url) => set("image", url)} />
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              <h2 className="font-bold text-gray-800 border-b pb-3">التصنيف</h2>
              <Field label="التصنيف (عربي)">
                <Input value={form.categoryAr} onChange={e => set("categoryAr", e.target.value)} placeholder="الضرائب" className="h-10" />
              </Field>
              <Field label="التصنيف (إنجليزي)">
                <Input value={form.categoryEn} onChange={e => set("categoryEn", e.target.value)} placeholder="Taxation" className="h-10" dir="ltr" />
              </Field>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="font-bold text-gray-800 border-b pb-3 mb-4">الحالة</h2>
              <button type="button" onClick={() => set("published", !form.published)}
                className={`flex items-center gap-2 w-full justify-center py-3 rounded-xl font-semibold text-sm transition-colors ${form.published ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                {form.published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                {form.published ? "منشور — اضغط للإخفاء" : "مخفي — اضغط للنشر"}
              </button>
            </div>

            <Button type="submit" className="w-full h-12 gap-2 text-base" disabled={saving}>
              <Save className="w-5 h-5" />
              {saving ? "جاري الحفظ..." : isEdit ? "حفظ التعديلات" : "نشر المقال"}
            </Button>
          </div>
        </div>
      </form>
    </AdminLayout>
  );
}
