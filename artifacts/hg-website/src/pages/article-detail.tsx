import { Link, useParams } from "wouter";
import { Clock, ArrowLeft, ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLang } from "@/lib/language";
import { fetchArticleBySlug, fetchArticles, type ArticleRecord } from "@/lib/api";
import { formatDate } from "@/lib/articles";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";

function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;
  for (const line of lines) {
    if (line.startsWith("## ")) {
      elements.push(<h2 key={key++} className="text-2xl font-bold text-foreground mt-8 mb-4">{line.slice(3)}</h2>);
    } else if (line.startsWith("### ")) {
      elements.push(<h3 key={key++} className="text-xl font-bold text-foreground mt-6 mb-3">{line.slice(4)}</h3>);
    } else if (line.startsWith("- ")) {
      elements.push(
        <li key={key++} className="flex items-start gap-2 text-muted-foreground leading-relaxed my-1">
          <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />
          <span>{line.slice(2)}</span>
        </li>
      );
    } else if (line.match(/^\d+\. /)) {
      elements.push(<li key={key++} className="text-muted-foreground leading-relaxed my-1 ms-4 list-decimal">{line.replace(/^\d+\. /, "")}</li>);
    } else if (line.trim() === "") {
      elements.push(<div key={key++} className="my-2" />);
    } else {
      const parts = line.split(/\*\*(.*?)\*\*/g);
      const formatted = parts.map((part, i) =>
        i % 2 === 1 ? <strong key={i} className="font-bold text-foreground">{part}</strong> : part
      );
      elements.push(<p key={key++} className="text-muted-foreground leading-relaxed my-2">{formatted}</p>);
    }
  }
  return elements;
}

export default function ArticleDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { t, lang } = useLang();
  const ArrowBack = lang === "ar" ? ArrowRight : ArrowLeft;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: article, isLoading, isError } = useQuery<ArticleRecord>({
    queryKey: ["article", slug],
    queryFn: () => fetchArticleBySlug(slug || ""),
    enabled: !!slug,
  });

  const { data: allArticles = [] } = useQuery<ArticleRecord[]>({
    queryKey: ["articles"],
    queryFn: fetchArticles,
  });

  const related = allArticles.filter((a) => a.slug !== slug).slice(0, 3);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background font-sans" dir={t.dir}>
        <Navbar />
        <div className="pt-32 container mx-auto px-4 animate-pulse space-y-6 max-w-3xl">
          <div className="h-10 bg-gray-200 rounded w-3/4" />
          <div className="h-64 bg-gray-200 rounded-2xl" />
          <div className="space-y-3">
            {[1,2,3,4].map(i => <div key={i} className="h-4 bg-gray-200 rounded w-full" />)}
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (isError || !article) {
    return (
      <div className="min-h-screen bg-background font-sans" dir={t.dir}>
        <Navbar />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-4">
              {lang === "ar" ? "المقال غير موجود" : "Article not found"}
            </h1>
            <Link href={`${base}/articles`} className="text-primary underline">
              {lang === "ar" ? "العودة للمقالات" : "Back to articles"}
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const title = lang === "ar" ? article.titleAr : article.titleEn;
  const excerpt = lang === "ar" ? article.excerptAr : article.excerptEn;
  const content = lang === "ar" ? article.contentAr : article.contentEn;
  const category = lang === "ar" ? article.categoryAr : article.categoryEn;
  const readTime = lang === "ar" ? article.readTimeAr : article.readTimeEn;

  return (
    <div className="min-h-screen bg-background font-sans overflow-x-hidden" dir={t.dir}>
      <Navbar />

      <div className="relative h-[45vh] md:h-[55vh] w-full mt-0 pt-20">
        <img src={article.image} alt={title} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#001d56]/90 via-[#001d56]/40 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 container mx-auto px-4 md:px-6 pb-10">
          <span className="inline-block bg-primary text-white text-sm font-bold px-4 py-1.5 rounded-full mb-4">{category}</span>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white leading-tight max-w-3xl">{title}</h1>
          <div className="flex items-center gap-6 text-gray-300 text-sm mt-4">
            <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />{readTime}</span>
            <span>{formatDate(article.date, lang)}</span>
          </div>
        </div>
      </div>

      <section className="py-12 md:py-16">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-3xl mx-auto">
            <Link href={`${base}/articles`} className="inline-flex items-center gap-2 text-primary font-semibold mb-10 hover:gap-3 transition-all">
              <ArrowBack className="w-4 h-4" />
              {lang === "ar" ? "العودة إلى المقالات" : "Back to Articles"}
            </Link>
            <p className="text-xl text-muted-foreground leading-relaxed mb-10 p-6 bg-primary/5 border-s-4 border-primary rounded-xl">{excerpt}</p>
            <div>{renderMarkdown(content)}</div>
            <div className="mt-16 bg-[#001d56] rounded-3xl p-8 text-white text-center">
              <h3 className="text-2xl font-bold mb-3">{lang === "ar" ? "هل تحتاج مساعدة متخصصة؟" : "Need Expert Help?"}</h3>
              <p className="text-gray-300 mb-6">
                {lang === "ar" ? "فريقنا من الخبراء جاهز للإجابة على استفساراتك" : "Our team of experts is ready to answer your questions"}
              </p>
              <Link href={`${base}/`} className="inline-block bg-primary hover:bg-primary/90 text-white px-8 py-3 rounded-xl font-bold transition-colors">
                {lang === "ar" ? "تواصل معنا" : "Contact Us"}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="py-12 bg-gray-50 dark:bg-card/50">
          <div className="container mx-auto px-4 md:px-6">
            <h2 className="text-2xl font-bold text-foreground mb-8">{lang === "ar" ? "مقالات ذات صلة" : "Related Articles"}</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {related.map((rel) => (
                <Link key={rel.id} href={`${base}/articles/${rel.slug}`} className="group block rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all bg-white dark:bg-card border border-gray-100 dark:border-gray-800">
                  <div className="h-40 overflow-hidden">
                    <img src={rel.image} alt={lang === "ar" ? rel.titleAr : rel.titleEn} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                  <div className="p-5">
                    <span className="text-xs text-primary font-semibold">{lang === "ar" ? rel.categoryAr : rel.categoryEn}</span>
                    <h3 className="text-base font-bold text-foreground mt-1 group-hover:text-primary transition-colors line-clamp-2">
                      {lang === "ar" ? rel.titleAr : rel.titleEn}
                    </h3>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <Footer />
    </div>
  );
}
