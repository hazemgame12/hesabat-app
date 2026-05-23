import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, articlesTable, insertArticleSchema, updateArticleSchema } from "@workspace/db";
import { adminAuth } from "../middleware/auth";

const router = Router();

router.post("/admin/login", (req, res) => {
  const { password } = req.body as { password?: string };
  const secret = process.env["ADMIN_SECRET"];
  if (!secret || !password || password !== secret) {
    res.status(401).json({ error: "كلمة المرور غير صحيحة" });
    return;
  }
  res.json({ token: secret });
});

router.get("/articles", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(articlesTable)
      .where(eq(articlesTable.published, true))
      .orderBy(desc(articlesTable.createdAt));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch articles");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/articles/:slug", async (req, res) => {
  try {
    const [row] = await db
      .select()
      .from(articlesTable)
      .where(eq(articlesTable.slug, req.params["slug"] as string));
    if (!row) {
      res.status(404).json({ error: "Article not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch article");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/admin/articles", adminAuth, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(articlesTable)
      .orderBy(desc(articlesTable.createdAt));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch admin articles");
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/admin/articles", adminAuth, async (req, res) => {
  const parsed = insertArticleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    const [row] = await db.insert(articlesTable).values(parsed.data).returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create article");
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/admin/articles/:id", adminAuth, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  const parsed = updateArticleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    const [row] = await db
      .update(articlesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(articlesTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Article not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to update article");
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/admin/articles/:id", adminAuth, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  try {
    await db.delete(articlesTable).where(eq(articlesTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete article");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
