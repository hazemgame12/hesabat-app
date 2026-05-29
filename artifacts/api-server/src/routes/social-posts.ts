import { Router } from "express";
import { eq, desc, and } from "drizzle-orm";
import {
  db,
  socialPostsTable,
  insertSocialPostSchema,
  updateSocialPostSchema,
} from "@workspace/db";
import { adminAuth } from "../middleware/auth";
import {
  getConnectionStatus,
  getConnectionStatuses,
} from "../lib/social/connections";
import { attemptExternalPublish } from "../lib/social/dispatch";
import {
  deleteStoredCreds,
  getStoredCreds,
  setStoredCreds,
} from "../lib/social/store";
import { hasEncryptionKey } from "../lib/social/crypto";
import { PLATFORM_FIELDS, type SocialPlatform } from "../lib/social/config";

const router = Router();

const PLATFORMS: readonly SocialPlatform[] = [
  "facebook",
  "instagram",
  "linkedin",
];

function isPlatform(value: string): value is SocialPlatform {
  return (PLATFORMS as readonly string[]).includes(value);
}

/* ─── Public: released social posts (Updates feed) ──────────── */
router.get("/social-posts", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(socialPostsTable)
      .where(eq(socialPostsTable.status, "released"))
      .orderBy(desc(socialPostsTable.releasedAt), desc(socialPostsTable.createdAt));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch social posts");
    res.status(500).json({ error: "Server error" });
  }
});

/* ─── Admin: full list ──────────────────────────────────────── */
router.get("/admin/social-posts", adminAuth, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(socialPostsTable)
      .orderBy(desc(socialPostsTable.createdAt));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch admin social posts");
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/admin/social-posts", adminAuth, async (req, res) => {
  const parsed = insertSocialPostSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    const [row] = await db
      .insert(socialPostsTable)
      .values(parsed.data)
      .returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create social post");
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/admin/social-posts/:id", adminAuth, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  const parsed = updateSocialPostSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    const [row] = await db
      .update(socialPostsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(socialPostsTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Social post not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to update social post");
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/admin/social-posts/:id", adminAuth, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  try {
    await db.delete(socialPostsTable).where(eq(socialPostsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete social post");
    res.status(500).json({ error: "Server error" });
  }
});

/* ─── Admin: platform connection status ─────────────────────── */
router.get("/admin/social-connections", adminAuth, async (req, res) => {
  try {
    const statuses = await getConnectionStatuses();
    res.json(statuses);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch social connections");
    res.status(500).json({ error: "Server error" });
  }
});

/* ─── Admin: connect a platform (store encrypted credentials) ─ */
router.post("/admin/social-connections/:platform", adminAuth, async (req, res) => {
  const platform = req.params["platform"] as string;
  if (!isPlatform(platform)) {
    res.status(400).json({ error: "Unknown platform" });
    return;
  }
  if (!hasEncryptionKey()) {
    res.status(400).json({
      error:
        "تعذّر حفظ بيانات الربط: لم يتم ضبط مفتاح التشفير (CREDENTIALS_SECRET) على الخادم.",
    });
    return;
  }
  try {
    const body = req.body as { fields?: Record<string, unknown> };
    const incoming = body?.fields ?? {};
    // Merge over any existing stored values so untouched secrets aren't wiped.
    const existing = (await getStoredCreds(platform)) ?? {};
    const merged: Record<string, string> = { ...existing };
    for (const field of PLATFORM_FIELDS[platform]) {
      const value = incoming[field.key];
      if (typeof value === "string" && value.trim()) {
        merged[field.key] = value.trim();
      }
    }
    await setStoredCreds(platform, merged);
    const status = await getConnectionStatus(platform);
    res.json(status);
  } catch (err) {
    req.log.error({ err }, "Failed to save social connection");
    res.status(500).json({ error: "Server error" });
  }
});

/* ─── Admin: disconnect a platform (remove stored credentials) ─ */
router.delete("/admin/social-connections/:platform", adminAuth, async (req, res) => {
  const platform = req.params["platform"] as string;
  if (!isPlatform(platform)) {
    res.status(400).json({ error: "Unknown platform" });
    return;
  }
  try {
    await deleteStoredCreds(platform);
    const status = await getConnectionStatus(platform);
    res.json(status);
  } catch (err) {
    req.log.error({ err }, "Failed to disconnect social platform");
    res.status(500).json({ error: "Server error" });
  }
});

/* ─── Admin: release now (publish to feed + external platform) ─ */
router.post("/admin/social-posts/:id/release", adminAuth, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  try {
    const now = new Date();
    const [row] = await db
      .update(socialPostsTable)
      .set({ status: "released", releasedAt: now, updatedAt: now })
      .where(and(eq(socialPostsTable.id, id)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Social post not found" });
      return;
    }
    const published = await attemptExternalPublish(row);
    res.json(published);
  } catch (err) {
    req.log.error({ err }, "Failed to release social post");
    res.status(500).json({ error: "Server error" });
  }
});

/* ─── Admin: retry external publish for a failed post ───────── */
router.post("/admin/social-posts/:id/retry", adminAuth, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  try {
    const [row] = await db
      .select()
      .from(socialPostsTable)
      .where(eq(socialPostsTable.id, id));
    if (!row) {
      res.status(404).json({ error: "Social post not found" });
      return;
    }
    const published = await attemptExternalPublish(row);
    res.json(published);
  } catch (err) {
    req.log.error({ err }, "Failed to retry social post");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
