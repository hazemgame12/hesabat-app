import { Router } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db, projectsTable, type Project } from "@workspace/db";
import { CreateProjectBody, UpdateProjectBody } from "@workspace/api-zod";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";

const router = Router();

function toProject(row: Project) {
  return {
    id: row.id,
    code: row.code ?? null,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    status: row.status,
    budget: row.budget === null ? null : Number(row.budget),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get(
  "/projects",
  requireAuth,
  requireCapability("projects:read"),
  async (req, res) => {
    try {
      const rows = await db
        .select()
        .from(projectsTable)
        .where(eq(projectsTable.companyId, req.auth!.companyId))
        .orderBy(asc(projectsTable.createdAt));
      res.json(rows.map(toProject));
    } catch (err) {
      req.log.error({ err }, "Failed to list projects");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.post(
  "/projects",
  requireAuth,
  requireCapability("projects:create"),
  async (req, res) => {
    const parsed = CreateProjectBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    try {
      const [row] = await db
        .insert(projectsTable)
        .values({
          companyId: req.auth!.companyId,
          code: parsed.data.code ? parsed.data.code.trim() : null,
          nameAr: parsed.data.nameAr,
          nameEn: parsed.data.nameEn ?? null,
          status: parsed.data.status ?? "active",
          budget:
            parsed.data.budget === undefined || parsed.data.budget === null
              ? null
              : String(parsed.data.budget),
          isActive: parsed.data.isActive ?? true,
        })
        .returning();
      res.status(201).json(toProject(row as Project));
    } catch (err: any) {
      if (err?.code === "23505") {
        res.status(400).json({ error: "الكود مستخدم بالفعل في هذه الشركة" });
        return;
      }
      req.log.error({ err }, "Failed to create project");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.patch(
  "/projects/:id",
  requireAuth,
  requireCapability("projects:update"),
  async (req, res) => {
    const id = req.params["id"] as string;
    if (!id) {
      res.status(400).json({ error: "معرّف غير صحيح" });
      return;
    }
    const parsed = UpdateProjectBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const updates: Record<string, unknown> = {};
    if (parsed.data.code !== undefined) updates["code"] = parsed.data.code ? parsed.data.code.trim() : null;
    if (parsed.data.nameAr !== undefined) updates["nameAr"] = parsed.data.nameAr;
    if (parsed.data.nameEn !== undefined) updates["nameEn"] = parsed.data.nameEn;
    if (parsed.data.status !== undefined) updates["status"] = parsed.data.status;
    if (parsed.data.budget !== undefined) {
      updates["budget"] =
        parsed.data.budget === null ? null : String(parsed.data.budget);
    }
    if (parsed.data.isActive !== undefined) {
      updates["isActive"] = parsed.data.isActive;
    }
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "لا توجد بيانات للتحديث" });
      return;
    }
    try {
      const [row] = await db
        .update(projectsTable)
        .set(updates)
        .where(
          and(
            eq(projectsTable.id, id),
            eq(projectsTable.companyId, req.auth!.companyId),
          ),
        )
        .returning();
      if (!row) {
        res.status(404).json({ error: "المشروع غير موجود" });
        return;
      }
      res.json(toProject(row as Project));
    } catch (err: any) {
      if (err?.code === "23505") {
        res.status(400).json({ error: "الكود مستخدم بالفعل في هذه الشركة" });
        return;
      }
      req.log.error({ err }, "Failed to update project");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.delete(
  "/projects/:id",
  requireAuth,
  requireCapability("projects:delete"),
  async (req, res) => {
    const id = req.params["id"] as string;
    if (!id) {
      res.status(400).json({ error: "معرّف غير صحيح" });
      return;
    }
    try {
      const [row] = await db
        .update(projectsTable)
        .set({ isActive: false })
        .where(
          and(
            eq(projectsTable.id, id),
            eq(projectsTable.companyId, req.auth!.companyId),
          ),
        )
        .returning({ id: projectsTable.id });
      if (!row) {
        res.status(404).json({ error: "المشروع غير موجود" });
        return;
      }
      res.json({ status: "ok" });
    } catch (err) {
      req.log.error({ err }, "Failed to delete project");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
