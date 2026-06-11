import { Router } from "express";
import { eq, and, gt, isNull } from "drizzle-orm";
import {
  db,
  usersTable,
  companiesTable,
  passwordResetTokensTable,
  type User,
  type Company,
} from "@workspace/db";
import { SignupBody, LoginBody } from "@workspace/api-zod";
import { COUNTRY_INFO, isCountry, isCurrency } from "@workspace/locale";
import { hashPassword, verifyPassword, hashToken, generateSessionToken } from "../lib/auth";
import { sendPasswordResetEmail } from "../lib/mailer";
import {
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  SESSION_COOKIE,
} from "../lib/session";
import { requireAuth } from "../middleware/require-auth";
import { seedDefaultAccounts } from "../lib/seed-accounts";
import { seedDefaultTaxes } from "../lib/seed-taxes";

const router = Router();

function toAuthUser(user: User, companyName: string, companyExtra?: { subscriptionStatus?: string | null; trialEndsAt?: Date | null; planId?: string | null; country?: string | null }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
    companyName,
    subscriptionStatus: companyExtra?.subscriptionStatus ?? null,
    trialEndsAt: companyExtra?.trialEndsAt?.toISOString() ?? null,
    planId: companyExtra?.planId ?? null,
    country: companyExtra?.country ?? null,
  };
}

router.post("/auth/signup", async (req, res) => {
  const parsed = SignupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
    return;
  }
  const { companyName, name, email, password, country, baseCurrency } =
    parsed.data;
  const normalizedEmail = email.toLowerCase().trim();
  const resolvedCountry = country && isCountry(country) ? country : "EG";
  const resolvedCurrency =
    baseCurrency && isCurrency(baseCurrency)
      ? baseCurrency
      : COUNTRY_INFO[resolvedCountry].defaultCurrency;
  try {
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "هذا البريد الإلكتروني مسجل بالفعل" });
      return;
    }

    const passwordHash = await hashPassword(password);
    const created = await db.transaction(async (tx) => {
      const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const [company] = await tx
        .insert(companiesTable)
        .values({
          name: companyName,
          country: resolvedCountry,
          baseCurrency: resolvedCurrency,
          subscriptionStatus: "trial",
          trialEndsAt,
        })
        .returning();
      const [user] = await tx
        .insert(usersTable)
        .values({
          companyId: company!.id,
          email: normalizedEmail,
          name,
          passwordHash,
          role: "owner",
        })
        .returning();
      const codeToId = await seedDefaultAccounts(tx, company!.id);
      await seedDefaultTaxes(tx, company!.id, resolvedCountry, codeToId);
      return { company: company as Company, user: user as User };
    });

    const token = await createSession(created.user.id);
    setSessionCookie(res, token);
    res.status(201).json(toAuthUser(created.user, created.company.name, {
      subscriptionStatus: created.company.subscriptionStatus,
      trialEndsAt: created.company.trialEndsAt,
      planId: created.company.planId,
      country: created.company.country,
    }));
  } catch (err) {
    req.log.error({ err }, "Signup failed");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

router.post("/auth/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
    return;
  }
  const normalizedEmail = parsed.data.email.toLowerCase().trim();
  try {
    const rows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .limit(1);
    const user = rows[0];
    if (!user) {
      res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
      return;
    }
    const ok = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
      return;
    }
    const companyRows = await db
      .select({ name: companiesTable.name, subscriptionStatus: companiesTable.subscriptionStatus, trialEndsAt: companiesTable.trialEndsAt, planId: companiesTable.planId, country: companiesTable.country })
      .from(companiesTable)
      .where(eq(companiesTable.id, user.companyId))
      .limit(1);
    const token = await createSession(user.id);
    setSessionCookie(res, token);
    const company = companyRows[0];
    res.json(toAuthUser(user, company?.name ?? "", company));
  } catch (err) {
    req.log.error({ err }, "Login failed");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

router.post("/auth/logout", async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (token) {
    try {
      await destroySession(token);
    } catch (err) {
      req.log.error({ err }, "Logout failed");
    }
  }
  clearSessionCookie(res);
  res.json({ status: "ok" });
});

router.get("/auth/me", requireAuth, async (req, res) => {
  const auth = req.auth!;
  const companyRows = await db
    .select({
      subscriptionStatus: companiesTable.subscriptionStatus,
      trialEndsAt: companiesTable.trialEndsAt,
      planId: companiesTable.planId,
      country: companiesTable.country,
    })
    .from(companiesTable)
    .where(eq(companiesTable.id, auth.companyId))
    .limit(1);
  const company = companyRows[0];
  res.json({
    id: auth.userId,
    name: auth.name,
    email: auth.email,
    role: auth.role,
    companyId: auth.companyId,
    companyName: auth.companyName,
    subscriptionStatus: company?.subscriptionStatus ?? null,
    trialEndsAt: company?.trialEndsAt?.toISOString() ?? null,
    planId: company?.planId ?? null,
    country: company?.country ?? null,
  });
});

// ---- Password reset --------------------------------------------------------

router.post("/auth/forgot-password", async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "البريد الإلكتروني مطلوب" });
    return;
  }
  const normalizedEmail = email.toLowerCase().trim();
  try {
    const rows = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .limit(1);
    const user = rows[0];
    if (!user) {
      // Don't reveal whether email exists for privacy
      res.json({ status: "ok" });
      return;
    }
    // Rate limit: max 3 active tokens per user
    const activeTokens = await db
      .select({ id: passwordResetTokensTable.id })
      .from(passwordResetTokensTable)
      .where(
        and(
          eq(passwordResetTokensTable.userId, user.id),
          isNull(passwordResetTokensTable.usedAt),
          gt(passwordResetTokensTable.expiresAt, new Date())
        )
      );
    if (activeTokens.length >= 3) {
      res.json({ status: "ok" });
      return;
    }
    const rawToken = generateSessionToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour
    await db.insert(passwordResetTokensTable).values({
      userId: user.id,
      tokenHash,
      expiresAt,
    });
    // Send email via Resend
    const emailSent = await sendPasswordResetEmail(normalizedEmail, user.name, rawToken);
    if (!emailSent) {
      req.log.error("Failed to send password reset email");
      res.status(500).json({ error: "تعذر إرسال بريد الإستعادة. خدمة البريد الإلكتروني غير مفعلة." });
      return;
    }
    res.json({ status: "ok" });
  } catch (err) {
    req.log.error({ err }, "Forgot password failed");
    res.json({ status: "ok" });
  }
});

router.post("/auth/reset-password", async (req, res) => {
  const { token, newPassword } = req.body as {
    token?: string;
    newPassword?: string;
  };
  if (!token || !newPassword || typeof token !== "string" || typeof newPassword !== "string") {
    res.status(400).json({ error: "الرمز وكلمة المرور الجديدة مطلوبان" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" });
    return;
  }
  const tokenHash = hashToken(token);
  try {
    const rows = await db
      .select({
        id: passwordResetTokensTable.id,
        userId: passwordResetTokensTable.userId,
        expiresAt: passwordResetTokensTable.expiresAt,
        usedAt: passwordResetTokensTable.usedAt,
      })
      .from(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.tokenHash, tokenHash))
      .limit(1);
    const record = rows[0];
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      res.status(400).json({ error: "الرمز غير صالح أو منتهي الصلاحية" });
      return;
    }
    const passwordHash = await hashPassword(newPassword);
    await db.transaction(async (tx) => {
      await tx
        .update(usersTable)
        .set({ passwordHash })
        .where(eq(usersTable.id, record.userId));
      await tx
        .update(passwordResetTokensTable)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokensTable.id, record.id));
    });
    res.json({ status: "ok" });
  } catch (err) {
    req.log.error({ err }, "Reset password failed");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

router.get("/auth/verify-reset-token", async (req, res) => {
  const token = req.query["token"] as string | undefined;
  if (!token) {
    res.status(400).json({ error: "الرمز مطلوب" });
    return;
  }
  const tokenHash = hashToken(token);
  try {
    const rows = await db
      .select({ id: passwordResetTokensTable.id, usedAt: passwordResetTokensTable.usedAt, expiresAt: passwordResetTokensTable.expiresAt })
      .from(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.tokenHash, tokenHash))
      .limit(1);
    const record = rows[0];
    const valid = !!record && !record.usedAt && record.expiresAt.getTime() > Date.now();
    res.json({ valid });
  } catch (err) {
    req.log.error({ err }, "Verify reset token failed");
    res.json({ valid: false });
  }
});

router.post("/auth/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    res.status(400).json({ error: "البيانات غير صالحة. كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل" });
    return;
  }
  try {
    const rows = await db
      .select({ id: usersTable.id, passwordHash: usersTable.passwordHash })
      .from(usersTable)
      .where(eq(usersTable.id, req.auth!.userId))
      .limit(1);
    const user = rows[0];
    if (!user) {
      res.status(404).json({ error: "المستخدم غير موجود" });
      return;
    }
    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "كلمة المرور الحالية غير صحيحة" });
      return;
    }
    const newHash = await hashPassword(newPassword);
    await db
      .update(usersTable)
      .set({ passwordHash: newHash })
      .where(eq(usersTable.id, user.id));
    res.json({ status: "ok" });
  } catch (err) {
    req.log.error({ err }, "Change password failed");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

export default router;
