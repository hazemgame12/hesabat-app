import {
  GRAPH_BASE,
  PLATFORM_FIELDS,
  getFacebookCreds,
  getFieldStatuses,
  getInstagramCreds,
  getLinkedInCreds,
  getPlatformSource,
  type FieldSource,
  type SocialPlatform,
} from "./config";
import { isOAuthConfigured } from "./oauth";

export interface ConnectionFieldStatus {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  /** Whether a value is currently resolved (from stored creds or env). */
  hasValue: boolean;
  source: FieldSource;
}

export interface ConnectionStatus {
  platform: SocialPlatform;
  /** Required credentials are all present (stored or env). */
  configured: boolean;
  /** Live API verification succeeded. */
  connected: boolean;
  /** Human-readable account/page name when verified. */
  accountName: string;
  /** Error message when verification fails. */
  error: string;
  /** Where the active credentials come from. */
  source: "stored" | "env" | "none";
  /** Per-field status used to render the dashboard connect form. */
  fields: ConnectionFieldStatus[];
  /** Env var names required to connect this platform (docs/fallback). */
  requiredEnv: string[];
  /** Whether one-click in-app OAuth ("Connect" button) is available. */
  oauthAvailable: boolean;
}

async function base(
  platform: SocialPlatform,
  configured: boolean,
): Promise<ConnectionStatus> {
  const fields = await getFieldStatuses(platform);
  return {
    platform,
    configured,
    connected: false,
    accountName: "",
    error: "",
    source: await getPlatformSource(platform),
    fields,
    requiredEnv: PLATFORM_FIELDS[platform]
      .filter((f) => f.required)
      .map((f) => f.envVar),
    oauthAvailable: isOAuthConfigured(platform),
  };
}

async function verifyFacebook(): Promise<ConnectionStatus> {
  const creds = await getFacebookCreds();
  const status = await base("facebook", creds !== null);
  if (!creds) return status;
  try {
    const url = `${GRAPH_BASE}/${creds.pageId}?fields=name&access_token=${encodeURIComponent(creds.accessToken)}`;
    const res = await fetch(url);
    const data = (await res.json()) as { name?: string; error?: { message?: string } };
    if (!res.ok || data.error) {
      status.error = data.error?.message || `HTTP ${res.status}`;
      return status;
    }
    status.connected = true;
    status.accountName = data.name || creds.pageId;
  } catch (err) {
    status.error = err instanceof Error ? err.message : String(err);
  }
  return status;
}

async function verifyInstagram(): Promise<ConnectionStatus> {
  const creds = await getInstagramCreds();
  const status = await base("instagram", creds !== null);
  if (!creds) return status;
  try {
    const url = `${GRAPH_BASE}/${creds.igUserId}?fields=username&access_token=${encodeURIComponent(creds.accessToken)}`;
    const res = await fetch(url);
    const data = (await res.json()) as { username?: string; error?: { message?: string } };
    if (!res.ok || data.error) {
      status.error = data.error?.message || `HTTP ${res.status}`;
      return status;
    }
    status.connected = true;
    status.accountName = data.username ? `@${data.username}` : creds.igUserId;
  } catch (err) {
    status.error = err instanceof Error ? err.message : String(err);
  }
  return status;
}

async function verifyLinkedIn(): Promise<ConnectionStatus> {
  const creds = await getLinkedInCreds();
  const status = await base("linkedin", creds !== null);
  if (!creds) return status;
  // Lightweight token validation: a 401 means the token is invalid/expired and
  // we should not report "connected". A 403 (token valid but scope-limited for
  // /me) is tolerated, since publishing uses org/UGC scopes, not profile read.
  try {
    const res = await fetch("https://api.linkedin.com/v2/me", {
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "X-Restli-Protocol-Version": "2.0.0",
      },
    });
    if (res.status === 401) {
      status.error = "رمز الوصول غير صالح أو منتهي الصلاحية (401)";
      return status;
    }
    status.connected = true;
    status.accountName = creds.authorUrn;
  } catch (err) {
    status.error = err instanceof Error ? err.message : String(err);
  }
  return status;
}

export async function getConnectionStatuses(): Promise<ConnectionStatus[]> {
  return Promise.all([verifyFacebook(), verifyInstagram(), verifyLinkedIn()]);
}

export async function getConnectionStatus(
  platform: SocialPlatform,
): Promise<ConnectionStatus> {
  switch (platform) {
    case "facebook":
      return verifyFacebook();
    case "instagram":
      return verifyInstagram();
    case "linkedin":
      return verifyLinkedIn();
  }
}
