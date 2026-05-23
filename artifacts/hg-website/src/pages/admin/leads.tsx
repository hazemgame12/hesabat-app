import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Phone, Mail, MessageCircle, Trash2, ChevronDown } from "lucide-react";
import AdminLayout from "@/components/admin-layout";
import { getAdminToken, clearAdminToken, type LeadRecord } from "@/lib/api";

const STATUS_OPTIONS = [
  { value: "new", label: "جديد", color: "bg-blue-100 text-blue-700" },
  { value: "contacted", label: "تم التواصل", color: "bg-yellow-100 text-yellow-700" },
  { value: "converted", label: "تحول لعميل", color: "bg-green-100 text-green-700" },
  { value: "lost", label: "لم يكمل", color: "bg-red-100 text-red-700" },
];

function statusColor(s: string) { return STATUS_OPTIONS.find(o => o.value === s)?.color || "bg-gray-100 text-gray-500"; }
function statusLabel(s: string) { return STATUS_OPTIONS.find(o => o.value === s)?.label || s; }

export default function AdminLeads() {
  const [, navigate] = useLocation();
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const token = getAdminToken();

  useEffect(() => {
    if (!token) { navigate(`${base}/admin`); return; }
    fetch("/api/admin/leads", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setLeads)
      .catch(() => { clearAdminToken(); navigate(`${base}/admin`); })
      .finally(() => setLoading(false));
  }, []);

  const updateStatus = async (id: number, status: string) => {
    if (!token) return;
    const res = await fetch(`/api/admin/leads/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    const updated = await res.json();
    setLeads(l => l.map(x => x.id === id ? updated : x));
  };

  const updateNotes = async (id: number, notes: string) => {
    if (!token) return;
    await fetch(`/api/admin/leads/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ notes }),
    });
  };

  const handleDelete = async (id: number) => {
    if (!token || !confirm("حذف هذا العميل؟")) return;
    await fetch(`/api/admin/leads/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setLeads(l => l.filter(x => x.id !== id));
  };

  const newCount = leads.filter(l => l.status === "new").length;

  return (
    <AdminLayout title="العملاء المحتملون (Leads CRM)">
      <div className="flex items-center gap-4 mb-6">
        {STATUS_OPTIONS.map(opt => {
          const count = leads.filter(l => l.status === opt.value).length;
          return (
            <div key={opt.value} className={`px-4 py-2 rounded-xl text-sm font-semibold ${opt.color}`}>
              {opt.label}: {count}
            </div>
          );
        })}
      </div>

      {loading ? <div className="text-center py-20 text-gray-400">جاري التحميل...</div> : leads.length === 0 ? (
        <div className="text-center py-20 text-gray-400">لا توجد رسائل بعد. ستظهر هنا عند ملء نموذج التواصل في الموقع.</div>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => (
            <div key={lead.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div
                className="flex items-center justify-between p-5 cursor-pointer hover:bg-gray-50/50 transition-colors"
                onClick={() => setExpanded(expanded === lead.id ? null : lead.id)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary/10 text-primary rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                    {lead.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-800">{lead.name}</div>
                    <div className="text-xs text-gray-400">{new Date(lead.createdAt).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={lead.status}
                    onChange={e => { e.stopPropagation(); updateStatus(lead.id, e.target.value); }}
                    onClick={e => e.stopPropagation()}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border-0 cursor-pointer ${statusColor(lead.status)}`}
                  >
                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expanded === lead.id ? "rotate-180" : ""}`} />
                </div>
              </div>

              {expanded === lead.id && (
                <div className="px-5 pb-5 pt-0 border-t border-gray-50 space-y-4">
                  <div className="grid md:grid-cols-3 gap-4 pt-4">
                    {lead.phone && (
                      <a href={`tel:${lead.phone}`} className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary">
                        <Phone className="w-4 h-4 text-primary" /><span dir="ltr">{lead.phone}</span>
                      </a>
                    )}
                    {lead.email && (
                      <a href={`mailto:${lead.email}`} className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary">
                        <Mail className="w-4 h-4 text-primary" />{lead.email}
                      </a>
                    )}
                    {lead.phone && (
                      <a href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-green-600 hover:text-green-700 font-medium">
                        <MessageCircle className="w-4 h-4" />واتساب
                      </a>
                    )}
                  </div>
                  {lead.message && (
                    <div className="bg-gray-50 p-4 rounded-xl">
                      <p className="text-sm text-gray-600 font-medium mb-1">الرسالة:</p>
                      <p className="text-sm text-gray-700 leading-relaxed">{lead.message}</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">ملاحظات داخلية</label>
                    <textarea
                      defaultValue={lead.notes}
                      onBlur={e => updateNotes(lead.id, e.target.value)}
                      placeholder="أضف ملاحظاتك هنا..."
                      rows={2}
                      className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button onClick={() => handleDelete(lead.id)} className="text-red-500 hover:text-red-700 text-sm flex items-center gap-1">
                      <Trash2 className="w-4 h-4" /> حذف
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
