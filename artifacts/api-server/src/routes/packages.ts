import { Router } from "express";
import { eq, asc } from "drizzle-orm";
import { db, packagesTable, insertPackageSchema, updatePackageSchema } from "@workspace/db";
import { adminAuth } from "../middleware/auth";

const router = Router();

router.get("/packages", async (req, res) => {
  try {
    const rows = await db.select().from(packagesTable)
      .where(eq(packagesTable.published, true))
      .orderBy(asc(packagesTable.order));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch packages");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/admin/packages", adminAuth, async (req, res) => {
  try {
    const rows = await db.select().from(packagesTable).orderBy(asc(packagesTable.order));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch admin packages");
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/admin/packages", adminAuth, async (req, res) => {
  const parsed = insertPackageSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  try {
    const [row] = await db.insert(packagesTable).values(parsed.data).returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create package");
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/admin/packages/:id", adminAuth, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  const parsed = updatePackageSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  try {
    const [row] = await db.update(packagesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(packagesTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to update package");
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/admin/packages/:id", adminAuth, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  try {
    await db.delete(packagesTable).where(eq(packagesTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete package");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
