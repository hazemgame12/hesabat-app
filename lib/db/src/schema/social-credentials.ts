import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Encrypted-at-rest storage for social platform credentials.
 *
 * `data` holds an AES-256-GCM encrypted JSON blob (never plaintext). The
 * encryption key is derived from a server secret (CREDENTIALS_SECRET /
 * SESSION_SECRET / ADMIN_SECRET) that lives only in the environment, so the
 * database never contains usable tokens on its own.
 */
export const socialCredentialsTable = pgTable("social_credentials", {
  platform: text("platform").primaryKey(),
  data: text("data").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SocialCredentialRow = typeof socialCredentialsTable.$inferSelect;
