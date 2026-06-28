import { Router, type IRouter } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

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

// Admin schema-check endpoint — returns DB column info for dimension tables.
// Protected by ADMIN_SECRET bearer token; no user session needed.
router.get(
  "/webhook/schema-check",
  async (req, res) => {
    const token = (req.headers["x-admin-secret"] ?? "") as string;
    const secret = WEBHOOK_SECRET;
    // timingSafeEqual throws if buffer lengths differ — check first
    const authed =
      secret.length > 0 &&
      token.length === secret.length &&
      timingSafeEqual(Buffer.from(token), Buffer.from(secret));
    if (!authed) {
      res.status(401).json({ error: "Unauthorized", tokenLen: token.length, secretLen: secret.length });
      return;
    }
    try {
      // Quick connectivity test
      const ping = await db.execute(sql`SELECT current_database() AS db, now() AS ts`);
      const pingRow = (ping.rows ?? ping)[0] as any;

      // Dimension columns
      const cols = await db.execute(sql`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_name IN ('cost_centers','branches','projects')
          AND column_name IN ('code','is_active','name_ar')
        ORDER BY table_name, column_name
      `);
      res.json({ db: pingRow?.db, ts: pingRow?.ts, columns: cols.rows ?? cols });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

export default router;
