import { type Request, type Response, type NextFunction } from "express";
import { resolveSession, SESSION_COOKIE } from "../lib/session";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!token) {
    res.status(401).json({ error: "غير مصرح" });
    return;
  }
  const auth = await resolveSession(token);
  if (!auth) {
    res.status(401).json({ error: "غير مصرح" });
    return;
  }
  req.auth = auth;
  next();
}
