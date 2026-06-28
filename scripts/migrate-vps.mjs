#!/usr/bin/env node
/**
 * VPS migration runner — uses pg from pnpm virtual store (no psql required).
 * Usage:  node scripts/migrate-vps.mjs [sql-dir] [applied-log]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "..");

// ── Find pg in pnpm virtual store ─────────────────────────────────────────
async function loadPg() {
  // 1. Direct symlink (unlikely with pnpm but try first)
  const candidates = [
    path.join(workspaceRoot, "node_modules/pg/lib/index.js"),
  ];

  // 2. pnpm virtual store: node_modules/.pnpm/pg@*/node_modules/pg
  const pnpmStore = path.join(workspaceRoot, "node_modules/.pnpm");
  try {
    const dirs = readdirSync(pnpmStore);
    for (const d of dirs) {
      if (/^pg@/.test(d)) {
        candidates.push(path.join(pnpmStore, d, "node_modules/pg/lib/index.js"));
      }
    }
  } catch { /* .pnpm not present */ }

  for (const c of candidates) {
    if (existsSync(c)) {
      try {
        const mod = await import(pathToFileURL(c).href);
        return mod.default ?? mod;
      } catch { /* try next */ }
    }
  }
  return null;
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log("⚠️  DATABASE_URL not set — skipping migrations");
  process.exit(0);
}

const sqlDir     = process.argv[2] ?? path.join(workspaceRoot, "hostinger-deploy-sql");
const appliedLog = process.argv[3] ?? path.join(workspaceRoot, ".applied-migrations");

const pg = await loadPg();
if (!pg) {
  console.error("❌  Cannot find pg module in pnpm store — skipping migrations");
  process.exit(0);
}

const { Client } = pg;

// Load already-applied set
const appliedSet = new Set(
  existsSync(appliedLog)
    ? readFileSync(appliedLog, "utf8").split("\n").map(l => l.trim()).filter(Boolean)
    : []
);

// Collect pending migrate-*.sql files, sorted alphabetically
const pending = readdirSync(sqlDir)
  .filter(f => f.startsWith("migrate-") && f.endsWith(".sql"))
  .sort()
  .filter(f => !appliedSet.has(f));

if (pending.length === 0) {
  console.log("✅  All migrations already applied");
  process.exit(0);
}

const client = new Client({ connectionString: DATABASE_URL });
try {
  await client.connect();
} catch (err) {
  console.error("❌  DB connect failed:", err.message);
  process.exit(0);
}

for (const fname of pending) {
  const sql = readFileSync(path.join(sqlDir, fname), "utf8");
  console.log(`  ▶  Applying ${fname} ...`);
  try {
    await client.query(sql);
    const newApplied = [...appliedSet, fname].join("\n") + "\n";
    writeFileSync(appliedLog, newApplied);
    appliedSet.add(fname);
    console.log(`  ✅  ${fname} applied`);
  } catch (err) {
    console.error(`  ⚠️  ${fname} FAILED: ${err.message}`);
    // Continue — don't block other migrations or the deploy
  }
}

await client.end();
console.log("✅  Migration run complete");
process.exit(0);
