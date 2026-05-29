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
import {
  buildAuthUrl,
  consumePendingSelection,
  createPendingSelection,
  getPendingSelection,
  getPublicBaseUrl,
  isOAuthConfigured,
  listOAuthTargets,
  verifyState,
} from "../lib/social/oauth";

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

/* ─── Admin: start one-click OAuth (returns provider auth URL) ─ */
router.get("/admin/social-connections/:platform/oauth-url", adminAuth, (req, res) => {
  const platform = req.params["platform"] as string;
  if (!isPlatform(platform)) {
    res.status(400).json({ error: "Unknown platform" });
    return;
  }
  if (!isOAuthConfigured(platform)) {
    res.status(400).json({
      error:
        "الربط بنقرة واحدة غير متاح: لم تُضبط بيانات تطبيق المنصة على الخادم (App ID/Secret).",
    });
    return;
  }
  if (!getPublicBaseUrl()) {
    res.status(400).json({
      error:
        "تعذّر بناء رابط الربط: لم يتم ضبط عنوان الموقع العام (SITE_URL) على الخادم.",
    });
    return;
  }
  if (!hasEncryptionKey()) {
    res.status(400).json({
      error:
        "تعذّر بدء الربط: لم يتم ضبط مفتاح التشفير (CREDENTIALS_SECRET) على الخادم.",
    });
    return;
  }
  res.json({ url: buildAuthUrl(platform) });
});

/* ─── OAuth callback (provider redirect — validated via signed state) ─ */
router.get("/admin/social-connections/:platform/callback", async (req, res) => {
  const platform = req.params["platform"] as string;
  const base = getPublicBaseUrl();
  const back = (params: string) =>
    res.redirect(`${base}/admin/social-connections?${params}`);

  if (!isPlatform(platform)) {
    back("social_error=unknown_platform");
    return;
  }
  const code = typeof req.query["code"] === "string" ? req.query["code"] : "";
  const state = typeof req.query["state"] === "string" ? req.query["state"] : "";
  const oauthError =
    typeof req.query["error"] === "string" ? req.query["error"] : "";

  if (oauthError) {
    back(`social_error=${encodeURIComponent(oauthError)}`);
    return;
  }
  if (!code || verifyState(state) !== platform) {
    back("social_error=invalid_state");
    return;
  }
  try {
    const targets = await listOAuthTargets(platform, code);
    if (targets.length === 0) {
      back("social_error=no_targets");
      return;
    }
    // Single target: store it directly. Multiple: hand off to the chooser UI.
    if (targets.length === 1) {
      const only = targets[0]!;
      const existing = (await getStoredCreds(platform)) ?? {};
      await setStoredCreds(platform, { ...existing, ...only.fields });
      back(`connected=${platform}`);
      return;
    }
    const pendingId = createPendingSelection(platform, targets);
    back(`select=${platform}&pending=${encodeURIComponent(pendingId)}`);
  } catch (err) {
    req.log.error({ err, platform }, "OAuth code exchange failed");
    const msg = err instanceof Error ? err.message : "exchange_failed";
    back(`social_error=${encodeURIComponent(msg)}`);
  }
});

/* ─── Admin: list pending OAuth targets to choose from ──────── */
router.get(
  "/admin/social-connections/:platform/pending/:id",
  adminAuth,
  (req, res) => {
    const platform = req.params["platform"] as string;
    const id = req.params["id"] as string;
    if (!isPlatform(platform)) {
      res.status(400).json({ error: "Unknown platform" });
      return;
    }
    const pending = getPendingSelection(platform, id);
    if (!pending) {
      res.status(404).json({ error: "انتهت صلاحية جلسة الاختيار. أعد الربط من جديد." });
      return;
    }
    // Never expose the captured tokens — only the selectable identity.
    res.json({
      platform,
      targets: pending.targets.map((t) => ({
        id: t.id,
        name: t.name,
        subtitle: t.subtitle,
      })),
    });
  },
);

/* ─── Admin: finalize a chosen OAuth target ─────────────────── */
router.post(
  "/admin/social-connections/:platform/select",
  adminAuth,
  async (req, res) => {
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
    const body = req.body as { pendingId?: unknown; targetId?: unknown };
    const pendingId = typeof body?.pendingId === "string" ? body.pendingId : "";
    const targetId = typeof body?.targetId === "string" ? body.targetId : "";
    if (!pendingId || !targetId) {
      res.status(400).json({ error: "بيانات الاختيار ناقصة." });
      return;
    }
    const pending = getPendingSelection(platform, pendingId);
    if (!pending) {
      res.status(404).json({ error: "انتهت صلاحية جلسة الاختيار. أعد الربط من جديد." });
      return;
    }
    const target = pending.targets.find((t) => t.id === targetId);
    if (!target) {
      res.status(400).json({ error: "الهدف المختار غير موجود." });
      return;
    }
    try {
      const existing = (await getStoredCreds(platform)) ?? {};
      await setStoredCreds(platform, { ...existing, ...target.fields });
      consumePendingSelection(pendingId);
      const status = await getConnectionStatus(platform);
      res.json(status);
    } catch (err) {
      req.log.error({ err, platform }, "Failed to finalize social connection");
      res.status(500).json({ error: "Server error" });
    }
  },
);

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
    // A manually-entered access token has no known expiry; drop any stale
    // expiry captured from a prior OAuth connection so we don't mislead.
    const newToken = incoming["accessToken"];
    if (typeof newToken === "string" && newToken.trim()) {
      delete merged["tokenExpiresAt"];
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
