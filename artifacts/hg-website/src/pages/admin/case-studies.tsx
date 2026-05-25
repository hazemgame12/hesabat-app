import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import AdminLayout from "@/components/admin-layout";
import { Button } from "@/components/ui/button";
import { getAdminToken, clearAdminToken, type CaseStudyRecord } from "@/lib/api";

export default function AdminCaseStudies() {
  const [, navigate] = useLocation();
  const [items, setItems] = useState<CaseStudyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const token = getAdminToken();

  useEffect(() => {
    if (!token) { navigate(`${base}/admin`); return; }
    fetch("/api/admin/case-studies", { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => {
        if (r.status === 401) { clearAdminToken(); navigate(`${base}/admin`); return; }
        const data = await r.json().catch(() => null);
        setItems(Array.isArray(data) ? data : []);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: number, title: string) => {
    if (!token || !confirm(`حذف "${title}"؟`)) return;
    await fetch(`/api/admin/case-studies/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setItems(s => s.filter(x => x.id !== id));
  };

  const handleToggle = async (item: CaseStudyRecord) => {
    if (!token) return;
    const res = await fetch(`/api/admin/case-studies/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ published: !item.published }),
    });
    const updated = await res.json();
    setItems(prev => prev.map(x => x.id === item.id ? updated : x));
  };

  return (
    <AdminLayout title="دراسات الحالة">
      <div className="flex items-center justify-between mb-6">
        <p className="text-gray-500 text-sm">{items.length} دراسة</p>
        <Link href={`${base}/admin/case-studies/new`}>
          <Button className="gap-2 h-10"><Plus className="w-4 h-4" /> دراسة جديدة</Button>
        </Link>
      </div>

      {loading ? <div className="text-center py-20 text-gray-400">جاري التحميل...</div> : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
          مفيش دراسات حالة لسه. اضغط "دراسة جديدة" تبدأ.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-right py-4 px-6 font-semibold text-gray-500">الدراسة</th>
                <th className="text-right py-4 px-4 font-semibold text-gray-500 hidden md:table-cell">العميل</th>
                <th className="text-center py-4 px-4 font-semibold text-gray-500">الحالة</th>
                <th className="text-center py-4 px-6 font-semibold text-gray-500">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      {item.image && <img src={item.image} alt="" className="w-12 h-9 object-cover rounded-lg flex-shrink-0" />}
                      <div>
                        <div className="font-semibold text-gray-800">{item.titleAr}</div>
                        <div className="text-gray-400 text-xs">{item.industryAr}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4 hidden md:table-cell text-gray-500">{item.clientName || "—"}</td>
                  <td className="py-4 px-4 text-center">
                    <button onClick={() => handleToggle(item)} className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${item.published ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                      {item.published ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      {item.published ? "ظاهر" : "مخفي"}
                    </button>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center justify-center gap-2">
                      <Link href={`${base}/admin/case-studies/${item.id}/edit`}>
                        <button className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Pencil className="w-4 h-4" /></button>
                      </Link>
                      <button onClick={() => handleDelete(item.id, item.titleAr)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
