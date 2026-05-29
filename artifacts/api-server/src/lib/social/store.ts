import { eq } from "drizzle-orm";
import { db, socialCredentialsTable } from "@workspace/db";
import { decrypt, encrypt, hasEncryptionKey } from "./crypto";
import type { SocialPlatform } from "./config";

export { hasEncryptionKey };

/**
 * Read decrypted credential fields for a platform, or null when none are
 * stored (or decryption fails, e.g. the server secret changed).
 */
export async function getStoredCreds(
  platform: SocialPlatform,
): Promise<Record<string, string> | null> {
  const [row] = await db
    .select()
    .from(socialCredentialsTable)
    .where(eq(socialCredentialsTable.platform, platform));
  if (!row || !row.data) return null;
  try {
    const parsed = JSON.parse(decrypt(row.data)) as Record<string, string>;
    return parsed;
  } catch {
    return null;
  }
}

/** Encrypt and upsert credential fields for a platform. */
export async function setStoredCreds(
  platform: SocialPlatform,
  fields: Record<string, string>,
): Promise<void> {
  const data = encrypt(JSON.stringify(fields));
  await db
    .insert(socialCredentialsTable)
    .values({ platform, data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: socialCredentialsTable.platform,
      set: { data, updatedAt: new Date() },
    });
}

/** Remove stored credentials for a platform (disconnect). */
export async function deleteStoredCreds(platform: SocialPlatform): Promise<void> {
  await db
    .delete(socialCredentialsTable)
    .where(eq(socialCredentialsTable.platform, platform));
}
