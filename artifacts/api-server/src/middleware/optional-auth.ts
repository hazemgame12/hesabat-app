import { type Request, type Response, type NextFunction } from "express";
import { resolveSession, SESSION_COOKIE } from "../lib/session";

export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (token) {
    const auth = await resolveSession(token);
    if (auth) req.auth = auth;
  }
  next();
}
