import { Link } from "wouter";
import { Clock, ArrowLeft, ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLang } from "@/lib/language";
import { fetchArticles, type ArticleRecord } from "@/lib/api";
import { formatDate } from "@/lib/articles";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";

export default function Articles() {
  const { t, lang } = useLang();
  const ArrowIcon = lang === "ar" ? ArrowLeft : ArrowRight;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: articles = [], isLoading, isError } = useQuery<ArticleRecord[]>({
    queryKey: ["articles"],
    queryFn: fetchArticles,
  });

  return (
    <div className="min-h-screen bg-background font-sans overflow-x-hidden" dir={t.dir}>
      <Navbar />

      <section className="bg-[#001d56] pt-32 pb-16 text-white">
        <div className="container mx-auto px-4 md:px-6 text-center">
          <div className="inline-block px-4 py-1.5 bg-white/10 text-white/80 rounded-full font-semibold text-sm mb-4">
            {lang === "ar" ? "المدونة" : "Blog"}
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4">
            {lang === "ar" ? "المقالات والأخبار" : "Articles & Insights"}
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            {lang === "ar"
              ? "مقالات متخصصة في المجال المالي والمحاسبي لمساعدتك في اتخاذ القرارات الصحيحة"
              : "Specialized articles in the financial and accounting field to help you make the right decisions"}
          </p>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4 md:px-6">
          {isLoading && (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="rounded-2xl bg-card border border-gray-100 overflow-hidden animate-pulse">
                  <div className="h-52 bg-gray-200" />
                  <div className="p-6 space-y-3">
                    <div className="h-3 bg-gray-200 rounded w-1/3" />
                    <div className="h-5 bg-gray-200 rounded w-full" />
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {isError && (
            <div className="text-center py-20 text-red-500">
              {lang === "ar" ? "حدث خطأ أثناء تحميل المقالات" : "Failed to load articles"}
            </div>
          )}

          {!isLoading && !isError && articles.length === 0 && (
            <div className="text-center py-20 text-muted-foreground">
              {lang === "ar" ? "لا توجد مقالات حتى الآن" : "No articles yet"}
            </div>
          )}

          {!isLoading && !isError && articles.length > 0 && (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {articles.map((article) => (
                <Link
                  key={article.id}
                  href={`${base}/articles/${article.slug}`}
                  className="group block rounded-2xl overflow-hidden shadow-md hover:shadow-2xl transition-all duration-300 bg-card border border-gray-100 dark:border-gray-800"
                >
                  <div className="relative h-52 overflow-hidden">
                    <img
                      src={article.image}
                      alt={lang === "ar" ? article.titleAr : article.titleEn}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#001d56]/60 to-transparent" />
                    <span className="absolute top-4 start-4 bg-primary text-white text-xs font-bold px-3 py-1 rounded-full">
                      {lang === "ar" ? article.categoryAr : article.categoryEn}
                    </span>
                  </div>
                  <div className="p-6">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {lang === "ar" ? article.readTimeAr : article.readTimeEn}
                      </span>
                      <span>{formatDate(article.date, lang)}</span>
                    </div>
                    <h2 className="text-lg font-bold text-foreground mb-3 leading-snug group-hover:text-primary transition-colors line-clamp-2">
                      {lang === "ar" ? article.titleAr : article.titleEn}
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 mb-4">
                      {lang === "ar" ? article.excerptAr : article.excerptEn}
                    </p>
                    <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                      <span>{lang === "ar" ? "اقرأ المزيد" : "Read More"}</span>
                      <ArrowIcon className="w-4 h-4 group-hover:translate-x-1 rtl:group-hover:-translate-x-1 transition-transform" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
