import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSettings, type SiteSettings } from "@/lib/api";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

function injectScript(id: string, content: string) {
  if (document.getElementById(id)) return;
  const s = document.createElement("script");
  s.id = id;
  s.text = content;
  document.head.appendChild(s);
}

function injectExternal(id: string, src: string) {
  if (document.getElementById(id)) return;
  const s = document.createElement("script");
  s.id = id;
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

export default function Analytics() {
  const { data: settings } = useQuery<SiteSettings>({
    queryKey: ["settings"],
    queryFn: fetchSettings,
  });

  useEffect(() => {
    if (!settings) return;
    const gaId = settings["google_analytics_id"]?.trim();
    const fbId = settings["meta_pixel_id"]?.trim();

    if (gaId) {
      injectExternal("ga4-src", `https://www.googletagmanager.com/gtag/js?id=${gaId}`);
      injectScript("ga4-init", `
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        window.gtag = gtag;
        gtag('js', new Date());
        gtag('config', '${gaId}');
      `);
    }

    if (fbId) {
      injectScript("fbq-init", `
        !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){
        n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;
        s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
        document,'script','https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '${fbId}');
        fbq('track', 'PageView');
      `);
    }
  }, [settings]);

  return null;
}
