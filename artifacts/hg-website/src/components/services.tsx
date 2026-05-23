import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

import finance3 from "@assets/finance3.jpg";
import finance4 from "@assets/finance4.jpg";
import taxes from "@assets/taxes.jpg";
import finance2 from "@assets/finance2-min.jpg";
import corporate from "@assets/corporate.jpg";
import tech from "@assets/tech.jpg";

export default function Services() {
  const services = [
    {
      title: "تدقيق القوائم المالية",
      desc: "خدمات تدقيق وفحص القوائم المالية واعتمادها من قِبل خبراء متخصصين",
      img: finance3
    },
    {
      title: "امساك الدفاتر المحاسبية",
      desc: "إدارة وتسجيل العمليات المالية اليومية باحترافية عالية",
      img: finance4
    },
    {
      title: "خدمات الضرائب",
      desc: "تقديم الإقرارات الضريبية والمتابعة الدورية مع الجهات الحكومية",
      img: taxes
    },
    {
      title: "اعداد دراسات جدوى للمشروعات",
      desc: "دراسات جدوى احترافية لضمان نجاح مشاريعك",
      img: finance2
    },
    {
      title: "خدمات تأسيس الشركات",
      desc: "إجراءات تأسيس الشركات والتسجيل القانوني بسهولة ويسر",
      img: corporate
    },
    {
      title: "خدمات التقنية",
      desc: "حلول تقنية متكاملة لدعم إدارة الأعمال المالية",
      img: tech
    }
  ];

  return (
    <section id="services" className="py-20 md:py-32 bg-white dark:bg-background">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-block px-4 py-1.5 bg-primary/10 text-primary rounded-full font-semibold text-sm mb-4">
            خدماتنا
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6">
            خدماتنا | اتش جي للاستشارات المالية والضرائب
          </h2>
          <p className="text-lg text-muted-foreground">
            نحن شركة مهنية احترافية متخصص في تقديم خدمات مالية متكاملة لدعم نمو أعمالك وتحقيق أهدافك الاستراتيجية.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((service, index) => (
            <div 
              key={index} 
              className="group rounded-2xl overflow-hidden shadow-lg bg-card hover:shadow-2xl transition-all duration-300 border border-gray-100 dark:border-gray-800 flex flex-col"
            >
              <div className="relative h-64 overflow-hidden">
                <img 
                  src={service.img} 
                  alt={service.title} 
                  className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#001d56]/80 to-transparent opacity-80"></div>
                <h3 className="absolute bottom-6 right-6 left-6 text-white text-2xl font-bold">
                  {service.title}
                </h3>
              </div>
              <div className="p-8 flex-grow flex flex-col justify-between">
                <p className="text-muted-foreground text-lg mb-6 leading-relaxed">
                  {service.desc}
                </p>
                <div className="flex justify-end">
                  <Button variant="ghost" className="text-primary hover:text-primary hover:bg-primary/5 p-0 h-auto group-hover:gap-2 transition-all">
                    <span>المزيد</span>
                    <ArrowLeft className="w-4 h-4 mr-2 transform group-hover:-translate-x-1 transition-transform" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
