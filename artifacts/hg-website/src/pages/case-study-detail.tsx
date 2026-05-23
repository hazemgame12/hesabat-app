import { Link, useParams } from "wouter";
import { ArrowLeft, ArrowRight, Building2, Target, Lightbulb, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLang } from "@/lib/language";
import { fetchCaseStudyBySlug, type CaseStudyRecord } from "@/lib/api";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import SeoHead from "@/components/seo-head";

function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;
  for (const line of lines) {
    if (line.startsWith("## ")) {
      elements.push(<h3 key={key++} className="text-xl font-bold text-foreground mt-6 mb-3">{line.slice(3)}</h3>);
    } else if (line.startsWith("- ")) {
      elements.push(
        <li key={key++} className="flex items-start gap-2 text-muted-foreground leading-relaxed my-1">
          <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />
          <span>{line.slice(2)}</span>
        </li>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={key++} className="my-1" />);
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

export default function CaseStudyDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { t, lang } = useLang();
  const ArrowBack = lang === "ar" ? ArrowRight : ArrowLeft;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: item, isLoading, isError } = useQuery<CaseStudyRecord>({
    queryKey: ["case-study", slug],
    queryFn: () => fetchCaseStudyBySlug(slug || ""),
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background font-sans" dir={t.dir}>
        <Navbar />
        <div className="pt-32 container mx-auto px-4 animate-pulse space-y-6 max-w-3xl">
          <div className="h-10 bg-gray-200 rounded w-3/4" />
          <div className="h-64 bg-gray-200 rounded-2xl" />
          <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-4 bg-gray-200 rounded w-full" />)}</div>
        </div>
        <Footer />
      </div>
    );
  }

  if (isError || !item) {
    return (
      <div className="min-h-screen bg-background font-sans" dir={t.dir}>
        <Navbar />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-4">
              {lang === "ar" ? "دراسة الحالة غير موجودة" : "Case study not found"}
            </h1>
            <Link href={`${base}/case-studies`} className="text-primary underline">
              {lang === "ar" ? "العودة لدراسات الحالة" : "Back to case studies"}
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const title = lang === "ar" ? item.titleAr : item.titleEn;
  const industry = lang === "ar" ? item.industryAr : item.industryEn;
  const summary = lang === "ar" ? item.summaryAr : item.summaryEn;
  const challenge = lang === "ar" ? item.challengeAr : item.challengeEn;
  const solution = lang === "ar" ? item.solutionAr : item.solutionEn;
  const results = lang === "ar" ? item.resultsAr : item.resultsEn;

  return (
    <div className="min-h-screen bg-background font-sans overflow-x-hidden" dir={t.dir}>
      <SeoHead title={title} description={summary} image={item.image} />
      <Navbar />

      <div className="relative h-[45vh] md:h-[55vh] w-full mt-0 pt-20">
        {item.image ? (
          <img src={item.image} alt={title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#001d56] to-primary" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#001d56]/90 via-[#001d56]/40 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 container mx-auto px-4 md:px-6 pb-10">
          {industry && (
            <span className="inline-block bg-primary text-white text-sm font-bold px-4 py-1.5 rounded-full mb-4">
              {industry}
            </span>
          )}
          <h1 className="text-3xl md:text-5xl font-extrabold text-white leading-tight max-w-3xl">{title}</h1>
          {item.clientName && (
            <div className="flex items-center gap-2 text-gray-300 text-sm mt-4">
              <Building2 className="w-4 h-4" />
              <span>{item.clientName}</span>
            </div>
          )}
        </div>
      </div>

      <section className="py-12 md:py-16">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-3xl mx-auto">
            <Link href={`${base}/case-studies`} className="inline-flex items-center gap-2 text-primary font-semibold mb-10 hover:gap-3 transition-all">
              <ArrowBack className="w-4 h-4" />
              {lang === "ar" ? "العودة لدراسات الحالة" : "Back to Case Studies"}
            </Link>

            {summary && (
              <p className="text-xl text-muted-foreground leading-relaxed mb-10 p-6 bg-primary/5 border-s-4 border-primary rounded-xl">
                {summary}
              </p>
            )}

            {challenge && (
              <div className="mb-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-600">
                    <Target className="w-6 h-6" />
                  </div>
                  <h2 className="text-2xl font-bold text-foreground">{lang === "ar" ? "التحدي" : "The Challenge"}</h2>
                </div>
                <div>{renderMarkdown(challenge)}</div>
              </div>
            )}

            {solution && (
              <div className="mb-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                    <Lightbulb className="w-6 h-6" />
                  </div>
                  <h2 className="text-2xl font-bold text-foreground">{lang === "ar" ? "الحل" : "Our Solution"}</h2>
                </div>
                <div>{renderMarkdown(solution)}</div>
              </div>
            )}

            {results && (
              <div className="mb-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-green-600">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <h2 className="text-2xl font-bold text-foreground">{lang === "ar" ? "النتائج" : "Results"}</h2>
                </div>
                <div>{renderMarkdown(results)}</div>
              </div>
            )}

            <div className="mt-16 bg-[#001d56] rounded-3xl p-8 text-white text-center">
              <h3 className="text-2xl font-bold mb-3">
                {lang === "ar" ? "هل تواجه تحدياً مشابهاً؟" : "Facing a similar challenge?"}
              </h3>
              <p className="text-gray-300 mb-6">
                {lang === "ar" ? "فريقنا من الخبراء جاهز لمساعدتك" : "Our team of experts is ready to help"}
              </p>
              <Link href={`${base}/#contact`} className="inline-block bg-primary hover:bg-primary/90 text-white px-8 py-3 rounded-xl font-bold transition-colors">
                {lang === "ar" ? "تواصل معنا" : "Contact Us"}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
