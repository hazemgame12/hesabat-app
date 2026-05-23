import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Plus, Pencil, Trash2, Eye, EyeOff, LogOut, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  adminFetchArticles,
  adminDeleteArticle,
  adminUpdateArticle,
  clearAdminToken,
  getAdminToken,
  type ArticleRecord,
} from "@/lib/api";

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
}

export default function AdminArticles() {
  const [, navigate] = useLocation();
  const [articles, setArticles] = useState<ArticleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const token = getAdminToken();

  useEffect(() => {
    if (!token) { navigate(`${base}/admin`); return; }
    adminFetchArticles(token)
      .then(setArticles)
      .catch(() => { clearAdminToken(); navigate(`${base}/admin`); })
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: number, titleAr: string) => {
    if (!token) return;
    if (!confirm(`هل تريد حذف المقال: "${titleAr}"؟`)) return;
    await adminDeleteArticle(token, id);
    setArticles((a) => a.filter((x) => x.id !== id));
  };

  const handleToggle = async (article: ArticleRecord) => {
    if (!token) return;
    const updated = await adminUpdateArticle(token, article.id, { published: !article.published });
    setArticles((a) => a.map((x) => (x.id === article.id ? updated : x)));
  };

  const handleLogout = () => {
    clearAdminToken();
    navigate(`${base}/admin`);
  };

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <header className="bg-[#001d56] text-white px-6 py-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-bold text-sm">HG</div>
          <h1 className="text-xl font-bold">لوحة التحكم</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`${base}/articles`} className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm transition-colors">
            <Globe className="w-4 h-4" />
            عرض الموقع
          </Link>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm transition-colors">
            <LogOut className="w-4 h-4" />
            خروج
          </button>
        </div>
      </header>

      <main className="container mx-auto px-4 md:px-6 py-8">
        {/* Title bar */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">إدارة المقالات</h2>
            <p className="text-gray-500 text-sm mt-1">{articles.length} مقال في قاعدة البيانات</p>
          </div>
          <Link href={`${base}/admin/articles/new`}>
            <Button className="gap-2 h-11">
              <Plus className="w-4 h-4" />
              مقال جديد
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">جاري التحميل...</div>
        ) : error ? (
          <div className="text-center py-20 text-red-500">{error}</div>
        ) : articles.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg mb-4">لا توجد مقالات بعد</p>
            <Link href={`${base}/admin/articles/new`}>
              <Button>أضف أول مقال</Button>
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-right py-4 px-6 font-semibold text-gray-600">العنوان</th>
                  <th className="text-right py-4 px-4 font-semibold text-gray-600 hidden md:table-cell">التصنيف</th>
                  <th className="text-right py-4 px-4 font-semibold text-gray-600 hidden lg:table-cell">التاريخ</th>
                  <th className="text-center py-4 px-4 font-semibold text-gray-600">الحالة</th>
                  <th className="text-center py-4 px-6 font-semibold text-gray-600">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {articles.map((article) => (
                  <tr key={article.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 px-6">
                      <div className="font-semibold text-gray-800 line-clamp-1">{article.titleAr}</div>
                      <div className="text-gray-400 text-xs mt-0.5 line-clamp-1">{article.titleEn}</div>
                    </td>
                    <td className="py-4 px-4 hidden md:table-cell">
                      <span className="bg-primary/10 text-primary text-xs font-semibold px-2.5 py-1 rounded-full">
                        {article.categoryAr}
                      </span>
                    </td>
                    <td className="py-4 px-4 hidden lg:table-cell text-gray-500">
                      {formatDate(article.date)}
                    </td>
                    <td className="py-4 px-4 text-center">
                      <button
                        onClick={() => handleToggle(article)}
                        className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                          article.published
                            ? "bg-green-100 text-green-700 hover:bg-green-200"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                      >
                        {article.published ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        {article.published ? "منشور" : "مخفي"}
                      </button>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-center gap-2">
                        <Link href={`${base}/admin/articles/${article.id}/edit`}>
                          <button className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            <Pencil className="w-4 h-4" />
                          </button>
                        </Link>
                        <button
                          onClick={() => handleDelete(article.id, article.titleAr)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
