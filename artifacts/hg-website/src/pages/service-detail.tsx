import { useParams, Link } from "wouter";
import { ArrowRight, ArrowLeft, CheckCircle2, ChevronDown, Phone, MessageCircle } from "lucide-react";
import { useState } from "react";
import { useLang } from "@/lib/language";
import { getServiceBySlug } from "@/lib/services-content";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import { Button } from "@/components/ui/button";

export default function ServiceDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { lang } = useLang();
  const service = getServiceBySlug(slug);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const isRtl = lang === "ar";
  const ArrowBack = isRtl ? ArrowRight : ArrowLeft;

  if (!service) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" dir={isRtl ? "rtl" : "ltr"}>
        <Navbar />
        <p className="text-2xl font-bold text-gray-700 mt-32">
          {isRtl ? "الخدمة غير موجودة" : "Service not found"}
        </p>
        <Link href={`${base}/`}>
          <Button>{isRtl ? "العودة للرئيسية" : "Back to Home"}</Button>
        </Link>
        <Footer />
      </div>
    );
  }

  const title = isRtl ? service.titleAr : service.titleEn;
  const fullDesc = isRtl ? service.fullDescAr : service.fullDescEn;
  const features = isRtl ? service.featuresAr : service.featuresEn;
  const faq = isRtl ? service.faqAr : service.faqEn;

  return (
    <div className="min-h-screen bg-white" dir={isRtl ? "rtl" : "ltr"}>
      <Navbar />

      {/* Hero */}
      <section className="relative h-[55vh] min-h-[380px] overflow-hidden">
        <img src={service.image} alt={title} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#001d56]/70 via-[#001d56]/60 to-[#001d56]/90" />
        <div className="relative h-full flex flex-col justify-end container mx-auto px-4 md:px-6 pb-12">
          <Link href={`${base}/#services`} className="inline-flex items-center gap-2 text-white/70 hover:text-white text-sm mb-6 transition-colors w-fit">
            <ArrowBack className="w-4 h-4" />
            {isRtl ? "العودة إلى الخدمات" : "Back to Services"}
          </Link>
          <h1 className="text-3xl md:text-5xl font-bold text-white leading-tight">{title}</h1>
        </div>
      </section>

      {/* Main content */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid lg:grid-cols-3 gap-12">

            {/* Left: Description + FAQ */}
            <div className="lg:col-span-2 space-y-12">

              {/* Description */}
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">
                  {isRtl ? "نبذة عن الخدمة" : "About This Service"}
                </h2>
                {fullDesc.split("\n\n").map((para, i) => (
                  <p key={i} className="text-gray-600 text-lg leading-relaxed mb-4">{para}</p>
                ))}
              </div>

              {/* Features */}
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">
                  {isRtl ? "ماذا يشمل؟" : "What's Included?"}
                </h2>
                <div className="grid md:grid-cols-2 gap-4">
                  {features.map((f, i) => (
                    <div key={i} className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-gray-700 text-sm leading-relaxed">{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* FAQ */}
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">
                  {isRtl ? "الأسئلة الشائعة" : "Frequently Asked Questions"}
                </h2>
                <div className="space-y-3">
                  {faq.map((item, i) => (
                    <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setOpenFaq(openFaq === i ? null : i)}
                        className="w-full flex items-center justify-between p-5 text-right hover:bg-gray-50 transition-colors"
                      >
                        <span className="font-semibold text-gray-800 text-sm md:text-base">{item.q}</span>
                        <ChevronDown className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ms-3 ${openFaq === i ? "rotate-180" : ""}`} />
                      </button>
                      {openFaq === i && (
                        <div className="px-5 pb-5 text-gray-600 text-sm leading-relaxed border-t border-gray-100 pt-4">
                          {item.a}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: CTA Sidebar */}
            <div className="space-y-6">
              <div className="bg-[#001d56] text-white rounded-2xl p-7 sticky top-28">
                <h3 className="text-xl font-bold mb-3">
                  {isRtl ? "هل تحتاج هذه الخدمة؟" : "Interested in This Service?"}
                </h3>
                <p className="text-white/70 text-sm mb-6 leading-relaxed">
                  {isRtl
                    ? "تواصل معنا الآن للحصول على استشارة مجانية وعرض سعر مخصص لشركتك."
                    : "Contact us now for a free consultation and a custom quote for your company."}
                </p>
                <div className="space-y-3">
                  <a href="tel:01025812666" className="flex items-center justify-center gap-2 w-full bg-white text-[#001d56] py-3 rounded-xl font-bold text-sm hover:bg-gray-100 transition-colors">
                    <Phone className="w-4 h-4" />
                    01025812666
                  </a>
                  <a href="https://wa.me/201025812666" target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full bg-[#25D366] text-white py-3 rounded-xl font-bold text-sm hover:bg-[#128C7E] transition-colors">
                    <MessageCircle className="w-4 h-4" />
                    {isRtl ? "تواصل عبر واتساب" : "Chat on WhatsApp"}
                  </a>
                  <Link href={`${base}/#contact`}
                    className="flex items-center justify-center gap-2 w-full border border-white/30 text-white py-3 rounded-xl font-bold text-sm hover:bg-white/10 transition-colors">
                    {isRtl ? "أرسل رسالة" : "Send a Message"}
                  </Link>
                </div>
              </div>

              {/* Other services */}
              <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                <h4 className="font-bold text-gray-800 mb-4 text-sm">
                  {isRtl ? "خدمات أخرى" : "Other Services"}
                </h4>
                <div className="space-y-2">
                  {[
                    { slug: "financial-auditing", ar: "تدقيق القوائم المالية", en: "Financial Auditing" },
                    { slug: "bookkeeping", ar: "امساك الدفاتر", en: "Bookkeeping" },
                    { slug: "tax-services", ar: "خدمات الضرائب", en: "Tax Services" },
                    { slug: "feasibility-studies", ar: "دراسات الجدوى", en: "Feasibility Studies" },
                    { slug: "company-formation", ar: "تأسيس الشركات", en: "Company Formation" },
                    { slug: "technology-services", ar: "خدمات التقنية", en: "Technology Services" },
                  ].filter(s => s.slug !== slug).map(s => (
                    <Link key={s.slug} href={`${base}/services/${s.slug}`}
                      className="block px-4 py-2.5 rounded-lg text-sm text-gray-600 hover:text-primary hover:bg-primary/5 transition-colors">
                      {isRtl ? s.ar : s.en}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
