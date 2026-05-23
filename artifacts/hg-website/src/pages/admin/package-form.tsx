import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { Save, Plus, Trash2 } from "lucide-react";
import AdminLayout from "@/components/admin-layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getAdminToken, clearAdminToken, type InsertPackage, type PackageRecord } from "@/lib/api";

const empty: InsertPackage = { titleAr: "", titleEn: "", descriptionAr: "", descriptionEn: "", featuresAr: [], featuresEn: [], highlighted: false, order: 0, published: true };

export default function PackageForm() {
  const { id } = useParams<{ id?: string }>();
  const [, navigate] = useLocation();
  const [form, setForm] = useState<InsertPackage>(empty);
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
    fetch("/api/admin/packages", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((pkgs: PackageRecord[]) => {
        const found = pkgs.find(p => p.id === parseInt(id!));
        if (found) { const { id: _, createdAt: _c, updatedAt: _u, ...rest } = found; setForm(rest as InsertPackage); }
      })
      .catch(() => { clearAdminToken(); navigate(`${base}/admin`); })
      .finally(() => setLoading(false));
  }, [id]);

  const setField = (key: keyof InsertPackage, val: unknown) => setForm(f => ({ ...f, [key]: val }));

  const featuresAr = (form.featuresAr as string[]) || [];
  const featuresEn = (form.featuresEn as string[]) || [];

  const addFeature = () => { setField("featuresAr", [...featuresAr, ""]); setField("featuresEn", [...featuresEn, ""]); };
  const removeFeature = (i: number) => {
    setField("featuresAr", featuresAr.filter((_, idx) => idx !== i));
    setField("featuresEn", featuresEn.filter((_, idx) => idx !== i));
  };
  const setFeatureAr = (i: number, val: string) => { const f = [...featuresAr]; f[i] = val; setField("featuresAr", f); };
  const setFeatureEn = (i: number, val: string) => { const f = [...featuresEn]; f[i] = val; setField("featuresEn", f); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true); setError("");
    try {
      const url = isEdit ? `/api/admin/packages/${id}` : "/api/admin/packages";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      navigate(`${base}/admin/packages`);
    } catch { setError("حدث خطأ أثناء الحفظ"); } finally { setSaving(false); }
  };

  if (loading) return <AdminLayout title={isEdit ? "تعديل باقة" : "باقة جديدة"}><div className="text-center py-20 text-gray-400">جاري التحميل...</div></AdminLayout>;

  return (
    <AdminLayout title={isEdit ? "تعديل باقة" : "باقة جديدة"}>
      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        {error && <div className="bg-red-50 text-red-600 p-4 rounded-xl">{error}</div>}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          <h2 className="font-bold text-gray-700 border-b pb-3">معلومات الباقة</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-semibold text-gray-700 mb-1.5">اسم الباقة (عربي) *</label>
              <Input value={form.titleAr} onChange={e => setField("titleAr", e.target.value)} required className="h-11" /></div>
            <div><label className="block text-sm font-semibold text-gray-700 mb-1.5">Package Name (English) *</label>
              <Input value={form.titleEn} onChange={e => setField("titleEn", e.target.value)} required className="h-11" dir="ltr" /></div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-semibold text-gray-700 mb-1.5">وصف مختصر (عربي)</label>
              <Input value={form.descriptionAr} onChange={e => setField("descriptionAr", e.target.value)} className="h-11" /></div>
            <div><label className="block text-sm font-semibold text-gray-700 mb-1.5">Short Description (English)</label>
              <Input value={form.descriptionEn} onChange={e => setField("descriptionEn", e.target.value)} className="h-11" dir="ltr" /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="block text-sm font-semibold text-gray-700 mb-1.5">الترتيب</label>
              <Input type="number" value={form.order} onChange={e => setField("order", parseInt(e.target.value) || 0)} className="h-11" /></div>
            <div className="flex items-end pb-1">
              <button type="button" onClick={() => setField("highlighted", !form.highlighted)}
                className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-colors ${form.highlighted ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"}`}>
                {form.highlighted ? "⭐ مميز" : "○ عادي"}
              </button>
            </div>
            <div className="flex items-end pb-1">
              <button type="button" onClick={() => setField("published", !form.published)}
                className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-colors ${form.published ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                {form.published ? "✓ ظاهر" : "○ مخفي"}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h2 className="font-bold text-gray-700">المميزات</h2>
            <Button type="button" variant="outline" size="sm" onClick={addFeature} className="gap-1"><Plus className="w-3 h-3" />إضافة ميزة</Button>
          </div>
          {featuresAr.length === 0 ? (
            <p className="text-center py-4 text-gray-400 text-sm">اضغط "إضافة ميزة" لإضافة مميزات الباقة</p>
          ) : (
            <div className="space-y-3">
              {featuresAr.map((f, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <Input value={f} onChange={e => setFeatureAr(i, e.target.value)} placeholder={`ميزة ${i + 1} (عربي)`} className="h-9 text-sm" />
                    <Input value={featuresEn[i] || ""} onChange={e => setFeatureEn(i, e.target.value)} placeholder={`Feature ${i + 1} (English)`} className="h-9 text-sm" dir="ltr" />
                  </div>
                  <button type="button" onClick={() => removeFeature(i)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Button type="submit" className="w-full h-12 gap-2 text-base" disabled={saving}>
          <Save className="w-5 h-5" />
          {saving ? "جاري الحفظ..." : isEdit ? "حفظ التعديلات" : "إضافة الباقة"}
        </Button>
      </form>
    </AdminLayout>
  );
}
