import { Router, type Request, type Response, type NextFunction } from "express";
import { and, eq, asc, inArray, sql, count } from "drizzle-orm";
import { parsePagination, paginatedResponse } from "../lib/pagination";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import ExcelJS from "exceljs";
import {
  db,
  advancesTable,
  advanceInstallmentsTable,
  custodiesTable,
  custodyAttachmentsTable,
  employeesTable,
  accountsTable,
  companiesTable,
  costCentersTable,
  journalEntriesTable,
  type Advance,
  type Custody,
  type CustodyAttachment,
} from "@workspace/db";
import {
  CreateAdvanceBody,
  UpdateAdvanceBody,
  CreateCustodyBody,
  UpdateCustodyBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import { uploadsDir } from "./uploads";
import { createDraftJournalEntry } from "../lib/journal-posting";

const router = Router();

const round2 = (n: number) => Math.round(n * 100) / 100;
const EPS = 0.005;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ---- shared helpers --------------------------------------------------------

// Verifies every mapped account exists, belongs to the caller's company, and is
// a leaf (non-group) account. Returns an Arabic error message when invalid.
async function validateLeafAccounts(
  accountIds: string[],
  companyId: string,
): Promise<string | null> {
  const ids = [...new Set(accountIds.filter(Boolean))];
  if (ids.length === 0) return null;
  const rows = await db
    .select({ id: accountsTable.id, isGroup: accountsTable.isGroup })
    .from(accountsTable)
    .where(
      and(
        eq(accountsTable.companyId, companyId),
        inArray(accountsTable.id, ids),
      ),
    );
  const map = new Map(rows.map((r) => [r.id, r]));
  for (const id of ids) {
    const acc = map.get(id);
    if (!acc) return "أحد الحسابات المحددة غير موجود";
    if (acc.isGroup) return "لا يمكن الترحيل إلى حساب رئيسي";
  }
  return null;
}

async function employeeName(
  employeeId: string,
  companyId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ nameAr: employeesTable.nameAr })
    .from(employeesTable)
    .where(
      and(
        eq(employeesTable.id, employeeId),
        eq(employeesTable.companyId, companyId),
      ),
    )
    .limit(1);
  return row?.nameAr ?? null;
}

function toAdvance(row: Advance, name: string): ReturnType<typeof Object> {
  const amount = Number(row.amount);
  const totalRepaid = Number(row.totalRepaid);
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: name,
    date: row.date,
    amount,
    repaymentMonths: row.repaymentMonths,
    monthlyInstallment: Number(row.monthlyInstallment),
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    advancesAccountId: row.advancesAccountId,
    totalRepaid,
    remaining: round2(amount - totalRepaid),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

function toCustodyAttachment(row: CustodyAttachment) {
  return {
    id: row.id,
    fileName: row.fileName,
    contentType: row.contentType,
    size: row.size,
    createdAt: row.createdAt.toISOString(),
  };
}

function toCustody(
  row: Custody,
  name: string,
  attachments: CustodyAttachment[],
  entryNo: number | null,
) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: name,
    type: row.type,
    amount: Number(row.amount),
    receiptDate: row.receiptDate,
    description: row.description,
    status: row.status,
    settlementJournalEntryId: row.settlementJournalEntryId,
    settlementJournalEntryNo: entryNo,
    attachments: attachments.map(toCustodyAttachment),
    createdAt: row.createdAt.toISOString(),
  };
}

// ---- Advances --------------------------------------------------------------

router.get(
  "/advances",
  requireAuth,
  requireCapability("advances:read"),
  async (req, res) => {
    try {
      const companyId = req.auth!.companyId;
      const pg = parsePagination(req.query as Record<string, unknown>);

      if (pg) {
        const [{ total }] = await db
          .select({ total: count() })
          .from(advancesTable)
          .where(eq(advancesTable.companyId, companyId));
        const rows = await db
          .select({ advance: advancesTable, name: employeesTable.nameAr })
          .from(advancesTable)
          .innerJoin(employeesTable, eq(employeesTable.id, advancesTable.employeeId))
          .where(eq(advancesTable.companyId, companyId))
          .orderBy(asc(advancesTable.date))
          .limit(pg.limit)
          .offset(pg.offset);
        res.json(
          paginatedResponse(
            rows.map((r) => toAdvance(r.advance, r.name)),
            Number(total),
            pg.page,
            pg.limit,
          ),
        );
        return;
      }

      const rows = await db
        .select({
          advance: advancesTable,
          name: employeesTable.nameAr,
        })
        .from(advancesTable)
        .innerJoin(
          employeesTable,
          eq(employeesTable.id, advancesTable.employeeId),
        )
        .where(eq(advancesTable.companyId, companyId))
        .orderBy(asc(advancesTable.date));
      res.json(rows.map((r) => toAdvance(r.advance, r.name)));
    } catch (err) {
      req.log.error({ err }, "Failed to list advances");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.get(
  "/advances/:id",
  requireAuth,
  requireCapability("advances:read"),
  async (req, res) => {
    const id = req.params["id"] as string;
    try {
      const companyId = req.auth!.companyId;
      const [row] = await db
        .select()
        .from(advancesTable)
        .where(
          and(
            eq(advancesTable.id, id),
            eq(advancesTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "السلفة غير موجودة" });
        return;
      }
      const name = (await employeeName(row.employeeId, companyId)) ?? "";
      res.json(toAdvance(row, name));
    } catch (err) {
      req.log.error({ err }, "Failed to get advance");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.post(
  "/advances",
  requireAuth,
  requireCapability("advances:create"),
  async (req, res) => {
    const parsed = CreateAdvanceBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const d = parsed.data;
    try {
      const name = await employeeName(d.employeeId, companyId);
      if (!name) {
        res.status(400).json({ error: "الموظف غير موجود" });
        return;
      }
      const accErr = await validateLeafAccounts(
        [d.advancesAccountId],
        companyId,
      );
      if (accErr) {
        res.status(400).json({ error: accErr });
        return;
      }
      const [row] = await db
        .insert(advancesTable)
        .values({
          companyId,
          employeeId: d.employeeId,
          date: d.date,
          amount: String(round2(d.amount)),
          repaymentMonths: d.repaymentMonths,
          monthlyInstallment: String(round2(d.monthlyInstallment)),
          startDate: d.startDate,
          endDate: d.endDate ?? null,
          status: d.status ?? "active",
          advancesAccountId: d.advancesAccountId,
          notes: d.notes ?? null,
          createdBy: req.auth!.userId,
        })
        .returning();
      res.status(201).json(toAdvance(row!, name));
    } catch (err) {
      req.log.error({ err }, "Failed to create advance");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.patch(
  "/advances/:id",
  requireAuth,
  requireCapability("advances:update"),
  async (req, res) => {
    const id = req.params["id"] as string;
    const parsed = UpdateAdvanceBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const d = parsed.data;
    try {
      const [existing] = await db
        .select()
        .from(advancesTable)
        .where(
          and(
            eq(advancesTable.id, id),
            eq(advancesTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "السلفة غير موجودة" });
        return;
      }
      if (d.advancesAccountId) {
        const accErr = await validateLeafAccounts(
          [d.advancesAccountId],
          companyId,
        );
        if (accErr) {
          res.status(400).json({ error: accErr });
          return;
        }
      }
      const patch: Partial<typeof advancesTable.$inferInsert> = {};
      if (d.date !== undefined) patch.date = d.date;
      if (d.amount !== undefined) patch.amount = String(round2(d.amount));
      if (d.repaymentMonths !== undefined)
        patch.repaymentMonths = d.repaymentMonths;
      if (d.monthlyInstallment !== undefined)
        patch.monthlyInstallment = String(round2(d.monthlyInstallment));
      if (d.startDate !== undefined) patch.startDate = d.startDate;
      if (d.endDate !== undefined) patch.endDate = d.endDate;
      if (d.status !== undefined) patch.status = d.status;
      if (d.advancesAccountId !== undefined)
        patch.advancesAccountId = d.advancesAccountId;
      if (d.notes !== undefined) patch.notes = d.notes;
      const [row] = await db
        .update(advancesTable)
        .set(patch)
        .where(
          and(
            eq(advancesTable.id, id),
            eq(advancesTable.companyId, companyId),
          ),
        )
        .returning();
      const name = (await employeeName(row!.employeeId, companyId)) ?? "";
      res.json(toAdvance(row!, name));
    } catch (err) {
      req.log.error({ err }, "Failed to update advance");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.delete(
  "/advances/:id",
  requireAuth,
  requireCapability("advances:delete"),
  async (req, res) => {
    const id = req.params["id"] as string;
    const companyId = req.auth!.companyId;
    try {
      const [existing] = await db
        .select({ id: advancesTable.id })
        .from(advancesTable)
        .where(
          and(
            eq(advancesTable.id, id),
            eq(advancesTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "السلفة غير موجودة" });
        return;
      }
      // Block deletion once installments have been deducted in a payroll run —
      // those are tied to posted journal entries and must not be orphaned.
      const [{ cnt }] = await db
        .select({ cnt: sql<number>`count(*)` })
        .from(advanceInstallmentsTable)
        .where(
          and(
            eq(advanceInstallmentsTable.companyId, companyId),
            eq(advanceInstallmentsTable.advanceId, id),
          ),
        );
      if (Number(cnt) > 0) {
        res.status(400).json({
          error: "لا يمكن حذف سلفة تم خصم أقساط منها",
        });
        return;
      }
      await db
        .delete(advancesTable)
        .where(
          and(
            eq(advancesTable.id, id),
            eq(advancesTable.companyId, companyId),
          ),
        );
      res.json({ status: "ok" });
    } catch (err) {
      req.log.error({ err }, "Failed to delete advance");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Custodies -------------------------------------------------------------

async function loadCustodyAttachments(
  custodyIds: string[],
  companyId: string,
): Promise<Map<string, CustodyAttachment[]>> {
  const map = new Map<string, CustodyAttachment[]>();
  if (custodyIds.length === 0) return map;
  const rows = await db
    .select()
    .from(custodyAttachmentsTable)
    .where(
      and(
        eq(custodyAttachmentsTable.companyId, companyId),
        inArray(custodyAttachmentsTable.custodyId, custodyIds),
      ),
    )
    .orderBy(asc(custodyAttachmentsTable.createdAt));
  for (const row of rows) {
    const list = map.get(row.custodyId) ?? [];
    list.push(row);
    map.set(row.custodyId, list);
  }
  return map;
}

router.get(
  "/custodies",
  requireAuth,
  requireCapability("custodies:read"),
  async (req, res) => {
    try {
      const companyId = req.auth!.companyId;
      const pg = parsePagination(req.query as Record<string, unknown>);

      const fetchCustodies = async (whereClause: ReturnType<typeof eq>, lim?: number, off?: number) => {
        const q = db
          .select({
            custody: custodiesTable,
            name: employeesTable.nameAr,
            entryNo: journalEntriesTable.entryNo,
          })
          .from(custodiesTable)
          .innerJoin(employeesTable, eq(employeesTable.id, custodiesTable.employeeId))
          .leftJoin(
            journalEntriesTable,
            eq(journalEntriesTable.id, custodiesTable.settlementJournalEntryId),
          )
          .where(whereClause)
          .orderBy(asc(custodiesTable.receiptDate));
        if (lim !== undefined && off !== undefined) return q.limit(lim).offset(off);
        return q;
      };

      const cond = eq(custodiesTable.companyId, companyId);

      if (pg) {
        const [{ total }] = await db
          .select({ total: count() })
          .from(custodiesTable)
          .where(cond);
        const rows = await fetchCustodies(cond, pg.limit, pg.offset);
        const attachMap = await loadCustodyAttachments(rows.map((r) => r.custody.id), companyId);
        res.json(
          paginatedResponse(
            rows.map((r) => toCustody(r.custody, r.name, attachMap.get(r.custody.id) ?? [], r.entryNo ?? null)),
            Number(total),
            pg.page,
            pg.limit,
          ),
        );
        return;
      }

      const rows = await fetchCustodies(cond);
      const attachMap = await loadCustodyAttachments(
        rows.map((r) => r.custody.id),
        companyId,
      );
      res.json(
        rows.map((r) =>
          toCustody(
            r.custody,
            r.name,
            attachMap.get(r.custody.id) ?? [],
            r.entryNo ?? null,
          ),
        ),
      );
    } catch (err) {
      req.log.error({ err }, "Failed to list custodies");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

async function loadCustodyDetail(id: string, companyId: string) {
  const [row] = await db
    .select({
      custody: custodiesTable,
      name: employeesTable.nameAr,
      entryNo: journalEntriesTable.entryNo,
    })
    .from(custodiesTable)
    .innerJoin(employeesTable, eq(employeesTable.id, custodiesTable.employeeId))
    .leftJoin(
      journalEntriesTable,
      eq(journalEntriesTable.id, custodiesTable.settlementJournalEntryId),
    )
    .where(
      and(eq(custodiesTable.id, id), eq(custodiesTable.companyId, companyId)),
    )
    .limit(1);
  if (!row) return null;
  const attachMap = await loadCustodyAttachments([id], companyId);
  return toCustody(
    row.custody,
    row.name,
    attachMap.get(id) ?? [],
    row.entryNo ?? null,
  );
}

router.get(
  "/custodies/:id",
  requireAuth,
  requireCapability("custodies:read"),
  async (req, res) => {
    const id = req.params["id"] as string;
    try {
      const companyId = req.auth!.companyId;
      const custody = await loadCustodyDetail(id, companyId);
      if (!custody) {
        res.status(404).json({ error: "العهدة غير موجودة" });
        return;
      }
      res.json(custody);
    } catch (err) {
      req.log.error({ err }, "Failed to get custody");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.post(
  "/custodies",
  requireAuth,
  requireCapability("custodies:create"),
  async (req, res) => {
    const parsed = CreateCustodyBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const d = parsed.data;
    try {
      // "settled" is reserved for the Excel settlement flow (which links a
      // balanced draft JE) — it can never be set on create.
      if (d.status === "settled") {
        res.status(400).json({
          error: "تتم تسوية العهدة من خلال رفع ملف التسوية فقط",
        });
        return;
      }
      const name = await employeeName(d.employeeId, companyId);
      if (!name) {
        res.status(400).json({ error: "الموظف غير موجود" });
        return;
      }
      const [row] = await db
        .insert(custodiesTable)
        .values({
          companyId,
          employeeId: d.employeeId,
          type: d.type,
          amount: String(round2(d.amount)),
          receiptDate: d.receiptDate,
          description: d.description ?? null,
          status: d.status ?? "open",
          createdBy: req.auth!.userId,
        })
        .returning();
      res.status(201).json(toCustody(row!, name, [], null));
    } catch (err) {
      req.log.error({ err }, "Failed to create custody");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.patch(
  "/custodies/:id",
  requireAuth,
  requireCapability("custodies:update"),
  async (req, res) => {
    const id = req.params["id"] as string;
    const parsed = UpdateCustodyBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const d = parsed.data;
    try {
      const [existing] = await db
        .select()
        .from(custodiesTable)
        .where(
          and(
            eq(custodiesTable.id, id),
            eq(custodiesTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "العهدة غير موجودة" });
        return;
      }
      // "settled" is reserved for the Excel settlement flow (which links a
      // balanced draft JE) — it can never be set manually via edit.
      if (d.status === "settled" && existing.status !== "settled") {
        res.status(400).json({
          error: "تتم تسوية العهدة من خلال رفع ملف التسوية فقط",
        });
        return;
      }
      const patch: Partial<typeof custodiesTable.$inferInsert> = {};
      if (d.type !== undefined) patch.type = d.type;
      if (d.amount !== undefined) patch.amount = String(round2(d.amount));
      if (d.receiptDate !== undefined) patch.receiptDate = d.receiptDate;
      if (d.description !== undefined) patch.description = d.description;
      if (d.status !== undefined) patch.status = d.status;
      await db
        .update(custodiesTable)
        .set(patch)
        .where(
          and(
            eq(custodiesTable.id, id),
            eq(custodiesTable.companyId, companyId),
          ),
        );
      const custody = await loadCustodyDetail(id, companyId);
      res.json(custody);
    } catch (err) {
      req.log.error({ err }, "Failed to update custody");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.delete(
  "/custodies/:id",
  requireAuth,
  requireCapability("custodies:delete"),
  async (req, res) => {
    const id = req.params["id"] as string;
    const companyId = req.auth!.companyId;
    try {
      const [existing] = await db
        .select({
          id: custodiesTable.id,
          settlementJournalEntryId: custodiesTable.settlementJournalEntryId,
        })
        .from(custodiesTable)
        .where(
          and(
            eq(custodiesTable.id, id),
            eq(custodiesTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "العهدة غير موجودة" });
        return;
      }
      if (existing.settlementJournalEntryId) {
        res.status(400).json({
          error: "لا يمكن حذف عهدة تمت تسويتها",
        });
        return;
      }
      // Remove attachment files from disk before deleting the rows.
      const attachments = await db
        .select({ objectKey: custodyAttachmentsTable.objectKey })
        .from(custodyAttachmentsTable)
        .where(
          and(
            eq(custodyAttachmentsTable.companyId, companyId),
            eq(custodyAttachmentsTable.custodyId, id),
          ),
        );
      await db
        .delete(custodiesTable)
        .where(
          and(
            eq(custodiesTable.id, id),
            eq(custodiesTable.companyId, companyId),
          ),
        );
      for (const a of attachments) {
        fs.promises
          .unlink(path.join(uploadsDir, a.objectKey))
          .catch(() => {});
      }
      res.json({ status: "ok" });
    } catch (err) {
      req.log.error({ err }, "Failed to delete custody");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Custody settlement (Excel upload → draft journal entry) ---------------

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_TYPES =
  /^(image\/(jpeg|jpg|png|webp|gif)|application\/pdf|application\/vnd\.openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document)|application\/vnd\.ms-excel|application\/msword|text\/csv|text\/plain)$/;

const attachmentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const hash = crypto.randomBytes(8).toString("hex");
    cb(null, `custody-${Date.now()}-${hash}${ext}`);
  },
});
const attachmentUpload = multer({
  storage: attachmentStorage,
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ATTACHMENT_TYPES.test(file.mimetype)) {
      cb(new Error("INVALID_TYPE"));
      return;
    }
    cb(null, true);
  },
});
const xlsxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
});

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

const cellStr = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "text" in v)
    return String((v as { text: unknown }).text);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
};
const cellNum = (v: ExcelJS.CellValue): number => {
  const n = Number(cellStr(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// Settles a custody from an .xlsx. Each row is one debit/credit pair:
//   date, docNo, debitAccount (code), creditAccount (code), description,
//   costCenter (name), project (name), amount
// All rows are posted as ONE balanced DRAFT journal entry (each row contributes
// equal debit and credit so the entry always balances) linked to the custody,
// which is then marked 'settled'. Reviewable/postable from the journal screen.
router.post(
  "/custodies/:id/settle",
  requireAuth,
  requireCapability("custodies:update"),
  handleXlsxUpload,
  async (req, res) => {
    const id = req.params["id"] as string;
    const companyId = req.auth!.companyId;
    if (!req.file) {
      res.status(400).json({ error: "لم يتم رفع أي ملف" });
      return;
    }
    try {
      const [custody] = await db
        .select()
        .from(custodiesTable)
        .where(
          and(
            eq(custodiesTable.id, id),
            eq(custodiesTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!custody) {
        res.status(404).json({ error: "العهدة غير موجودة" });
        return;
      }
      if (custody.settlementJournalEntryId) {
        res.status(400).json({ error: "تمت تسوية هذه العهدة بالفعل" });
        return;
      }

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(req.file.buffer as unknown as ArrayBuffer);
      const ws = wb.worksheets[0];
      if (!ws) {
        res.status(400).json({ error: "الملف لا يحتوي على بيانات" });
        return;
      }
      const headerRow = ws.getRow(1);
      const colIndex: Record<string, number> = {};
      headerRow.eachCell((cell, col) => {
        colIndex[cellStr(cell.value).trim()] = col;
      });
      const need = (k: string) => colIndex[k] ?? 0;
      if (
        !need("debitAccount") ||
        !need("creditAccount") ||
        !need("amount")
      ) {
        res.status(400).json({
          error:
            "صيغة الملف غير صحيحة. الأعمدة المطلوبة: debitAccount, creditAccount, amount",
        });
        return;
      }

      type ParsedRow = {
        rowNo: number;
        date: string;
        docNo: string | null;
        debitCode: string;
        creditCode: string;
        description: string | null;
        costCenterName: string;
        projectName: string;
        amount: number;
      };
      const parsedRows: ParsedRow[] = [];
      for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const debitCode = cellStr(row.getCell(need("debitAccount")).value);
        const creditCode = cellStr(row.getCell(need("creditAccount")).value);
        const amount = cellNum(row.getCell(need("amount")).value);
        if (!debitCode && !creditCode && amount === 0) continue;
        if (!debitCode || !creditCode) {
          res.status(400).json({
            error: `السطر ${r}: لا بد من تحديد حساب مدين وحساب دائن`,
          });
          return;
        }
        if (amount <= EPS) {
          res
            .status(400)
            .json({ error: `السطر ${r}: المبلغ يجب أن يكون أكبر من صفر` });
          return;
        }
        parsedRows.push({
          rowNo: r,
          date: need("date") ? cellStr(row.getCell(need("date")).value) : "",
          docNo: need("docNo")
            ? cellStr(row.getCell(need("docNo")).value) || null
            : null,
          debitCode,
          creditCode,
          description: need("description")
            ? cellStr(row.getCell(need("description")).value) || null
            : null,
          costCenterName: need("costCenter")
            ? cellStr(row.getCell(need("costCenter")).value)
            : "",
          projectName: need("project")
            ? cellStr(row.getCell(need("project")).value)
            : "",
          amount: round2(amount),
        });
      }

      if (parsedRows.length === 0) {
        res.status(400).json({ error: "الملف لا يحتوي على بنود تسوية" });
        return;
      }

      // Resolve account codes (company-scoped, leaf only).
      const accounts = await db
        .select({
          id: accountsTable.id,
          code: accountsTable.code,
          isGroup: accountsTable.isGroup,
        })
        .from(accountsTable)
        .where(eq(accountsTable.companyId, companyId));
      const accByCode = new Map(accounts.map((a) => [a.code, a]));

      // Resolve cost center / project names (company-scoped).
      const costCenters = await db
        .select({
          id: costCentersTable.id,
          nameAr: costCentersTable.nameAr,
          nameEn: costCentersTable.nameEn,
        })
        .from(costCentersTable)
        .where(eq(costCentersTable.companyId, companyId));
      const ccByName = new Map<string, string>();
      for (const c of costCenters) {
        ccByName.set(c.nameAr, c.id);
        if (c.nameEn) ccByName.set(c.nameEn, c.id);
      }

      const lines: {
        accountId: string;
        description?: string | null;
        debit: number;
        credit: number;
        costCenterId?: string | null;
      }[] = [];
      let firstDate = "";
      for (const pr of parsedRows) {
        const dr = accByCode.get(pr.debitCode);
        const cr = accByCode.get(pr.creditCode);
        if (!dr) {
          res.status(400).json({
            error: `السطر ${pr.rowNo}: الحساب المدين ${pr.debitCode} غير موجود`,
          });
          return;
        }
        if (!cr) {
          res.status(400).json({
            error: `السطر ${pr.rowNo}: الحساب الدائن ${pr.creditCode} غير موجود`,
          });
          return;
        }
        if (dr.isGroup || cr.isGroup) {
          res.status(400).json({
            error: `السطر ${pr.rowNo}: لا يمكن الترحيل إلى حساب رئيسي`,
          });
          return;
        }
        // Prefer the cost center column, fall back to the project column.
        const ccRaw = pr.costCenterName || pr.projectName;
        let costCenterId: string | null = null;
        if (ccRaw) {
          const found = ccByName.get(ccRaw);
          if (!found) {
            res.status(400).json({
              error: `السطر ${pr.rowNo}: مركز التكلفة/المشروع ${ccRaw} غير موجود`,
            });
            return;
          }
          costCenterId = found;
        }
        if (!firstDate && pr.date) firstDate = pr.date;
        const desc =
          pr.description ?? (pr.docNo ? `تسوية عهدة - ${pr.docNo}` : "تسوية عهدة");
        lines.push({
          accountId: dr.id,
          description: desc,
          debit: pr.amount,
          credit: 0,
          costCenterId,
        });
        lines.push({
          accountId: cr.id,
          description: desc,
          debit: 0,
          credit: pr.amount,
          costCenterId,
        });
      }

      const [company] = await db
        .select({ baseCurrency: companiesTable.baseCurrency })
        .from(companiesTable)
        .where(eq(companiesTable.id, companyId))
        .limit(1);
      const baseCurrency = (company?.baseCurrency || "EGP").toUpperCase();
      const entryDate =
        firstDate || new Date().toISOString().slice(0, 10);

      const result = await db.transaction(async (tx) => {
        // Re-check under no concurrent settle: guard the update on null link.
        const entry = await createDraftJournalEntry(tx, {
          companyId,
          baseCurrency,
          date: entryDate,
          reference: `تسوية عهدة`,
          notes: `تسوية عهدة الموظف`,
          createdBy: req.auth!.userId,
          lines,
        });
        const updated = await tx
          .update(custodiesTable)
          .set({
            status: "settled",
            settlementJournalEntryId: entry.id,
          })
          .where(
            and(
              eq(custodiesTable.id, id),
              eq(custodiesTable.companyId, companyId),
              sql`${custodiesTable.settlementJournalEntryId} is null`,
            ),
          )
          .returning({ id: custodiesTable.id });
        if (updated.length === 0) {
          throw new Error("ALREADY_SETTLED");
        }
        return entry;
      });

      void result;
      const custodyOut = await loadCustodyDetail(id, companyId);
      res.json(custodyOut);
    } catch (err) {
      if (err instanceof Error && err.message === "ALREADY_SETTLED") {
        res.status(400).json({ error: "تمت تسوية هذه العهدة بالفعل" });
        return;
      }
      if (
        err instanceof Error &&
        err.message.startsWith("DRAFT_ENTRY_")
      ) {
        res.status(400).json({ error: "القيد غير متزن أو غير صحيح" });
        return;
      }
      req.log.error({ err }, "Failed to settle custody");
      res
        .status(500)
        .json({ error: "تعذّر قراءة الملف. تأكد أنه ملف Excel صحيح" });
    }
  },
);

// ---- Custody attachments ---------------------------------------------------

router.post(
  "/custodies/:id/attachments",
  requireAuth,
  requireCapability("custodies:update"),
  handleAttachmentUpload,
  async (req, res) => {
    const id = req.params["id"] as string;
    const companyId = req.auth!.companyId;
    if (!req.file) {
      res.status(400).json({ error: "لم يتم رفع أي ملف" });
      return;
    }
    try {
      const [custody] = await db
        .select({ id: custodiesTable.id })
        .from(custodiesTable)
        .where(
          and(
            eq(custodiesTable.id, id),
            eq(custodiesTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!custody) {
        fs.promises
          .unlink(path.join(uploadsDir, req.file.filename))
          .catch(() => {});
        res.status(404).json({ error: "العهدة غير موجودة" });
        return;
      }
      const [row] = await db
        .insert(custodyAttachmentsTable)
        .values({
          companyId,
          custodyId: id,
          fileName: Buffer.from(req.file.originalname, "latin1").toString(
            "utf8",
          ),
          objectKey: req.file.filename,
          contentType: req.file.mimetype,
          size: req.file.size,
        })
        .returning();
      res.status(201).json(toCustodyAttachment(row!));
    } catch (err) {
      if (req.file)
        fs.promises
          .unlink(path.join(uploadsDir, req.file.filename))
          .catch(() => {});
      req.log.error({ err }, "Failed to attach file to custody");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.delete(
  "/custodies/:id/attachments/:attachmentId",
  requireAuth,
  requireCapability("custodies:update"),
  async (req, res) => {
    const id = req.params["id"] as string;
    const attachmentId = req.params["attachmentId"] as string;
    const companyId = req.auth!.companyId;
    try {
      const deleted = await db
        .delete(custodyAttachmentsTable)
        .where(
          and(
            eq(custodyAttachmentsTable.id, attachmentId),
            eq(custodyAttachmentsTable.custodyId, id),
            eq(custodyAttachmentsTable.companyId, companyId),
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
      req.log.error({ err }, "Failed to delete custody attachment");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// Binary stream (not in the OpenAPI JSON contract). Forces a download so the
// browser never renders the file inline.
router.get(
  "/custodies/:id/attachments/:attachmentId/download",
  requireAuth,
  requireCapability("custodies:read"),
  async (req, res) => {
    const id = req.params["id"] as string;
    const attachmentId = req.params["attachmentId"] as string;
    const companyId = req.auth!.companyId;
    try {
      const [row] = await db
        .select()
        .from(custodyAttachmentsTable)
        .where(
          and(
            eq(custodyAttachmentsTable.id, attachmentId),
            eq(custodyAttachmentsTable.custodyId, id),
            eq(custodyAttachmentsTable.companyId, companyId),
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
      req.log.error({ err }, "Failed to download custody attachment");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
