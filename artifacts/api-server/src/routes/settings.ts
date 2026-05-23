import { Router } from "express";
import { db, siteSettingsTable, DEFAULT_SETTINGS } from "@workspace/db";
import { adminAuth } from "../middleware/auth";

const router = Router();

router.get("/settings", async (req, res) => {
  try {
    const rows = await db.select().from(siteSettingsTable);
    const settings: Record<string, string> = { ...DEFAULT_SETTINGS };
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    res.json(settings);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch settings");
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/admin/settings", adminAuth, async (req, res) => {
  const updates = req.body as Record<string, string>;
  try {
    for (const [key, value] of Object.entries(updates)) {
      await db
        .insert(siteSettingsTable)
        .values({ key, value, updatedAt: new Date() })
        .onConflictDoUpdate({ target: siteSettingsTable.key, set: { value, updatedAt: new Date() } });
    }
    const rows = await db.select().from(siteSettingsTable);
    const settings: Record<string, string> = { ...DEFAULT_SETTINGS };
    for (const row of rows) settings[row.key] = row.value;
    res.json(settings);
  } catch (err) {
    req.log.error({ err }, "Failed to update settings");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
