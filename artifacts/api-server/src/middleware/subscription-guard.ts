import { type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, companiesTable } from "@workspace/db";
import { resolveSession, SESSION_COOKIE } from "../lib/session";

/**
 * Routes that a suspended company is still allowed to call.
 * Every other authenticated route is blocked with 402.
 */
const SUBSCRIPTION_WHITELIST = [
  "/auth/me",
  "/auth/logout",
  "/auth/exit-impersonation",
  "/plans",
  "/company/select-plan",
  "/company/subscription",
  "/company/subscription/renewal-request",
  "/payment-requests",
];

/**
 * Blocks API calls from companies whose subscription is `suspended`.
 *
 * This middleware is mounted BEFORE route-level requireAuth, so it must
 * resolve the session itself from the cookie rather than relying on
 * req.auth being populated.
 *
 * Super admin impersonation sessions bypass this guard so admins can
 * always inspect the data.
 * Companies with status `expired` are NOT blocked at the API level —
 * the frontend redirects them to /choose-plan; this keeps the app
 * usable while they renew.
 */
export async function subscriptionGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Resolve auth from cookie because this middleware runs before requireAuth.
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!token) {
    // No session cookie — unauthenticated, let requireAuth handle it.
    next();
    return;
  }

  const auth = await resolveSession(token);
  if (!auth) {
    // Invalid / expired session — let requireAuth handle it.
    next();
    return;
  }

  // Super admin impersonation bypasses subscription guard so admins can
  // always inspect the tenant's data.
  if (auth.isImpersonating) {
    next();
    return;
  }

  const path = req.path;

  // Check if this path is whitelisted (always allowed even when suspended).
  const isWhitelisted = SUBSCRIPTION_WHITELIST.some((w) => path.startsWith(w));
  if (isWhitelisted) {
    next();
    return;
  }

  // Fetch subscription status from DB to avoid stale session data.
  const rows = await db
    .select({ subscriptionStatus: companiesTable.subscriptionStatus })
    .from(companiesTable)
    .where(eq(companiesTable.id, auth.companyId))
    .limit(1);

  const status = rows[0]?.subscriptionStatus;
  if (status === "suspended") {
    res.status(402).json({
      error: "حساب شركتك موقوف مؤقتاً. تواصل مع الدعم أو سدد الاشتراك.",
      code: "SUBSCRIPTION_SUSPENDED",
    });
    return;
  }

  next();
}
