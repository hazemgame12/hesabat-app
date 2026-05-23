import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { Save } from "lucide-react";
import AdminLayout from "@/components/admin-layout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import ImageUpload from "@/components/image-upload";
import { getAdminToken, clearAdminToken, type InsertService, type ServiceRecord } from "@/lib/api";

const empty: InsertService = { titleAr: "", titleEn: "", descriptionAr: "", descriptionEn: "", image: "", order: 0, published: true };

export default function ServiceForm() {
  const { id } = useParams<{ id?: string }>();
  const [, navigate] = useLocation();
  const [form, setForm] = useState<InsertService>(empty);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const token = getAdminToken();
  const isEdit = !!id;

  useEffect(() => {
    if (!token) { navigate(`${base}/admin`); return; }
    if (!isEdit) return;
    setLoading(true);
    fetch("/api/admin/services", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((services: ServiceRecord[]) => {
        const found = services.find(s => s.id === parseInt(id!));
        if (found) { const { id: _, createdAt: _c, updatedAt: _u, ...rest } = found; setForm(rest); }
      })
      .catch(() => { clearAdminToken(); navigate(`${base}/admin`); })
      .finally(() => setLoading(false));
  }, [id]);

  const set = (key: keyof InsertService, val: string | number | boolean) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true); setError("");
    try {
      const url = isEdit ? `/api/admin/services/${id}` : "/api/admin/services";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      navigate(`${base}/admin/services`);
    } catch { setError("حدث خطأ أثناء الحفظ"); } finally { setSaving(false); }
  };

  if (loading) return <AdminLayout title={isEdit ? "تعديل خدمة" : "خدمة جديدة"}><div className="text-center py-20 text-gray-400">جاري التحميل...</div></AdminLayout>;

  return (
    <AdminLayout title={isEdit ? "تعديل خدمة" : "خدمة جديدة"}>
      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        {error && <div className="bg-red-50 text-red-600 p-4 rounded-xl">{error}</div>}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">اسم الخدمة (عربي) *</label>
              <Input value={form.titleAr} onChange={e => set("titleAr", e.target.value)} required className="h-11" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Service Name (English) *</label>
              <Input value={form.titleEn} onChange={e => set("titleEn", e.target.value)} required className="h-11" dir="ltr" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">وصف مختصر (عربي)</label>
            <Textarea value={form.descriptionAr} onChange={e => set("descriptionAr", e.target.value)} rows={3} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Short Description (English)</label>
            <Textarea value={form.descriptionEn} onChange={e => set("descriptionEn", e.target.value)} rows={3} dir="ltr" />
          </div>
          <ImageUpload label="صورة الخدمة" value={form.image} onChange={(url) => set("image", url)} />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">الترتيب</label>
              <Input type="number" value={form.order} onChange={e => set("order", parseInt(e.target.value) || 0)} className="h-11" />
            </div>
            <div className="flex items-end pb-1">
              <button type="button" onClick={() => set("published", !form.published)}
                className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-colors ${form.published ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                {form.published ? "✓ ظاهر على الموقع" : "○ مخفي"}
              </button>
            </div>
          </div>
        </div>

        <Button type="submit" className="w-full h-12 gap-2 text-base" disabled={saving}>
          <Save className="w-5 h-5" />
          {saving ? "جاري الحفظ..." : isEdit ? "حفظ التعديلات" : "إضافة الخدمة"}
        </Button>
      </form>
    </AdminLayout>
  );
}
