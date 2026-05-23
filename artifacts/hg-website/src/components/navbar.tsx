import { useState, useEffect } from "react";
import { Menu, X, Phone, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/language";
import logo from "@assets/hg-logo.png";

export default function Navbar() {
  const { t, toggle } = useLang();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const navLinks = [
    { name: t.navbar.home, id: "home" },
    { name: t.navbar.services, id: "services" },
    { name: t.navbar.packages, id: "packages" },
    { name: t.navbar.about, id: "about" },
    { name: t.navbar.contact, id: "contact" },
  ];

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? "bg-white shadow-md py-2" : "bg-white/90 backdrop-blur-md py-4"}`}>
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="#home" onClick={(e) => { e.preventDefault(); scrollToSection("home"); }}>
              <img src={logo} alt="HG Financial Consulting" className="h-12 w-auto object-contain" />
            </a>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <div className="flex items-center gap-6">
              {navLinks.map((link) => (
                <button
                  key={link.id}
                  onClick={() => scrollToSection(link.id)}
                  className="text-foreground hover:text-primary font-medium transition-colors text-lg"
                >
                  {link.name}
                </button>
              ))}
            </div>
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
        <div className="md:hidden absolute top-full left-0 right-0 bg-white border-t border-gray-100 shadow-lg py-4 px-4 flex flex-col gap-4">
          {navLinks.map((link) => (
            <button
              key={link.id}
              onClick={() => scrollToSection(link.id)}
              className="text-foreground hover:text-primary font-medium text-lg py-2 border-b border-gray-50 last:border-0 text-start"
            >
              {link.name}
            </button>
          ))}
          <div className="flex items-center gap-2 text-primary font-bold py-2" dir="ltr">
            <Phone className="w-5 h-5" />
            <span>01025812666</span>
          </div>
          <Button variant="outline" className="w-full justify-center gap-2" onClick={toggle}>
            <Globe className="w-4 h-4" />
            {t.navbar.switchLang}
          </Button>
        </div>
      )}
    </nav>
  );
}
