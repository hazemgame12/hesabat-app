import { getStoredCreds } from "./store";

export type SocialPlatform = "facebook" | "instagram" | "linkedin";

export const GRAPH_API_VERSION =
  process.env["GRAPH_API_VERSION"] || "v21.0";

export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export interface FacebookCreds {
  pageId: string;
  accessToken: string;
}

export interface InstagramCreds {
  igUserId: string;
  accessToken: string;
}

export interface LinkedInCreds {
  accessToken: string;
  /** URN of the author, e.g. "urn:li:organization:123" or "urn:li:person:abc". */
  authorUrn: string;
}

/**
 * Field definitions per platform. Each field can be supplied either by an admin
 * from the dashboard (stored encrypted at rest) or via an environment secret.
 * Stored values take precedence; env vars remain a valid fallback for hosts
 * configured the classic way.
 */
export interface PlatformFieldDef {
  /** Logical key used in the encrypted store and dashboard form. */
  key: string;
  /** Environment variable fallback. */
  envVar: string;
  /** Arabic label shown in the dashboard. */
  label: string;
  /** Sensitive value (token) — never echoed back to the client. */
  secret: boolean;
  required: boolean;
}

export const PLATFORM_FIELDS: Record<SocialPlatform, PlatformFieldDef[]> = {
  facebook: [
    { key: "pageId", envVar: "FACEBOOK_PAGE_ID", label: "معرّف الصفحة (Page ID)", secret: false, required: true },
    { key: "accessToken", envVar: "FACEBOOK_PAGE_ACCESS_TOKEN", label: "رمز وصول الصفحة (Page Access Token)", secret: true, required: true },
  ],
  instagram: [
    { key: "igUserId", envVar: "INSTAGRAM_BUSINESS_ACCOUNT_ID", label: "معرّف حساب الأعمال (Business Account ID)", secret: false, required: true },
    { key: "accessToken", envVar: "INSTAGRAM_ACCESS_TOKEN", label: "رمز الوصول (اختياري — يُستخدم رمز صفحة فيسبوك افتراضياً)", secret: true, required: false },
  ],
  linkedin: [
    { key: "accessToken", envVar: "LINKEDIN_ACCESS_TOKEN", label: "رمز الوصول (Access Token)", secret: true, required: true },
    { key: "authorUrn", envVar: "LINKEDIN_AUTHOR_URN", label: "معرّف الناشر (Author URN)", secret: false, required: true },
  ],
};

/** Backward-compatible list of env var names per platform (used in docs). */
export const PLATFORM_ENV_KEYS: Record<SocialPlatform, string[]> = {
  facebook: PLATFORM_FIELDS.facebook.map((f) => f.envVar),
  instagram: PLATFORM_FIELDS.instagram.map((f) => f.envVar),
  linkedin: PLATFORM_FIELDS.linkedin.map((f) => f.envVar),
};

/** Where a resolved field value came from. */
export type FieldSource = "stored" | "env" | "";

export interface ResolvedField {
  key: string;
  value: string;
  source: FieldSource;
}

/**
 * Resolve a platform's fields by merging stored (encrypted) credentials over
 * environment variables. Stored values win; env is the fallback.
 */
async function resolveFields(
  platform: SocialPlatform,
): Promise<Record<string, ResolvedField>> {
  const stored = (await getStoredCreds(platform)) ?? {};
  const out: Record<string, ResolvedField> = {};
  for (const field of PLATFORM_FIELDS[platform]) {
    const storedVal = (stored[field.key] || "").trim();
    if (storedVal) {
      out[field.key] = { key: field.key, value: storedVal, source: "stored" };
      continue;
    }
    const envVal = (process.env[field.envVar] || "").trim();
    out[field.key] = {
      key: field.key,
      value: envVal,
      source: envVal ? "env" : "",
    };
  }
  return out;
}

/** Public: per-field presence/source for the dashboard (no secret values). */
export async function getFieldStatuses(
  platform: SocialPlatform,
): Promise<{ key: string; label: string; secret: boolean; required: boolean; hasValue: boolean; source: FieldSource }[]> {
  const resolved = await resolveFields(platform);
  return PLATFORM_FIELDS[platform].map((f) => {
    const r = resolved[f.key];
    return {
      key: f.key,
      label: f.label,
      secret: f.secret,
      required: f.required,
      hasValue: Boolean(r && r.value),
      source: r ? r.source : "",
    };
  });
}

/** Overall credential source for a platform. */
export async function getPlatformSource(
  platform: SocialPlatform,
): Promise<"stored" | "env" | "none"> {
  const resolved = await resolveFields(platform);
  const sources = PLATFORM_FIELDS[platform]
    .filter((f) => f.required)
    .map((f) => resolved[f.key]?.source);
  if (sources.some((s) => s === "stored")) return "stored";
  if (sources.every((s) => s === "env")) return "env";
  return "none";
}

export async function getFacebookCreds(): Promise<FacebookCreds | null> {
  const r = await resolveFields("facebook");
  const pageId = r["pageId"]?.value;
  const accessToken = r["accessToken"]?.value;
  if (!pageId || !accessToken) return null;
  return { pageId, accessToken };
}

export async function getInstagramCreds(): Promise<InstagramCreds | null> {
  const r = await resolveFields("instagram");
  const igUserId = r["igUserId"]?.value;
  // Instagram Graph API publishing uses the linked Facebook Page access token
  // when a dedicated Instagram token isn't supplied.
  let accessToken = r["accessToken"]?.value || "";
  if (!accessToken) {
    const fb = await getFacebookCreds();
    accessToken = fb?.accessToken || "";
  }
  if (!igUserId || !accessToken) return null;
  return { igUserId, accessToken };
}

export async function getLinkedInCreds(): Promise<LinkedInCreds | null> {
  const r = await resolveFields("linkedin");
  const accessToken = r["accessToken"]?.value;
  const authorUrn = r["authorUrn"]?.value;
  if (!accessToken || !authorUrn) return null;
  return { accessToken, authorUrn };
}

/** Number of days before expiry at which a token is flagged "expiring soon". */
export const EXPIRY_WARNING_DAYS = 7;

export type ExpiryStatus = "ok" | "expiring_soon" | "expired" | "unknown";

export interface TokenExpiry {
  /** ISO timestamp when the active token expires, or null when unknown. */
  expiresAt: string | null;
  status: ExpiryStatus;
}

/**
 * Resolve the access-token expiry for a platform.
 *
 * Only credentials captured via the in-app OAuth flow carry an expiry, stored
 * as `tokenExpiresAt` inside the encrypted credential blob. Meta Page tokens
 * (used for Facebook/Instagram) do not expire, and manually-entered or
 * env-supplied tokens have no known expiry — all of these report "unknown".
 */
export async function getTokenExpiry(
  platform: SocialPlatform,
): Promise<TokenExpiry> {
  const stored = await getStoredCreds(platform);
  const raw = (stored?.["tokenExpiresAt"] || "").trim();
  if (!raw) return { expiresAt: null, status: "unknown" };
  const ts = Date.parse(raw);
  if (Number.isNaN(ts)) return { expiresAt: null, status: "unknown" };
  const msLeft = ts - Date.now();
  if (msLeft <= 0) return { expiresAt: raw, status: "expired" };
  if (msLeft <= EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000) {
    return { expiresAt: raw, status: "expiring_soon" };
  }
  return { expiresAt: raw, status: "ok" };
}

export async function isPlatformConfigured(
  platform: SocialPlatform,
): Promise<boolean> {
  switch (platform) {
    case "facebook":
      return (await getFacebookCreds()) !== null;
    case "instagram":
      return (await getInstagramCreds()) !== null;
    case "linkedin":
      return (await getLinkedInCreds()) !== null;
  }
}

/**
 * Build an absolute, publicly reachable URL for a stored image path.
 * Facebook photo posts and Instagram media require a public image URL.
 */
export function toAbsoluteUrl(pathOrUrl: string): string {
  const value = (pathOrUrl || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  const base = (process.env["SITE_URL"] || "").replace(/\/$/, "");
  if (!base) return value;
  return `${base}${value.startsWith("/") ? "" : "/"}${value}`;
}

/**
 * Compose the message body for a post from its bilingual captions and link.
 */
export function composeMessage(post: {
  captionAr: string;
  captionEn: string;
  link: string;
}): string {
  const parts: string[] = [];
  if (post.captionAr?.trim()) parts.push(post.captionAr.trim());
  if (post.captionEn?.trim()) parts.push(post.captionEn.trim());
  let message = parts.join("\n\n");
  const link = toAbsoluteUrl(post.link);
  if (link && !message.includes(link)) {
    message = message ? `${message}\n\n${link}` : link;
  }
  return message;
}
