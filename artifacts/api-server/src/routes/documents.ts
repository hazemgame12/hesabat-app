import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  db,
  documentsTable,
  invoicesTable,
  journalEntriesTable,
  bankMovementsTable,
} from "@workspace/db";
import { requireAuth } from "../middleware/require-auth";
import { uploadsDir } from "./uploads";

const router = Router();

const MAX_DOC_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES =
  /^(image\/(jpeg|jpg|png|webp|gif)|application\/pdf|application\/vnd\.openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document)|application\/vnd\.ms-excel|application\/msword|text\/csv|text\/plain)$/;

const docStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const hash = crypto.randomBytes(10).toString("hex");
    cb(null, `doc-${Date.now()}-${hash}${ext}`);
  },
});

const docUpload = multer({
  storage: docStorage,
  limits: { fileSize: MAX_DOC_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_TYPES.test(file.mimetype)) {
      cb(new Error("INVALID_TYPE"));
      return;
    }
    cb(null, true);
  },
});

function handleUpload(req: Parameters<typeof requireAuth>[0], res: Parameters<typeof requireAuth>[1], next: Parameters<typeof requireAuth>[2]) {
  docUpload.single("file")(req as never, res as never, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === "LIMIT_FILE_SIZE"
        ? "حجم الملف يتجاوز الحد المسموح (20 ميجابايت)"
        : "تعذّر رفع الملف";
      res.status(400).json({ error: msg });
      return;
    }
    if (err instanceof Error && err.message === "INVALID_TYPE") {
      res.status(400).json({ error: "نوع الملف غير مدعوم. المسموح: PDF، صور، Excel، Word، CSV" });
      return;
    }
    if (err) { next(err); return; }
    next();
  });
}

// GET /documents/unlinked-count — MUST be before /:id
router.get("/documents/unlinked-count", requireAuth, async (req, res) => {
  const { companyId } = req.auth!;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(documentsTable)
    .where(
      and(
        eq(documentsTable.companyId, companyId),
        isNull(documentsTable.invoiceId),
        isNull(documentsTable.journalEntryId),
        isNull(documentsTable.bankMovementId),
      ),
    );
  res.json({ count: row?.count ?? 0 });
});

// GET /documents
router.get("/documents", requireAuth, async (req, res) => {
  const { companyId } = req.auth!;
  const { filter, invoiceId: qInvoiceId, journalEntryId: qJournalEntryId, bankMovementId: qBankMovementId } = req.query as {
    filter?: string;
    invoiceId?: string;
    journalEntryId?: string;
    bankMovementId?: string;
  };

  const conditions = [eq(documentsTable.companyId, companyId)];

  if (qInvoiceId) {
    conditions.push(eq(documentsTable.invoiceId, qInvoiceId));
  } else if (qJournalEntryId) {
    conditions.push(eq(documentsTable.journalEntryId, qJournalEntryId));
  } else if (qBankMovementId) {
    conditions.push(eq(documentsTable.bankMovementId, qBankMovementId));
  } else if (filter === "unlinked") {
    conditions.push(isNull(documentsTable.invoiceId));
    conditions.push(isNull(documentsTable.journalEntryId));
    conditions.push(isNull(documentsTable.bankMovementId));
  } else if (filter === "invoices") {
    conditions.push(sql`${documentsTable.invoiceId} IS NOT NULL`);
  } else if (filter === "journal") {
    conditions.push(sql`${documentsTable.journalEntryId} IS NOT NULL`);
  } else if (filter === "bank") {
    conditions.push(sql`${documentsTable.bankMovementId} IS NOT NULL`);
  }

  const rows = await db
    .select()
    .from(documentsTable)
    .where(and(...conditions))
    .orderBy(sql`${documentsTable.createdAt} DESC`);

  const linked: Array<{
    linkedLabel: string | null;
    linkedModule: "invoice" | "journal" | "bank" | null;
  }> = await Promise.all(
    rows.map(async (doc) => {
      if (doc.invoiceId) {
        const [inv] = await db
          .select({ invoiceNo: invoicesTable.invoiceNo, kind: invoicesTable.kind })
          .from(invoicesTable)
          .where(and(eq(invoicesTable.id, doc.invoiceId), eq(invoicesTable.companyId, companyId)))
          .limit(1);
        const prefix = inv?.kind?.startsWith("sales") ? "SI" : inv?.kind?.startsWith("purchase") ? "PI" : "فاتورة";
        const label = inv ? `${prefix}-${String(inv.invoiceNo).padStart(5, "0")}` : null;
        return { linkedLabel: label, linkedModule: "invoice" as const };
      }
      if (doc.journalEntryId) {
        const [je] = await db
          .select({ entryNo: journalEntriesTable.entryNo })
          .from(journalEntriesTable)
          .where(and(eq(journalEntriesTable.id, doc.journalEntryId), eq(journalEntriesTable.companyId, companyId)))
          .limit(1);
        const label = je ? `JE-${String(je.entryNo).padStart(5, "0")}` : null;
        return { linkedLabel: label, linkedModule: "journal" as const };
      }
      if (doc.bankMovementId) {
        const [mv] = await db
          .select({ notes: bankMovementsTable.notes })
          .from(bankMovementsTable)
          .where(and(eq(bankMovementsTable.id, doc.bankMovementId), eq(bankMovementsTable.companyId, companyId)))
          .limit(1);
        return { linkedLabel: mv?.notes ?? "حركة بنكية", linkedModule: "bank" as const };
      }
      return { linkedLabel: null, linkedModule: null };
    }),
  );

  const result = rows.map((doc, i) => ({
    ...doc,
    filePath: undefined,
    linkedLabel: linked[i]!.linkedLabel,
    linkedModule: linked[i]!.linkedModule,
  }));

  res.json(result);
});

// POST /documents/upload
router.post("/documents/upload", requireAuth, handleUpload, async (req, res) => {
  const { companyId, userId } = req.auth!;
  const file = (req as never as { file?: Express.Multer.File }).file;
  if (!file) { res.status(400).json({ error: "لم يتم رفع ملف" }); return; }

  const displayName = (req.body as { displayName?: string }).displayName?.trim()
    || file.originalname;

  const [doc] = await db
    .insert(documentsTable)
    .values({
      companyId,
      displayName,
      originalName: file.originalname,
      filePath: file.filename,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      source: "manual",
      uploadedBy: userId,
    })
    .returning();

  res.status(201).json({ ...doc, filePath: undefined });
});

// GET /documents/:id/view — serve inline (browser preview: PDF viewer, image)
router.get("/documents/:id/view", requireAuth, async (req, res) => {
  const { companyId } = req.auth!;
  const id = req.params["id"] as string;
  const [doc] = await db
    .select()
    .from(documentsTable)
    .where(and(eq(documentsTable.id, id), eq(documentsTable.companyId, companyId)));

  if (!doc) { res.status(404).json({ error: "المستند غير موجود" }); return; }

  const filePath = path.join(uploadsDir, doc.filePath);
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: "الملف غير موجود على الخادم" }); return; }

  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(doc.displayName)}`);
  res.setHeader("Content-Type", doc.mimeType);
  fs.createReadStream(filePath).pipe(res);
});

// GET /documents/:id/download
router.get("/documents/:id/download", requireAuth, async (req, res) => {
  const { companyId } = req.auth!;
  const id = req.params["id"] as string;
  const [doc] = await db
    .select()
    .from(documentsTable)
    .where(and(eq(documentsTable.id, id), eq(documentsTable.companyId, companyId)));

  if (!doc) { res.status(404).json({ error: "المستند غير موجود" }); return; }

  const filePath = path.join(uploadsDir, doc.filePath);
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: "الملف غير موجود على الخادم" }); return; }

  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(doc.displayName)}`);
  res.setHeader("Content-Type", doc.mimeType);
  fs.createReadStream(filePath).pipe(res);
});

// PATCH /documents/:id
router.patch("/documents/:id", requireAuth, async (req, res) => {
  const { companyId } = req.auth!;
  const id = req.params["id"] as string;
  const body = req.body as {
    displayName?: string;
    invoiceId?: string | null;
    journalEntryId?: string | null;
    bankMovementId?: string | null;
  };

  const [existing] = await db
    .select()
    .from(documentsTable)
    .where(and(eq(documentsTable.id, id), eq(documentsTable.companyId, companyId)));

  if (!existing) { res.status(404).json({ error: "المستند غير موجود" }); return; }

  const updates: Partial<typeof documentsTable.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (body.displayName !== undefined) {
    const name = body.displayName.trim();
    if (!name) { res.status(400).json({ error: "الاسم مطلوب" }); return; }
    updates.displayName = name;
  }

  if ("invoiceId" in body || "journalEntryId" in body || "bankMovementId" in body) {
    updates.invoiceId = body.invoiceId ?? null;
    updates.journalEntryId = body.journalEntryId ?? null;
    updates.bankMovementId = body.bankMovementId ?? null;
  }

  const [updated] = await db
    .update(documentsTable)
    .set(updates)
    .where(and(eq(documentsTable.id, id), eq(documentsTable.companyId, companyId)))
    .returning();

  res.json({ ...updated, filePath: undefined });
});

// DELETE /documents/:id
router.delete("/documents/:id", requireAuth, async (req, res) => {
  const { companyId } = req.auth!;
  const id = req.params["id"] as string;
  const [doc] = await db
    .select()
    .from(documentsTable)
    .where(and(eq(documentsTable.id, id), eq(documentsTable.companyId, companyId)));

  if (!doc) { res.status(404).json({ error: "المستند غير موجود" }); return; }

  await db
    .delete(documentsTable)
    .where(and(eq(documentsTable.id, id), eq(documentsTable.companyId, companyId)));

  const filePath = path.join(uploadsDir, doc.filePath);
  fs.unlink(filePath, () => {});

  res.json({ ok: true });
});

export default router;
