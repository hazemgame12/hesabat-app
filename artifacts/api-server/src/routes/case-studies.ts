import { Router } from "express";
import { eq, asc } from "drizzle-orm";
import { db, caseStudiesTable, insertCaseStudySchema, updateCaseStudySchema } from "@workspace/db";
import { adminAuth } from "../middleware/auth";

const router = Router();

router.get("/case-studies", async (req, res) => {
  try {
    const rows = await db.select().from(caseStudiesTable)
      .where(eq(caseStudiesTable.published, true))
      .orderBy(asc(caseStudiesTable.order));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch case studies");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/case-studies/:slug", async (req, res) => {
  try {
    const slug = req.params["slug"] as string;
    const [row] = await db.select().from(caseStudiesTable)
      .where(eq(caseStudiesTable.slug, slug)).limit(1);
    if (!row || !row.published) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch case study");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/admin/case-studies", adminAuth, async (req, res) => {
  try {
    const rows = await db.select().from(caseStudiesTable).orderBy(asc(caseStudiesTable.order));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch admin case studies");
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/admin/case-studies", adminAuth, async (req, res) => {
  const parsed = insertCaseStudySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  try {
    const [row] = await db.insert(caseStudiesTable).values(parsed.data).returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create case study");
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/admin/case-studies/:id", adminAuth, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  const parsed = updateCaseStudySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  try {
    const [row] = await db.update(caseStudiesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(caseStudiesTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to update case study");
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/admin/case-studies/:id", adminAuth, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  try {
    await db.delete(caseStudiesTable).where(eq(caseStudiesTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete case study");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
