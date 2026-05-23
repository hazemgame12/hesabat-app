import { Router } from "express";
import { eq, asc } from "drizzle-orm";
import { db, servicesTable, insertServiceSchema, updateServiceSchema } from "@workspace/db";
import { adminAuth } from "../middleware/auth";

const router = Router();

router.get("/services", async (req, res) => {
  try {
    const rows = await db.select().from(servicesTable)
      .where(eq(servicesTable.published, true))
      .orderBy(asc(servicesTable.order));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch services");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/admin/services", adminAuth, async (req, res) => {
  try {
    const rows = await db.select().from(servicesTable).orderBy(asc(servicesTable.order));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch admin services");
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/admin/services", adminAuth, async (req, res) => {
  const parsed = insertServiceSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  try {
    const [row] = await db.insert(servicesTable).values(parsed.data).returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create service");
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/admin/services/:id", adminAuth, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  const parsed = updateServiceSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  try {
    const [row] = await db.update(servicesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(servicesTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to update service");
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/admin/services/:id", adminAuth, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  try {
    await db.delete(servicesTable).where(eq(servicesTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete service");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
