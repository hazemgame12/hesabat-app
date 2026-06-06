import { type Request, type Response, type NextFunction } from "express";
import { hasCapability, type Capability } from "@workspace/permissions";

// Must run after requireAuth. Rejects with 403 when the authenticated user's
// role does not grant the required capability.
export function requireCapability(cap: Capability) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.auth?.role;
    if (!role || !hasCapability(role, cap)) {
      res.status(403).json({ error: "ليس لديك صلاحية لتنفيذ هذا الإجراء" });
      return;
    }
    next();
  };
}
