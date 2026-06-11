import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, Phone, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/language";
import logo from "@assets/hg-logo.png";

export default function Navbar() {
  const { t, toggle, lang } = useLang();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location] = useLocation();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const isHome = location === "/" || location === "";

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    if (isHome) {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    } else {
      window.location.href = `${base}/#${id}`;
    }
  };

  const sectionLinks = [
    { name: t.navbar.home, id: "home" },
    { name: t.navbar.services, id: "services" },
    { name: t.navbar.packages, id: "packages" },
    { name: t.navbar.about, id: "about" },
    { name: t.navbar.contact, id: "contact" },
  ];

  const hesabatLink = `${base}/hesabat/`;

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? "bg-white shadow-md py-2" : "bg-white/90 backdrop-blur-md py-4"}`}>
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between">
          <Link href={`${base}/`}>
            <img src={logo} alt="HG Financial Consulting" className="h-12 w-auto object-contain cursor-pointer" />
          </Link>

          <div className="hidden md:flex items-center gap-6">
            {sectionLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => scrollToSection(link.id)}
                className="text-foreground hover:text-primary font-medium transition-colors text-base"
              >
                {link.name}
              </button>
            ))}
            <Link
              href={`${base}/case-studies`}
              className="text-foreground hover:text-primary font-medium transition-colors text-base"
            >
              {lang === "ar" ? "دراسات الحالة" : "Case Studies"}
            </Link>
            <Link
              href={`${base}/articles`}
              className="text-foreground hover:text-primary font-medium transition-colors text-base"
            >
              {t.navbar.articles}
            </Link>
            <a
              href={hesabatLink}
              className="text-primary font-bold hover:text-primary/80 transition-colors text-base"
            >
              {lang === "ar" ? "حسابات" : "Hesabat"}
            </a>
          </div>

          <div className="hidden md:flex items-center gap-4">
            <div className="flex items-center gap-2 text-primary font-bold" dir="ltr">
              <Phone className="w-5 h-5" />
              <span>01025812666</span>
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={toggle}>
              <Globe className="w-4 h-4" />
              {t.navbar.switchLang}
            </Button>
          </div>

          <button className="md:hidden text-foreground" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-white border-t border-gray-100 shadow-lg py-4 px-4 flex flex-col gap-2">
          {sectionLinks.map((link) => (
            <button
              key={link.id}
              onClick={() => scrollToSection(link.id)}
              className="text-foreground hover:text-primary font-medium text-lg py-2 border-b border-gray-50 text-start"
            >
              {link.name}
            </button>
          ))}
          <Link
            href={`${base}/case-studies`}
            onClick={() => setMobileMenuOpen(false)}
            className="text-foreground hover:text-primary font-medium text-lg py-2 border-b border-gray-50"
          >
            {lang === "ar" ? "دراسات الحالة" : "Case Studies"}
          </Link>
          <Link
            href={`${base}/articles`}
            onClick={() => setMobileMenuOpen(false)}
            className="text-foreground hover:text-primary font-medium text-lg py-2 border-b border-gray-50 last:border-0"
          >
            {t.navbar.articles}
          </Link>
          <a
            href={hesabatLink}
            onClick={() => setMobileMenuOpen(false)}
            className="text-primary font-bold text-lg py-2 border-b border-gray-50 last:border-0"
          >
            {lang === "ar" ? "حسابات" : "Hesabat"}
          </a>
          <div className="flex items-center gap-2 text-primary font-bold py-2" dir="ltr">
            <Phone className="w-5 h-5" />
            <span>01025812666</span>
          </div>
          <Button variant="outline" className="w-full justify-center gap-2 mt-2" onClick={toggle}>
            <Globe className="w-4 h-4" />
            {t.navbar.switchLang}
          </Button>
        </div>
      )}
    </nav>
  );
}
