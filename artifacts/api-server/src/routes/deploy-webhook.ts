import { Router, type IRouter } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";

const router: IRouter = Router();

const WEBHOOK_SECRET = process.env.ADMIN_SECRET ?? "";

// Resolve the deploy script path. On the VPS the bundled server runs from
// /var/www/hg-website/dist/, so a path relative to import.meta.url is wrong.
// Prefer an explicit env override, then known VPS locations, then a
// repo-relative fallback for local/dev use.
function resolveScriptPath(): string {
  const fromEnv = process.env.DEPLOY_SCRIPT_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const candidates = [
    "/var/www/hesabat/scripts/update-hg.sh",
    path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      "../../../../scripts/update-hg.sh",
    ),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0]!;
}

const SCRIPT_PATH = resolveScriptPath();

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
  (req, res) => {
    const signature = (req.headers["x-hub-signature-256"] ?? "") as string;
    // rawBody is captured by the express.json verify hook in app.ts.
    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);

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
