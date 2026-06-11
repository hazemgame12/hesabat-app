import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, superAdminsTable, superAdminSessionsTable } from "@workspace/db";
import { hashPassword, verifyPassword, generateSessionToken, hashToken } from "../lib/auth";
import { requireSuperAdmin, SUPER_ADMIN_COOKIE } from "../middleware/super-admin";
import { z } from "zod/v4";

const router = Router();

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function setSuperAdminCookie(res: any, token: string) {
  const isProd = process.env["NODE_ENV"] === "production";
  const maxAge = 1000 * 60 * 60 * 24 * 30; // 30 days
  res.cookie(SUPER_ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge,
  });
}

function clearSuperAdminCookie(res: any) {
  const isProd = process.env["NODE_ENV"] === "production";
  res.clearCookie(SUPER_ADMIN_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
  });
}

// POST /super-admin/auth/login
router.post("/super-admin/auth/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid credentials" });
    return;
  }
  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const rows = await db
    .select()
    .from(superAdminsTable)
    .where(eq(superAdminsTable.email, normalizedEmail))
    .limit(1);

  const admin = rows[0];
  if (!admin || !admin.isActive) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await verifyPassword(password, admin.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  await db.insert(superAdminSessionsTable).values({
    superAdminId: admin.id,
    tokenHash: hashToken(token),
    expiresAt,
  });

  setSuperAdminCookie(res, token);
  res.json({
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
  });
});

// POST /super-admin/auth/logout
router.post("/super-admin/auth/logout", async (req, res) => {
  const token = req.cookies?.[SUPER_ADMIN_COOKIE];
  if (token) {
    await db
      .delete(superAdminSessionsTable)
      .where(eq(superAdminSessionsTable.tokenHash, hashToken(token)));
  }
  clearSuperAdminCookie(res);
  res.json({ ok: true });
});

// GET /super-admin/auth/me
router.get("/super-admin/auth/me", requireSuperAdmin, async (req, res) => {
  const ctx = req.superAdmin!;
  res.json({
    id: ctx.superAdminId,
    name: ctx.name,
    email: ctx.email,
    role: ctx.role,
  });
});

export default router;
