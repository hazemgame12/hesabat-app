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

app.use("/api", router);
app.use(seoRouter);

app.use("/uploads", express.static(uploadsDir, { maxAge: "30d" }));

const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));
app.use(/.*/, (_req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

export default app;
