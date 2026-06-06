import { Router } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  usersTable,
  companiesTable,
  type User,
  type Company,
} from "@workspace/db";
import { SignupBody, LoginBody } from "@workspace/api-zod";
import { COUNTRY_INFO, isCountry, isCurrency } from "@workspace/locale";
import { hashPassword, verifyPassword } from "../lib/auth";
import {
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  SESSION_COOKIE,
} from "../lib/session";
import { requireAuth } from "../middleware/require-auth";

const router = Router();

function toAuthUser(user: User, companyName: string) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
    companyName,
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
      const [company] = await tx
        .insert(companiesTable)
        .values({
          name: companyName,
          country: resolvedCountry,
          baseCurrency: resolvedCurrency,
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
      return { company: company as Company, user: user as User };
    });

    const token = await createSession(created.user.id);
    setSessionCookie(res, token);
    res.status(201).json(toAuthUser(created.user, created.company.name));
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
      .select({ name: companiesTable.name })
      .from(companiesTable)
      .where(eq(companiesTable.id, user.companyId))
      .limit(1);
    const token = await createSession(user.id);
    setSessionCookie(res, token);
    res.json(toAuthUser(user, companyRows[0]?.name ?? ""));
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

router.get("/auth/me", requireAuth, (req, res) => {
  const auth = req.auth!;
  res.json({
    id: auth.userId,
    name: auth.name,
    email: auth.email,
    role: auth.role,
    companyId: auth.companyId,
    companyName: auth.companyName,
  });
});

export default router;
