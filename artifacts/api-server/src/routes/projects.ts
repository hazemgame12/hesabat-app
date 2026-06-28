import { Router } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, projectsTable, type Project } from "@workspace/db";
import { CreateProjectBody, UpdateProjectBody } from "@workspace/api-zod";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import { exportWorkbook, handleXlsxUpload, parseSheet } from "../lib/excel";

const router = Router();
const PROJECT_CODE_PREFIX = "PRJ";
const CODE_PAD = 3;
const PROJECT_STATUSES = ["active", "completed", "on_hold", "cancelled"] as const;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

async function generateNextProjectCode(
  companyId: string,
  exec: Executor = db,
): Promise<string> {
  const pattern = `^${PROJECT_CODE_PREFIX}-[0-9]+$`;
  const [row] = await exec
    .select({
      lastNo: sql<number>`COALESCE(MAX(CASE WHEN ${projectsTable.code} ~ ${pattern} THEN CAST(split_part(${projectsTable.code}, '-', 2) AS integer) END), 0)`,
    })
    .from(projectsTable)
    .where(eq(projectsTable.companyId, companyId));
  return `${PROJECT_CODE_PREFIX}-${String(Number(row?.lastNo ?? 0) + 1).padStart(CODE_PAD, "0")}`;
}

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
      const companyId = req.auth!.companyId;
      const manualCode = parsed.data.code?.trim();
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const [row] = await db
            .insert(projectsTable)
            .values({
              companyId,
              code: manualCode || (await generateNextProjectCode(companyId)),
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
          return;
        } catch (err: any) {
          if (err?.code === "23505" && !manualCode && attempt < 4) continue;
          throw err;
        }
      }
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

router.get(
  "/projects/export",
  requireAuth,
  requireCapability("projects:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    try {
      const rows = await db
        .select()
        .from(projectsTable)
        .where(eq(projectsTable.companyId, companyId))
        .orderBy(asc(projectsTable.createdAt));
      await exportWorkbook(res, {
        sheetName: "Projects",
        fileName: "projects-export",
        columns: [
          { header: "code", value: (r) => r.code ?? "" },
          { header: "nameAr", value: (r) => r.nameAr },
          { header: "nameEn", value: (r) => r.nameEn ?? "" },
          { header: "description", value: () => "" },
          { header: "startDate", value: () => "" },
          { header: "endDate", value: () => "" },
          {
            header: "budget",
            value: (r) => (r.budget === null ? "" : Number(r.budget)),
          },
          { header: "status", value: (r) => r.status },
          { header: "isActive", value: (r) => (r.isActive ? "true" : "false") },
        ],
        rows,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to export projects");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.post(
  "/projects/import",
  requireAuth,
  requireCapability("projects:create"),
  handleXlsxUpload,
  async (req, res) => {
    const companyId = req.auth!.companyId;
    if (!req.file) {
      res.status(400).json({ error: "لم يتم رفع أي ملف" });
      return;
    }
    try {
      const sheet = await parseSheet(req.file.buffer);
      if (!sheet) {
        res.status(400).json({ error: "الملف لا يحتوي على بيانات" });
        return;
      }
      if (!sheet.has("nameAr")) {
        res.status(400).json({
          error: "صيغة الملف غير صحيحة. الأعمدة المطلوبة: nameAr",
        });
        return;
      }

      type Row = {
        code: string | null;
        nameAr: string;
        nameEn: string | null;
        budget: string | null;
        status: (typeof PROJECT_STATUSES)[number];
        isActive: boolean;
      };
      const parsed: Row[] = [];
      for (const { rowNo, row } of sheet.rows) {
        const nameAr = sheet.str(row, "nameAr");
        const budgetRaw = sheet.has("budget") ? sheet.str(row, "budget") : "";
        const nameEn = sheet.str(row, "nameEn");
        const codeRaw = sheet.has("code") ? sheet.str(row, "code").trim() : "";
        const statusRaw = sheet.has("status")
          ? sheet.str(row, "status").trim().toLowerCase()
          : "";
        const description = sheet.has("description")
          ? sheet.str(row, "description")
          : "";
        const startDate = sheet.has("startDate") ? sheet.str(row, "startDate") : "";
        const endDate = sheet.has("endDate") ? sheet.str(row, "endDate") : "";
        if (
          !nameAr &&
          !budgetRaw &&
          !nameEn &&
          !codeRaw &&
          !statusRaw &&
          !description &&
          !startDate &&
          !endDate
        )
          continue;
        if (!nameAr) {
          res.status(400).json({ error: `السطر ${rowNo}: nameAr مطلوب` });
          return;
        }
        if (statusRaw && !PROJECT_STATUSES.includes(statusRaw as any)) {
          res.status(400).json({
            error: `السطر ${rowNo}: status غير صالح`,
          });
          return;
        }
        const activeRaw = sheet.has("isActive")
          ? sheet.str(row, "isActive").toLowerCase()
          : "";
        const isActive = !(
          activeRaw === "false" ||
          activeRaw === "0" ||
          activeRaw === "no" ||
          activeRaw === "غير نشط"
        );
        parsed.push({
          code: codeRaw || null,
          nameAr,
          nameEn: nameEn || null,
          budget: budgetRaw ? String(sheet.num(row, "budget")) : null,
          status: (statusRaw || "active") as (typeof PROJECT_STATUSES)[number],
          isActive,
        });
      }
      if (parsed.length === 0) {
        res.status(400).json({ error: "الملف لا يحتوي على مشاريع" });
        return;
      }

      await db.transaction(async (tx) => {
        for (const r of parsed) {
          const code = r.code || (await generateNextProjectCode(companyId, tx));
          await tx.insert(projectsTable).values({
            companyId,
            code,
            nameAr: r.nameAr,
            nameEn: r.nameEn,
            budget: r.budget,
            status: r.status,
            isActive: r.isActive,
          });
        }
      });
      res.json({ imported: parsed.length });
    } catch (err) {
      req.log.error({ err }, "Failed to import projects");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
