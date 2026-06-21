import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/language";
import { useQuery } from "@tanstack/react-query";
import { fetchPackages, type PackageRecord } from "@/lib/api";

export default function Packages() {
  const { t, lang } = useLang();
  const p = t.packages;

  const { data: packages, isLoading } = useQuery<PackageRecord[]>({
    queryKey: ["packages-public"],
    queryFn: fetchPackages,
    staleTime: 1000 * 60 * 5,
  });

  const scrollToContact = () => {
    document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section id="packages" className="py-20 md:py-32 bg-gray-50 dark:bg-background">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-block px-4 py-1.5 bg-primary/10 text-primary rounded-full font-semibold text-sm mb-4">
            {p.badge}
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6">{p.title}</h2>
          <p className="text-lg text-muted-foreground">{p.body}</p>
        </div>

        {isLoading && (
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-3xl bg-card border border-gray-100 animate-pulse">
                <div className="p-8 border-b border-gray-100">
                  <div className="h-7 bg-gray-200 rounded w-2/3 mx-auto mb-3" />
                  <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto" />
                </div>
                <div className="p-8 space-y-4">
                  {[1, 2, 3, 4, 5].map((j) => (
                    <div key={j} className="h-4 bg-gray-200 rounded w-full" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && packages && packages.length > 0 && (
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {packages.map((pkg) => {
              const popular = pkg.highlighted;
              const title = lang === "ar" ? pkg.titleAr : pkg.titleEn;
              const desc = lang === "ar" ? pkg.descriptionAr : pkg.descriptionEn;
              const features = lang === "ar" ? pkg.featuresAr : pkg.featuresEn;
              return (
                <div
                  key={pkg.id}
                  className={`relative rounded-3xl overflow-hidden shadow-xl bg-card border flex flex-col ${
                    popular
                      ? "border-primary ring-2 ring-primary/20 scale-105 z-10"
                      : "border-gray-100 dark:border-gray-800"
                  }`}
                >
                  {popular && (
                    <div className="bg-primary text-primary-foreground text-center py-2 text-sm font-bold tracking-wide">
                      {p.popular}
                    </div>
                  )}
                  <div className="p-8 text-center border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/20">
                    <h3 className="text-2xl font-bold text-foreground mb-3">{title}</h3>
                    <p className="text-muted-foreground font-medium">{desc}</p>
                  </div>
                  <div className="p-8 flex-grow">
                    <ul className="space-y-4">
                      {features.map((feature, fIdx) => (
                        <li key={fIdx} className="flex items-start gap-3">
                          <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                          <span className="text-sm text-foreground/80 leading-relaxed">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-8 pt-0 mt-auto">
                    <Button
                      onClick={scrollToContact}
                      className="w-full text-lg h-14"
                      variant={popular ? "default" : "outline"}
                    >
                      {p.cta}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!isLoading && (!packages || packages.length === 0) && (
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {p.items.map((pkg, idx) => {
              const popular = idx === 1;
              return (
                <div
                  key={idx}
                  className={`relative rounded-3xl overflow-hidden shadow-xl bg-card border flex flex-col ${
                    popular
                      ? "border-primary ring-2 ring-primary/20 scale-105 z-10"
                      : "border-gray-100 dark:border-gray-800"
                  }`}
                >
                  {popular && (
                    <div className="bg-primary text-primary-foreground text-center py-2 text-sm font-bold tracking-wide">
                      {p.popular}
                    </div>
                  )}
                  <div className="p-8 text-center border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/20">
                    <h3 className="text-2xl font-bold text-foreground mb-3">{pkg.title}</h3>
                    <p className="text-muted-foreground font-medium">{pkg.desc}</p>
                  </div>
                  <div className="p-8 flex-grow">
                    <ul className="space-y-4">
                      {p.features.map((feature, fIdx) => (
                        <li key={fIdx} className="flex items-start gap-3">
                          <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                          <span className="text-sm text-foreground/80 leading-relaxed">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-8 pt-0 mt-auto">
                    <Button
                      onClick={scrollToContact}
                      className="w-full text-lg h-14"
                      variant={popular ? "default" : "outline"}
                    >
                      {p.cta}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
