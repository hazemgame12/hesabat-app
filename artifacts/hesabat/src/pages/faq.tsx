import React from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { ChevronDown, ChevronUp, HelpCircle, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

const FAQS = [
  {
    q: "هل يمكنني استخدام حسابات مجاناً؟",
    a: "نعم! نقدم 14 يوم تجربة مجانية كاملة بدون أي بطاقة ائتمان. تستطيع استخدام كل المميزات خلال فترة التجربة. بعد انتهاء التجربة، تستطيع اختيار الباقة المناسبة لك أو الاستمرار في الباقة المجانية مع مميزات محدودة.",
  },
  {
    q: "هل أحتاج خبرة محاسبية لاستخدام حسابات؟",
    a: "لا. حسابات مصمم خصيصاً ليكون سهل الاستخدام حتى لو لم تكن لديك خبرة محاسبية. التصميم بسيط والخطوات واضحة. بالإضافة، فريق الدعم المحاسبي لدينا جاهز لمساعدتك في أي سؤال.",
  },
  {
    q: "كيف تعمل سياسة الدفع؟",
    a: "تستطيع الدفع بشكل شهري أو ربع سنوي أو سنوي. نقدم خصم 20% عند الدفع السنوي. ندعم عدة طرق دفع: بطاقات الائتمان، فودافون كاش، إنستا باي، وتحويل بنكي. الفواتير تُرسل آلياً لبريدك الإلكتروني.",
  },
  {
    q: "هل بياناتي آمنة؟",
    a: "نعم. نستخدم تشفير 256-bit SSL على كل الاتصالات. البيانات تُخزن على خوادم سحابية موثوقة مع نسخ احتياطي يومي. نتبع معايير أمان الصناعة المالية العالمية.",
  },
  {
    q: "هل تستطيع نقل بياناتي من برنامج آخر؟",
    a: "نعم. نقدم خدمة نقل البيانات مجاناً من أي برنامج محاسبة أو Excel. فريقنا يتولى عملية النقل بالكامل. ما عليك إلا تزويدنا بملفات البيانات وسنقوم بالباقي.",
  },
  {
    q: "هل تستطيع طلب ميزة جديدة؟",
    a: "بالتأكيد. نحن نستمع لعملائنا ونضيف ميزات جديدة كل شهر. إذا كنت بحاجة ميزة خاصة، تواصل معنا وسننظر في إضافتها في الإصدارات القادمة.",
  },
  {
    q: "هل هناك دعم عربي؟",
    a: "نعم. الواجهة بالكامل بالعربية مع إمكانية التبديل للإنجليزية. فريق الدعم يتحدث العربية ومتاح 24/7 عبر الشات والواتساب والبريد الإلكتروني.",
  },
  {
    q: "هل يمكنني إلغاء الاشتراك في أي وقت؟",
    a: "نعم. تستطيع إلغاء الاشتراك في أي وقت بدون أي رسوم إضافية. بياناتك تبقى متاحة لك للتصدير حتى بعد الإلغاء.",
  },
  {
    q: "هل يعمل النظام على الجوال؟",
    a: "نعم. حسابات متجاوب بالكامل ويعمل على أي جهاز: كمبيوتر، تابلت، أو موبايل. لا تحتاج تحميل أي تطبيق.",
  },
  {
    q: "ما الدول التي يدعمها النظام؟",
    a: "نحن ندعم حالياً: مصر، السعودية، الإمارات، الكويت، قطر، البحرين، وعمان. كل دولة لها قوانينها الضريبية الخاصة في النظام.",
  },
];

export function FAQ() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [open, setOpen] = React.useState<number | null>(null);

  return (
    <div className="min-h-screen bg-background font-sans" dir="rtl">
      <nav className="sticky top-0 z-50 border-b bg-white/90 backdrop-blur-md shadow-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setLocation("/")}>
            <div className="w-10 h-10 rounded-xl bg-[#1e3a5f] flex items-center justify-center text-white font-bold text-xl">
              ح
            </div>
            <span className="font-bold text-xl text-[#1e3a5f]">حسابات</span>
          </div>
          <Button variant="ghost" onClick={() => setLocation("/")}>
            العودة
          </Button>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-16 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#1e3a5f]/10 text-[#1e3a5f] rounded-full text-sm font-semibold mb-4">
            <HelpCircle className="w-4 h-4" />
            الأسئلة الشائعة
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-[#1e3a5f] mb-4">
            كل ما تريد معرفته عن حسابات
          </h1>
          <p className="text-lg text-muted-foreground">
            إذا لم تجد إجابة لسؤالك، تواصل معنا مباشرة
          </p>
        </motion.div>

        <div className="space-y-4">
          {FAQS.map((faq, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="border rounded-xl bg-white overflow-hidden"
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between p-5 text-right hover:bg-gray-50 transition-colors"
              >
                <span className="font-bold text-[#1e3a5f]">{faq.q}</span>
                {open === i ? (
                  <ChevronUp className="w-5 h-5 text-[#c9a96e] shrink-0" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
                )}
              </button>
              {open === i && (
                <div className="px-5 pb-5 text-muted-foreground leading-relaxed">
                  {faq.a}
                </div>
              )}
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-12 text-center bg-[#1e3a5f] rounded-2xl p-8 text-white"
        >
          <h3 className="text-xl font-bold mb-2">لم تجد إجابة لسؤالك؟</h3>
          <p className="text-white/80 mb-6">
            فريق الدعم متاح 24/7 للإجابة على أي استفسار
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              className="bg-[#c9a96e] hover:bg-[#b8956a] text-[#1e3a5f] font-bold"
              onClick={() => setLocation("/support")}
            >
              <MessageCircle className="w-5 h-5 me-2" />
              تواصل معنا
            </Button>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
