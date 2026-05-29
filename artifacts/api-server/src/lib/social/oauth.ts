import crypto from "node:crypto";
import { GRAPH_API_VERSION, GRAPH_BASE, type SocialPlatform } from "./config";

/**
 * Guided in-app OAuth ("Connect" buttons) for capturing long-lived platform
 * tokens without the admin pasting raw keys.
 *
 * The developer *app* credentials (Meta App ID/Secret, LinkedIn Client
 * ID/Secret) are configuration that lives only in the server environment. The
 * *user* tokens captured by the flow are stored AES-256-GCM encrypted via the
 * existing credential store — never in the DB as plaintext. This keeps the
 * "tokens are secrets" constraint while letting an admin connect with a click.
 *
 * Note: a working flow still depends on external approvals (Meta App Review /
 * Business Verification, an Instagram business account linked to the Page, and
 * LinkedIn Marketing Developer Platform access) which are prerequisites outside
 * our control.
 */

/* ─── App credentials (env only) ─────────────────────────────── */

function metaAppId(): string {
  return (process.env["META_APP_ID"] || process.env["FACEBOOK_APP_ID"] || "").trim();
}
function metaAppSecret(): string {
  return (process.env["META_APP_SECRET"] || process.env["FACEBOOK_APP_SECRET"] || "").trim();
}
function linkedInClientId(): string {
  return (process.env["LINKEDIN_CLIENT_ID"] || "").trim();
}
function linkedInClientSecret(): string {
  return (process.env["LINKEDIN_CLIENT_SECRET"] || "").trim();
}

/** Whether the in-app OAuth ("Connect" button) is available for a platform. */
export function isOAuthConfigured(platform: SocialPlatform): boolean {
  switch (platform) {
    case "facebook":
    case "instagram":
      return Boolean(metaAppId() && metaAppSecret());
    case "linkedin":
      return Boolean(linkedInClientId() && linkedInClientSecret());
  }
}

/* ─── Public base URL / redirect URI ─────────────────────────── */

/** Public origin used to build the OAuth redirect URI (must be registered). */
export function getPublicBaseUrl(): string {
  const site = (process.env["SITE_URL"] || "").trim().replace(/\/$/, "");
  if (site) return site;
  const domains = (process.env["REPLIT_DOMAINS"] || "").split(",").map((d) => d.trim()).filter(Boolean);
  if (domains[0]) return `https://${domains[0]}`;
  return "";
}

/** Fixed callback URL the provider redirects back to (goes through the proxy). */
export function getRedirectUri(platform: SocialPlatform): string {
  const base = getPublicBaseUrl();
  return `${base}/api/admin/social-connections/${platform}/callback`;
}

/* ─── Signed state (CSRF + admin-initiated proof) ────────────── */

function stateSecret(): string {
  return (
    process.env["CREDENTIALS_SECRET"] ||
    process.env["SESSION_SECRET"] ||
    process.env["ADMIN_SECRET"] ||
    ""
  );
}

const STATE_TTL_MS = 10 * 60 * 1000;

interface StatePayload {
  platform: SocialPlatform;
  nonce: string;
  exp: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** Create an HMAC-signed state string proving an admin started this flow. */
export function signState(platform: SocialPlatform): string {
  const payload: StatePayload = {
    platform,
    nonce: crypto.randomBytes(8).toString("hex"),
    exp: Date.now() + STATE_TTL_MS,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = crypto
    .createHmac("sha256", stateSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

/** Verify a returned state string; returns the platform when valid, else null. */
export function verifyState(state: string): SocialPlatform | null {
  const parts = (state || "").split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];
  const expected = crypto
    .createHmac("sha256", stateSecret())
    .update(body)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload.platform;
  } catch {
    return null;
  }
}

/* ─── Authorization URLs ─────────────────────────────────────── */

const META_SCOPES: Record<"facebook" | "instagram", string> = {
  facebook: "pages_show_list,pages_read_engagement,pages_manage_posts",
  instagram:
    "pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish",
};

const LINKEDIN_SCOPES = "openid,profile,w_member_social";

/** Build the provider authorization URL the admin's browser is sent to. */
export function buildAuthUrl(platform: SocialPlatform): string {
  const state = signState(platform);
  const redirectUri = getRedirectUri(platform);
  if (platform === "linkedin") {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: linkedInClientId(),
      redirect_uri: redirectUri,
      scope: LINKEDIN_SCOPES.split(",").join(" "),
      state,
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  }
  const params = new URLSearchParams({
    client_id: metaAppId(),
    redirect_uri: redirectUri,
    scope: META_SCOPES[platform],
    response_type: "code",
    state,
  });
  return `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth?${params.toString()}`;
}

/* ─── Code → long-lived token exchange ───────────────────────── */

async function metaJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok || (data as { error?: unknown }).error) {
    const msg = (data as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

/**
 * Exchange an authorization code for stored credential fields (keyed by the
 * platform's PLATFORM_FIELDS) ready to persist via setStoredCreds.
 */
export async function exchangeCode(
  platform: SocialPlatform,
  code: string,
): Promise<Record<string, string>> {
  const redirectUri = getRedirectUri(platform);
  if (platform === "linkedin") {
    return exchangeLinkedIn(code, redirectUri);
  }
  return exchangeMeta(platform, code, redirectUri);
}

async function exchangeMeta(
  platform: "facebook" | "instagram",
  code: string,
  redirectUri: string,
): Promise<Record<string, string>> {
  // 1. code → short-lived user token
  const shortUrl =
    `${GRAPH_BASE}/oauth/access_token?` +
    new URLSearchParams({
      client_id: metaAppId(),
      client_secret: metaAppSecret(),
      redirect_uri: redirectUri,
      code,
    }).toString();
  const short = await metaJson<{ access_token: string }>(shortUrl);

  // 2. short-lived → long-lived user token (~60 days)
  const longUrl =
    `${GRAPH_BASE}/oauth/access_token?` +
    new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: metaAppId(),
      client_secret: metaAppSecret(),
      fb_exchange_token: short.access_token,
    }).toString();
  const long = await metaJson<{ access_token: string }>(longUrl);

  // 3. list Pages — Page tokens derived from a long-lived user token do not expire
  const pagesUrl =
    `${GRAPH_BASE}/me/accounts?` +
    new URLSearchParams({
      fields: "id,name,access_token",
      access_token: long.access_token,
    }).toString();
  const pages = await metaJson<{
    data?: { id: string; name: string; access_token: string }[];
  }>(pagesUrl);
  const page = pages.data?.[0];
  if (!page) {
    throw new Error(
      "لم يتم العثور على صفحة فيسبوك مرتبطة بهذا الحساب. تأكد من إدارتك لصفحة واحدة على الأقل.",
    );
  }

  if (platform === "facebook") {
    return { pageId: page.id, accessToken: page.access_token };
  }

  // instagram: resolve the IG business account linked to the Page
  const igUrl =
    `${GRAPH_BASE}/${page.id}?` +
    new URLSearchParams({
      fields: "instagram_business_account",
      access_token: page.access_token,
    }).toString();
  const ig = await metaJson<{ instagram_business_account?: { id: string } }>(igUrl);
  const igUserId = ig.instagram_business_account?.id;
  if (!igUserId) {
    throw new Error(
      "لا يوجد حساب إنستجرام أعمال مرتبط بصفحة فيسبوك. اربط حساب إنستجرام أعمال بالصفحة ثم أعد المحاولة.",
    );
  }
  return { igUserId, accessToken: page.access_token };
}

async function exchangeLinkedIn(
  code: string,
  redirectUri: string,
): Promise<Record<string, string>> {
  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: linkedInClientId(),
      client_secret: linkedInClientSecret(),
    }).toString(),
  });
  const token = (await tokenRes.json()) as {
    access_token?: string;
    error_description?: string;
  };
  if (!tokenRes.ok || !token.access_token) {
    throw new Error(token.error_description || `HTTP ${tokenRes.status}`);
  }

  // Resolve the member URN via the OpenID userinfo endpoint.
  const infoRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const info = (await infoRes.json()) as { sub?: string };
  if (!infoRes.ok || !info.sub) {
    throw new Error("تعذّر تحديد معرّف الناشر (Author URN) من LinkedIn.");
  }
  return {
    accessToken: token.access_token,
    authorUrn: `urn:li:person:${info.sub}`,
  };
}
