import React from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Calendar, Clock, Tag, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SEOHead } from "@/pages/landing";

async function fetchArticles() {
  const res = await fetch(`/api/articles`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch articles");
  return res.json();
}

export function ArticlesPage() {
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const lang = i18n.language as "ar" | "en";

  const { data: articles, isLoading } = useQuery({
    queryKey: ["articles"],
    queryFn: fetchArticles,
  });

  return (
    <div className="min-h-screen bg-background" dir={lang === "en" ? "ltr" : "rtl"}>
      <SEOHead />

      {/* Header */}
      <nav className="sticky top-0 z-50 border-b bg-white/90 backdrop-blur-md shadow-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setLocation("/")}>
            <div className="w-10 h-10 rounded-xl bg-[#1e3a5f] flex items-center justify-center text-white font-bold text-xl shadow-md">
              ح
            </div>
            <span className="font-bold text-xl text-[#1e3a5f]">حسابات</span>
          </div>
          <Button variant="ghost" onClick={() => setLocation("/")}>
            <ArrowLeft className="w-4 h-4 me-2" />
            {t("articles.backToArticles")}
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-16 bg-[#1e3a5f] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#c9a96e]/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#c9a96e]/10 rounded-full translate-y-1/2 -translate-x-1/2" />
        <div className="container mx-auto px-4 relative z-10 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl md:text-4xl font-bold text-white mb-3"
          >
            {t("articles.pageTitle")}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-white/70 max-w-2xl mx-auto"
          >
            {t("articles.pageSubtitle")}
          </motion.p>
        </div>
      </section>

      {/* Articles Grid */}
      <section className="py-12 bg-[#f8f9fb]">
        <div className="container mx-auto px-4">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">{t("common.loading")}</div>
          ) : !articles || articles.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">{t("articles.noArticles")}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {articles.map((article: any, i: number) => (
                <motion.div
                  key={article.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  whileHover={{ y: -5 }}
                  className="bg-white rounded-2xl overflow-hidden border shadow-sm hover:shadow-md transition-all cursor-pointer group"
                  onClick={() => setLocation(`/article/${article.slug}`)}
                >
                  <div className="h-48 bg-muted overflow-hidden">
                    {article.image ? (
                      <img
                        src={article.image}
                        alt={lang === "ar" ? article.titleAr : article.titleEn}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[#1e3a5f]/5">
                        <ImageIcon className="w-10 h-10 text-[#1e3a5f]/30" />
                      </div>
                    )}
                  </div>
                  <div className="p-5 space-y-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {article.categoryAr && (
                        <Badge variant="outline" className="text-[#1e3a5f] border-[#1e3a5f]/20">
                          <Tag className="w-3 h-3 me-1" />
                          {lang === "ar" ? article.categoryAr : article.categoryEn}
                        </Badge>
                      )}
                    </div>
                    <h3 className="font-bold text-lg text-[#1e3a5f] leading-snug group-hover:text-[#c9a96e] transition-colors">
                      {lang === "ar" ? article.titleAr : article.titleEn}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {lang === "ar" ? article.excerptAr : article.excerptEn}
                    </p>
                    <div className="flex items-center gap-3 pt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {article.date}
                      </span>
                      {(lang === "ar" ? article.readTimeAr : article.readTimeEn) && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {lang === "ar" ? article.readTimeAr : article.readTimeEn}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
