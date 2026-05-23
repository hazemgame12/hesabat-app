import Navbar from "@/components/navbar";
import Hero from "@/components/hero";
import About from "@/components/about";
import Services from "@/components/services";
import Stats from "@/components/stats";
import Packages from "@/components/packages";
import Partners from "@/components/partners";
import Contact from "@/components/contact";
import Footer from "@/components/footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-background font-sans overflow-x-hidden" dir="rtl">
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
