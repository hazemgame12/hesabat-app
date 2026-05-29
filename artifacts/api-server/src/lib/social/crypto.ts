import crypto from "node:crypto";

/**
 * AES-256-GCM encryption for platform credentials stored at rest.
 *
 * The key is derived (scrypt) from a server-side secret that only lives in the
 * environment — never in the database. As a result the `social_credentials`
 * rows are useless without the host's secret, satisfying the "never store
 * tokens in the database in plaintext" constraint while still letting an admin
 * connect platforms from the dashboard.
 */

const KEY_SALT = "hg-social-creds-v1";

function getSecret(): string | null {
  return (
    process.env["CREDENTIALS_SECRET"] ||
    process.env["SESSION_SECRET"] ||
    process.env["ADMIN_SECRET"] ||
    null
  );
}

export function hasEncryptionKey(): boolean {
  return getSecret() !== null;
}

function getKey(): Buffer {
  const secret = getSecret();
  if (!secret) {
    throw new Error(
      "No encryption secret configured. Set CREDENTIALS_SECRET (or SESSION_SECRET) to store platform credentials.",
    );
  }
  return crypto.scryptSync(secret, KEY_SALT, 32);
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
