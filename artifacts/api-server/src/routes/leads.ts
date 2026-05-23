import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, leadsTable, insertLeadSchema, updateLeadSchema } from "@workspace/db";
import { adminAuth } from "../middleware/auth";
import { sendLeadNotification } from "../lib/mailer";

const router = Router();

router.post("/leads", async (req, res) => {
  const parsed = insertLeadSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  try {
    const [row] = await db.insert(leadsTable).values(parsed.data).returning();
    if (row) {
      sendLeadNotification({
        name: row.name,
        phone: row.phone,
        email: row.email,
        message: row.message,
        service: row.service,
      }).catch((err) => req.log.error({ err }, "Email send error"));
    }
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to save lead");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/admin/leads", adminAuth, async (req, res) => {
  try {
    const rows = await db.select().from(leadsTable).orderBy(desc(leadsTable.createdAt));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch leads");
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/admin/leads/:id", adminAuth, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  const parsed = updateLeadSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  try {
    const [row] = await db.update(leadsTable).set(parsed.data)
      .where(eq(leadsTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to update lead");
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/admin/leads/:id", adminAuth, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  try {
    await db.delete(leadsTable).where(eq(leadsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete lead");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
