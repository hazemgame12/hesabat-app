import React from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Calendar, Clock, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SEOHead } from "@/pages/landing";

async function fetchArticleBySlug(slug: string) {
  const res = await fetch(`/api/articles/${slug}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch article");
  return res.json();
}

export function ArticleDetailPage() {
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const params = useParams();
  const slug = params.slug ?? "";
  const lang = i18n.language as "ar" | "en";

  const { data: article, isLoading } = useQuery({
    queryKey: ["article", slug],
    queryFn: () => fetchArticleBySlug(slug),
    enabled: !!slug,
  });

  return (
    <div className="min-h-screen bg-background" dir={lang === "en" ? "ltr" : "rtl"}>
      <SEOHead />

      <nav className="sticky top-0 z-50 border-b bg-white/90 backdrop-blur-md shadow-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setLocation("/")}>
            <div className="w-10 h-10 rounded-xl bg-[#1e3a5f] flex items-center justify-center text-white font-bold text-xl shadow-md">
              {t("common.appInitial")}
            </div>
            <span className="font-bold text-xl text-[#1e3a5f]">{t("common.appName")}</span>
          </div>
          <Button variant="ghost" onClick={() => setLocation("/articles")}>
            <ArrowLeft className="w-4 h-4 me-2" />
            {t("articles.backToArticles")}
          </Button>
        </div>
      </nav>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t("common.loading")}</div>
      ) : !article ? (
        <div className="text-center py-12 text-muted-foreground">{t("articles.noArticles")}</div>
      ) : (
        <>
          <section className="py-16 bg-[#1e3a5f] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#c9a96e]/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#c9a96e]/10 rounded-full translate-y-1/2 -translate-x-1/2" />
            <div className="container mx-auto px-4 relative z-10 text-center">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                {article.categoryAr && (
                  <Badge variant="outline" className="text-white border-white/30 mb-4">
                    <Tag className="w-3 h-3 me-1" />
                    {lang === "ar" ? article.categoryAr : article.categoryEn}
                  </Badge>
                )}
                <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
                  {lang === "ar" ? article.titleAr : article.titleEn}
                </h1>
                <div className="flex items-center justify-center gap-3 text-white/70 text-sm">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {article.date}
                  </span>
                  {(lang === "ar" ? article.readTimeAr : article.readTimeEn) && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {lang === "ar" ? article.readTimeAr : article.readTimeEn}
                    </span>
                  )}
                </div>
              </motion.div>
            </div>
          </section>

          <section className="py-8 bg-[#f8f9fb]">
            <div className="container mx-auto px-4 max-w-3xl">
              {article.image && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-8 rounded-2xl overflow-hidden border shadow-sm"
                >
                  <img
                    src={article.image}
                    alt={lang === "ar" ? article.titleAr : article.titleEn}
                    className="w-full h-64 md:h-80 object-cover"
                  />
                </motion.div>
              )}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="prose prose-lg max-w-none"
              >
                <div className="text-muted-foreground text-lg mb-8 leading-relaxed font-medium">
                  {lang === "ar" ? article.excerptAr : article.excerptEn}
                </div>
                <div className="text-foreground leading-relaxed whitespace-pre-wrap">
                  {lang === "ar" ? article.contentAr : article.contentEn}
                </div>
              </motion.div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
