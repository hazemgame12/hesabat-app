import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { useLang } from "@/lib/language";
import { servicesContent } from "@/lib/services-content";

import finance3 from "@assets/finance3.jpg";
import finance4 from "@assets/finance4.jpg";
import taxes from "@assets/taxes.jpg";
import finance2 from "@assets/finance2-min.jpg";
import corporate from "@assets/corporate.jpg";
import tech from "@assets/tech.jpg";

const images = [finance3, finance2, taxes, finance4, corporate, tech];

export default function Services() {
  const { t, lang } = useLang();
  const s = t.services;
  const ArrowIcon = lang === "ar" ? ArrowLeft : ArrowRight;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <section id="services" className="py-20 md:py-32 bg-white dark:bg-background">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-block px-4 py-1.5 bg-primary/10 text-primary rounded-full font-semibold text-sm mb-4">
            {s.badge}
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6">{s.title}</h2>
          <p className="text-lg text-muted-foreground">{s.body}</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {s.items.map((service, index) => (
            <div
              key={index}
              className="group rounded-2xl overflow-hidden shadow-lg bg-card hover:shadow-2xl transition-all duration-300 border border-gray-100 dark:border-gray-800 flex flex-col"
            >
              <div className="relative h-64 overflow-hidden">
                <img
                  src={images[index]}
                  alt={service.title}
                  className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#001d56]/80 to-transparent opacity-80"></div>
                <h3 className="absolute bottom-6 right-6 left-6 text-white text-2xl font-bold">{service.title}</h3>
              </div>
              <div className="p-8 flex-grow flex flex-col justify-between">
                <p className="text-muted-foreground text-lg mb-6 leading-relaxed">{service.desc}</p>
                <div className="flex justify-end">
                  <Link href={`${base}/services/${servicesContent[index].slug}`}
                    className="inline-flex items-center gap-2 text-primary hover:text-primary/80 font-semibold text-sm transition-colors group/btn">
                    <span>{s.more}</span>
                    <ArrowIcon className="w-4 h-4 transition-transform group-hover/btn:translate-x-[-3px]" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
