import { rateLimit } from "express-rate-limit";

const isProd = process.env["NODE_ENV"] === "production";

/**
 * Login / signup / password-reset endpoints.
 * Tight window to stop brute-force and credential-stuffing attacks.
 * 10 attempts per IP per 15 minutes.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 10 : 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "كثرة المحاولات — يرجى المحاولة بعد 15 دقيقة",
    code: "RATE_LIMIT_AUTH",
  },
});

/**
 * General API routes (authenticated calls).
 * 300 requests per IP per minute — generous enough for normal use,
 * tight enough to stop automated scraping or accidental loops.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProd ? 300 : 1000,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "تجاوزت الحد المسموح به من الطلبات — يرجى المحاولة بعد قليل",
    code: "RATE_LIMIT_API",
  },
});

/**
 * File upload / Excel import endpoints.
 * Heavy operations — limit to 30 uploads per IP per 10 minutes.
 */
export const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: isProd ? 30 : 200,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "كثرة طلبات الرفع — يرجى المحاولة بعد 10 دقائق",
    code: "RATE_LIMIT_UPLOAD",
  },
});
