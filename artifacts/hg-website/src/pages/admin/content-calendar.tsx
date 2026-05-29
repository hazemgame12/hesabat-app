import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Plus, FileText, Facebook, Instagram, Linkedin, Clock, CheckCircle2, FileEdit } from "lucide-react";
import { Button } from "@/components/ui/button";
import AdminLayout from "@/components/admin-layout";
import {
  adminFetchArticles, adminFetchSocialPosts,
  clearAdminToken, getAdminToken,
  type ArticleRecord, type SocialPostRecord, type SocialPlatform,
} from "@/lib/api";

const platformIcon: Record<SocialPlatform, typeof Facebook> = {
  facebook: Facebook,
  instagram: Instagram,
  linkedin: Linkedin,
};

interface TimelineItem {
  kind: "article" | "social";
  id: number;
  title: string;
  status: string;
  when: string | null;
  platform?: SocialPlatform;
}

function statusBadge(status: string) {
  switch (status) {
    case "scheduled":
      return { label: "مجدول", cls: "bg-amber-100 text-amber-700", Icon: Clock };
    case "published":
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

export default function ContentCalendar() {
  const [, navigate] = useLocation();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const token = getAdminToken();
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "scheduled" | "published" | "draft">("all");

  useEffect(() => {
    if (!token) { navigate(`${base}/admin`); return; }
    Promise.all([adminFetchArticles(token), adminFetchSocialPosts(token)])
      .then(([articles, posts]) => {
        const articleItems: TimelineItem[] = articles.map((a: ArticleRecord) => ({
          kind: "article",
          id: a.id,
          title: a.titleAr || a.titleEn,
          status: a.status || (a.published ? "published" : "draft"),
          when: a.scheduledAt ?? a.createdAt,
        }));
        const socialItems: TimelineItem[] = posts.map((p: SocialPostRecord) => ({
          kind: "social",
          id: p.id,
          title: (p.captionAr || p.captionEn).slice(0, 80),
          status: p.status,
          when: p.scheduledAt ?? p.releasedAt ?? p.createdAt,
          platform: p.platform,
        }));
        const all = [...articleItems, ...socialItems].sort((a, b) => {
          const ta = a.when ? new Date(a.when).getTime() : 0;
          const tb = b.when ? new Date(b.when).getTime() : 0;
          return tb - ta;
        });
        setItems(all);
      })
      .catch(() => { clearAdminToken(); navigate(`${base}/admin`); })
      .finally(() => setLoading(false));
  }, []);

  const norm = (s: string) => (s === "released" ? "published" : s);
  const filtered = filter === "all" ? items : items.filter((i) => norm(i.status) === filter);

  const counts = {
    scheduled: items.filter((i) => norm(i.status) === "scheduled").length,
    published: items.filter((i) => norm(i.status) === "published").length,
    draft: items.filter((i) => norm(i.status) === "draft").length,
  };

  return (
    <AdminLayout title="تقويم المحتوى">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {([
            { v: "all", l: `الكل (${items.length})` },
            { v: "scheduled", l: `مجدول (${counts.scheduled})` },
            { v: "published", l: `منشور (${counts.published})` },
            { v: "draft", l: `مسودة (${counts.draft})` },
          ] as const).map((f) => (
            <button
              key={f.v}
              onClick={() => setFilter(f.v)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                filter === f.v ? "bg-primary text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f.l}
            </button>
          ))}
        </div>
        <Link href={`${base}/admin/studio`}>
          <Button className="gap-2 h-10"><Plus className="w-4 h-4" />محتوى جديد</Button>
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg mb-4">لا يوجد محتوى بعد</p>
          <Link href={`${base}/admin/studio`}><Button>ابدأ من استوديو المحتوى</Button></Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
          {filtered.map((item) => {
            const badge = statusBadge(item.status);
            const Icon = item.kind === "social" && item.platform ? platformIcon[item.platform] : FileText;
            return (
              <div key={`${item.kind}-${item.id}`} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/50 transition-colors">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${item.kind === "article" ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-600"}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-800 line-clamp-1">{item.title || "بدون عنوان"}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {item.kind === "article" ? "مقال" : "منشور سوشيال"} · {fmt(item.when)}
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${badge.cls}`}>
                  <badge.Icon className="w-3 h-3" />
                  {badge.label}
                </span>
                {item.kind === "article" && (
                  <Link href={`${base}/admin/articles/${item.id}/edit`}>
                    <button className="text-xs text-primary font-semibold hover:underline">تعديل</button>
                  </Link>
                )}
                {item.kind === "social" && (
                  <Link href={`${base}/admin/social-posts`}>
                    <button className="text-xs text-primary font-semibold hover:underline">إدارة</button>
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}
