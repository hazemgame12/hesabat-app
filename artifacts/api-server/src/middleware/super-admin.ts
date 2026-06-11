import { type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, superAdminSessionsTable, superAdminsTable } from "@workspace/db";
import { hashToken } from "../lib/auth";

export const SUPER_ADMIN_COOKIE = "hesabat_super_admin";

export type SuperAdminContext = {
  superAdminId: string;
  email: string;
  name: string;
  role: string;
};

declare global {
  namespace Express {
    interface Request {
      superAdmin?: SuperAdminContext;
    }
  }
}

export async function requireSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = req.cookies?.[SUPER_ADMIN_COOKIE];
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const tokenHash = hashToken(token);
  const rows = await db
    .select({
      superAdminId: superAdminsTable.id,
      email: superAdminsTable.email,
      name: superAdminsTable.name,
      role: superAdminsTable.role,
      isActive: superAdminsTable.isActive,
      expiresAt: superAdminSessionsTable.expiresAt,
    })
    .from(superAdminSessionsTable)
    .innerJoin(
      superAdminsTable,
      eq(superAdminSessionsTable.superAdminId, superAdminsTable.id),
    )
    .where(eq(superAdminSessionsTable.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  if (!row || !row.isActive || row.expiresAt.getTime() < Date.now()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.superAdmin = {
    superAdminId: row.superAdminId,
    email: row.email,
    name: row.name,
    role: row.role,
  };
  next();
}

export function requireSuperAdminRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.superAdmin) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(req.superAdmin.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
