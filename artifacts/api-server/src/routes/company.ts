import { Router, type Request, type Response, type NextFunction } from "express";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { eq } from "drizzle-orm";
import { db, companiesTable, type Company } from "@workspace/db";
import { isCountry, isCurrency } from "@workspace/locale";
import { UpdateCompanyBody } from "@workspace/api-zod";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import { uploadsDir } from "./uploads";

const router = Router();

function toCompany(row: Company) {
  return {
    id: row.id,
    name: row.name,
    tradeName: row.tradeName,
    taxRegistrationNumber: row.taxRegistrationNumber,
    activityDescription: row.activityDescription,
    logoUrl: row.logoUrl,
    country: row.country,
    baseCurrency: row.baseCurrency,
    address: row.address,
    phone: row.phone,
  };
}

async function loadCompany(companyId: string): Promise<Company | undefined> {
  const rows = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);
  return rows[0];
}

router.get("/company", requireAuth, async (req, res) => {
  try {
    const company = await loadCompany(req.auth!.companyId);
    if (!company) {
      res.status(404).json({ error: "الشركة غير موجودة" });
      return;
    }
    res.json(toCompany(company));
  } catch (err) {
    req.log.error({ err }, "Failed to load company");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

router.patch(
  "/company",
  requireAuth,
  requireCapability("company:manage"),
  async (req, res) => {
    const parsed = UpdateCompanyBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const data = parsed.data;
    if (data.country !== undefined && !isCountry(data.country)) {
      res.status(400).json({ error: "الدولة المختارة غير مدعومة" });
      return;
    }
    if (data.baseCurrency !== undefined && !isCurrency(data.baseCurrency)) {
      res.status(400).json({ error: "العملة المختارة غير مدعومة" });
      return;
    }
    try {
      const [updated] = await db
        .update(companiesTable)
        .set({
          ...(data.name !== undefined && { name: data.name }),
          ...(data.tradeName !== undefined && { tradeName: data.tradeName }),
          ...(data.taxRegistrationNumber !== undefined && {
            taxRegistrationNumber: data.taxRegistrationNumber,
          }),
          ...(data.activityDescription !== undefined && {
            activityDescription: data.activityDescription,
          }),
          ...(data.country !== undefined && { country: data.country }),
          ...(data.baseCurrency !== undefined && {
            baseCurrency: data.baseCurrency,
          }),
          ...(data.address !== undefined && { address: data.address }),
          ...(data.phone !== undefined && { phone: data.phone }),
        })
        .where(eq(companiesTable.id, req.auth!.companyId))
        .returning();
      if (!updated) {
        res.status(404).json({ error: "الشركة غير موجودة" });
        return;
      }
      res.json(toCompany(updated));
    } catch (err) {
      req.log.error({ err }, "Failed to update company");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const hash = crypto.randomBytes(8).toString("hex");
    cb(null, `${Date.now()}-${hash}${ext}`);
  },
});

// SVG is intentionally excluded: it can carry active (script) content and would
// be served same-origin from /api/uploads, enabling stored-XSS abuse. Raster only.
const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const upload = multer({
  storage,
  limits: { fileSize: MAX_LOGO_BYTES },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|jpg|png|webp|gif)$/.test(file.mimetype);
    if (!ok) {
      cb(new Error("INVALID_TYPE"));
      return;
    }
    cb(null, true);
  },
});

// Maps multer/file-filter failures to structured 400 JSON instead of letting
// them fall through to the generic Express error handler.
function uploadLogo(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const msg =
        err.code === "LIMIT_FILE_SIZE"
          ? "حجم الملف يتجاوز الحد المسموح (5 ميجابايت)"
          : "تعذّر رفع الملف";
      res.status(400).json({ error: msg });
      return;
    }
    if (err instanceof Error && err.message === "INVALID_TYPE") {
      res.status(400).json({
        error: "نوع الملف غير مدعوم. الصور المسموحة: JPG, PNG, WEBP, GIF",
      });
      return;
    }
    if (err) {
      next(err);
      return;
    }
    next();
  });
}

router.post(
  "/company/logo",
  requireAuth,
  requireCapability("company:manage"),
  uploadLogo,
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "لم يتم رفع أي ملف" });
      return;
    }
    const logoUrl = `/api/uploads/${req.file.filename}`;
    try {
      const [updated] = await db
        .update(companiesTable)
        .set({ logoUrl })
        .where(eq(companiesTable.id, req.auth!.companyId))
        .returning();
      if (!updated) {
        res.status(404).json({ error: "الشركة غير موجودة" });
        return;
      }
      res.json(toCompany(updated));
    } catch (err) {
      req.log.error({ err }, "Failed to save company logo");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
