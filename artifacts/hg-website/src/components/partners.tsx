import evalLogo from "@assets/1-eval.jpg";
import idexLogo from "@assets/2-idex.jpg";
import swafLogo from "@assets/3-swaf.jpg";
import middlestarLogo from "@assets/4-middlestar.jpg";
import plazaespanaLogo from "@assets/5-plazaespana.jpg";
import arkanLogo from "@assets/6-arkan.jpg";
import alhokairLogo from "@assets/7-alhokair.jpg";

export default function Partners() {
  const logos = [
    evalLogo, idexLogo, swafLogo, middlestarLogo, plazaespanaLogo, arkanLogo, alhokairLogo,
    evalLogo, idexLogo, swafLogo, middlestarLogo, plazaespanaLogo, arkanLogo, alhokairLogo // Duplicated for continuous scroll
  ];

  return (
    <section className="py-20 bg-white dark:bg-card border-y border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="container mx-auto px-4 md:px-6 mb-12 text-center">
        <h2 className="text-3xl font-bold text-foreground mb-4">شركاؤنا | تعرف على بعض من عملائنا وشركاء نجاحنا</h2>
        <div className="w-20 h-1.5 bg-primary rounded-full mx-auto"></div>
      </div>
      
      <div className="relative w-full overflow-hidden flex">
        {/* We use a simple CSS animation for the infinite scroll */}
        <div className="flex w-[200%] animate-marquee-rtl">
          {logos.map((logo, idx) => (
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
