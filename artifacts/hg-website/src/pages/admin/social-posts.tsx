import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Facebook, Instagram, Linkedin, Copy, Check, Trash2, Send, Clock, CheckCircle2, FileEdit, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import AdminLayout from "@/components/admin-layout";
import {
  adminFetchSocialPosts, adminDeleteSocialPost, adminReleaseSocialPost,
  clearAdminToken, getAdminToken,
  type SocialPostRecord, type SocialPlatform,
} from "@/lib/api";

const platformMeta: Record<SocialPlatform, { icon: typeof Facebook; label: string; color: string }> = {
  facebook: { icon: Facebook, label: "فيسبوك", color: "text-blue-600" },
  instagram: { icon: Instagram, label: "إنستجرام", color: "text-pink-600" },
  linkedin: { icon: Linkedin, label: "لينكدإن", color: "text-sky-700" },
};

function statusBadge(status: string) {
  switch (status) {
    case "scheduled":
      return { label: "مجدول", cls: "bg-amber-100 text-amber-700", Icon: Clock };
    case "released":
      return { label: "منشور", cls: "bg-green-100 text-green-700", Icon: CheckCircle2 };
    default:
      return { label: "مسودة", cls: "bg-gray-100 text-gray-500", Icon: FileEdit };
  }
}

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("ar-EG", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminSocialPosts() {
  const [, navigate] = useLocation();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const token = getAdminToken();
  const [posts, setPosts] = useState<SocialPostRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  const load = () => {
    if (!token) { navigate(`${base}/admin`); return; }
    adminFetchSocialPosts(token)
      .then(setPosts)
      .catch(() => { clearAdminToken(); navigate(`${base}/admin`); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(""), 1500);
    } catch { /* ignore */ }
  };

  const handleRelease = async (id: number) => {
    if (!token) return;
    setBusy(id);
    try {
      const updated = await adminReleaseSocialPost(token, id);
      setPosts((cur) => cur.map((p) => (p.id === id ? updated : p)));
    } catch { /* ignore */ } finally { setBusy(null); }
  };

  const handleDelete = async (id: number) => {
    if (!token || !confirm("حذف هذا المنشور؟")) return;
    setBusy(id);
    try {
      await adminDeleteSocialPost(token, id);
      setPosts((cur) => cur.filter((p) => p.id !== id));
    } catch { /* ignore */ } finally { setBusy(null); }
  };

  return (
    <AdminLayout title="منشورات السوشيال ميديا">
      <div className="flex items-center justify-between mb-6">
        <p className="text-gray-500 text-sm">انسخ النصوص الجاهزة وانشرها على منصاتك، أو انشرها فوراً في قسم آخر الأخبار.</p>
        <Link href={`${base}/admin/studio`}>
          <Button className="gap-2 h-10"><Plus className="w-4 h-4" />محتوى جديد</Button>
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">جاري التحميل...</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg mb-4">لا توجد منشورات بعد</p>
          <Link href={`${base}/admin/studio`}><Button>ابدأ من استوديو المحتوى</Button></Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {posts.map((p) => {
            const meta = platformMeta[p.platform];
            const badge = statusBadge(p.status);
            return (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 font-semibold text-gray-800">
                    <meta.icon className={`w-5 h-5 ${meta.color}`} />
                    {meta.label}
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${badge.cls} mr-2`}>
                      <badge.Icon className="w-3 h-3" />
                      {badge.label}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {p.status === "scheduled" ? `يُنشر: ${fmt(p.scheduledAt)}` : p.status === "released" ? `نُشر: ${fmt(p.releasedAt)}` : "مسودة"}
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-3 mb-3">
                  <div className="relative bg-gray-50 rounded-xl p-3 pl-10 text-sm text-gray-700 whitespace-pre-wrap min-h-[80px]" dir="rtl">
                    {p.captionAr || <span className="text-gray-300">لا يوجد نص عربي</span>}
                    {p.captionAr && (
                      <button onClick={() => copy(`${p.id}-ar`, p.captionAr)} className="absolute top-2 left-2 p-1.5 bg-white border border-gray-200 rounded-lg text-gray-500 hover:text-primary">
                        {copied === `${p.id}-ar` ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                  <div className="relative bg-gray-50 rounded-xl p-3 pr-10 text-sm text-gray-700 whitespace-pre-wrap min-h-[80px]" dir="ltr">
                    {p.captionEn || <span className="text-gray-300">No English caption</span>}
                    {p.captionEn && (
                      <button onClick={() => copy(`${p.id}-en`, p.captionEn)} className="absolute top-2 right-2 p-1.5 bg-white border border-gray-200 rounded-lg text-gray-500 hover:text-primary">
                        {copied === `${p.id}-en` ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {p.status !== "released" && (
                    <Button size="sm" onClick={() => handleRelease(p.id)} disabled={busy === p.id} className="gap-1.5 h-9">
                      <Send className="w-4 h-4" />نشر الآن
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => handleDelete(p.id)} disabled={busy === p.id} className="gap-1.5 h-9 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200">
                    <Trash2 className="w-4 h-4" />حذف
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}
