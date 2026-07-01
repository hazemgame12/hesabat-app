import { type Response } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  sessionsTable,
  usersTable,
  companiesTable,
  superAdminsTable,
} from "@workspace/db";
import { generateSessionToken, hashToken } from "./auth";

export const SESSION_COOKIE = "hesabat_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const IMPERSONATION_TTL_MS = 1000 * 60 * 60 * 4; // 4 hours

function isProd(): boolean {
  return process.env["NODE_ENV"] === "production";
}

export type AuthContext = {
  userId: string;
  companyId: string;
  role: string;
  name: string;
  email: string;
  companyName: string;
  isImpersonating: boolean;
  impersonatedByName: string | null;
  impersonatedBySuperAdminId: string | null;
};

export async function createSession(userId: string): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessionsTable).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    isImpersonating: false,
  });
  return token;
}

/** Create a short-lived impersonation session on behalf of a super admin. */
export async function createImpersonationSession(
  userId: string,
  superAdminId: string,
): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + IMPERSONATION_TTL_MS);
  await db.insert(sessionsTable).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    isImpersonating: true,
    impersonatedBySuperAdminId: superAdminId,
  });
  return token;
}

export async function destroySession(token: string): Promise<void> {
  await db
    .delete(sessionsTable)
    .where(eq(sessionsTable.tokenHash, hashToken(token)));
}

export async function resolveSession(
  token: string,
): Promise<AuthContext | null> {
  const tokenHash = hashToken(token);
  const rows = await db
    .select({
      userId: usersTable.id,
      companyId: usersTable.companyId,
      role: usersTable.role,
      name: usersTable.name,
      email: usersTable.email,
      companyName: companiesTable.name,
      expiresAt: sessionsTable.expiresAt,
      isImpersonating: sessionsTable.isImpersonating,
      impersonatedBySuperAdminId: sessionsTable.impersonatedBySuperAdminId,
    })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .innerJoin(companiesTable, eq(usersTable.companyId, companiesTable.id))
    .where(eq(sessionsTable.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await db
      .delete(sessionsTable)
      .where(eq(sessionsTable.tokenHash, tokenHash));
    return null;
  }

  let impersonatedByName: string | null = null;
  if (row.isImpersonating && row.impersonatedBySuperAdminId) {
    const adminRows = await db
      .select({ name: superAdminsTable.name })
      .from(superAdminsTable)
      .where(eq(superAdminsTable.id, row.impersonatedBySuperAdminId))
      .limit(1);
    impersonatedByName = adminRows[0]?.name ?? null;
  }

  return {
    userId: row.userId,
    companyId: row.companyId,
    role: row.role,
    name: row.name,
    email: row.email,
    companyName: row.companyName,
    isImpersonating: row.isImpersonating,
    impersonatedByName,
    impersonatedBySuperAdminId: row.impersonatedBySuperAdminId ?? null,
  };
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd(),
    path: "/",
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd(),
    path: "/",
  });
}
