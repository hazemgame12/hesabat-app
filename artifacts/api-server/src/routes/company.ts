import { Router, type Request, type Response, type NextFunction } from "express";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { eq, and, asc } from "drizzle-orm";
import {
  db,
  companiesTable,
  accountsTable,
  journalEntriesTable,
  journalEntryLinesTable,
  journalEntryAttachmentsTable,
  customersTable,
  suppliersTable,
  invoicesTable,
  invoiceLinesTable,
  paymentsTable,
  paymentAllocationsTable,
  inventoryItemsTable,
  inventoryMovementsTable,
  fixedAssetsTable,
  assetDepreciationEntriesTable,
  employeesTable,
  employeePayComponentsTable,
  payrollRunsTable,
  payrollRunLinesTable,
  bankAccountsTable,
  bankMovementsTable,
  bankReconciliationsTable,
  bankStatementLinesTable,
  currenciesTable,
  exchangeRatesTable,
  revaluationsTable,
  taxesTable,
  costCentersTable,
  fiscalYearsTable,
  usersTable,
  type Company,
} from "@workspace/db";
import { isCountry, isCurrency } from "@workspace/locale";
import { UpdateCompanyBody } from "@workspace/api-zod";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import { isWriteBlocked, WRITE_BLOCK_MSG } from "../lib/fiscal-year";
import { uploadsDir } from "./uploads";
import { subscriptionPlansTable } from "@workspace/db";

const router = Router();

const INBOUND_EMAIL_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN ?? "inbox.hesabat.com";

function getInboxEmail(token: string | null | undefined): string | null {
  if (!token) return null;
  return `${token}@${INBOUND_EMAIL_DOMAIN}`;
}

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
    commercialRegistrationNumber: row.commercialRegistrationNumber,
    branchCode: row.branchCode,
    eInvoiceEnabled: row.eInvoiceEnabled,
    lockedThrough: row.lockedThrough ?? null,
    inboxEmail: getInboxEmail(row.inboxToken),
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
    let company = await loadCompany(req.auth!.companyId);
    if (!company) {
      res.status(404).json({ error: "الشركة غير موجودة" });
      return;
    }
    // Lazy-init inbox token on first access
    if (!company.inboxToken) {
      const token = crypto.randomBytes(24).toString("hex");
      const [updated] = await db
        .update(companiesTable)
        .set({ inboxToken: token })
        .where(eq(companiesTable.id, company.id))
        .returning();
      if (updated) company = updated;
    }
    res.json(toCompany(company));
  } catch (err) {
    req.log.error({ err }, "Failed to load company");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

router.post(
  "/company/regenerate-inbox-token",
  requireAuth,
  requireCapability("company:manage"),
  async (req, res) => {
    try {
      const token = crypto.randomBytes(24).toString("hex");
      const [updated] = await db
        .update(companiesTable)
        .set({ inboxToken: token })
        .where(eq(companiesTable.id, req.auth!.companyId))
        .returning();
      if (!updated) {
        res.status(404).json({ error: "الشركة غير موجودة" });
        return;
      }
      res.json({ inboxEmail: getInboxEmail(updated.inboxToken) });
    } catch (err) {
      req.log.error({ err }, "Failed to regenerate inbox token");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

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
          ...(data.commercialRegistrationNumber !== undefined && {
            commercialRegistrationNumber: data.commercialRegistrationNumber,
          }),
          ...(data.branchCode !== undefined && { branchCode: data.branchCode }),
          ...(data.eInvoiceEnabled !== undefined && {
            eInvoiceEnabled: data.eInvoiceEnabled,
          }),
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

router.get("/company/export", requireAuth, async (req, res) => {
  const companyId = req.auth!.companyId;
  try {
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
    const accounts = await db.select().from(accountsTable).where(eq(accountsTable.companyId, companyId));
    const journalEntries = await db.select().from(journalEntriesTable).where(eq(journalEntriesTable.companyId, companyId));
    const journalEntryLines = await db.select().from(journalEntryLinesTable).where(eq(journalEntryLinesTable.companyId, companyId));
    const journalAttachments = await db.select().from(journalEntryAttachmentsTable).where(eq(journalEntryAttachmentsTable.companyId, companyId));
    const customers = await db.select().from(customersTable).where(eq(customersTable.companyId, companyId));
    const suppliers = await db.select().from(suppliersTable).where(eq(suppliersTable.companyId, companyId));
    const invoices = await db.select().from(invoicesTable).where(eq(invoicesTable.companyId, companyId));
    const invoiceLines = await db.select().from(invoiceLinesTable).where(eq(invoiceLinesTable.companyId, companyId));
    const payments = await db.select().from(paymentsTable).where(eq(paymentsTable.companyId, companyId));
    const paymentAllocs = await db.select().from(paymentAllocationsTable).where(eq(paymentAllocationsTable.companyId, companyId));
    const inventoryItems = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.companyId, companyId));
    const inventoryMovements = await db.select().from(inventoryMovementsTable).where(eq(inventoryMovementsTable.companyId, companyId));
    const fixedAssets = await db.select().from(fixedAssetsTable).where(eq(fixedAssetsTable.companyId, companyId));
    const assetDepreciations = await db.select().from(assetDepreciationEntriesTable).where(eq(assetDepreciationEntriesTable.companyId, companyId));
    const employees = await db.select().from(employeesTable).where(eq(employeesTable.companyId, companyId));
    const payComponents = await db.select().from(employeePayComponentsTable).where(eq(employeePayComponentsTable.companyId, companyId));
    const payrollRuns = await db.select().from(payrollRunsTable).where(eq(payrollRunsTable.companyId, companyId));
    const payrollRunLines = await db.select().from(payrollRunLinesTable).where(eq(payrollRunLinesTable.companyId, companyId));
    const bankAccounts = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.companyId, companyId));
    const bankMovements = await db.select().from(bankMovementsTable).where(eq(bankMovementsTable.companyId, companyId));
    const bankReconciliations = await db.select().from(bankReconciliationsTable).where(eq(bankReconciliationsTable.companyId, companyId));
    const bankStatementLines = await db.select().from(bankStatementLinesTable).where(eq(bankStatementLinesTable.companyId, companyId));
    const currencies = await db.select().from(currenciesTable).where(eq(currenciesTable.companyId, companyId));
    const exchangeRates = await db.select().from(exchangeRatesTable).where(eq(exchangeRatesTable.companyId, companyId));
    const revaluations = await db.select().from(revaluationsTable).where(eq(revaluationsTable.companyId, companyId));
    const taxes = await db.select().from(taxesTable).where(eq(taxesTable.companyId, companyId));
    const costCenters = await db.select().from(costCentersTable).where(eq(costCentersTable.companyId, companyId));
    const fiscalYears = await db.select().from(fiscalYearsTable).where(eq(fiscalYearsTable.companyId, companyId));
    const team = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, createdAt: usersTable.createdAt }).from(usersTable).where(eq(usersTable.companyId, companyId));

    res.json({
      company,
      accounts,
      journalEntries,
      journalEntryLines,
      journalAttachments,
      customers,
      suppliers,
      invoices,
      invoiceLines,
      payments,
      paymentAllocs,
      inventoryItems,
      inventoryMovements,
      fixedAssets,
      assetDepreciations,
      employees,
      payComponents,
      payrollRuns,
      payrollRunLines,
      bankAccounts,
      bankMovements,
      bankReconciliations,
      bankStatementLines,
      currencies,
      exchangeRates,
      revaluations,
      taxes,
      costCenters,
      fiscalYears,
      team,
      exportedAt: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to export company data");
    res.status(500).json({ error: "حدث خطأ في تصدير البيانات" });
  }
});

// GET /plans — available subscription plans
// Public browsing: only showOnLanding=true; authenticated users: all active plans
router.get("/plans", async (req, res) => {
  const country = req.query["country"] as string | undefined;
  const isAuthenticated = !!(req as any).auth?.userId;
  const conditions = [];
  if (country) {
    conditions.push(eq(subscriptionPlansTable.country, country));
  }
  conditions.push(eq(subscriptionPlansTable.isActive, true));
  if (!isAuthenticated) {
    conditions.push(eq(subscriptionPlansTable.showOnLanding, true));
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const plans = await db
    .select()
    .from(subscriptionPlansTable)
    .where(whereClause)
    .orderBy(asc(subscriptionPlansTable.order));
  res.json(plans);
});

// POST /company/select-plan — user chooses a plan
router.post("/company/select-plan", requireAuth, async (req, res) => {
  const { planId } = req.body as { planId?: string };
  if (!planId || typeof planId !== "string") {
    res.status(400).json({ error: "planId required" });
    return;
  }
  const planRows = await db
    .select()
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.id, planId))
    .limit(1);
  if (planRows.length === 0) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  const plan = planRows[0];
  const now = new Date();
  const endsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  await db
    .update(companiesTable)
    .set({
      planId: plan.id,
      subscriptionStatus: "trial",
      trialEndsAt: endsAt,
      updatedAt: now,
    })
    .where(eq(companiesTable.id, req.auth!.companyId));

  res.json({ ok: true, trialEndsAt: endsAt.toISOString() });
});

// PATCH /company/period-lock — set or clear the soft period lock (owner only)
router.patch(
  "/company/period-lock",
  requireAuth,
  requireCapability("fiscalyear:manage"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const { lockedThrough } = req.body as { lockedThrough?: string | null };
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    if (lockedThrough !== null && lockedThrough !== undefined) {
      if (typeof lockedThrough !== "string" || !DATE_RE.test(lockedThrough)) {
        res
          .status(400)
          .json({ error: "تاريخ القفل يجب أن يكون بصيغة YYYY-MM-DD أو null" });
        return;
      }
    }
    try {
      const [updated] = await db
        .update(companiesTable)
        .set({ lockedThrough: lockedThrough ?? null })
        .where(eq(companiesTable.id, companyId))
        .returning();
      if (!updated) {
        res.status(404).json({ error: "الشركة غير موجودة" });
        return;
      }
      res.json(toCompany(updated));
    } catch (err) {
      req.log.error({ err }, "Failed to update period lock");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
