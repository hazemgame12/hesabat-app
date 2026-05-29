import crypto from "node:crypto";
import { logger } from "../logger";
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

const LINKEDIN_BASE_SCOPES = "openid,profile,w_member_social";
/**
 * Scopes required to list and post as a LinkedIn Company/Organization. These
 * belong to the LinkedIn Marketing Developer Platform and are only granted to
 * approved apps, so requesting them on an unapproved app makes the whole
 * authorization fail. They are therefore opt-in via LINKEDIN_ENABLE_ORG.
 */
const LINKEDIN_ORG_SCOPES = "r_organization_admin,w_organization_social";

/** Whether LinkedIn organization (Company Page) connection is enabled. */
export function linkedInOrgEnabled(): boolean {
  const v = (process.env["LINKEDIN_ENABLE_ORG"] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function linkedInScopes(): string {
  return linkedInOrgEnabled()
    ? `${LINKEDIN_BASE_SCOPES},${LINKEDIN_ORG_SCOPES}`
    : LINKEDIN_BASE_SCOPES;
}

/** Build the provider authorization URL the admin's browser is sent to. */
export function buildAuthUrl(platform: SocialPlatform): string {
  const state = signState(platform);
  const redirectUri = getRedirectUri(platform);
  if (platform === "linkedin") {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: linkedInClientId(),
      redirect_uri: redirectUri,
      scope: linkedInScopes().split(",").join(" "),
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
 * A connectable target captured during OAuth. `fields` are the credential
 * values to persist via setStoredCreds when this target is chosen. `id`/`name`/
 * `subtitle` are the only parts ever surfaced to the client (tokens stay
 * server-side).
 */
export interface OAuthTarget {
  /** Stable selection id (Page ID, IG account ID, or LinkedIn URN). */
  id: string;
  /** Display name shown in the chooser. */
  name: string;
  /** Secondary line (account type / linkage). */
  subtitle: string;
  /** Credential fields to persist if this target is selected. */
  fields: Record<string, string>;
}

/**
 * Exchange an authorization code and enumerate the connectable targets for the
 * platform (Facebook Pages, Instagram business accounts, or LinkedIn
 * person/organization URNs). The caller stores the single target directly or,
 * when more than one exists, asks the admin to choose.
 */
export async function listOAuthTargets(
  platform: SocialPlatform,
  code: string,
): Promise<OAuthTarget[]> {
  const redirectUri = getRedirectUri(platform);
  if (platform === "linkedin") {
    return listLinkedInTargets(code, redirectUri);
  }
  return listMetaTargets(platform, code, redirectUri);
}

async function listMetaTargets(
  platform: "facebook" | "instagram",
  code: string,
  redirectUri: string,
): Promise<OAuthTarget[]> {
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
  const list = pages.data ?? [];
  if (list.length === 0) {
    throw new Error(
      "لم يتم العثور على صفحة فيسبوك مرتبطة بهذا الحساب. تأكد من إدارتك لصفحة واحدة على الأقل.",
    );
  }

  if (platform === "facebook") {
    return list.map((page) => ({
      id: page.id,
      name: page.name || page.id,
      subtitle: "صفحة فيسبوك",
      fields: { pageId: page.id, accessToken: page.access_token },
    }));
  }

  // instagram: resolve the IG business account linked to each Page; only Pages
  // with a linked IG business account are connectable targets.
  const targets: OAuthTarget[] = [];
  for (const page of list) {
    const igUrl =
      `${GRAPH_BASE}/${page.id}?` +
      new URLSearchParams({
        fields: "instagram_business_account{id,username}",
        access_token: page.access_token,
      }).toString();
    try {
      const ig = await metaJson<{
        instagram_business_account?: { id: string; username?: string };
      }>(igUrl);
      const igAccount = ig.instagram_business_account;
      if (!igAccount?.id) continue;
      targets.push({
        id: igAccount.id,
        name: igAccount.username ? `@${igAccount.username}` : igAccount.id,
        subtitle: `إنستجرام عبر صفحة ${page.name || page.id}`,
        fields: { igUserId: igAccount.id, accessToken: page.access_token },
      });
    } catch {
      // Skip Pages we cannot inspect for a linked IG account.
    }
  }
  if (targets.length === 0) {
    throw new Error(
      "لا يوجد حساب إنستجرام أعمال مرتبط بصفحة فيسبوك. اربط حساب إنستجرام أعمال بالصفحة ثم أعد المحاولة.",
    );
  }
  return targets;
}

async function listLinkedInTargets(
  code: string,
  redirectUri: string,
): Promise<OAuthTarget[]> {
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
    expires_in?: number;
    error_description?: string;
  };
  if (!tokenRes.ok || !token.access_token) {
    throw new Error(token.error_description || `HTTP ${tokenRes.status}`);
  }
  const accessToken = token.access_token;

  // Resolve the member URN via the OpenID userinfo endpoint.
  const infoRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const info = (await infoRes.json()) as { sub?: string; name?: string };
  if (!infoRes.ok || !info.sub) {
    throw new Error("تعذّر تحديد معرّف الناشر (Author URN) من LinkedIn.");
  }
  // LinkedIn access tokens expire (~60 days); record an absolute expiry so the
  // dashboard can nudge a reconnect before auto-publishing silently fails.
  const expiryFields: Record<string, string> = {};
  if (typeof token.expires_in === "number" && token.expires_in > 0) {
    expiryFields["tokenExpiresAt"] = new Date(
      Date.now() + token.expires_in * 1000,
    ).toISOString();
  }

  const targets: OAuthTarget[] = [
    {
      id: `urn:li:person:${info.sub}`,
      name: info.name || "الحساب الشخصي",
      subtitle: "حساب شخصي (Personal)",
      fields: {
        accessToken,
        authorUrn: `urn:li:person:${info.sub}`,
        ...expiryFields,
      },
    },
  ];

  // Organizations the member administers (requires the opt-in org scopes).
  if (linkedInOrgEnabled()) {
    try {
      const orgs = await listLinkedInOrganizations(accessToken, info.sub);
      for (const org of orgs) {
        targets.push({
          id: org.urn,
          name: org.name,
          subtitle: "صفحة شركة (Organization)",
          fields: { accessToken, authorUrn: org.urn, ...expiryFields },
        });
      }
    } catch (err) {
      // Fall back to person-only when org listing isn't permitted/available,
      // but surface the reason so the failure is diagnosable.
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "LinkedIn organization listing failed; offering person account only",
      );
    }
  }
  return targets;
}

/** List LinkedIn organizations the member administers (URN + display name). */
async function listLinkedInOrganizations(
  accessToken: string,
  memberSub: string,
): Promise<{ urn: string; name: string }[]> {
  // The roleAssignee finder requires the member URN it is querying for.
  const roleAssignee = `urn:li:person:${memberSub}`;
  const url =
    "https://api.linkedin.com/v2/organizationAcls?" +
    `q=roleAssignee&roleAssignee=${encodeURIComponent(roleAssignee)}` +
    "&role=ADMINISTRATOR&state=APPROVED" +
    "&projection=(elements*(organizationalTarget~(id,localizedName)))";
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`organizationAcls HTTP ${res.status} ${body}`.trim());
  }
  const data = (await res.json()) as {
    elements?: {
      organizationalTarget?: string;
      "organizationalTarget~"?: { id?: number | string; localizedName?: string };
    }[];
  };
  const out: { urn: string; name: string }[] = [];
  for (const el of data.elements ?? []) {
    const urn = el.organizationalTarget;
    if (!urn) continue;
    const decorated = el["organizationalTarget~"];
    out.push({ urn, name: decorated?.localizedName || urn });
  }
  return out;
}

/* ─── Pending target selection (in-memory, short-lived) ──────── */

/**
 * When OAuth yields more than one connectable target, the captured tokens are
 * held in process memory (never persisted) until the admin chooses which one to
 * store. Entries expire quickly and are removed once consumed.
 */
interface PendingSelection {
  platform: SocialPlatform;
  targets: OAuthTarget[];
  exp: number;
}

const PENDING_TTL_MS = 10 * 60 * 1000;
const pendingSelections = new Map<string, PendingSelection>();

function prunePending(): void {
  const now = Date.now();
  for (const [id, entry] of pendingSelections) {
    if (entry.exp <= now) pendingSelections.delete(id);
  }
}

/** Store the captured targets and return an opaque id for the chooser flow. */
export function createPendingSelection(
  platform: SocialPlatform,
  targets: OAuthTarget[],
): string {
  prunePending();
  const id = crypto.randomBytes(18).toString("base64url");
  pendingSelections.set(id, {
    platform,
    targets,
    exp: Date.now() + PENDING_TTL_MS,
  });
  return id;
}

/** Look up a live pending selection for a platform (null if missing/expired). */
export function getPendingSelection(
  platform: SocialPlatform,
  id: string,
): PendingSelection | null {
  prunePending();
  const entry = pendingSelections.get(id);
  if (!entry || entry.platform !== platform) return null;
  return entry;
}

/** Remove a pending selection once it has been used. */
export function consumePendingSelection(id: string): void {
  pendingSelections.delete(id);
}
