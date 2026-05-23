import Navbar from "@/components/navbar";
import Hero from "@/components/hero";
import About from "@/components/about";
import Services from "@/components/services";
import Stats from "@/components/stats";
import Packages from "@/components/packages";
import Partners from "@/components/partners";
import Contact from "@/components/contact";
import Footer from "@/components/footer";
import { useLang } from "@/lib/language";

export default function Home() {
  const { t } = useLang();
  return (
    <div className="min-h-screen bg-background font-sans overflow-x-hidden" dir={t.dir}>
      <Navbar />
      <main>
        <Hero />
        <About />
        <Services />
        <Stats />
        <Packages />
        <Partners />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}
