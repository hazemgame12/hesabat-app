import { useState, useRef } from "react";
import { Phone, Mail, MapPin, Send, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLang } from "@/lib/language";
import { submitLead } from "@/lib/api";

export default function Contact() {
  const { t } = useLang();
  const c = t.contact;
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      await submitLead({
        name: fd.get("name") as string,
        phone: fd.get("phone") as string,
        email: fd.get("email") as string,
        message: fd.get("message") as string,
        service: "",
        source: "website",
        status: "new",
        notes: "",
      });
      setSuccess(true);
      formRef.current?.reset();
      setTimeout(() => setSuccess(false), 5000);
    } catch {
      setError("حدث خطأ، يرجى المحاولة مرة أخرى أو التواصل عبر واتساب.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="contact" className="py-20 md:py-32 bg-white dark:bg-background">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-block px-4 py-1.5 bg-primary/10 text-primary rounded-full font-semibold text-sm mb-4">
            {c.badge}
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6">{c.title}</h2>
          <p className="text-lg text-muted-foreground">{c.body}</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 max-w-6xl mx-auto">
          <div>
            <div className="bg-gray-50 dark:bg-card p-8 rounded-3xl mb-8 border border-gray-100 dark:border-gray-800">
              <h3 className="text-2xl font-bold mb-6 text-foreground">{c.infoTitle}</h3>
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
                    <Phone className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground mb-1">{c.phone}</h4>
                    <p className="text-muted-foreground" dir="ltr">+20 102 581 2666</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
                    <Mail className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground mb-1">{c.email}</h4>
                    <p className="text-muted-foreground">info@hgaudit.com</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
                    <MapPin className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground mb-1">{c.address}</h4>
                    <p className="text-muted-foreground">{c.addressVal}</p>
                  </div>
                </div>
              </div>
              <div className="mt-10">
                <a href="https://wa.me/201025812666" target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-[#25D366] hover:bg-[#128C7E] text-white py-4 rounded-xl font-bold text-lg transition-colors">
                  <MessageCircle className="w-6 h-6" />
                  {c.whatsapp}
                </a>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-card shadow-xl rounded-3xl p-8 border border-gray-100 dark:border-gray-800">
            <h3 className="text-2xl font-bold mb-6 text-foreground">{c.formTitle}</h3>
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2 text-foreground">{c.name}</label>
                <Input name="name" required placeholder={c.namePlaceholder} className="h-12" />
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium mb-2 text-foreground">{c.phone}</label>
                  <Input name="phone" required type="tel" placeholder={c.phonePlaceholder} className="h-12" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-foreground">{c.email}</label>
                  <Input name="email" type="email" placeholder={c.emailPlaceholder} className="h-12" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-foreground">{c.message}</label>
                <Textarea name="message" placeholder={c.messagePlaceholder} className="min-h-[150px] resize-none" />
              </div>

              {error && <p className="text-sm text-red-500 font-medium">{error}</p>}

              <Button type="submit" size="lg" className="w-full h-14 text-lg gap-2" disabled={loading || success}>
                {success ? "✓ " + c.sent : (
                  <>{loading ? c.sending : c.send}{!loading && <Send className="w-5 h-5" />}</>
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
