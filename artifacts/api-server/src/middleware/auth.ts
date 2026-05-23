import { type Request, type Response, type NextFunction } from "express";

export function adminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  const secret = process.env["ADMIN_SECRET"];
  if (!secret || token !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
