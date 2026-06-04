import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function parseEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadEnv(): void {
  const candidates = [
    process.env["ENV_FILE"],
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "dist", ".env"),
  ].filter((p): p is string => Boolean(p));

  for (const file of candidates) {
    if (!existsSync(file)) continue;
    let parsed: Record<string, string>;
    try {
      parsed = parseEnv(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    let added = 0;
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
        added += 1;
      }
    }
    console.log(`[startup] Loaded ${added} env var(s) from ${file}`);
    return;
  }
}

loadEnv();
