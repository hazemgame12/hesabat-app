import { type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, companiesTable } from "@workspace/db";

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
  "/payment-requests",
];

/**
 * Blocks API calls from companies whose subscription is `suspended`.
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
  const auth = (req as any).auth;
  if (!auth) {
    // Not authenticated — let the requireAuth middleware handle it.
    next();
    return;
  }

  // Super admin impersonation bypasses subscription guard.
  if (auth.isImpersonating) {
    next();
    return;
  }

  const path = req.path;

  // Check if this path is whitelisted.
  const isWhitelisted = SUBSCRIPTION_WHITELIST.some((w) => path.startsWith(w));
  if (isWhitelisted) {
    next();
    return;
  }

  // Fetch subscription status from DB (already available via session but
  // we double-check here to avoid stale session data).
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
