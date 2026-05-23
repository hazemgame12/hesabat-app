import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Plus, Pencil, Trash2, Star, Eye, EyeOff } from "lucide-react";
import AdminLayout from "@/components/admin-layout";
import { Button } from "@/components/ui/button";
import { getAdminToken, clearAdminToken, type PackageRecord } from "@/lib/api";

export default function AdminPackages() {
  const [, navigate] = useLocation();
  const [packages, setPackages] = useState<PackageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const token = getAdminToken();

  useEffect(() => {
    if (!token) { navigate(`${base}/admin`); return; }
    fetch("/api/admin/packages", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setPackages)
      .catch(() => { clearAdminToken(); navigate(`${base}/admin`); })
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: number, title: string) => {
    if (!token || !confirm(`حذف "${title}"؟`)) return;
    await fetch(`/api/admin/packages/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setPackages(p => p.filter(x => x.id !== id));
  };

  const handleToggle = async (pkg: PackageRecord) => {
    if (!token) return;
    const res = await fetch(`/api/admin/packages/${pkg.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ published: !pkg.published }),
    });
    const updated = await res.json();
    setPackages(p => p.map(x => x.id === pkg.id ? updated : x));
  };

  return (
    <AdminLayout title="إدارة الباقات">
      <div className="flex items-center justify-between mb-6">
        <p className="text-gray-500 text-sm">{packages.length} باقة</p>
        <Link href={`${base}/admin/packages/new`}>
          <Button className="gap-2 h-10"><Plus className="w-4 h-4" /> باقة جديدة</Button>
        </Link>
      </div>

      {loading ? <div className="text-center py-20 text-gray-400">جاري التحميل...</div> : (
        <div className="grid md:grid-cols-3 gap-5">
          {packages.map((pkg) => (
            <div key={pkg.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${pkg.highlighted ? "border-primary ring-2 ring-primary/20" : "border-gray-100"}`}>
              {pkg.highlighted && <div className="bg-primary text-white text-center py-2 text-xs font-bold">⭐ الأكثر طلباً</div>}
              <div className="p-5">
                <h3 className="font-bold text-gray-800 text-lg mb-1">{pkg.titleAr}</h3>
                <p className="text-gray-500 text-sm mb-3">{pkg.descriptionAr}</p>
                <p className="text-xs text-gray-400">{(pkg.featuresAr as string[]).length} ميزة</p>
              </div>
              <div className="px-5 pb-5 flex items-center gap-2">
                <button onClick={() => handleToggle(pkg)} className={`flex-1 flex items-center justify-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg transition-colors ${pkg.published ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                  {pkg.published ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  {pkg.published ? "ظاهر" : "مخفي"}
                </button>
                <Link href={`${base}/admin/packages/${pkg.id}/edit`}>
                  <button className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Pencil className="w-4 h-4" /></button>
                </Link>
                <button onClick={() => handleDelete(pkg.id, pkg.titleAr)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
