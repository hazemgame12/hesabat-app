import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/language";
import heroImg from "@assets/finance2-min.jpg";

export default function Hero() {
  const { t } = useLang();

  return (
    <section id="home" className="relative min-h-[90vh] flex items-center justify-center pt-20">
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `url(${heroImg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-[#001d56]/90 to-[#001d56]/70"></div>
      </div>

      <div className="container relative z-10 mx-auto px-4 md:px-6 text-center md:text-start">
        <div className="max-w-3xl">
          <h2 className="text-primary-foreground/90 font-bold text-xl md:text-2xl mb-4 tracking-wider uppercase" dir="ltr">
            {t.hero.subtitle}
          </h2>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold text-white leading-tight mb-6">
            {t.hero.title}
          </h1>
          <p className="text-lg md:text-2xl text-gray-200 mb-10 leading-relaxed font-medium">
            {t.hero.body}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
            <Button
              size="lg"
              className="text-lg px-8 py-6 rounded-sm shadow-lg hover:shadow-xl transition-all"
              onClick={() => document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" })}
            >
              {t.hero.cta}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-lg px-8 py-6 rounded-sm bg-transparent text-white border-white hover:bg-white hover:text-[#001d56]"
              onClick={() => document.getElementById("services")?.scrollIntoView({ behavior: "smooth" })}
            >
              {t.hero.explore}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
