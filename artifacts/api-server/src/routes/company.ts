import { Router, type Request, type Response, type NextFunction } from "express";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { z } from "zod/v4";
import { eq, and, asc, ne, or, desc, count } from "drizzle-orm";
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
  subscriptionPlansTable,
  subscriptionsTable,
  manualPaymentRequestsTable,
  countryPaymentMethodsTable,
  type Company,
} from "@workspace/db";
import { isCountry, isCurrency } from "@workspace/locale";
import { UpdateCompanyBody } from "@workspace/api-zod";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import { isWriteBlocked, WRITE_BLOCK_MSG } from "../lib/fiscal-year";
import { uploadsDir } from "./uploads";
import { safeAudit } from "../lib/audit";

const router = Router();

const INBOUND_EMAIL_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN ?? "hesabat.hg-audit.com";

function getInboxEmail(token: string | null | undefined): string | null {
  if (!token) return null;
  return `${token}@${INBOUND_EMAIL_DOMAIN}`;
}

// Arabic → Latin phonetic map (single chars + digraphs handled by longest-match)
const AR_MAP: Record<string, string> = {
  "أ":"a","إ":"a","آ":"a","ا":"a",
  "ب":"b","ت":"t","ث":"th","ج":"j","ح":"h","خ":"kh",
  "د":"d","ذ":"dh","ر":"r","ز":"z","س":"s","ش":"sh",
  "ص":"s","ض":"d","ط":"t","ظ":"z","ع":"a","غ":"gh",
  "ف":"f","ق":"q","ك":"k","ل":"l","م":"m","ن":"n",
  "ه":"h","و":"w","ي":"y","ى":"a","ة":"a",
  "ء":"","ئ":"y","ؤ":"w",
};

function transliterateArabic(text: string): string {
  let out = "";
  for (const ch of text) out += AR_MAP[ch] ?? ch;
  return out;
}

function nameToSlugBase(name: string): string {
  // Strip diacritics, transliterate Arabic, lower, keep alphanum + spaces
  const latin = transliterateArabic(name.normalize("NFC"))
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 30)
    .replace(/-+$/, "");
  return latin || "company";
}

async function generateInboxSlug(companyName: string, excludeCompanyId?: string): Promise<string> {
  const base = nameToSlugBase(companyName);
  // Try base, then base-2, base-3 … until unique (skip own company's current token)
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const conds: ReturnType<typeof eq>[] = [eq(companiesTable.inboxToken, candidate)];
    if (excludeCompanyId) conds.push(ne(companiesTable.id, excludeCompanyId));
    const [existing] = await db
      .select({ id: companiesTable.id })
      .from(companiesTable)
      .where(and(...conds))
      .limit(1);
    if (!existing) return candidate;
  }
  // Extremely unlikely fallback — append random suffix
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
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
    // Init or migrate inbox token:
    // - missing → create name-based slug
    // - old format (pure hex, no dashes) → migrate to name-based slug
    const isOldHexToken = company.inboxToken && /^[0-9a-f]+$/.test(company.inboxToken);
    if (!company.inboxToken || isOldHexToken) {
      const token = await generateInboxSlug(company.name, company.id);
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
      const company = await loadCompany(req.auth!.companyId);
      if (!company) {
        res.status(404).json({ error: "الشركة غير موجودة" });
        return;
      }
      const token = await generateInboxSlug(company.name, company.id);
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
  const country = (req.query["country"] as string | undefined) ?? (req.query["countryCode"] as string | undefined);
  const isAuthenticated = !!(req as any).auth?.userId;
  const conditions = [];
  if (country) {
    conditions.push(or(eq(subscriptionPlansTable.country, country), eq(subscriptionPlansTable.countryCode, country)));
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
  res.json(
    plans.map((plan) => ({
      ...plan,
      countryCode: plan.countryCode ?? plan.country,
      currencyCode: plan.currencyCode ?? plan.currency,
      monthlyPrice: plan.monthlyPrice ?? plan.price,
      sortOrder: plan.order,
    })),
  );
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
  const plan = planRows[0]!;

  // Country validation: plan must belong to the company's country.
  const companyRows = await db
    .select({ country: companiesTable.country })
    .from(companiesTable)
    .where(eq(companiesTable.id, req.auth!.companyId))
    .limit(1);
  const companyCountry = companyRows[0]?.country;
  if (companyCountry && plan.country !== companyCountry) {
    res.status(400).json({
      error: "هذه الباقة غير متاحة لدولتك",
      code: "PLAN_COUNTRY_MISMATCH",
    });
    return;
  }

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

router.get("/company/subscription", requireAuth, async (req, res) => {
  const companyId = req.auth!.companyId;
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);
  if (!company) {
    res.status(404).json({ error: "الشركة غير موجودة" });
    return;
  }
  const [plan] = company.planId
    ? await db
        .select()
        .from(subscriptionPlansTable)
        .where(eq(subscriptionPlansTable.id, company.planId))
        .limit(1)
    : [];
  const [latestSubscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.companyId, companyId))
    .orderBy(desc(subscriptionsTable.createdAt))
    .limit(1);
  const [usersCount] = await db
    .select({ count: count() })
    .from(usersTable)
    .where(eq(usersTable.companyId, companyId));
  const [latestRequest] = await db
    .select()
    .from(manualPaymentRequestsTable)
    .where(eq(manualPaymentRequestsTable.companyId, companyId))
    .orderBy(desc(manualPaymentRequestsTable.createdAt))
    .limit(1);
  const paymentMethods = await db
    .select()
    .from(countryPaymentMethodsTable)
    .where(
      and(
        eq(countryPaymentMethodsTable.countryCode, company.country),
        eq(countryPaymentMethodsTable.enabled, true),
        eq(countryPaymentMethodsTable.isPublic, true),
      ),
    )
    .orderBy(asc(countryPaymentMethodsTable.methodName));

  const now = Date.now();
  const endsAt = latestSubscription?.endsAt ?? company.trialEndsAt;
  const remainingDays = endsAt
    ? Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / (24 * 60 * 60 * 1000)))
    : null;
  const trialStatus = company.subscriptionStatus === "trial" ? "in_trial" : "not_trial";

  res.json({
    company,
    plan,
    latestSubscription,
    latestRequest,
    usersCount: usersCount?.count ?? 0,
    remainingDays,
    trialStatus,
    paymentMethods,
    manualInstructions: paymentMethods
      .filter((m) => m.type === "manual" || m.type === "bank_transfer" || m.type === "cash")
      .map((m) => ({
        methodName: m.methodName,
        type: m.type,
        instructionsAr: m.instructionsAr ?? null,
        instructionsEn: m.instructionsEn ?? null,
        accountDetails: m.accountDetails ?? null,
      })),
  });
});

const RenewalRequestBody = z.object({
  planId: z.string().uuid(),
  billingCycle: z.enum(["monthly", "quarterly", "yearly"]),
  amount: z.string().min(1),
  currency: z.string().min(1),
  notes: z.string().optional(),
  proofUrl: z.string().url().optional(),
});

router.post("/company/subscription/renewal-request", requireAuth, async (req, res) => {
  const body = RenewalRequestBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  // Validate plan exists, is active, and matches company country
  const [planRows, companyRows] = await Promise.all([
    db
      .select({ countryCode: subscriptionPlansTable.countryCode, country: subscriptionPlansTable.country, isActive: subscriptionPlansTable.isActive })
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.id, body.data.planId))
      .limit(1),
    db
      .select({ country: companiesTable.country })
      .from(companiesTable)
      .where(eq(companiesTable.id, req.auth!.companyId))
      .limit(1),
  ]);
  if (planRows.length === 0 || !planRows[0]!.isActive) {
    res.status(404).json({ error: "الباقة غير موجودة أو غير متاحة" });
    return;
  }
  const companyCountry = companyRows[0]?.country;
  // accept match on either countryCode or country column (plans endpoint uses OR on both)
  const planCountry = planRows[0]!.countryCode || planRows[0]!.country;
  if (companyCountry && planCountry && planCountry !== companyCountry) {
    res.status(400).json({ error: "هذه الباقة غير متاحة لدولتك", code: "PLAN_COUNTRY_MISMATCH" });
    return;
  }

  const [created] = await db
    .insert(manualPaymentRequestsTable)
    .values({
      companyId: req.auth!.companyId,
      planId: body.data.planId,
      billingCycle: body.data.billingCycle,
      amount: body.data.amount,
      currency: body.data.currency,
      notes: body.data.notes,
      proofUrl: body.data.proofUrl,
      status: "pending",
    })
    .returning();
  await safeAudit(
    db,
    {
      companyId: req.auth!.companyId,
      userId: req.auth!.userId,
      action: "SUBSCRIPTION_RENEWAL_REQUESTED",
      entity: "subscription",
      entityId: created.id,
      newValue: created,
    },
    req.log,
  );
  res.status(201).json(created);
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

// POST /payment-requests — company submits a manual payment/renewal request

const PaymentRequestBody = z.object({
  planId: z.string().uuid(),
  amount: z.string().min(1),
  currency: z.string().min(1),
  billingCycle: z.enum(["monthly", "quarterly", "yearly"]),
  notes: z.string().optional(),
  proofUrl: z.string().url().optional(),
});

router.post("/payment-requests", requireAuth, async (req, res) => {
  const parsed = PaymentRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const { planId, amount, currency, billingCycle, notes, proofUrl } = parsed.data;

  // Validate plan belongs to company's country
  const planRows = await db
    .select({ country: subscriptionPlansTable.country, isActive: subscriptionPlansTable.isActive })
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.id, planId))
    .limit(1);
  if (planRows.length === 0) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  const companyRows = await db
    .select({ country: companiesTable.country })
    .from(companiesTable)
    .where(eq(companiesTable.id, req.auth!.companyId))
    .limit(1);
  const companyCountry = companyRows[0]?.country;
  if (companyCountry && planRows[0]!.country !== companyCountry) {
    res.status(400).json({ error: "هذه الباقة غير متاحة لدولتك", code: "PLAN_COUNTRY_MISMATCH" });
    return;
  }

  const [row] = await db
    .insert(manualPaymentRequestsTable)
    .values({
      companyId: req.auth!.companyId,
      planId,
      amount,
      currency,
      billingCycle,
      notes: notes ?? null,
      proofUrl: proofUrl ?? null,
      status: "pending",
    })
    .returning();

  res.status(201).json(row);
});

// GET /payment-requests — company views its own requests
router.get("/payment-requests", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(manualPaymentRequestsTable)
    .where(eq(manualPaymentRequestsTable.companyId, req.auth!.companyId));
  res.json(rows);
});

export default router;
