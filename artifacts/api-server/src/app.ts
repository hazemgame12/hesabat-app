import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import seoRouter from "./routes/seo";
import { uploadsDir } from "./routes/uploads";
import { logger } from "./lib/logger";
import { apiLimiter } from "./lib/rate-limit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        const path = req.url?.split("?")[0];
        return {
          id: req.id,
          method: req.method,
          // Invitation tokens are secrets carried in the path; redact them so
          // they never end up in logs.
          url: path?.replace(/\/invitations\/[^/]+/, "/invitations/[redacted]"),
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", apiLimiter, router);
app.use(seoRouter);

app.use("/uploads", express.static(uploadsDir, { maxAge: "30d" }));
// Also expose uploads under /api so they route through the shared proxy
// (only /api is mapped to this service) — used by the Hesabat app for logos.
app.use("/api/uploads", express.static(uploadsDir, { maxAge: "30d" }));

const publicPath = path.join(__dirname, "public");
// Hashed assets (JS/CSS) — safe to cache aggressively (filename changes on every build)
app.use("/assets", express.static(path.join(publicPath, "assets"), { maxAge: "1y", immutable: true }));
// Serve static files; index.html always gets no-cache so new deploys are picked up immediately
app.use(express.static(publicPath, {
  maxAge: 0,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith("index.html")) {
      res.set("Cache-Control", "no-cache, no-store, must-revalidate");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
    }
  },
}));
// SPA fallback for deep routes
app.use(/.*/, (_req, res) => {
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.sendFile(path.join(publicPath, "index.html"));
});

export default app;
