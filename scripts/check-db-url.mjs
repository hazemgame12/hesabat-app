#!/usr/bin/env node
/**
 * Checks if companies table exists in DATABASE_URL.
 * If not, tries swapping the DB name to hesabat_db.
 * If hesabat_db has companies, rewrites DATABASE_URL in .env.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { readdirSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "..");
const envFile = path.join(workspaceRoot, ".env");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.log("⚠️  DATABASE_URL not set — skipping DB URL check"); process.exit(0); }

// Load pg from pnpm virtual store
async function loadPg() {
  const pnpmStore = path.join(workspaceRoot, "node_modules/.pnpm");
  const candidates = [path.join(workspaceRoot, "node_modules/pg/lib/index.js")];
  try {
    for (const d of readdirSync(pnpmStore)) {
      if (/^pg@/.test(d)) candidates.push(path.join(pnpmStore, d, "node_modules/pg/lib/index.js"));
    }
  } catch {}
  for (const c of candidates) {
    if (existsSync(c)) { try { const m = await import(pathToFileURL(c).href); return m.default ?? m; } catch {} }
  }
  return null;
}

const pg = await loadPg();
if (!pg) { console.log("⚠️  pg not found — skipping DB URL check"); process.exit(0); }
const { Client } = pg;

async function hasCompanies(url) {
  const c = new Client({ connectionString: url });
  try {
    await c.connect();
    const r = await c.query("SELECT COUNT(*) FROM companies");
    await c.end();
    return { ok: true, count: r.rows[0].count };
  } catch (e) {
    try { await c.end(); } catch {}
    return { ok: false, error: e.message };
  }
}

// 1) Check current DATABASE_URL
const current = await hasCompanies(DATABASE_URL);
if (current.ok) {
  console.log(`✅  companies table found in current DB (${current.count} rows) — no change needed`);
  process.exit(0);
}
console.log(`⚠️  companies NOT in current DB (${current.error?.split("\n")[0]})`);

// 2) Try hesabat_db
const hesabatUrl = DATABASE_URL.replace(/\/([^/?]+)(\?.*)?$/, "/hesabat_db$2");
if (hesabatUrl === DATABASE_URL) { console.log("⚠️  Could not construct hesabat_db URL"); process.exit(0); }
console.log("🔍  Trying hesabat_db ...");
const hesabat = await hasCompanies(hesabatUrl);
if (!hesabat.ok) { console.log(`❌  hesabat_db also failed: ${hesabat.error?.split("\n")[0]}`); process.exit(0); }

console.log(`✅  companies found in hesabat_db (${hesabat.count} rows)`);

// 3) Rewrite DATABASE_URL in .env
if (!existsSync(envFile)) { console.log("⚠️  .env not found — cannot rewrite"); process.exit(0); }
let envContent = readFileSync(envFile, "utf8");
const oldLine = envContent.split("\n").find(l => l.startsWith("DATABASE_URL="));
if (!oldLine) { console.log("⚠️  DATABASE_URL line not found in .env"); process.exit(0); }
const newLine = `DATABASE_URL=${hesabatUrl}`;
envContent = envContent.replace(oldLine, newLine);
writeFileSync(envFile, envContent);
console.log("✅  DATABASE_URL in .env updated to hesabat_db");
console.log(`   old: ${oldLine.replace(/:([^:@]+)@/, ":***@")}`);
console.log(`   new: ${newLine.replace(/:([^:@]+)@/, ":***@")}`);
process.exit(0);
