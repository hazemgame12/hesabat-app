import { Link } from "wouter";
import { ArrowLeft, ArrowRight, Briefcase } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLang } from "@/lib/language";
import { fetchCaseStudies, type CaseStudyRecord } from "@/lib/api";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import SeoHead from "@/components/seo-head";

export default function CaseStudies() {
  const { t, lang } = useLang();
  const ArrowIcon = lang === "ar" ? ArrowLeft : ArrowRight;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: items = [], isLoading } = useQuery<CaseStudyRecord[]>({
    queryKey: ["case-studies"],
    queryFn: fetchCaseStudies,
  });

  return (
    <div className="min-h-screen bg-background font-sans overflow-x-hidden" dir={t.dir}>
      <SeoHead
        title={lang === "ar" ? "دراسات الحالة" : "Case Studies"}
        description={lang === "ar" ? "نماذج من نجاحات عملائنا في القطاعات المختلفة" : "Success stories from our clients across industries"}
      />
      <Navbar />

      <section className="bg-[#001d56] pt-32 pb-16 text-white">
        <div className="container mx-auto px-4 md:px-6 text-center">
          <div className="inline-block px-4 py-1.5 bg-white/10 text-white/80 rounded-full font-semibold text-sm mb-4">
            {lang === "ar" ? "إنجازاتنا" : "Our Work"}
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4">
            {lang === "ar" ? "دراسات الحالة" : "Case Studies"}
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            {lang === "ar"
              ? "نماذج حقيقية من المشاريع التي قمنا بها مع عملائنا في القطاعات المختلفة"
              : "Real examples of projects we delivered for clients across various industries"}
          </p>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4 md:px-6">
          {isLoading && (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3].map((i) => (
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

          {!isLoading && items.length === 0 && (
            <div className="text-center py-20 text-muted-foreground">
              <Briefcase className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p>{lang === "ar" ? "قريباً..." : "Coming soon..."}</p>
            </div>
          )}

          {!isLoading && items.length > 0 && (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {items.map((item) => (
                <Link
                  key={item.id}
                  href={`${base}/case-studies/${item.slug}`}
                  className="group block rounded-2xl overflow-hidden shadow-md hover:shadow-2xl transition-all duration-300 bg-card border border-gray-100 dark:border-gray-800"
                >
                  <div className="relative h-52 overflow-hidden bg-gradient-to-br from-[#001d56] to-[#0a3a8e]">
                    {item.image && (
                      <img
                        src={item.image}
                        alt={lang === "ar" ? item.titleAr : item.titleEn}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#001d56]/60 to-transparent" />
                    {(lang === "ar" ? item.industryAr : item.industryEn) && (
                      <span className="absolute top-4 start-4 bg-primary text-white text-xs font-bold px-3 py-1 rounded-full">
                        {lang === "ar" ? item.industryAr : item.industryEn}
                      </span>
                    )}
                  </div>
                  <div className="p-6">
                    {item.clientName && <p className="text-xs text-muted-foreground mb-2">{item.clientName}</p>}
                    <h2 className="text-lg font-bold text-foreground mb-3 leading-snug group-hover:text-primary transition-colors line-clamp-2">
                      {lang === "ar" ? item.titleAr : item.titleEn}
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 mb-4">
                      {lang === "ar" ? item.summaryAr : item.summaryEn}
                    </p>
                    <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                      <span>{lang === "ar" ? "اقرأ التفاصيل" : "Read details"}</span>
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
