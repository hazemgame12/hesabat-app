import { Router, type Request, type Response, type NextFunction } from "express";
import { and, eq, asc, desc, sql, inArray } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import ExcelJS from "exceljs";
import {
  db,
  journalEntriesTable,
  journalEntryLinesTable,
  journalEntryAttachmentsTable,
  accountsTable,
  taxesTable,
  costCentersTable,
  type JournalEntry,
  type JournalEntryLine,
  type JournalEntryAttachment,
} from "@workspace/db";
import { CreateJournalEntryBody, UpdateJournalEntryBody } from "@workspace/api-zod";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import { uploadsDir } from "./uploads";
import { lockCompanyEntryNo } from "../lib/journal-posting";
import { safeAudit } from "../lib/audit";

const router = Router();

// Money values use 2 decimals; treat sub-cent differences as balanced.
const BALANCE_TOLERANCE = 0.005;
const round2 = (n: number) => Math.round(n * 100) / 100;

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
// Supporting documents for accounting entries: invoices, receipts, sheets.
// SVG/HTML are excluded — attachments are streamed back with a forced
// download (Content-Disposition: attachment), never rendered inline.
const ATTACHMENT_TYPES =
  /^(image\/(jpeg|jpg|png|webp|gif)|application\/pdf|application\/vnd\.openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document)|application\/vnd\.ms-excel|application\/msword|text\/csv|text\/plain)$/;

const attachmentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const hash = crypto.randomBytes(8).toString("hex");
    cb(null, `journal-${Date.now()}-${hash}${ext}`);
  },
});
const attachmentUpload = multer({
  storage: attachmentStorage,
  limits: { fileSize: MAX_ATTACHMENT_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ATTACHMENT_TYPES.test(file.mimetype)) {
      cb(new Error("INVALID_TYPE"));
      return;
    }
    cb(null, true);
  },
});

// xlsx imports come through memory storage (parsed, never persisted to disk).
const xlsxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES },
});

// Maps multer/file-filter failures to structured 400 JSON instead of letting
// them fall through to the generic Express error handler.
function handleAttachmentUpload(req: Request, res: Response, next: NextFunction) {
  attachmentUpload.single("file")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const msg =
        err.code === "LIMIT_FILE_SIZE"
          ? "حجم الملف يتجاوز الحد المسموح (10 ميجابايت)"
          : "تعذّر رفع الملف";
      res.status(400).json({ error: msg });
      return;
    }
    if (err instanceof Error && err.message === "INVALID_TYPE") {
      res.status(400).json({
        error: "نوع الملف غير مدعوم. المسموح: PDF, صور, Excel, Word, CSV",
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

function handleXlsxUpload(req: Request, res: Response, next: NextFunction) {
  xlsxUpload.single("file")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      res.status(400).json({ error: "تعذّر رفع الملف" });
      return;
    }
    if (err) {
      next(err);
      return;
    }
    next();
  });
}

type LineInput = {
  accountId: string;
  description?: string | null;
  currency: string;
  exchangeRate: number;
  debit: number;
  credit: number;
  taxId?: string | null;
  costCenterId?: string | null;
};

function toLine(row: JournalEntryLine) {
  return {
    id: row.id,
    lineNo: row.lineNo,
    accountId: row.accountId,
    description: row.description,
    currency: row.currency,
    exchangeRate: Number(row.exchangeRate),
    debit: Number(row.debit),
    credit: Number(row.credit),
    debitBase: Number(row.debitBase),
    creditBase: Number(row.creditBase),
    taxId: row.taxId,
    costCenterId: row.costCenterId,
  };
}

function toAttachment(row: JournalEntryAttachment) {
  return {
    id: row.id,
    fileName: row.fileName,
    contentType: row.contentType,
    size: row.size,
    createdAt: row.createdAt.toISOString(),
  };
}

// Human-facing entry number, e.g. JV-2026-000123. The underlying integer
// `entryNo` (concurrency-safe via lockCompanyEntryNo) stays the source of truth.
function formatEntryNumber(entryNo: number, date: string): string {
  const year = date.slice(0, 4);
  return `JV-${year}-${String(entryNo).padStart(6, "0")}`;
}

function toEntrySummary(
  row: JournalEntry,
  totals: { debit: number; credit: number },
) {
  return {
    id: row.id,
    entryNo: row.entryNo,
    entryNumber: formatEntryNumber(row.entryNo, row.date),
    date: row.date,
    reference: row.reference,
    notes: row.notes,
    status: row.status,
    entryType: row.entryType,
    reversedEntryId: row.reversedEntryId,
    totalDebitBase: round2(totals.debit),
    totalCreditBase: round2(totals.credit),
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    postedAt: row.postedAt ? row.postedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toEntryDetail(
  row: JournalEntry,
  lines: JournalEntryLine[],
  attachments: JournalEntryAttachment[],
) {
  const totalDebitBase = lines.reduce((s, l) => s + Number(l.debitBase), 0);
  const totalCreditBase = lines.reduce((s, l) => s + Number(l.creditBase), 0);
  return {
    ...toEntrySummary(row, { debit: totalDebitBase, credit: totalCreditBase }),
    lines: lines.map(toLine),
    attachments: attachments.map(toAttachment),
  };
}

// Verifies every referenced FK (accounts, taxes, cost centers) belongs to the
// caller's company. Returns an Arabic error message when something is invalid.
async function validateLineRefs(
  lines: LineInput[],
  companyId: string,
): Promise<string | null> {
  const accountIds = [...new Set(lines.map((l) => l.accountId))];
  const taxIds = [
    ...new Set(lines.map((l) => l.taxId).filter((x): x is string => !!x)),
  ];
  const centerIds = [
    ...new Set(
      lines.map((l) => l.costCenterId).filter((x): x is string => !!x),
    ),
  ];

  const accounts = await db
    .select({ id: accountsTable.id, isGroup: accountsTable.isGroup })
    .from(accountsTable)
    .where(
      and(
        eq(accountsTable.companyId, companyId),
        inArray(accountsTable.id, accountIds),
      ),
    );
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  for (const id of accountIds) {
    const acc = accountMap.get(id);
    if (!acc) return "أحد الحسابات المحددة غير موجود";
    if (acc.isGroup) return "لا يمكن الترحيل إلى حساب رئيسي";
  }

  if (taxIds.length > 0) {
    const taxes = await db
      .select({ id: taxesTable.id })
      .from(taxesTable)
      .where(
        and(eq(taxesTable.companyId, companyId), inArray(taxesTable.id, taxIds)),
      );
    if (taxes.length !== taxIds.length) return "إحدى الضرائب المحددة غير موجودة";
  }

  if (centerIds.length > 0) {
    const centers = await db
      .select({ id: costCentersTable.id })
      .from(costCentersTable)
      .where(
        and(
          eq(costCentersTable.companyId, companyId),
          inArray(costCentersTable.id, centerIds),
        ),
      );
    if (centers.length !== centerIds.length)
      return "أحد مراكز التكلفة المحددة غير موجود";
  }

  return null;
}

// Validates line amounts and balance; returns computed base amounts per line.
function computeAndValidate(
  lines: LineInput[],
): { error: string } | { computed: { debitBase: number; creditBase: number }[] } {
  const computed: { debitBase: number; creditBase: number }[] = [];
  let totalDebit = 0;
  let totalCredit = 0;
  for (const l of lines) {
    if (l.debit > 0 && l.credit > 0) {
      return { error: "لا يمكن إدخال مدين ودائن في نفس السطر" };
    }
    if (l.debit <= 0 && l.credit <= 0) {
      return { error: "كل سطر يجب أن يحتوي على مبلغ مدين أو دائن" };
    }
    const debitBase = round2(l.debit * l.exchangeRate);
    const creditBase = round2(l.credit * l.exchangeRate);
    computed.push({ debitBase, creditBase });
    totalDebit += debitBase;
    totalCredit += creditBase;
  }
  if (Math.abs(totalDebit - totalCredit) > BALANCE_TOLERANCE) {
    return { error: "القيد غير متوازن: إجمالي المدين لا يساوي إجمالي الدائن" };
  }
  return { computed };
}

router.get(
  "/journal",
  requireAuth,
  requireCapability("journal:read"),
  async (req, res) => {
    try {
      const companyId = req.auth!.companyId;
      const entries = await db
        .select()
        .from(journalEntriesTable)
        .where(eq(journalEntriesTable.companyId, companyId))
        .orderBy(desc(journalEntriesTable.entryNo));
      if (entries.length === 0) {
        res.json([]);
        return;
      }
      const ids = entries.map((e) => e.id);
      const totalsRows = await db
        .select({
          entryId: journalEntryLinesTable.entryId,
          debit: sql<string>`coalesce(sum(${journalEntryLinesTable.debitBase}), 0)`,
          credit: sql<string>`coalesce(sum(${journalEntryLinesTable.creditBase}), 0)`,
        })
        .from(journalEntryLinesTable)
        .where(
          and(
            eq(journalEntryLinesTable.companyId, companyId),
            inArray(journalEntryLinesTable.entryId, ids),
          ),
        )
        .groupBy(journalEntryLinesTable.entryId);
      const totalsMap = new Map(
        totalsRows.map((r) => [
          r.entryId,
          { debit: Number(r.debit), credit: Number(r.credit) },
        ]),
      );
      res.json(
        entries.map((e) =>
          toEntrySummary(e, totalsMap.get(e.id) ?? { debit: 0, credit: 0 }),
        ),
      );
    } catch (err) {
      req.log.error({ err }, "Failed to list journal entries");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

const EXPORT_HEADERS = [
  "entryNo",
  "date",
  "reference",
  "notes",
  "accountCode",
  "accountName",
  "description",
  "currency",
  "exchangeRate",
  "debit",
  "credit",
] as const;

// Streams ALL of the company's entries (one row per line) as an .xlsx workbook.
// Registered BEFORE "/journal/:id" so the literal path wins over the param route.
router.get(
  "/journal/export",
  requireAuth,
  requireCapability("journal:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    try {
      const entries = await db
        .select()
        .from(journalEntriesTable)
        .where(eq(journalEntriesTable.companyId, companyId))
        .orderBy(asc(journalEntriesTable.entryNo));
      const lines = await db
        .select()
        .from(journalEntryLinesTable)
        .where(eq(journalEntryLinesTable.companyId, companyId))
        .orderBy(
          asc(journalEntryLinesTable.entryId),
          asc(journalEntryLinesTable.lineNo),
        );
      const accounts = await db
        .select({
          id: accountsTable.id,
          code: accountsTable.code,
          nameAr: accountsTable.nameAr,
        })
        .from(accountsTable)
        .where(eq(accountsTable.companyId, companyId));
      const accountMap = new Map(accounts.map((a) => [a.id, a]));
      const entryMap = new Map(entries.map((e) => [e.id, e]));

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Journal");
      ws.addRow(EXPORT_HEADERS as unknown as string[]);
      for (const l of lines) {
        const e = entryMap.get(l.entryId);
        if (!e) continue;
        const acc = accountMap.get(l.accountId);
        ws.addRow([
          e.entryNo,
          e.date,
          e.reference ?? "",
          e.notes ?? "",
          acc?.code ?? "",
          acc?.nameAr ?? "",
          l.description ?? "",
          l.currency,
          Number(l.exchangeRate),
          Number(l.debit),
          Number(l.credit),
        ]);
      }
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="journal-export-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      );
      await wb.xlsx.write(res);
      res.end();
    } catch (err) {
      req.log.error({ err }, "Failed to export journal entries");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.get(
  "/journal/:id",
  requireAuth,
  requireCapability("journal:read"),
  async (req, res) => {
    const id = req.params["id"] as string;
    try {
      const companyId = req.auth!.companyId;
      const [entry] = await db
        .select()
        .from(journalEntriesTable)
        .where(
          and(
            eq(journalEntriesTable.id, id),
            eq(journalEntriesTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!entry) {
        res.status(404).json({ error: "القيد غير موجود" });
        return;
      }
      const lines = await db
        .select()
        .from(journalEntryLinesTable)
        .where(
          and(
            eq(journalEntryLinesTable.entryId, id),
            eq(journalEntryLinesTable.companyId, companyId),
          ),
        )
        .orderBy(asc(journalEntryLinesTable.lineNo));
      const attachments = await db
        .select()
        .from(journalEntryAttachmentsTable)
        .where(
          and(
            eq(journalEntryAttachmentsTable.entryId, id),
            eq(journalEntryAttachmentsTable.companyId, companyId),
          ),
        )
        .orderBy(asc(journalEntryAttachmentsTable.createdAt));
      res.json(toEntryDetail(entry, lines, attachments));
    } catch (err) {
      req.log.error({ err }, "Failed to get journal entry");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.post(
  "/journal",
  requireAuth,
  requireCapability("journal:create"),
  async (req, res) => {
    const parsed = CreateJournalEntryBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const lines = parsed.data.lines as LineInput[];
    const result = computeAndValidate(lines);
    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    try {
      const refErr = await validateLineRefs(lines, companyId);
      if (refErr) {
        res.status(400).json({ error: refErr });
        return;
      }
      const detail = await db.transaction(async (tx) => {
        await lockCompanyEntryNo(tx, companyId);
        const [{ maxNo }] = await tx
          .select({
            maxNo: sql<number>`coalesce(max(${journalEntriesTable.entryNo}), 0)`,
          })
          .from(journalEntriesTable)
          .where(eq(journalEntriesTable.companyId, companyId));
        const [entry] = await tx
          .insert(journalEntriesTable)
          .values({
            companyId,
            entryNo: Number(maxNo) + 1,
            date: parsed.data.date,
            reference: parsed.data.reference ?? null,
            notes: parsed.data.notes ?? null,
            status: "draft",
            createdBy: req.auth!.userId,
          })
          .returning();
        const lineRows = await tx
          .insert(journalEntryLinesTable)
          .values(
            lines.map((l, i) => ({
              entryId: entry!.id,
              companyId,
              lineNo: i + 1,
              accountId: l.accountId,
              description: l.description ?? null,
              currency: l.currency,
              exchangeRate: String(l.exchangeRate),
              debit: String(round2(l.debit)),
              credit: String(round2(l.credit)),
              debitBase: String(result.computed[i]!.debitBase),
              creditBase: String(result.computed[i]!.creditBase),
              taxId: l.taxId ?? null,
              costCenterId: l.costCenterId ?? null,
            })),
          )
          .returning();
        return toEntryDetail(entry!, lineRows, []);
      });
      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "create",
          entity: "journal_entry",
          entityId: detail.id,
          newValue: {
            entryNo: detail.entryNo,
            date: detail.date,
            reference: detail.reference,
            status: detail.status,
          },
        },
        req.log,
      );
      res.status(201).json(detail);
    } catch (err) {
      req.log.error({ err }, "Failed to create journal entry");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.patch(
  "/journal/:id",
  requireAuth,
  requireCapability("journal:update"),
  async (req, res) => {
    const id = req.params["id"] as string;
    const parsed = UpdateJournalEntryBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const lines = parsed.data.lines as LineInput[];
    const result = computeAndValidate(lines);
    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    try {
      const [existing] = await db
        .select()
        .from(journalEntriesTable)
        .where(
          and(
            eq(journalEntriesTable.id, id),
            eq(journalEntriesTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "القيد غير موجود" });
        return;
      }
      if (existing.status !== "draft") {
        res
          .status(400)
          .json({ error: "لا يمكن تعديل القيد إلا وهو مسودة" });
        return;
      }
      const refErr = await validateLineRefs(lines, companyId);
      if (refErr) {
        res.status(400).json({ error: refErr });
        return;
      }
      const detail = await db.transaction(async (tx) => {
        const [entry] = await tx
          .update(journalEntriesTable)
          .set({
            date: parsed.data.date,
            reference: parsed.data.reference ?? null,
            notes: parsed.data.notes ?? null,
          })
          .where(
            and(
              eq(journalEntriesTable.id, id),
              eq(journalEntriesTable.companyId, companyId),
            ),
          )
          .returning();
        await tx
          .delete(journalEntryLinesTable)
          .where(eq(journalEntryLinesTable.entryId, id));
        const lineRows = await tx
          .insert(journalEntryLinesTable)
          .values(
            lines.map((l, i) => ({
              entryId: id,
              companyId,
              lineNo: i + 1,
              accountId: l.accountId,
              description: l.description ?? null,
              currency: l.currency,
              exchangeRate: String(l.exchangeRate),
              debit: String(round2(l.debit)),
              credit: String(round2(l.credit)),
              debitBase: String(result.computed[i]!.debitBase),
              creditBase: String(result.computed[i]!.creditBase),
              taxId: l.taxId ?? null,
              costCenterId: l.costCenterId ?? null,
            })),
          )
          .returning();
        const attachments = await tx
          .select()
          .from(journalEntryAttachmentsTable)
          .where(eq(journalEntryAttachmentsTable.entryId, id));
        return toEntryDetail(entry!, lineRows, attachments);
      });
      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "update",
          entity: "journal_entry",
          entityId: id,
          oldValue: {
            date: existing.date,
            reference: existing.reference,
            notes: existing.notes,
          },
          newValue: {
            date: parsed.data.date,
            reference: parsed.data.reference ?? null,
            notes: parsed.data.notes ?? null,
          },
        },
        req.log,
      );
      res.json(detail);
    } catch (err) {
      req.log.error({ err }, "Failed to update journal entry");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.post(
  "/journal/:id/post",
  requireAuth,
  requireCapability("journal:post"),
  async (req, res) => {
    const id = req.params["id"] as string;
    const companyId = req.auth!.companyId;
    try {
      const [existing] = await db
        .select()
        .from(journalEntriesTable)
        .where(
          and(
            eq(journalEntriesTable.id, id),
            eq(journalEntriesTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "القيد غير موجود" });
        return;
      }
      if (existing.status === "posted") {
        res.status(400).json({ error: "القيد مرحَّل بالفعل" });
        return;
      }
      if (existing.status !== "approved") {
        res
          .status(400)
          .json({ error: "لا يمكن ترحيل القيد قبل اعتماده" });
        return;
      }
      const lines = await db
        .select()
        .from(journalEntryLinesTable)
        .where(
          and(
            eq(journalEntryLinesTable.entryId, id),
            eq(journalEntryLinesTable.companyId, companyId),
          ),
        )
        .orderBy(asc(journalEntryLinesTable.lineNo));
      if (lines.length < 2) {
        res.status(400).json({ error: "القيد يجب أن يحتوي على سطرين على الأقل" });
        return;
      }
      const totalDebit = lines.reduce((s, l) => s + Number(l.debitBase), 0);
      const totalCredit = lines.reduce((s, l) => s + Number(l.creditBase), 0);
      if (Math.abs(totalDebit - totalCredit) > BALANCE_TOLERANCE) {
        res.status(400).json({ error: "القيد غير متوازن ولا يمكن ترحيله" });
        return;
      }
      const [entry] = await db
        .update(journalEntriesTable)
        .set({ status: "posted", postedAt: new Date() })
        .where(
          and(
            eq(journalEntriesTable.id, id),
            eq(journalEntriesTable.companyId, companyId),
          ),
        )
        .returning();
      const attachments = await db
        .select()
        .from(journalEntryAttachmentsTable)
        .where(
          and(
            eq(journalEntryAttachmentsTable.entryId, id),
            eq(journalEntryAttachmentsTable.companyId, companyId),
          ),
        );
      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "post",
          entity: "journal_entry",
          entityId: id,
          oldValue: { status: existing.status },
          newValue: { status: "posted" },
        },
        req.log,
      );
      res.json(toEntryDetail(entry!, lines, attachments));
    } catch (err) {
      req.log.error({ err }, "Failed to post journal entry");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.delete(
  "/journal/:id",
  requireAuth,
  requireCapability("journal:delete"),
  async (req, res) => {
    const id = req.params["id"] as string;
    const companyId = req.auth!.companyId;
    try {
      // Only draft entries may be deleted; once an entry enters the approval
      // workflow (pending/approved/posted) it is immutable.
      const [existing] = await db
        .select({ status: journalEntriesTable.status })
        .from(journalEntriesTable)
        .where(
          and(
            eq(journalEntriesTable.id, id),
            eq(journalEntriesTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "القيد غير موجود" });
        return;
      }
      if (existing.status !== "draft") {
        res
          .status(400)
          .json({ error: "لا يمكن حذف القيد إلا وهو مسودة" });
        return;
      }
      // Capture the on-disk keys before the cascade removes the rows, so the
      // files can be cleaned up once the DB delete succeeds.
      const attachmentKeys = await db
        .select({ objectKey: journalEntryAttachmentsTable.objectKey })
        .from(journalEntryAttachmentsTable)
        .where(
          and(
            eq(journalEntryAttachmentsTable.entryId, id),
            eq(journalEntryAttachmentsTable.companyId, companyId),
          ),
        );
      const deleted = await db
        .delete(journalEntriesTable)
        .where(
          and(
            eq(journalEntriesTable.id, id),
            eq(journalEntriesTable.companyId, companyId),
          ),
        )
        .returning({ id: journalEntriesTable.id });
      if (deleted.length === 0) {
        res.status(404).json({ error: "القيد غير موجود" });
        return;
      }
      for (const a of attachmentKeys) {
        fs.promises
          .unlink(path.join(uploadsDir, a.objectKey))
          .catch(() => {});
      }
      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "delete",
          entity: "journal_entry",
          entityId: id,
          oldValue: { status: existing.status },
        },
        req.log,
      );
      res.json({ status: "ok" });
    } catch (err) {
      req.log.error({ err }, "Failed to delete journal entry");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Workflow (submit / approve / reject / reverse) ------------------------

// Loads a full entry detail (entry + ordered lines + attachments) scoped to the
// company. Returns null when the entry does not belong to the caller.
async function loadEntryDetail(id: string, companyId: string) {
  const [entry] = await db
    .select()
    .from(journalEntriesTable)
    .where(
      and(
        eq(journalEntriesTable.id, id),
        eq(journalEntriesTable.companyId, companyId),
      ),
    )
    .limit(1);
  if (!entry) return null;
  const lines = await db
    .select()
    .from(journalEntryLinesTable)
    .where(
      and(
        eq(journalEntryLinesTable.entryId, id),
        eq(journalEntryLinesTable.companyId, companyId),
      ),
    )
    .orderBy(asc(journalEntryLinesTable.lineNo));
  const attachments = await db
    .select()
    .from(journalEntryAttachmentsTable)
    .where(
      and(
        eq(journalEntryAttachmentsTable.entryId, id),
        eq(journalEntryAttachmentsTable.companyId, companyId),
      ),
    );
  return toEntryDetail(entry, lines, attachments);
}

// Submit a draft for approval: draft → pending_approval.
router.post(
  "/journal/:id/submit",
  requireAuth,
  requireCapability("journal:submit"),
  async (req, res) => {
    const id = req.params["id"] as string;
    const companyId = req.auth!.companyId;
    try {
      const [existing] = await db
        .select()
        .from(journalEntriesTable)
        .where(
          and(
            eq(journalEntriesTable.id, id),
            eq(journalEntriesTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "القيد غير موجود" });
        return;
      }
      if (existing.status !== "draft") {
        res
          .status(400)
          .json({ error: "لا يمكن إرسال القيد إلا وهو مسودة" });
        return;
      }
      const lines = await db
        .select()
        .from(journalEntryLinesTable)
        .where(
          and(
            eq(journalEntryLinesTable.entryId, id),
            eq(journalEntryLinesTable.companyId, companyId),
          ),
        );
      if (lines.length < 2) {
        res
          .status(400)
          .json({ error: "القيد يجب أن يحتوي على سطرين على الأقل" });
        return;
      }
      const totalDebit = lines.reduce((s, l) => s + Number(l.debitBase), 0);
      const totalCredit = lines.reduce((s, l) => s + Number(l.creditBase), 0);
      if (Math.abs(totalDebit - totalCredit) > BALANCE_TOLERANCE) {
        res
          .status(400)
          .json({ error: "القيد غير متوازن ولا يمكن إرساله" });
        return;
      }
      await db
        .update(journalEntriesTable)
        .set({
          status: "pending_approval",
          submittedBy: req.auth!.userId,
          submittedAt: new Date(),
        })
        .where(
          and(
            eq(journalEntriesTable.id, id),
            eq(journalEntriesTable.companyId, companyId),
          ),
        );
      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "submit",
          entity: "journal_entry",
          entityId: id,
          oldValue: { status: existing.status },
          newValue: { status: "pending_approval" },
        },
        req.log,
      );
      res.json(await loadEntryDetail(id, companyId));
    } catch (err) {
      req.log.error({ err }, "Failed to submit journal entry");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// Approve a submitted entry: pending_approval → approved.
router.post(
  "/journal/:id/approve",
  requireAuth,
  requireCapability("journal:approve"),
  async (req, res) => {
    const id = req.params["id"] as string;
    const companyId = req.auth!.companyId;
    try {
      const [existing] = await db
        .select()
        .from(journalEntriesTable)
        .where(
          and(
            eq(journalEntriesTable.id, id),
            eq(journalEntriesTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "القيد غير موجود" });
        return;
      }
      if (existing.status !== "pending_approval") {
        res
          .status(400)
          .json({ error: "لا يمكن اعتماد القيد إلا بعد إرساله للاعتماد" });
        return;
      }
      await db
        .update(journalEntriesTable)
        .set({
          status: "approved",
          approvedBy: req.auth!.userId,
          approvedAt: new Date(),
        })
        .where(
          and(
            eq(journalEntriesTable.id, id),
            eq(journalEntriesTable.companyId, companyId),
          ),
        );
      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "approve",
          entity: "journal_entry",
          entityId: id,
          oldValue: { status: existing.status },
          newValue: { status: "approved" },
        },
        req.log,
      );
      res.json(await loadEntryDetail(id, companyId));
    } catch (err) {
      req.log.error({ err }, "Failed to approve journal entry");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// Reject a submitted entry back to draft: pending_approval → draft.
router.post(
  "/journal/:id/reject",
  requireAuth,
  requireCapability("journal:approve"),
  async (req, res) => {
    const id = req.params["id"] as string;
    const companyId = req.auth!.companyId;
    try {
      const [existing] = await db
        .select()
        .from(journalEntriesTable)
        .where(
          and(
            eq(journalEntriesTable.id, id),
            eq(journalEntriesTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "القيد غير موجود" });
        return;
      }
      if (existing.status !== "pending_approval") {
        res
          .status(400)
          .json({ error: "لا يمكن رفض القيد إلا وهو قيد الاعتماد" });
        return;
      }
      await db
        .update(journalEntriesTable)
        .set({ status: "draft", submittedBy: null, submittedAt: null })
        .where(
          and(
            eq(journalEntriesTable.id, id),
            eq(journalEntriesTable.companyId, companyId),
          ),
        );
      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "reject",
          entity: "journal_entry",
          entityId: id,
          oldValue: { status: existing.status },
          newValue: { status: "draft" },
        },
        req.log,
      );
      res.json(await loadEntryDetail(id, companyId));
    } catch (err) {
      req.log.error({ err }, "Failed to reject journal entry");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// Reverse a posted entry: creates a new draft entry of type 'reversal' with
// debit/credit swapped, linked to the source via reversedEntryId.
router.post(
  "/journal/:id/reverse",
  requireAuth,
  requireCapability("journal:create"),
  async (req, res) => {
    const id = req.params["id"] as string;
    const companyId = req.auth!.companyId;
    try {
      const [original] = await db
        .select()
        .from(journalEntriesTable)
        .where(
          and(
            eq(journalEntriesTable.id, id),
            eq(journalEntriesTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!original) {
        res.status(404).json({ error: "القيد غير موجود" });
        return;
      }
      if (original.status !== "posted") {
        res
          .status(400)
          .json({ error: "لا يمكن عكس قيد غير مرحَّل" });
        return;
      }
      const sourceLines = await db
        .select()
        .from(journalEntryLinesTable)
        .where(
          and(
            eq(journalEntryLinesTable.entryId, id),
            eq(journalEntryLinesTable.companyId, companyId),
          ),
        )
        .orderBy(asc(journalEntryLinesTable.lineNo));
      const today = new Date().toISOString().slice(0, 10);
      const detail = await db.transaction(async (tx) => {
        await lockCompanyEntryNo(tx, companyId);
        // Re-check inside the lock: lockCompanyEntryNo serializes entry creation
        // per company, so a concurrent reverse cannot slip a second reversal in.
        const [existingReversal] = await tx
          .select({ id: journalEntriesTable.id })
          .from(journalEntriesTable)
          .where(
            and(
              eq(journalEntriesTable.companyId, companyId),
              eq(journalEntriesTable.reversedEntryId, id),
              eq(journalEntriesTable.entryType, "reversal"),
            ),
          )
          .limit(1);
        if (existingReversal) return null;
        const [{ maxNo }] = await tx
          .select({
            maxNo: sql<number>`coalesce(max(${journalEntriesTable.entryNo}), 0)`,
          })
          .from(journalEntriesTable)
          .where(eq(journalEntriesTable.companyId, companyId));
        const [entry] = await tx
          .insert(journalEntriesTable)
          .values({
            companyId,
            entryNo: Number(maxNo) + 1,
            date: today,
            reference: original.reference,
            notes: `قيد عكسي للقيد ${formatEntryNumber(
              original.entryNo,
              original.date,
            )}`,
            status: "draft",
            entryType: "reversal",
            reversedEntryId: original.id,
            createdBy: req.auth!.userId,
          })
          .returning();
        const lineRows = await tx
          .insert(journalEntryLinesTable)
          .values(
            sourceLines.map((l, i) => ({
              entryId: entry!.id,
              companyId,
              lineNo: i + 1,
              accountId: l.accountId,
              description: l.description,
              currency: l.currency,
              exchangeRate: l.exchangeRate,
              // Swap debit/credit to reverse the original entry.
              debit: l.credit,
              credit: l.debit,
              debitBase: l.creditBase,
              creditBase: l.debitBase,
              taxId: l.taxId,
              costCenterId: l.costCenterId,
            })),
          )
          .returning();
        return toEntryDetail(entry!, lineRows, []);
      });
      if (!detail) {
        res
          .status(400)
          .json({ error: "تم إنشاء قيد عكسي لهذا القيد بالفعل" });
        return;
      }
      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "reverse",
          entity: "journal_entry",
          entityId: original.id,
          newValue: {
            reversalEntryId: detail.id,
            reversalEntryNo: detail.entryNo,
          },
        },
        req.log,
      );
      res.status(201).json(detail);
    } catch (err) {
      req.log.error({ err }, "Failed to reverse journal entry");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Attachments -----------------------------------------------------------

async function loadOwnedEntry(id: string, companyId: string) {
  const [entry] = await db
    .select()
    .from(journalEntriesTable)
    .where(
      and(
        eq(journalEntriesTable.id, id),
        eq(journalEntriesTable.companyId, companyId),
      ),
    )
    .limit(1);
  return entry ?? null;
}

router.post(
  "/journal/:id/attachments",
  requireAuth,
  requireCapability("journal:update"),
  handleAttachmentUpload,
  async (req, res) => {
    const id = req.params["id"] as string;
    const companyId = req.auth!.companyId;
    if (!req.file) {
      res.status(400).json({ error: "لم يتم رفع أي ملف" });
      return;
    }
    try {
      const entry = await loadOwnedEntry(id, companyId);
      if (!entry) {
        fs.promises
          .unlink(path.join(uploadsDir, req.file.filename))
          .catch(() => {});
        res.status(404).json({ error: "القيد غير موجود" });
        return;
      }
      if (entry.status !== "draft") {
        fs.promises
          .unlink(path.join(uploadsDir, req.file.filename))
          .catch(() => {});
        res
          .status(400)
          .json({ error: "لا يمكن تعديل مرفقات القيد إلا وهو مسودة" });
        return;
      }
      const [row] = await db
        .insert(journalEntryAttachmentsTable)
        .values({
          entryId: id,
          companyId,
          fileName: Buffer.from(req.file.originalname, "latin1").toString("utf8"),
          objectKey: req.file.filename,
          contentType: req.file.mimetype,
          size: req.file.size,
        })
        .returning();
      res.status(201).json(toAttachment(row!));
    } catch (err) {
      // Remove the orphaned upload so a failed insert never leaks disk files.
      if (req.file)
        fs.promises
          .unlink(path.join(uploadsDir, req.file.filename))
          .catch(() => {});
      req.log.error({ err }, "Failed to attach file to journal entry");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.delete(
  "/journal/:id/attachments/:attachmentId",
  requireAuth,
  requireCapability("journal:update"),
  async (req, res) => {
    const id = req.params["id"] as string;
    const attachmentId = req.params["attachmentId"] as string;
    const companyId = req.auth!.companyId;
    try {
      const entry = await loadOwnedEntry(id, companyId);
      if (!entry) {
        res.status(404).json({ error: "القيد غير موجود" });
        return;
      }
      if (entry.status !== "draft") {
        res
          .status(400)
          .json({ error: "لا يمكن تعديل مرفقات القيد إلا وهو مسودة" });
        return;
      }
      const deleted = await db
        .delete(journalEntryAttachmentsTable)
        .where(
          and(
            eq(journalEntryAttachmentsTable.id, attachmentId),
            eq(journalEntryAttachmentsTable.entryId, id),
            eq(journalEntryAttachmentsTable.companyId, companyId),
          ),
        )
        .returning();
      if (deleted.length === 0) {
        res.status(404).json({ error: "المرفق غير موجود" });
        return;
      }
      fs.promises
        .unlink(path.join(uploadsDir, deleted[0]!.objectKey))
        .catch(() => {});
      res.json({ status: "ok" });
    } catch (err) {
      req.log.error({ err }, "Failed to delete journal attachment");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// Binary stream (not in the OpenAPI JSON contract). Forces a download so the
// browser never renders the file inline (defuses stored-XSS via uploads).
router.get(
  "/journal/:id/attachments/:attachmentId/download",
  requireAuth,
  requireCapability("journal:read"),
  async (req, res) => {
    const id = req.params["id"] as string;
    const attachmentId = req.params["attachmentId"] as string;
    const companyId = req.auth!.companyId;
    try {
      const [row] = await db
        .select()
        .from(journalEntryAttachmentsTable)
        .where(
          and(
            eq(journalEntryAttachmentsTable.id, attachmentId),
            eq(journalEntryAttachmentsTable.entryId, id),
            eq(journalEntryAttachmentsTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "المرفق غير موجود" });
        return;
      }
      const filePath = path.join(uploadsDir, row.objectKey);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: "الملف غير موجود" });
        return;
      }
      res.setHeader(
        "Content-Type",
        row.contentType ?? "application/octet-stream",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
      );
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      req.log.error({ err }, "Failed to download journal attachment");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Excel export / import -------------------------------------------------

type ImportLine = {
  accountCode: string;
  description: string | null;
  currency: string;
  exchangeRate: number;
  debit: number;
  credit: number;
};
type ImportGroup = {
  entryNo: string;
  date: string;
  reference: string | null;
  notes: string | null;
  lines: ImportLine[];
};

const cellStr = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "text" in v) return String((v as any).text);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
};
const cellNum = (v: ExcelJS.CellValue): number => {
  const n = Number(cellStr(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// Bulk-creates draft entries from an .xlsx (round-trips the export format).
// Rows are grouped by the entryNo column; each group becomes one draft entry.
router.post(
  "/journal/import",
  requireAuth,
  requireCapability("journal:create"),
  handleXlsxUpload,
  async (req, res) => {
    const companyId = req.auth!.companyId;
    if (!req.file) {
      res.status(400).json({ error: "لم يتم رفع أي ملف" });
      return;
    }
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(req.file.buffer as unknown as ArrayBuffer);
      const ws = wb.worksheets[0];
      if (!ws) {
        res.status(400).json({ error: "الملف لا يحتوي على بيانات" });
        return;
      }
      // Map header row → column indices (1-based in exceljs).
      const headerRow = ws.getRow(1);
      const colIndex: Record<string, number> = {};
      headerRow.eachCell((cell, col) => {
        colIndex[cellStr(cell.value).trim()] = col;
      });
      const need = (k: string) => colIndex[k] ?? 0;
      if (!need("entryNo") || !need("date") || !need("accountCode")) {
        res.status(400).json({
          error: "صيغة الملف غير صحيحة. الأعمدة المطلوبة: entryNo, date, accountCode",
        });
        return;
      }

      const groups = new Map<string, ImportGroup>();
      const order: string[] = [];
      for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const entryNo = cellStr(row.getCell(need("entryNo")).value);
        const accountCode = cellStr(row.getCell(need("accountCode")).value);
        if (!entryNo && !accountCode) continue;
        if (!entryNo || !accountCode) {
          res.status(400).json({
            error: `السطر ${r}: لا بد من وجود entryNo و accountCode`,
          });
          return;
        }
        if (!groups.has(entryNo)) {
          groups.set(entryNo, {
            entryNo,
            date: cellStr(row.getCell(need("date")).value),
            reference: need("reference")
              ? cellStr(row.getCell(need("reference")).value) || null
              : null,
            notes: need("notes")
              ? cellStr(row.getCell(need("notes")).value) || null
              : null,
            lines: [],
          });
          order.push(entryNo);
        }
        groups.get(entryNo)!.lines.push({
          accountCode,
          description: need("description")
            ? cellStr(row.getCell(need("description")).value) || null
            : null,
          currency: need("currency")
            ? cellStr(row.getCell(need("currency")).value) || "EGP"
            : "EGP",
          exchangeRate: need("exchangeRate")
            ? cellNum(row.getCell(need("exchangeRate")).value) || 1
            : 1,
          debit: need("debit") ? cellNum(row.getCell(need("debit")).value) : 0,
          credit: need("credit") ? cellNum(row.getCell(need("credit")).value) : 0,
        });
      }

      if (order.length === 0) {
        res.status(400).json({ error: "الملف لا يحتوي على قيود" });
        return;
      }

      // Resolve account codes → ids (company-scoped).
      const accounts = await db
        .select({
          id: accountsTable.id,
          code: accountsTable.code,
          isGroup: accountsTable.isGroup,
        })
        .from(accountsTable)
        .where(eq(accountsTable.companyId, companyId));
      const byCode = new Map(accounts.map((a) => [a.code, a]));

      // Validate every group up-front so the import is all-or-nothing.
      type Resolved = {
        group: ImportGroup;
        lines: LineInput[];
        computed: { debitBase: number; creditBase: number }[];
      };
      const resolved: Resolved[] = [];
      for (const key of order) {
        const g = groups.get(key)!;
        if (!g.date) {
          res.status(400).json({ error: `القيد ${key}: التاريخ مفقود` });
          return;
        }
        if (g.lines.length < 2) {
          res.status(400).json({ error: `القيد ${key}: يجب أن يحتوي على سطرين على الأقل` });
          return;
        }
        const lineInputs: LineInput[] = [];
        for (const l of g.lines) {
          const acc = byCode.get(l.accountCode);
          if (!acc) {
            res.status(400).json({ error: `القيد ${key}: الحساب ${l.accountCode} غير موجود` });
            return;
          }
          if (acc.isGroup) {
            res.status(400).json({ error: `القيد ${key}: لا يمكن الترحيل إلى حساب رئيسي (${l.accountCode})` });
            return;
          }
          lineInputs.push({
            accountId: acc.id,
            description: l.description,
            currency: l.currency,
            exchangeRate: l.exchangeRate,
            debit: l.debit,
            credit: l.credit,
          });
        }
        const calc = computeAndValidate(lineInputs);
        if ("error" in calc) {
          res.status(400).json({ error: `القيد ${key}: ${calc.error}` });
          return;
        }
        resolved.push({ group: g, lines: lineInputs, computed: calc.computed });
      }

      // Persist all entries in a single transaction.
      const created = await db.transaction(async (tx) => {
        await lockCompanyEntryNo(tx, companyId);
        const [{ maxNo }] = await tx
          .select({
            maxNo: sql<number>`coalesce(max(${journalEntriesTable.entryNo}), 0)`,
          })
          .from(journalEntriesTable)
          .where(eq(journalEntriesTable.companyId, companyId));
        let next = Number(maxNo);
        for (const r of resolved) {
          next += 1;
          const [entry] = await tx
            .insert(journalEntriesTable)
            .values({
              companyId,
              entryNo: next,
              date: r.group.date,
              reference: r.group.reference,
              notes: r.group.notes,
              status: "draft",
              createdBy: req.auth!.userId,
            })
            .returning();
          await tx.insert(journalEntryLinesTable).values(
            r.lines.map((l, i) => ({
              entryId: entry!.id,
              companyId,
              lineNo: i + 1,
              accountId: l.accountId,
              description: l.description ?? null,
              currency: l.currency,
              exchangeRate: String(l.exchangeRate),
              debit: String(round2(l.debit)),
              credit: String(round2(l.credit)),
              debitBase: String(r.computed[i]!.debitBase),
              creditBase: String(r.computed[i]!.creditBase),
            })),
          );
        }
        return resolved.length;
      });

      res.status(201).json({ status: "ok", imported: created });
    } catch (err) {
      req.log.error({ err }, "Failed to import journal entries");
      res.status(500).json({ error: "تعذّر قراءة الملف. تأكد أنه ملف Excel صحيح" });
    }
  },
);

export default router;
