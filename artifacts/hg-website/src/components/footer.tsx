import { Facebook, Instagram, Linkedin, MapPin, Phone, Mail } from "lucide-react";
import { useLang } from "@/lib/language";
import logo from "@assets/hg-logo.png";

export default function Footer() {
  const { t } = useLang();
  const f = t.footer;

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <footer className="bg-[#001d56] text-white pt-20 pb-8 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "32px 32px" }}
      />
      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          <div className="space-y-6">
            <img src={logo} alt="HG Financial Consulting" className="h-16 w-auto bg-white/10 p-2 rounded-lg" />
            <p className="text-gray-300 leading-relaxed text-sm">{f.tagline}</p>
            <div className="flex gap-4">
              <a href="https://www.facebook.com/Hgaudit/" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-primary transition-colors">
                <Facebook className="w-5 h-5" />
              </a>
              <a href="https://www.instagram.com/hg.audit/" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-primary transition-colors">
                <Instagram className="w-5 h-5" />
              </a>
              <a href="https://www.linkedin.com/in/hazem-gamel-32163a66" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-primary transition-colors">
                <Linkedin className="w-5 h-5" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="text-xl font-bold mb-6 border-b border-white/20 pb-4 inline-block">{f.quickLinks}</h4>
            <ul className="space-y-3">
              {f.links.map((link) => (
                <li key={link.id}>
                  <a href={`#${link.id}`} onClick={(e) => scrollToSection(e, link.id)} className="text-gray-300 hover:text-white transition-all">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xl font-bold mb-6 border-b border-white/20 pb-4 inline-block">{f.services}</h4>
            <ul className="space-y-3 text-sm">
              {f.serviceLinks.map((s, i) => (
                <li key={i}>
                  <a href="#services" onClick={(e) => scrollToSection(e, "services")} className="text-gray-300 hover:text-white transition-all">
                    {s}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xl font-bold mb-6 border-b border-white/20 pb-4 inline-block">{f.getInTouch}</h4>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                <span className="text-gray-300">{t.contact.addressVal}</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-primary flex-shrink-0" />
                <span className="text-gray-300" dir="ltr">+20 102 581 2666</span>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-primary flex-shrink-0" />
                <span className="text-gray-300">info@hgaudit.com</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 pt-8 mt-8 text-center md:flex md:justify-between md:text-start">
          <p className="text-gray-400 text-sm mb-4 md:mb-0">{f.copyright}</p>
          <p className="text-gray-400 text-sm font-medium">
            {f.design} <span className="text-white font-bold">Hashtag Group</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
