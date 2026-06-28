import { Router } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, branchesTable, type Branch } from "@workspace/db";
import { CreateBranchBody, UpdateBranchBody } from "@workspace/api-zod";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import { exportWorkbook, handleXlsxUpload, parseSheet } from "../lib/excel";

const router = Router();
const BRANCH_CODE_PREFIX = "BR";
const CODE_PAD = 3;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

async function generateNextBranchCode(
  companyId: string,
  exec: Executor = db,
): Promise<string> {
  const pattern = `^${BRANCH_CODE_PREFIX}-[0-9]+$`;
  const [row] = await exec
    .select({
      lastNo: sql<number>`COALESCE(MAX(CASE WHEN ${branchesTable.code} ~ ${pattern} THEN CAST(split_part(${branchesTable.code}, '-', 2) AS integer) END), 0)`,
    })
    .from(branchesTable)
    .where(eq(branchesTable.companyId, companyId));
  return `${BRANCH_CODE_PREFIX}-${String(Number(row?.lastNo ?? 0) + 1).padStart(CODE_PAD, "0")}`;
}

function toBranch(row: Branch) {
  return {
    id: row.id,
    code: row.code ?? null,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    budget: row.budget === null ? null : Number(row.budget),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get(
  "/branches",
  requireAuth,
  requireCapability("branches:read"),
  async (req, res) => {
    try {
      const rows = await db
        .select()
        .from(branchesTable)
        .where(eq(branchesTable.companyId, req.auth!.companyId))
        .orderBy(asc(branchesTable.createdAt));
      res.json(rows.map(toBranch));
    } catch (err) {
      req.log.error({ err }, "Failed to list branches");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.post(
  "/branches",
  requireAuth,
  requireCapability("branches:create"),
  async (req, res) => {
    const parsed = CreateBranchBody.safeParse(req.body);
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
            .insert(branchesTable)
            .values({
              companyId,
              code: manualCode || (await generateNextBranchCode(companyId)),
              nameAr: parsed.data.nameAr,
              nameEn: parsed.data.nameEn ?? null,
              budget:
                parsed.data.budget === undefined || parsed.data.budget === null
                  ? null
                  : String(parsed.data.budget),
              isActive: parsed.data.isActive ?? true,
            })
            .returning();
          res.status(201).json(toBranch(row as Branch));
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
      req.log.error({ err }, "Failed to create branch");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.patch(
  "/branches/:id",
  requireAuth,
  requireCapability("branches:update"),
  async (req, res) => {
    const id = req.params["id"] as string;
    if (!id) {
      res.status(400).json({ error: "معرّف غير صحيح" });
      return;
    }
    const parsed = UpdateBranchBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const updates: Record<string, unknown> = {};
    if (parsed.data.code !== undefined) updates["code"] = parsed.data.code ? parsed.data.code.trim() : null;
    if (parsed.data.nameAr !== undefined) updates["nameAr"] = parsed.data.nameAr;
    if (parsed.data.nameEn !== undefined) updates["nameEn"] = parsed.data.nameEn;
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
        .update(branchesTable)
        .set(updates)
        .where(
          and(
            eq(branchesTable.id, id),
            eq(branchesTable.companyId, req.auth!.companyId),
          ),
        )
        .returning();
      if (!row) {
        res.status(404).json({ error: "الفرع غير موجود" });
        return;
      }
      res.json(toBranch(row as Branch));
    } catch (err: any) {
      if (err?.code === "23505") {
        res.status(400).json({ error: "الكود مستخدم بالفعل في هذه الشركة" });
        return;
      }
      req.log.error({ err }, "Failed to update branch");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.delete(
  "/branches/:id",
  requireAuth,
  requireCapability("branches:delete"),
  async (req, res) => {
    const id = req.params["id"] as string;
    if (!id) {
      res.status(400).json({ error: "معرّف غير صحيح" });
      return;
    }
    try {
      const [row] = await db
        .update(branchesTable)
        .set({ isActive: false })
        .where(
          and(
            eq(branchesTable.id, id),
            eq(branchesTable.companyId, req.auth!.companyId),
          ),
        )
        .returning({ id: branchesTable.id });
      if (!row) {
        res.status(404).json({ error: "الفرع غير موجود" });
        return;
      }
      res.json({ status: "ok" });
    } catch (err) {
      req.log.error({ err }, "Failed to delete branch");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.get(
  "/branches/export",
  requireAuth,
  requireCapability("branches:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    try {
      const rows = await db
        .select()
        .from(branchesTable)
        .where(eq(branchesTable.companyId, companyId))
        .orderBy(asc(branchesTable.createdAt));
      await exportWorkbook(res, {
        sheetName: "Branches",
        fileName: "branches-export",
        columns: [
          { header: "code", value: (r) => r.code ?? "" },
          { header: "nameAr", value: (r) => r.nameAr },
          { header: "nameEn", value: (r) => r.nameEn ?? "" },
          { header: "location", value: () => "" },
          { header: "isActive", value: (r) => (r.isActive ? "true" : "false") },
        ],
        rows,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to export branches");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.post(
  "/branches/import",
  requireAuth,
  requireCapability("branches:create"),
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
        isActive: boolean;
      };
      const parsed: Row[] = [];
      for (const { rowNo, row } of sheet.rows) {
        const nameAr = sheet.str(row, "nameAr");
        const nameEn = sheet.str(row, "nameEn");
        const codeRaw = sheet.has("code") ? sheet.str(row, "code").trim() : "";
        const location = sheet.has("location") ? sheet.str(row, "location") : "";
        if (!nameAr && !nameEn && !codeRaw && !location) continue;
        if (!nameAr) {
          res.status(400).json({ error: `السطر ${rowNo}: nameAr مطلوب` });
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
          isActive,
        });
      }
      if (parsed.length === 0) {
        res.status(400).json({ error: "الملف لا يحتوي على فروع" });
        return;
      }

      await db.transaction(async (tx) => {
        for (const r of parsed) {
          const code = r.code || (await generateNextBranchCode(companyId, tx));
          await tx.insert(branchesTable).values({
            companyId,
            code,
            nameAr: r.nameAr,
            nameEn: r.nameEn,
            isActive: r.isActive,
          });
        }
      });
      res.json({ imported: parsed.length });
    } catch (err) {
      req.log.error({ err }, "Failed to import branches");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
