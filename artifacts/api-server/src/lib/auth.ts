import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;

// Password hashing using Node's built-in scrypt — no native deps, fully portable.
// Stored format: scrypt$<salt-hex>$<derived-hex>
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = parts[1];
  const hashHex = parts[2];
  if (!salt || !hashHex) return false;
  const derived = await scrypt(password, salt, KEY_LENGTH);
  const storedBuf = Buffer.from(hashHex, "hex");
  if (storedBuf.length !== derived.length) return false;
  return timingSafeEqual(storedBuf, derived);
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

// Only the SHA-256 of the session token is ever stored, so a DB leak does not
// expose live session tokens.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
