import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

function getSslConfig(
  url: string,
): boolean | { rejectUnauthorized: boolean } | undefined {
  if (url.includes("sslmode=disable")) return false;
  if (url.includes("sslmode=no-verify")) return { rejectUnauthorized: false };
  if (url.includes("neon.tech")) return { rejectUnauthorized: false };
  if (url.includes("sslmode=require")) return { rejectUnauthorized: false };
  return undefined;
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: getSslConfig(process.env.DATABASE_URL),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
