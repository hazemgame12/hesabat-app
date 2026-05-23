import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSettings, type SiteSettings } from "@/lib/api";
import { useLang } from "@/lib/language";

interface SeoHeadProps {
  title?: string;
  description?: string;
  image?: string;
  canonical?: string;
}

function upsertMeta(selector: string, attrName: string, attrValue: string, content: string) {
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attrName, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export default function SeoHead({ title, description, image, canonical }: SeoHeadProps) {
  const { lang } = useLang();
  const { data: settings } = useQuery<SiteSettings>({
    queryKey: ["settings"],
    queryFn: fetchSettings,
  });

  useEffect(() => {
    if (!settings) return;
    const siteName = lang === "ar" ? settings["site_name_ar"] : settings["site_name_en"];
    const metaTitle = lang === "ar" ? settings["meta_title_ar"] : settings["meta_title_en"];
    const metaDesc = lang === "ar" ? settings["meta_description_ar"] : settings["meta_description_en"];

    const finalTitle = title ? `${title} | ${siteName ?? metaTitle}` : (metaTitle ?? siteName ?? "");
    const finalDesc = description ?? metaDesc ?? "";

    if (finalTitle) document.title = finalTitle;

    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");

    if (finalDesc) upsertMeta('meta[name="description"]', "name", "description", finalDesc);
    upsertMeta('meta[property="og:title"]', "property", "og:title", finalTitle);
    if (finalDesc) upsertMeta('meta[property="og:description"]', "property", "og:description", finalDesc);
    upsertMeta('meta[property="og:type"]', "property", "og:type", "website");
    upsertMeta('meta[property="og:locale"]', "property", "og:locale", lang === "ar" ? "ar_EG" : "en_US");
    if (image) upsertMeta('meta[property="og:image"]', "property", "og:image", image);
    upsertMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");

    if (canonical || typeof window !== "undefined") {
      upsertLink("canonical", canonical ?? window.location.href);
    }
  }, [settings, lang, title, description, image, canonical]);

  return null;
}
