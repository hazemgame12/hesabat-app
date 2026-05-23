import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { Save, Eye, EyeOff } from "lucide-react";
import AdminLayout from "@/components/admin-layout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import ImageUpload from "@/components/image-upload";
import { getAdminToken, clearAdminToken, type InsertCaseStudy, type CaseStudyRecord } from "@/lib/api";

const empty: InsertCaseStudy = {
  slug: "", titleAr: "", titleEn: "", clientName: "",
  industryAr: "", industryEn: "",
  summaryAr: "", summaryEn: "",
  challengeAr: "", challengeEn: "",
  solutionAr: "", solutionEn: "",
  resultsAr: "", resultsEn: "",
  image: "", order: 0, published: true,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export default function CaseStudyForm() {
  const { id } = useParams<{ id?: string }>();
  const [, navigate] = useLocation();
  const isEdit = !!id;
  const [form, setForm] = useState<InsertCaseStudy>(empty);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const token = getAdminToken();

  useEffect(() => {
    if (!token) { navigate(`${base}/admin`); return; }
    if (!isEdit) return;
    setLoading(true);
    fetch("/api/admin/case-studies", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((items: CaseStudyRecord[]) => {
        const found = items.find(x => x.id === parseInt(id!));
        if (found) { const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = found; setForm(rest); }
      })
      .catch(() => { clearAdminToken(); navigate(`${base}/admin`); })
      .finally(() => setLoading(false));
  }, [id]);

  const set = <K extends keyof InsertCaseStudy>(key: K, val: InsertCaseStudy[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true); setError("");
    try {
      const url = isEdit ? `/api/admin/case-studies/${id}` : "/api/admin/case-studies";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      navigate(`${base}/admin/case-studies`);
    } catch { setError("حدث خطأ أثناء الحفظ. تأكد من ملء العنوان والـ slug."); }
    finally { setSaving(false); }
  };

  if (loading) return <AdminLayout title={isEdit ? "تعديل دراسة" : "دراسة جديدة"}><div className="text-center py-20 text-gray-400">جاري التحميل...</div></AdminLayout>;

  return (
    <AdminLayout title={isEdit ? "تعديل دراسة حالة" : "دراسة حالة جديدة"}>
      <form onSubmit={handleSubmit} className="max-w-5xl">
        {error && <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6 font-medium">{error}</div>}

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
              <h2 className="font-bold text-gray-800 text-lg border-b pb-3">المعلومات الأساسية</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="العنوان بالعربي *"><Input value={form.titleAr} onChange={e => set("titleAr", e.target.value)} required className="h-11" /></Field>
                <Field label="Title (English) *"><Input value={form.titleEn} onChange={e => set("titleEn", e.target.value)} required className="h-11" dir="ltr" /></Field>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="القطاع (عربي)"><Input value={form.industryAr} onChange={e => set("industryAr", e.target.value)} placeholder="مثلاً: التجزئة" className="h-11" /></Field>
                <Field label="Industry (English)"><Input value={form.industryEn} onChange={e => set("industryEn", e.target.value)} placeholder="e.g. Retail" className="h-11" dir="ltr" /></Field>
              </div>
              <Field label="الملخص (عربي)"><Textarea value={form.summaryAr} onChange={e => set("summaryAr", e.target.value)} rows={2} placeholder="ملخص قصير يظهر في قائمة الدراسات..." /></Field>
              <Field label="Summary (English)"><Textarea value={form.summaryEn} onChange={e => set("summaryEn", e.target.value)} rows={2} dir="ltr" /></Field>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
              <h2 className="font-bold text-gray-800 text-lg border-b pb-3">التحدي</h2>
              <Field label="التحدي (عربي) — Markdown مدعوم"><Textarea value={form.challengeAr} onChange={e => set("challengeAr", e.target.value)} rows={5} className="font-mono text-sm" /></Field>
              <Field label="Challenge (English)"><Textarea value={form.challengeEn} onChange={e => set("challengeEn", e.target.value)} rows={5} dir="ltr" className="font-mono text-sm" /></Field>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
              <h2 className="font-bold text-gray-800 text-lg border-b pb-3">الحل</h2>
              <Field label="الحل (عربي)"><Textarea value={form.solutionAr} onChange={e => set("solutionAr", e.target.value)} rows={5} className="font-mono text-sm" /></Field>
              <Field label="Solution (English)"><Textarea value={form.solutionEn} onChange={e => set("solutionEn", e.target.value)} rows={5} dir="ltr" className="font-mono text-sm" /></Field>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
              <h2 className="font-bold text-gray-800 text-lg border-b pb-3">النتائج</h2>
              <Field label="النتائج (عربي)"><Textarea value={form.resultsAr} onChange={e => set("resultsAr", e.target.value)} rows={5} className="font-mono text-sm" /></Field>
              <Field label="Results (English)"><Textarea value={form.resultsEn} onChange={e => set("resultsEn", e.target.value)} rows={5} dir="ltr" className="font-mono text-sm" /></Field>
            </div>
          </div>

          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              <h2 className="font-bold text-gray-800 border-b pb-3">الإعدادات</h2>
              <Field label="Slug (رابط) *"><Input value={form.slug} onChange={e => set("slug", e.target.value.toLowerCase().replace(/\s+/g, "-"))} required placeholder="case-study-slug" className="h-10" dir="ltr" /></Field>
              <Field label="اسم العميل"><Input value={form.clientName} onChange={e => set("clientName", e.target.value)} placeholder="اسم العميل أو الشركة" className="h-10" /></Field>
              <Field label="الترتيب"><Input type="number" value={form.order} onChange={e => set("order", parseInt(e.target.value) || 0)} className="h-10" /></Field>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <ImageUpload label="صورة الغلاف" value={form.image} onChange={(url) => set("image", url)} />
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
              {saving ? "جاري الحفظ..." : isEdit ? "حفظ التعديلات" : "إضافة الدراسة"}
            </Button>
          </div>
        </div>
      </form>
    </AdminLayout>
  );
}
