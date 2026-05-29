import { Router } from "express";
import { eq, desc, and } from "drizzle-orm";
import {
  db,
  socialPostsTable,
  insertSocialPostSchema,
  updateSocialPostSchema,
} from "@workspace/db";
import { adminAuth } from "../middleware/auth";

const router = Router();

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

/* ─── Admin: release now (manual publish to feed) ───────────── */
router.post("/admin/social-posts/:id/release", adminAuth, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  try {
    const [row] = await db
      .update(socialPostsTable)
      .set({ status: "released", releasedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(socialPostsTable.id, id)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Social post not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to release social post");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
