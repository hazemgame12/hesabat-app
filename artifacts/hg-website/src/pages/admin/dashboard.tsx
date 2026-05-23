import { useEffect, useState } from "react";
import { Link } from "wouter";
import { FileText, Briefcase, Package, Users, Plus, ArrowLeft } from "lucide-react";
import AdminLayout from "@/components/admin-layout";
import { adminFetchArticles, getAdminToken, clearAdminToken, type LeadRecord } from "@/lib/api";
import { useLocation } from "wouter";

export default function AdminDashboard() {
  const [, navigate] = useLocation();
  const [stats, setStats] = useState({ articles: 0, leads: 0 });
  const [recentLeads, setRecentLeads] = useState<LeadRecord[]>([]);
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const token = getAdminToken();

  useEffect(() => {
    if (!token) { navigate(`${base}/admin`); return; }
    Promise.all([
      fetch("/api/admin/articles", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch("/api/admin/leads", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ]).then(([articles, leads]) => {
      setStats({ articles: articles.length, leads: leads.length });
      setRecentLeads(leads.slice(0, 5));
    }).catch(() => { clearAdminToken(); navigate(`${base}/admin`); });
  }, []);

  const cards = [
    { label: "المقالات", value: stats.articles, icon: FileText, color: "bg-blue-500", href: "/admin/articles" },
    { label: "العملاء المحتملون", value: stats.leads, icon: Users, color: "bg-green-500", href: "/admin/leads" },
    { label: "الخدمات", value: 6, icon: Briefcase, color: "bg-purple-500", href: "/admin/services" },
    { label: "الباقات", value: 3, icon: Package, color: "bg-orange-500", href: "/admin/packages" },
  ];

  const statusColors: Record<string, string> = {
    new: "bg-blue-100 text-blue-700",
    contacted: "bg-yellow-100 text-yellow-700",
    converted: "bg-green-100 text-green-700",
    lost: "bg-red-100 text-red-700",
  };
  const statusLabels: Record<string, string> = {
    new: "جديد", contacted: "تم التواصل", converted: "تحول لعميل", lost: "لم يكمل",
  };

  return (
    <AdminLayout title="لوحة التحكم">
      <div className="space-y-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {cards.map((card) => (
            <Link key={card.label} href={`${base}${card.href}`} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow block">
              <div className={`w-12 h-12 ${card.color} rounded-xl flex items-center justify-center mb-4`}>
                <card.icon className="w-6 h-6 text-white" />
              </div>
              <div className="text-3xl font-bold text-gray-800 mb-1">{card.value}</div>
              <div className="text-sm text-gray-500">{card.label}</div>
            </Link>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-bold text-gray-800 text-lg mb-4">إجراءات سريعة</h2>
          <div className="flex flex-wrap gap-3">
            <Link href={`${base}/admin/articles/new`} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
              <Plus className="w-4 h-4" /> مقال جديد
            </Link>
            <Link href={`${base}/admin/services`} className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors">
              <Plus className="w-4 h-4" /> إدارة الخدمات
            </Link>
            <Link href={`${base}/admin/settings`} className="flex items-center gap-2 bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors">
              إعدادات الموقع
            </Link>
          </div>
        </div>

        {/* Recent Leads */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-6 border-b border-gray-50">
            <h2 className="font-bold text-gray-800 text-lg">آخر العملاء المحتملين</h2>
            <Link href={`${base}/admin/leads`} className="text-primary text-sm font-semibold flex items-center gap-1 hover:underline">
              عرض الكل <ArrowLeft className="w-3 h-3" />
            </Link>
          </div>
          {recentLeads.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm">لا توجد بيانات بعد</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr>
                <th className="text-right py-3 px-6 font-semibold text-gray-500">الاسم</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-500">الهاتف</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-500">التاريخ</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-500">الحالة</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {recentLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50/50">
                    <td className="py-3 px-6 font-medium text-gray-800">{lead.name}</td>
                    <td className="py-3 px-4 text-gray-500" dir="ltr">{lead.phone}</td>
                    <td className="py-3 px-4 text-gray-400 text-xs">{new Date(lead.createdAt).toLocaleDateString("ar-EG")}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColors[lead.status] || "bg-gray-100 text-gray-500"}`}>
                        {statusLabels[lead.status] || lead.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
