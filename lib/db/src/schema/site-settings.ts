import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const siteSettingsTable = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const upsertSettingSchema = createInsertSchema(siteSettingsTable);
export type SiteSetting = typeof siteSettingsTable.$inferSelect;

export const DEFAULT_SETTINGS: Record<string, string> = {
  site_name_ar: "شركة اتش جي للاستشارات المالية",
  site_name_en: "HG Financial Consulting",
  tagline_ar: "شركة مهنية احترافية متخصصة في تقديم خدمات الإستشارات المالية المتكاملة",
  tagline_en: "A professional firm specialized in providing comprehensive financial consulting services",
  phone: "01025812666",
  email: "info@hgaudit.com",
  address_ar: "مصر / المملكة العربية السعودية",
  address_en: "Egypt / Saudi Arabia",
  whatsapp: "201025812666",
  facebook: "https://www.facebook.com/Hgaudit/",
  instagram: "https://www.instagram.com/hg.audit/",
  linkedin: "https://www.linkedin.com/in/hazem-gamel-32163a66",
  primary_color: "#0571d5",
  dark_color: "#001d56",
  meta_title_ar: "شركة اتش جي للاستشارات المالية",
  meta_title_en: "HG Financial Consulting",
  meta_description_ar: "شركة مهنية احترافية متخصصة في تقديم خدمات الإستشارات المالية المتكاملة في مصر والسعودية",
  meta_description_en: "Professional financial consulting services in Egypt and Saudi Arabia — audit, tax, accounting, feasibility studies",
  google_analytics_id: "",
  meta_pixel_id: "",
};
