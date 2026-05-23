import { CheckCircle2 } from "lucide-react";
import aboutImg from "@assets/casestudie.jpg";

export default function About() {
  return (
    <section id="about" className="py-20 md:py-32 bg-gray-50 dark:bg-background">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid md:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div className="order-2 md:order-1 relative">
            <div className="absolute inset-0 bg-primary/10 rounded-3xl transform translate-x-4 translate-y-4 -z-10"></div>
            <img 
              src={aboutImg} 
              alt="نبذة عنا" 
              className="rounded-3xl shadow-xl w-full h-[500px] object-cover"
            />
            <div className="absolute -bottom-6 -right-6 bg-white dark:bg-card p-6 rounded-2xl shadow-xl max-w-[250px]">
              <div className="text-primary font-bold text-4xl mb-2">20+</div>
              <div className="text-sm font-semibold text-gray-600 dark:text-gray-300">عاماً من الخبرة في الاستشارات المالية</div>
            </div>
          </div>
          
          <div className="order-1 md:order-2 space-y-6">
            <div className="inline-block px-4 py-1.5 bg-primary/10 text-primary rounded-full font-semibold text-sm mb-2">
              من نحن
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground leading-tight">
              نبذة عنا | اتش جي لخدمات الاستشارات المالية
            </h2>
            <div className="w-20 h-1.5 bg-primary rounded-full mb-6"></div>
            
            <p className="text-lg text-muted-foreground leading-relaxed">
              تأسست شركة اتش جي للاستشارات المالية لتكون واحدة من اهم صروح المجال المحاسبي والمالي في الوطن العربي – وذلك من خلال الاعتماد على كوادرها التي تؤهلها لكسب احترام عملائنا.
            </p>
            
            <p className="text-lg text-muted-foreground leading-relaxed">
              نقدم في اتش جي فريقًا من المحترفين المؤهلين لتقديم أعلى مستوى من الخدمات المالية والمحاسبية. سواء كنت رائد أعمال أو شركة قائمة، فإننا نقدم لك الدعم والخبرة اللازمة لتحقيق النجاح المالي. خدماتنا تشمل: المحاسبة، الضرائب، المراجعة، دراسات الجدوى، والاستشارات المالية المتخصصة.
            </p>
            
            <div className="pt-6 border-t border-gray-200 dark:border-gray-800 mt-6">
              <p className="font-bold text-xl text-foreground">أ/ حازم جميل سيد سليم</p>
              <p className="text-primary font-medium">مؤسس الشركة</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
