/* ─── Article types ─────────────────────────────────────────── */
export interface ArticleRecord {
  id: number;
  slug: string;
  categoryAr: string;
  categoryEn: string;
  date: string;
  readTimeAr: string;
  readTimeEn: string;
  titleAr: string;
  titleEn: string;
  excerptAr: string;
  excerptEn: string;
  contentAr: string;
  contentEn: string;
  image: string;
  published: boolean;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export type InsertArticle = Omit<ArticleRecord, "id" | "createdAt" | "updatedAt">;

/* ─── Social Post types ─────────────────────────────────────── */
export type SocialPlatform = "facebook" | "instagram" | "linkedin";
export interface SocialPostRecord {
  id: number;
  platform: SocialPlatform;
  captionAr: string;
  captionEn: string;
  image: string;
  link: string;
  status: string;
  scheduledAt: string | null;
  releasedAt: string | null;
  articleId: number | null;
  publishResult: "published" | "failed" | null;
  publishError: string;
  platformPostId: string;
  publishedAt: string | null;
  publishAttempts: number;
  createdAt: string;
  updatedAt: string;
}
export type InsertSocialPost = Omit<
  SocialPostRecord,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "publishResult"
  | "publishError"
  | "platformPostId"
  | "publishedAt"
  | "publishAttempts"
>;

export interface SocialConnectionField {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  hasValue: boolean;
  source: "stored" | "env" | "";
}
export interface SocialConnectionStatus {
  platform: SocialPlatform;
  configured: boolean;
  connected: boolean;
  accountName: string;
  error: string;
  source: "stored" | "env" | "none";
  fields: SocialConnectionField[];
  requiredEnv: string[];
}

/* ─── AI generation types ───────────────────────────────────── */
export interface AIGeneratedArticle {
  slug: string;
  categoryAr: string;
  categoryEn: string;
  readTimeAr: string;
  readTimeEn: string;
  titleAr: string;
  titleEn: string;
  excerptAr: string;
  excerptEn: string;
  contentAr: string;
  contentEn: string;
}
export interface AIGeneratedSocial {
  platform: SocialPlatform;
  captionAr: string;
  captionEn: string;
}
export interface AIGeneratedContent {
  article: AIGeneratedArticle;
  social: AIGeneratedSocial[];
}

/* ─── Service types ─────────────────────────────────────────── */
export interface ServiceRecord {
  id: number;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  image: string;
  order: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}
export type InsertService = Omit<ServiceRecord, "id" | "createdAt" | "updatedAt">;

/* ─── Package types ─────────────────────────────────────────── */
export interface PackageRecord {
  id: number;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  featuresAr: string[];
  featuresEn: string[];
  highlighted: boolean;
  order: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}
export type InsertPackage = Omit<PackageRecord, "id" | "createdAt" | "updatedAt">;

/* ─── Lead types ────────────────────────────────────────────── */
export interface LeadRecord {
  id: number;
  name: string;
  phone: string;
  email: string;
  message: string;
  service: string;
  source: string;
  status: string;
  notes: string;
  createdAt: string;
}
export type InsertLead = Omit<LeadRecord, "id" | "createdAt">;

/* ─── Case Study types ──────────────────────────────────────── */
export interface CaseStudyRecord {
  id: number;
  slug: string;
  titleAr: string;
  titleEn: string;
  clientName: string;
  industryAr: string;
  industryEn: string;
  summaryAr: string;
  summaryEn: string;
  challengeAr: string;
  challengeEn: string;
  solutionAr: string;
  solutionEn: string;
  resultsAr: string;
  resultsEn: string;
  image: string;
  order: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}
export type InsertCaseStudy = Omit<CaseStudyRecord, "id" | "createdAt" | "updatedAt">;

/* ─── Settings type ─────────────────────────────────────────── */
export type SiteSettings = Record<string, string>;

/* ─── Auth helpers ──────────────────────────────────────────── */
export function getAdminToken(): string | null { return localStorage.getItem("admin_token"); }
export function setAdminToken(token: string) { localStorage.setItem("admin_token", token); }
export function clearAdminToken() { localStorage.removeItem("admin_token"); }

function authHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

/* ─── Public API ────────────────────────────────────────────── */
export async function fetchArticles(): Promise<ArticleRecord[]> {
  const res = await fetch("/api/articles");
  if (!res.ok) throw new Error("Failed to fetch articles");
  return res.json();
}

export async function fetchArticleBySlug(slug: string): Promise<ArticleRecord> {
  const res = await fetch(`/api/articles/${slug}`);
  if (!res.ok) throw new Error("Article not found");
  return res.json();
}

export async function fetchServices(): Promise<ServiceRecord[]> {
  const res = await fetch("/api/services");
  if (!res.ok) throw new Error("Failed to fetch services");
  return res.json();
}

export async function fetchPackages(): Promise<PackageRecord[]> {
  const res = await fetch("/api/packages");
  if (!res.ok) throw new Error("Failed to fetch packages");
  return res.json();
}

export async function fetchCaseStudies(): Promise<CaseStudyRecord[]> {
  const res = await fetch("/api/case-studies");
  if (!res.ok) throw new Error("Failed to fetch case studies");
  return res.json();
}

export async function fetchCaseStudyBySlug(slug: string): Promise<CaseStudyRecord> {
  const res = await fetch(`/api/case-studies/${slug}`);
  if (!res.ok) throw new Error("Case study not found");
  return res.json();
}

export async function fetchSettings(): Promise<SiteSettings> {
  const res = await fetch("/api/settings");
  if (!res.ok) throw new Error("Failed to fetch settings");
  return res.json();
}

export async function fetchSocialPosts(): Promise<SocialPostRecord[]> {
  const res = await fetch("/api/social-posts");
  if (!res.ok) throw new Error("Failed to fetch updates");
  return res.json();
}

export async function submitLead(data: InsertLead): Promise<LeadRecord> {
  const res = await fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to submit lead");
  return res.json();
}

/* ─── Admin: Login ──────────────────────────────────────────── */
export async function adminLogin(password: string): Promise<{ token: string }> {
  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Login failed"); }
  return res.json();
}

/* ─── Admin: Articles ───────────────────────────────────────── */
export async function adminFetchArticles(token: string): Promise<ArticleRecord[]> {
  const res = await fetch("/api/admin/articles", { headers: authHeaders(token) });
  if (!res.ok) throw new Error("Unauthorized");
  return res.json();
}

export async function adminCreateArticle(token: string, data: InsertArticle): Promise<ArticleRecord> {
  const res = await fetch("/api/admin/articles", { method: "POST", headers: authHeaders(token), body: JSON.stringify(data) });
  if (!res.ok) throw new Error("Failed to create article");
  return res.json();
}

export async function adminUpdateArticle(token: string, id: number, data: Partial<InsertArticle>): Promise<ArticleRecord> {
  const res = await fetch(`/api/admin/articles/${id}`, { method: "PUT", headers: authHeaders(token), body: JSON.stringify(data) });
  if (!res.ok) throw new Error("Failed to update article");
  return res.json();
}

export async function adminDeleteArticle(token: string, id: number): Promise<void> {
  const res = await fetch(`/api/admin/articles/${id}`, { method: "DELETE", headers: authHeaders(token) });
  if (!res.ok) throw new Error("Failed to delete article");
}

/* ─── Admin: Settings ───────────────────────────────────────── */
export async function adminUpdateSettings(token: string, settings: SiteSettings): Promise<SiteSettings> {
  const res = await fetch("/api/admin/settings", { method: "PUT", headers: authHeaders(token), body: JSON.stringify(settings) });
  if (!res.ok) throw new Error("Failed to update settings");
  return res.json();
}

/* ─── Admin: AI Content Studio ──────────────────────────────── */
export async function adminGenerateContent(
  token: string,
  body: { topic: string; platforms?: SocialPlatform[] },
): Promise<AIGeneratedContent> {
  const res = await fetch("/api/admin/ai/generate-content", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = "فشل توليد المحتوى";
    try { const d = await res.json(); msg = d.error || msg; } catch { /* ignore */ }
    throw new Error(typeof msg === "string" ? msg : "فشل توليد المحتوى");
  }
  return res.json();
}

/* ─── Admin: Social Posts ───────────────────────────────────── */
export async function adminFetchSocialPosts(token: string): Promise<SocialPostRecord[]> {
  const res = await fetch("/api/admin/social-posts", { headers: authHeaders(token) });
  if (!res.ok) throw new Error("Unauthorized");
  return res.json();
}

export async function adminCreateSocialPost(token: string, data: InsertSocialPost): Promise<SocialPostRecord> {
  const res = await fetch("/api/admin/social-posts", { method: "POST", headers: authHeaders(token), body: JSON.stringify(data) });
  if (!res.ok) throw new Error("Failed to create social post");
  return res.json();
}

export async function adminUpdateSocialPost(token: string, id: number, data: Partial<InsertSocialPost>): Promise<SocialPostRecord> {
  const res = await fetch(`/api/admin/social-posts/${id}`, { method: "PUT", headers: authHeaders(token), body: JSON.stringify(data) });
  if (!res.ok) throw new Error("Failed to update social post");
  return res.json();
}

export async function adminDeleteSocialPost(token: string, id: number): Promise<void> {
  const res = await fetch(`/api/admin/social-posts/${id}`, { method: "DELETE", headers: authHeaders(token) });
  if (!res.ok) throw new Error("Failed to delete social post");
}

export async function adminReleaseSocialPost(token: string, id: number): Promise<SocialPostRecord> {
  const res = await fetch(`/api/admin/social-posts/${id}/release`, { method: "POST", headers: authHeaders(token) });
  if (!res.ok) throw new Error("Failed to release social post");
  return res.json();
}

export async function adminRetrySocialPost(token: string, id: number): Promise<SocialPostRecord> {
  const res = await fetch(`/api/admin/social-posts/${id}/retry`, { method: "POST", headers: authHeaders(token) });
  if (!res.ok) throw new Error("Failed to retry social post");
  return res.json();
}

export async function adminFetchSocialConnections(token: string): Promise<SocialConnectionStatus[]> {
  const res = await fetch("/api/admin/social-connections", { headers: authHeaders(token) });
  if (!res.ok) throw new Error("Unauthorized");
  return res.json();
}

export async function adminSaveSocialConnection(
  token: string,
  platform: SocialPlatform,
  fields: Record<string, string>,
): Promise<SocialConnectionStatus> {
  const res = await fetch(`/api/admin/social-connections/${platform}`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || "Failed to save connection");
  }
  return res.json();
}

export async function adminDisconnectSocial(
  token: string,
  platform: SocialPlatform,
): Promise<SocialConnectionStatus> {
  const res = await fetch(`/api/admin/social-connections/${platform}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to disconnect");
  return res.json();
}
