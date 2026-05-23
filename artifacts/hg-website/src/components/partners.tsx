import { useLang } from "@/lib/language";
import evalLogo from "@assets/1-eval.jpg";
import idexLogo from "@assets/2-idex.jpg";
import swafLogo from "@assets/3-swaf.jpg";
import middlestarLogo from "@assets/4-middlestar.jpg";
import plazaespanaLogo from "@assets/5-plazaespana.jpg";
import arkanLogo from "@assets/6-arkan.jpg";
import alhokairLogo from "@assets/7-alhokair.jpg";

const logos = [evalLogo, idexLogo, swafLogo, middlestarLogo, plazaespanaLogo, arkanLogo, alhokairLogo];
const doubled = [...logos, ...logos];

export default function Partners() {
  const { t } = useLang();
  const p = t.partners;

  return (
    <section className="py-20 bg-white dark:bg-card border-y border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="container mx-auto px-4 md:px-6 mb-12 text-center">
        <div className="inline-block px-4 py-1.5 bg-primary/10 text-primary rounded-full font-semibold text-sm mb-4">
          {p.badge}
        </div>
        <h2 className="text-3xl font-bold text-foreground mb-3">{p.title}</h2>
        <p className="text-lg text-muted-foreground">{p.body}</p>
        <div className="w-20 h-1.5 bg-primary rounded-full mx-auto mt-4"></div>
      </div>

      <div className="relative w-full overflow-hidden flex">
        <div className="flex w-[200%] animate-marquee-rtl">
          {doubled.map((logo, idx) => (
            <div key={idx} className="flex-1 flex justify-center items-center px-4 md:px-8">
              <img
                src={logo}
                alt="Partner Logo"
                className="max-h-24 max-w-[150px] object-contain filter grayscale hover:grayscale-0 opacity-60 hover:opacity-100 transition-all duration-300"
              />
            </div>
          ))}
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes marquee-rtl {
          0% { transform: translateX(0%); }
          100% { transform: translateX(50%); }
        }
        .animate-marquee-rtl {
          animation: marquee-rtl 30s linear infinite;
        }
      `}} />
    </section>
  );
}
