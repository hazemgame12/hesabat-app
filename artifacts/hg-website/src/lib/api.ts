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
  createdAt: string;
  updatedAt: string;
}

export type InsertArticle = Omit<ArticleRecord, "id" | "createdAt" | "updatedAt">;

const API_BASE = "/api";

function authHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export async function fetchArticles(): Promise<ArticleRecord[]> {
  const res = await fetch(`${API_BASE}/articles`);
  if (!res.ok) throw new Error("Failed to fetch articles");
  return res.json();
}

export async function fetchArticleBySlug(slug: string): Promise<ArticleRecord> {
  const res = await fetch(`${API_BASE}/articles/${slug}`);
  if (!res.ok) throw new Error("Article not found");
  return res.json();
}

export async function adminLogin(password: string): Promise<{ token: string }> {
  const res = await fetch(`${API_BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Login failed");
  }
  return res.json();
}

export async function adminFetchArticles(token: string): Promise<ArticleRecord[]> {
  const res = await fetch(`${API_BASE}/admin/articles`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error("Unauthorized");
  return res.json();
}

export async function adminCreateArticle(token: string, data: InsertArticle): Promise<ArticleRecord> {
  const res = await fetch(`${API_BASE}/admin/articles`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create article");
  return res.json();
}

export async function adminUpdateArticle(token: string, id: number, data: Partial<InsertArticle>): Promise<ArticleRecord> {
  const res = await fetch(`${API_BASE}/admin/articles/${id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update article");
  return res.json();
}

export async function adminDeleteArticle(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/articles/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to delete article");
}

export function getAdminToken(): string | null {
  return localStorage.getItem("admin_token");
}

export function setAdminToken(token: string) {
  localStorage.setItem("admin_token", token);
}

export function clearAdminToken() {
  localStorage.removeItem("admin_token");
}
