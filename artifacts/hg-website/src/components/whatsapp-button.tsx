import { useQuery } from "@tanstack/react-query";
import { fetchSettings, type SiteSettings } from "@/lib/api";
import { FaWhatsapp } from "react-icons/fa";

export default function WhatsAppButton() {
  const { data: settings } = useQuery<SiteSettings>({
    queryKey: ["settings"],
    queryFn: fetchSettings,
  });

  const whatsapp = settings?.["whatsapp"];
  if (!whatsapp) return null;

  const number = whatsapp.replace(/\D/g, "");
  if (!number) return null;

  return (
    <a
      href={`https://wa.me/${number}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="تواصل عبر واتساب"
      className="fixed bottom-6 left-6 z-50 group flex items-center justify-center w-14 h-14 md:w-16 md:h-16 bg-[#25D366] hover:bg-[#1ebe57] text-white rounded-full shadow-2xl hover:shadow-[#25D366]/50 transition-all duration-300 hover:scale-110"
    >
      <FaWhatsapp className="w-7 h-7 md:w-8 md:h-8" />
      <span className="absolute inset-0 rounded-full bg-[#25D366] opacity-75 animate-ping" style={{ animationDuration: "2s" }} />
    </a>
  );
}
