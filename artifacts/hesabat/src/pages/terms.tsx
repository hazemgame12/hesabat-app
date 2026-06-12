import React from "react";
import { useLocation } from "wouter";
import { ArrowLeft, FileText, Shield, CreditCard, Lock, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export function Terms() {
  const [, setLocation] = useLocation();

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
            <FileText className="w-4 h-4" />
            الشروط والأحكام
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-[#1e3a5f] mb-4">
            سياسات الدفع والاستخدام
          </h1>
          <p className="text-lg text-muted-foreground">
            آخر تحديث: يونيو 2026
          </p>
        </motion.div>

        <div className="space-y-8">
          <Section
            icon={CreditCard}
            title="سياسة الدفع"
            items={[
              "نقبل الدفع ببطاقات الائتمان (Visa, Mastercard)، فودافون كاش، إنستا باي، وتحويل بنكي.",
              "يتم إصدار الفواتير آلياً وإرسالها لبريدك الإلكتروني.",
              "الدفع السنوي يمنح خصم 20% على إجمالي الاشتراك.",
              "الأسعار تشمل الضرائب المقررة في كل دولة.",
              "الدفع المتأخر يؤدي إلى تعليق الحساب لمدة 7 أيام قبل الإلغاء.",
            ]}
          />

          <Section
            icon={Shield}
            title="سياسة الاسترجاع"
            items={[
              "تستطيع طلب استرجاع كامل خلال 14 يوماً من أول دفع.",
              "الاسترجاع لا يشمل فترة التجربة المجانية.",
              "يتم معالجة الاسترجاع خلال 5-7 أيام عمل.",
              "لا يوجد التزام أو عقد طويل الأجل — تستطيع الإلغاء في أي وقت.",
            ]}
          />

          <Section
            icon={Lock}
            title="أمان البيانات"
            items={[
              "نستخدم تشفير 256-bit SSL على كل الاتصالات.",
              "البيانات تُخزن على خوادم سحابية موثوقة مع نسخ احتياطي يومي.",
              "نحن لا نبيع أو نشارك بياناتك مع أي طرف ثالث.",
              "تستطيع طلب تصدير بياناتك في أي وقت.",
              "نحتفظ بالبيانات لمدة 90 يوماً بعد إلغاء الاشتراك.",
            ]}
          />

          <Section
            icon={Globe}
            title="الاشتراك والتجديد"
            items={[
              "يتم التجديد آلياً ما لم تقم بالإلغاء.",
              "تستطيع الترقية أو التنزيل في أي وقت.",
              "الترقية تُفعّل فوراً، والتنزيل يُفعّل من الدورة القادمة.",
              "نرسل إشعار تجديد قبل 7 أيام من الموعد.",
            ]}
          />
        </div>

        <div className="mt-12 text-center">
          <p className="text-muted-foreground mb-4">
            إذا كان لديك أي استفسار، لا تتردد في التواصل معنا
          </p>
          <Button variant="outline" onClick={() => setLocation("/support")}>
            <ArrowLeft className="w-4 h-4 me-2" />
            تواصل معنا
          </Button>
        </div>
      </main>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  items,
}: {
  icon: React.ComponentType<any>;
  title: string;
  items: string[];
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="bg-white rounded-2xl p-6 border shadow-sm"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-[#1e3a5f]/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-[#1e3a5f]" />
        </div>
        <h2 className="text-xl font-bold text-[#1e3a5f]">{title}</h2>
      </div>
      <ul className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-3 text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-[#c9a96e] mt-2 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}
