import { Router, type IRouter } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { spawn } from "child_process";
import path from "path";

const router: IRouter = Router();

const WEBHOOK_SECRET = process.env.ADMIN_SECRET ?? "";
const SCRIPT_PATH = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../../../scripts/update-hg.sh",
);

function verifySignature(payload: Buffer, signature: string): boolean {
  if (!WEBHOOK_SECRET) return false;
  const expected = "sha256=" + createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

router.post(
  "/webhook/deploy",
  (req, res, next) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      (req as unknown as { rawBody: Buffer }).rawBody = Buffer.concat(chunks);
      next();
    });
  },
  (req, res) => {
    const signature = (req.headers["x-hub-signature-256"] ?? "") as string;
    const rawBody = (req as unknown as { rawBody: Buffer }).rawBody ?? Buffer.alloc(0);

    if (!verifySignature(rawBody, signature)) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    let payload: { ref?: string } = {};
    try { payload = JSON.parse(rawBody.toString()); } catch { /* ignore */ }

    if (payload.ref && payload.ref !== "refs/heads/main") {
      res.json({ status: "skipped", ref: payload.ref });
      return;
    }

    res.json({ status: "deploying" });

    const proc = spawn("bash", [SCRIPT_PATH], {
      detached: true,
      stdio: ["ignore", "ignore", "ignore"],
      env: { ...process.env, FORCE_COLOR: "0" },
    });
    proc.unref();
  },
);

export default router;
