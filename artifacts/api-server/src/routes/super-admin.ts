import { Router } from "express";
import { eq, count, sql, desc, asc, ilike, and, gte, lte, isNull, inArray } from "drizzle-orm";
import {
  db,
  companiesTable,
  usersTable,
  supportTicketsTable,
  ticketCommentsTable,
  subscriptionPlansTable,
  subscriptionsTable,
  superAdminsTable,
  siteSettingsTable,
  articlesTable,
  insertArticleSchema,
  updateArticleSchema,
  manualPaymentRequestsTable,
  countryPaymentMethodsTable,
  auditLogTable,
  journalEntriesTable,
  invoicesTable,
  customersTable,
  suppliersTable,
  bankAccountsTable,
  fixedAssetsTable,
  employeesTable,
} from "@workspace/db";
import { requireSuperAdmin, requireSuperAdminRole } from "../middleware/super-admin";
import { hashPassword } from "../lib/auth";
import { createSession, setSessionCookie } from "../lib/session";
import { safeAudit } from "../lib/audit";
import { z } from "zod/v4";

const router = Router();

// All routes require super admin auth
router.use(requireSuperAdmin);

// GET /super-admin/dashboard — KPIs
router.get("/super-admin/dashboard", async (req, res) => {
  const totalCompanies = await db
    .select({ count: count() })
    .from(companiesTable);
  const activeCompanies = await db
    .select({ count: count() })
    .from(companiesTable)
    .where(eq(companiesTable.isActive, true));
  const totalUsers = await db.select({ count: count() }).from(usersTable);
  const activeSubscriptions = await db
    .select({ count: count() })
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.status, "active"));
  const trialCompanies = await db
    .select({ count: count() })
    .from(companiesTable)
    .where(eq(companiesTable.subscriptionStatus, "trial"));
  const expiredCompanies = await db
    .select({ count: count() })
    .from(companiesTable)
    .where(eq(companiesTable.subscriptionStatus, "expired"));
  const openTickets = await db
    .select({ count: count() })
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.status, "open"));

  res.json({
    totalCompanies: totalCompanies[0]?.count ?? 0,
    activeCompanies: activeCompanies[0]?.count ?? 0,
    totalUsers: totalUsers[0]?.count ?? 0,
    activeSubscriptions: activeSubscriptions[0]?.count ?? 0,
    trialCompanies: trialCompanies[0]?.count ?? 0,
    expiredCompanies: expiredCompanies[0]?.count ?? 0,
    openTickets: openTickets[0]?.count ?? 0,
  });
});

// GET /super-admin/companies — list all companies
const CompaniesQuery = z.object({
  q: z.string().optional(),
  country: z.string().optional(),
  status: z.string().optional(),
  isActive: z.string().optional(),
  limit: z.coerce.number().default(50),
  offset: z.coerce.number().default(0),
});

router.get("/super-admin/companies", async (req, res) => {
  const query = CompaniesQuery.parse(req.query);
  const conditions = [];

  if (query.q) {
    conditions.push(
      ilike(companiesTable.name, `%${query.q}%`),
    );
  }
  if (query.country) {
    conditions.push(eq(companiesTable.country, query.country));
  }
  if (query.status) {
    conditions.push(eq(companiesTable.subscriptionStatus, query.status as any));
  }
  if (query.isActive === "true") {
    conditions.push(eq(companiesTable.isActive, true));
  } else if (query.isActive === "false") {
    conditions.push(eq(companiesTable.isActive, false));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const companies = await db
    .select({
      id: companiesTable.id,
      name: companiesTable.name,
      country: companiesTable.country,
      baseCurrency: companiesTable.baseCurrency,
      planId: companiesTable.planId,
      subscriptionStatus: companiesTable.subscriptionStatus,
      trialEndsAt: companiesTable.trialEndsAt,
      isActive: companiesTable.isActive,
      phone: companiesTable.phone,
      createdAt: companiesTable.createdAt,
      updatedAt: companiesTable.updatedAt,
    })
    .from(companiesTable)
    .where(whereClause)
    .limit(query.limit)
    .offset(query.offset)
    .orderBy(desc(companiesTable.createdAt));

  // Count user per company
  const companyIds = companies.map((c) => c.id);
  const userCounts = companyIds.length > 0
    ? await db
        .select({ companyId: usersTable.companyId, count: count() })
        .from(usersTable)
        .where(inArray(usersTable.companyId, companyIds))
        .groupBy(usersTable.companyId)
    : [];

  const countMap = new Map(userCounts.map((u) => [u.companyId, u.count]));

  res.json({
    companies: companies.map((c) => ({
      ...c,
      userCount: countMap.get(c.id) ?? 0,
    })),
    total: companies.length,
  });
});

// GET /super-admin/companies/:id
router.get("/super-admin/companies/:id", async (req, res) => {
  const { id } = req.params;
  const company = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, id))
    .limit(1);

  if (company.length === 0) {
    res.status(404).json({ error: "Company not found" });
    return;
  }

  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.companyId, id));

  const subscriptions = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.companyId, id));

  const tickets = await db
    .select({
      id: supportTicketsTable.id,
      subject: supportTicketsTable.subject,
      status: supportTicketsTable.status,
      priority: supportTicketsTable.priority,
      createdAt: supportTicketsTable.createdAt,
    })
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.companyId, id));

  res.json({
    company: company[0],
    users,
    subscriptions,
    tickets,
  });
});

// PATCH /super-admin/companies/:id
const UpdateCompany = z.object({
  isActive: z.boolean().optional(),
  subscriptionStatus: z.enum(["trial", "pending_payment", "active", "expired", "cancelled", "suspended"]).optional(),
  planId: z.string().uuid().optional(),
  maxUsers: z.number().optional(),
  maxTransactions: z.number().optional(),
  phone: z.string().max(30).nullable().optional(),
});

router.patch("/super-admin/companies/:id", async (req, res) => {
  const { id } = req.params;
  const body = UpdateCompany.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const update: any = {};
  const data = body.data;
  if (data.isActive !== undefined) update.isActive = data.isActive;
  if (data.subscriptionStatus !== undefined) update.subscriptionStatus = data.subscriptionStatus;
  if (data.planId !== undefined) update.planId = data.planId;
  if (data.maxUsers !== undefined) update.maxUsers = data.maxUsers;
  if (data.maxTransactions !== undefined) update.maxTransactions = data.maxTransactions;
  if (data.phone !== undefined) update.phone = data.phone;
  update.updatedAt = new Date();

  const result = await db
    .update(companiesTable)
    .set(update)
    .where(eq(companiesTable.id, id))
    .returning();

  if (result.length === 0) {
    res.status(404).json({ error: "Company not found" });
    return;
  }

  res.json(result[0]);
});

const CompanySubscriptionPatch = z.object({
  planId: z.string().uuid().optional(),
  subscriptionStatus: z.enum(["trial", "pending_payment", "active", "expired", "suspended"]).optional(),
  trialEndsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  internalNotes: z.string().optional(),
  renewalRequestId: z.string().uuid().optional(),
  renewalDecision: z.enum(["approved", "rejected"]).optional(),
});

router.get("/super-admin/companies/:id/subscription", async (req, res) => {
  const companyId = req.params["id"] as string;
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  const [plan] = company.planId
    ? await db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.id, company.planId)).limit(1)
    : [];
  const [latestSubscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.companyId, companyId))
    .orderBy(desc(subscriptionsTable.createdAt))
    .limit(1);
  const requests = await db
    .select()
    .from(manualPaymentRequestsTable)
    .where(eq(manualPaymentRequestsTable.companyId, companyId))
    .orderBy(desc(manualPaymentRequestsTable.requestedAt));
  res.json({ company, plan, latestSubscription, requests });
});

router.patch("/super-admin/companies/:id/subscription", async (req, res) => {
  const companyId = req.params["id"] as string;
  const body = CompanySubscriptionPatch.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.data.planId !== undefined) patch["planId"] = body.data.planId;
  if (body.data.subscriptionStatus !== undefined) patch["subscriptionStatus"] = body.data.subscriptionStatus;
  if (body.data.trialEndsAt !== undefined) patch["trialEndsAt"] = body.data.trialEndsAt ? new Date(body.data.trialEndsAt) : null;
  const [updated] = await db
    .update(companiesTable)
    .set(patch)
    .where(eq(companiesTable.id, companyId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Company not found" });
    return;
  }

  if (body.data.endsAt !== undefined || body.data.subscriptionStatus || body.data.planId) {
    await db.insert(subscriptionsTable).values({
      companyId,
      planId: updated.planId ?? body.data.planId ?? "",
      status: (body.data.subscriptionStatus ?? updated.subscriptionStatus ?? "trial") as any,
      startedAt: new Date(),
      endsAt: body.data.endsAt ? new Date(body.data.endsAt) : null,
      currency: updated.baseCurrency,
      billingCycle: "monthly",
    });
  }

  if (body.data.renewalRequestId && body.data.renewalDecision) {
    const [request] = await db
      .update(manualPaymentRequestsTable)
      .set({
        status: body.data.renewalDecision,
        approvedBy: req.superAdmin!.superAdminId,
        approvedAt: new Date(),
        internalNotes: body.data.internalNotes,
      })
      .where(eq(manualPaymentRequestsTable.id, body.data.renewalRequestId))
      .returning();
    if (request) {
      await safeAudit(
        db,
        {
          companyId,
          userId: null,
          action: body.data.renewalDecision === "approved" ? "MANUAL_PAYMENT_APPROVED" : "MANUAL_PAYMENT_REJECTED",
          entity: "subscription",
          entityId: request.id,
          newValue: request,
        },
        req.log,
      );
    }
  }

  const action =
    body.data.planId
      ? "SUBSCRIPTION_PACKAGE_CHANGED"
      : body.data.subscriptionStatus === "active"
        ? "SUBSCRIPTION_ACTIVATED"
        : body.data.subscriptionStatus === "suspended"
          ? "SUBSCRIPTION_SUSPENDED"
          : "SUBSCRIPTION_EXTENDED";
  await safeAudit(
    db,
    {
      companyId,
      userId: null,
      action,
      entity: "subscription",
      entityId: companyId,
      newValue: body.data,
    },
    req.log,
  );

  res.json(updated);
});

router.post("/super-admin/companies/:id/renew", async (req, res) => {
  const companyId = req.params["id"] as string;
  const body = z
    .object({
      months: z.number().min(1).max(36).optional(),
      endsAt: z.string().datetime().optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const endDate = body.data.endsAt
    ? new Date(body.data.endsAt)
    : new Date(Date.now() + (body.data.months ?? 1) * 30 * 24 * 60 * 60 * 1000);
  const [company] = await db
    .update(companiesTable)
    .set({ subscriptionStatus: "active", updatedAt: new Date() })
    .where(eq(companiesTable.id, companyId))
    .returning();
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  await db.insert(subscriptionsTable).values({
    companyId,
    planId: company.planId ?? "",
    status: "active",
    startedAt: new Date(),
    endsAt: endDate,
    currency: company.baseCurrency,
    billingCycle: "monthly",
  });
  await safeAudit(
    db,
    {
      companyId,
      userId: null,
      action: "SUBSCRIPTION_RENEWED",
      entity: "subscription",
      entityId: companyId,
      newValue: { endsAt: endDate.toISOString() },
    },
    req.log,
  );
  res.json({ ok: true, endsAt: endDate.toISOString() });
});

router.post("/super-admin/companies/:id/suspend", async (req, res) => {
  const companyId = req.params["id"] as string;
  const [company] = await db
    .update(companiesTable)
    .set({ subscriptionStatus: "suspended", updatedAt: new Date() })
    .where(eq(companiesTable.id, companyId))
    .returning();
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  await safeAudit(
    db,
    {
      companyId,
      userId: null,
      action: "SUBSCRIPTION_SUSPENDED",
      entity: "subscription",
      entityId: companyId,
    },
    req.log,
  );
  res.json(company);
});

router.post("/super-admin/companies/:id/reactivate", async (req, res) => {
  const companyId = req.params["id"] as string;
  const [company] = await db
    .update(companiesTable)
    .set({ subscriptionStatus: "active", updatedAt: new Date() })
    .where(eq(companiesTable.id, companyId))
    .returning();
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  await safeAudit(
    db,
    {
      companyId,
      userId: null,
      action: "SUBSCRIPTION_REACTIVATED",
      entity: "subscription",
      entityId: companyId,
    },
    req.log,
  );
  res.json(company);
});

router.get("/super-admin/companies/:id/overview", async (req, res) => {
  const companyId = req.params["id"] as string;
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }

  const [usersCount] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.companyId, companyId));
  const [journalCount] = await db.select({ count: count() }).from(journalEntriesTable).where(eq(journalEntriesTable.companyId, companyId));
  const [invoiceCount] = await db.select({ count: count() }).from(invoicesTable).where(eq(invoicesTable.companyId, companyId));
  const [customerCount] = await db.select({ count: count() }).from(customersTable).where(eq(customersTable.companyId, companyId));
  const [supplierCount] = await db.select({ count: count() }).from(suppliersTable).where(eq(suppliersTable.companyId, companyId));
  const [bankCount] = await db.select({ count: count() }).from(bankAccountsTable).where(eq(bankAccountsTable.companyId, companyId));
  const [assetCount] = await db.select({ count: count() }).from(fixedAssetsTable).where(eq(fixedAssetsTable.companyId, companyId));
  const [employeeCount] = await db.select({ count: count() }).from(employeesTable).where(eq(employeesTable.companyId, companyId));
  const [latestActivity] = await db
    .select()
    .from(auditLogTable)
    .where(eq(auditLogTable.companyId, companyId))
    .orderBy(desc(auditLogTable.createdAt))
    .limit(1);
  res.json({
    company,
    summary: {
      usersCount: usersCount?.count ?? 0,
      journalEntries: journalCount?.count ?? 0,
      invoices: invoiceCount?.count ?? 0,
      customers: customerCount?.count ?? 0,
      suppliers: supplierCount?.count ?? 0,
      bankAccounts: bankCount?.count ?? 0,
      fixedAssets: assetCount?.count ?? 0,
      employees: employeeCount?.count ?? 0,
      lastLogin: null,
      lastActivity: latestActivity ?? null,
    },
  });
});

router.get("/super-admin/companies/:id/activity", async (req, res) => {
  const companyId = req.params["id"] as string;
  const rows = await db
    .select()
    .from(auditLogTable)
    .where(eq(auditLogTable.companyId, companyId))
    .orderBy(desc(auditLogTable.createdAt))
    .limit(50);
  res.json(rows);
});

router.post("/super-admin/companies/:id/impersonate", async (req, res) => {
  const companyId = req.params["id"] as string;
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  const [candidate] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.companyId, companyId), inArray(usersTable.role, ["owner", "admin"] as any)))
    .orderBy(asc(usersTable.createdAt))
    .limit(1);
  if (!candidate) {
    res.status(404).json({ error: "No owner/admin user found for company" });
    return;
  }
  const sessionToken = await createSession(candidate.id);
  setSessionCookie(res, sessionToken);
  res.cookie("hesabat_impersonation", "1", {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    maxAge: 1000 * 60 * 60 * 12,
  });
  await safeAudit(
    db,
    {
      companyId,
      userId: null,
      action: "SUPER_ADMIN_IMPERSONATE_START",
      entity: "company",
      entityId: companyId,
      newValue: { superAdminId: req.superAdmin?.superAdminId, impersonatedUserId: candidate.id },
    },
    req.log,
  );
  res.json({ ok: true, redirectTo: "/hesabat/" });
});

// GET /super-admin/users — all users
const UsersQuery = z.object({
  q: z.string().optional(),
  companyId: z.string().uuid().optional(),
  limit: z.coerce.number().default(50),
  offset: z.coerce.number().default(0),
});

router.get("/super-admin/users", async (req, res) => {
  const query = UsersQuery.parse(req.query);
  const conditions = [];
  if (query.q) {
    conditions.push(
      ilike(usersTable.name, `%${query.q}%`),
    );
  }
  if (query.companyId) {
    conditions.push(eq(usersTable.companyId, query.companyId));
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      companyId: usersTable.companyId,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(whereClause)
    .limit(query.limit)
    .offset(query.offset)
    .orderBy(desc(usersTable.createdAt));

  // Join company names
  const companyIds = [...new Set(users.map((u) => u.companyId))];
  const companies = companyIds.length > 0
    ? await db
        .select({ id: companiesTable.id, name: companiesTable.name })
        .from(companiesTable)
        .where(inArray(companiesTable.id, companyIds))
    : [];

  const companyMap = new Map(companies.map((c) => [c.id, c.name]));

  res.json({
    users: users.map((u) => ({
      ...u,
      companyName: companyMap.get(u.companyId) ?? null,
    })),
    total: users.length,
  });
});

// GET /super-admin/plans
router.get("/super-admin/plans", async (req, res) => {
  const plans = await db
    .select()
    .from(subscriptionPlansTable)
    .orderBy(asc(subscriptionPlansTable.order));
  res.json(plans);
});

// POST /super-admin/plans
const CreatePlan = z.object({
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  descriptionAr: z.string().optional(),
  descriptionEn: z.string().optional(),
  country: z.string().min(1).optional(),
  countryCode: z.string().min(1).optional(),
  countryName: z.string().optional(),
  maxUsers: z.number().min(1),
  maxTransactions: z.number().min(1),
  price: z.string().min(1).optional(),
  currency: z.string().min(1).optional(),
  currencyCode: z.string().optional(),
  monthlyPrice: z.string().optional(),
  yearlyPrice: z.string().optional(),
  trialDays: z.number().min(0).optional(),
  maxCompaniesOrBranches: z.number().min(1).optional(),
  storageLimit: z.number().min(1).optional(),
  featureLimits: z.record(z.string(), z.unknown()).optional(),
  billingCycle: z.enum(["monthly", "quarterly", "yearly"]).optional(),
  features: z.array(z.string()).optional(),
  showOnLanding: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().optional(),
  order: z.number().optional(),
});

router.post("/super-admin/plans", async (req, res) => {
  const body = CreatePlan.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const result = await db
    .insert(subscriptionPlansTable)
    .values({
      ...body.data,
      country: body.data.country ?? body.data.countryCode ?? "EG",
      countryCode: body.data.countryCode ?? body.data.country ?? "EG",
      currency: body.data.currency ?? body.data.currencyCode ?? "EGP",
      currencyCode: body.data.currencyCode ?? body.data.currency ?? "EGP",
      monthlyPrice: body.data.monthlyPrice ?? body.data.price ?? "0",
      price: body.data.price ?? body.data.monthlyPrice ?? "0",
      billingCycle: body.data.billingCycle ?? "monthly",
      trialDays: body.data.trialDays ?? 14,
      order: body.data.order ?? body.data.sortOrder ?? 0,
    })
    .returning();
  res.status(201).json(result[0]);
});

// PATCH /super-admin/plans/:id
router.patch("/super-admin/plans/:id", async (req, res) => {
  const { id } = req.params;
  const body = CreatePlan.partial().safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const result = await db
    .update(subscriptionPlansTable)
    .set({
      ...body.data,
      ...(body.data.countryCode && !body.data.country ? { country: body.data.countryCode } : {}),
      ...(body.data.country && !body.data.countryCode ? { countryCode: body.data.country } : {}),
      ...(body.data.currencyCode && !body.data.currency ? { currency: body.data.currencyCode } : {}),
      ...(body.data.currency && !body.data.currencyCode ? { currencyCode: body.data.currency } : {}),
      ...(body.data.monthlyPrice && !body.data.price ? { price: body.data.monthlyPrice } : {}),
      ...(body.data.price && !body.data.monthlyPrice ? { monthlyPrice: body.data.price } : {}),
      ...(body.data.sortOrder !== undefined && body.data.order === undefined ? { order: body.data.sortOrder } : {}),
      updatedAt: new Date(),
    })
    .where(eq(subscriptionPlansTable.id, id))
    .returning();

  if (result.length === 0) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  res.json(result[0]);
});

// DELETE /super-admin/plans/:id
router.delete("/super-admin/plans/:id", async (req, res) => {
  const { id } = req.params;
  await db
    .delete(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.id, id));
  res.json({ ok: true });
});

router.get("/super-admin/packages", async (req, res) => {
  const rows = await db.select().from(subscriptionPlansTable).orderBy(asc(subscriptionPlansTable.order));
  res.json(rows);
});

router.post("/super-admin/packages", async (req, res) => {
  const body = CreatePlan.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const [created] = await db
    .insert(subscriptionPlansTable)
    .values({
      ...body.data,
      country: body.data.country ?? body.data.countryCode ?? "EG",
      countryCode: body.data.countryCode ?? body.data.country ?? "EG",
      currency: body.data.currency ?? body.data.currencyCode ?? "EGP",
      currencyCode: body.data.currencyCode ?? body.data.currency ?? "EGP",
      monthlyPrice: body.data.monthlyPrice ?? body.data.price ?? "0",
      price: body.data.price ?? body.data.monthlyPrice ?? "0",
      billingCycle: body.data.billingCycle ?? "monthly",
      trialDays: body.data.trialDays ?? 14,
      order: body.data.order ?? body.data.sortOrder ?? 0,
    })
    .returning();
  res.status(201).json(created);
});

router.patch("/super-admin/packages/:id", async (req, res) => {
  const { id } = req.params;
  const body = CreatePlan.partial().safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const [updated] = await db
    .update(subscriptionPlansTable)
    .set({
      ...body.data,
      ...(body.data.countryCode && !body.data.country ? { country: body.data.countryCode } : {}),
      ...(body.data.country && !body.data.countryCode ? { countryCode: body.data.country } : {}),
      ...(body.data.currencyCode && !body.data.currency ? { currency: body.data.currencyCode } : {}),
      ...(body.data.currency && !body.data.currencyCode ? { currencyCode: body.data.currency } : {}),
      ...(body.data.monthlyPrice && !body.data.price ? { price: body.data.monthlyPrice } : {}),
      ...(body.data.price && !body.data.monthlyPrice ? { monthlyPrice: body.data.price } : {}),
      ...(body.data.sortOrder !== undefined && body.data.order === undefined ? { order: body.data.sortOrder } : {}),
      updatedAt: new Date(),
    })
    .where(eq(subscriptionPlansTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Package not found" });
    return;
  }
  res.json(updated);
});

router.delete("/super-admin/packages/:id", async (req, res) => {
  const { id } = req.params;
  const [updated] = await db
    .update(subscriptionPlansTable)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(subscriptionPlansTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Package not found" });
    return;
  }
  res.json(updated);
});

// GET /super-admin/subscriptions
router.get("/super-admin/subscriptions", async (req, res) => {
  const subs = await db
    .select()
    .from(subscriptionsTable)
    .orderBy(desc(subscriptionsTable.createdAt));
  res.json(subs);
});

// GET /super-admin/support-tickets
router.get("/super-admin/support-tickets", async (req, res) => {
  try {
    const tickets = await db
      .select({
        id: supportTicketsTable.id,
        companyId: supportTicketsTable.companyId,
        type: supportTicketsTable.type,
        subject: supportTicketsTable.subject,
        status: supportTicketsTable.status,
        priority: supportTicketsTable.priority,
        createdAt: supportTicketsTable.createdAt,
        updatedAt: supportTicketsTable.updatedAt,
        userName: usersTable.name,
        companyName: companiesTable.name,
      })
      .from(supportTicketsTable)
      .leftJoin(usersTable, eq(usersTable.id, supportTicketsTable.userId))
      .leftJoin(companiesTable, eq(companiesTable.id, supportTicketsTable.companyId))
      .orderBy(desc(supportTicketsTable.createdAt));
    res.json(tickets);
  } catch (err) {
    req.log.error({ err }, "Failed to list super-admin tickets");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// GET /super-admin/support-tickets/:id — detail + comments
router.get("/super-admin/support-tickets/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [ticket] = await db
      .select({
        id: supportTicketsTable.id,
        companyId: supportTicketsTable.companyId,
        userId: supportTicketsTable.userId,
        type: supportTicketsTable.type,
        subject: supportTicketsTable.subject,
        body: supportTicketsTable.body,
        status: supportTicketsTable.status,
        priority: supportTicketsTable.priority,
        createdAt: supportTicketsTable.createdAt,
        updatedAt: supportTicketsTable.updatedAt,
        userName: usersTable.name,
        userEmail: usersTable.email,
        companyName: companiesTable.name,
      })
      .from(supportTicketsTable)
      .leftJoin(usersTable, eq(usersTable.id, supportTicketsTable.userId))
      .leftJoin(companiesTable, eq(companiesTable.id, supportTicketsTable.companyId))
      .where(eq(supportTicketsTable.id, id))
      .limit(1);
    if (!ticket) {
      res.status(404).json({ error: "التذكرة غير موجودة" });
      return;
    }
    const comments = await db
      .select({
        id: ticketCommentsTable.id,
        ticketId: ticketCommentsTable.ticketId,
        userId: ticketCommentsTable.userId,
        authorName: ticketCommentsTable.authorName,
        body: ticketCommentsTable.body,
        isInternal: ticketCommentsTable.isInternal,
        isAdminReply: ticketCommentsTable.isAdminReply,
        createdAt: ticketCommentsTable.createdAt,
        userName: usersTable.name,
      })
      .from(ticketCommentsTable)
      .leftJoin(usersTable, eq(usersTable.id, ticketCommentsTable.userId))
      .where(eq(ticketCommentsTable.ticketId, id))
      .orderBy(ticketCommentsTable.createdAt);
    res.json({ ticket, comments });
  } catch (err) {
    req.log.error({ err }, "Failed to get super-admin ticket");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// PATCH /super-admin/support-tickets/:id — update status
router.patch("/super-admin/support-tickets/:id", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body as { status?: string };
  if (!status || !["open", "in_progress", "resolved", "closed"].includes(status)) {
    res.status(400).json({ error: "حالة غير صالحة" });
    return;
  }
  try {
    const [updated] = await db
      .update(supportTicketsTable)
      .set({ status: status as "open" | "in_progress" | "resolved" | "closed", updatedAt: new Date() })
      .where(eq(supportTicketsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "التذكرة غير موجودة" });
      return;
    }
    res.json({ ticket: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to update super-admin ticket status");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// POST /super-admin/support-tickets/:id/comments — admin reply
router.post("/super-admin/support-tickets/:id/comments", async (req, res) => {
  const { id } = req.params;
  const { body: commentBody, isInternal } = req.body as { body?: string; isInternal?: boolean };
  if (!commentBody || commentBody.trim().length === 0) {
    res.status(400).json({ error: "الرد مطلوب" });
    return;
  }
  try {
    const [ticket] = await db
      .select({ id: supportTicketsTable.id, status: supportTicketsTable.status })
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.id, id))
      .limit(1);
    if (!ticket) {
      res.status(404).json({ error: "التذكرة غير موجودة" });
      return;
    }
    const [comment] = await db
      .insert(ticketCommentsTable)
      .values({
        ticketId: id,
        userId: null,
        authorName: req.superAdmin!.name || "مدير النظام",
        body: commentBody.trim(),
        isInternal: isInternal ?? false,
        isAdminReply: true,
        isReadByUser: false,
        isReadByAdmin: true,
      })
      .returning();
    if (ticket.status === "open" && !(isInternal ?? false)) {
      await db
        .update(supportTicketsTable)
        .set({ status: "in_progress", updatedAt: new Date() })
        .where(eq(supportTicketsTable.id, id));
    }
    res.status(201).json({ comment });
  } catch (err) {
    req.log.error({ err }, "Failed to add super-admin comment");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// GET /super-admin/stats
router.get("/super-admin/stats", async (req, res) => {
  // Monthly signups
  const monthlySignups = await db
    .select({
      month: sql<string>`to_char(${companiesTable.createdAt}, 'YYYY-MM')`,
      count: count(),
    })
    .from(companiesTable)
    .groupBy(sql`to_char(${companiesTable.createdAt}, 'YYYY-MM')`)
    .orderBy(asc(sql`to_char(${companiesTable.createdAt}, 'YYYY-MM')`));

  // Country distribution
  const byCountry = await db
    .select({
      country: companiesTable.country,
      count: count(),
    })
    .from(companiesTable)
    .groupBy(companiesTable.country);

  // Status distribution
  const byStatus = await db
    .select({
      status: companiesTable.subscriptionStatus,
      count: count(),
    })
    .from(companiesTable)
    .groupBy(companiesTable.subscriptionStatus);

  res.json({
    monthlySignups,
    byCountry,
    byStatus,
  });
});

// DELETE /super-admin/companies/:id
router.delete("/super-admin/companies/:id", async (req, res) => {
  const { id } = req.params;
  await db.delete(companiesTable).where(eq(companiesTable.id, id));
  res.json({ ok: true });
});

// PATCH /super-admin/users/:id/password
const UpdatePassword = z.object({
  password: z.string().min(1),
});

router.patch("/super-admin/users/:id/password", async (req, res) => {
  const { id } = req.params;
  const body = UpdatePassword.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const passwordHash = await hashPassword(body.data.password);
  const result = await db
    .update(usersTable)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(usersTable.id, id))
    .returning();

  if (result.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ ok: true });
});

/* ══════════════════  Landing Page Settings (site_settings)  ══════════════════ */

const LANDING_KEYS = [
  "heroTitle", "heroSubtitle", "heroDescription", "ctaPrimary", "ctaSecondary",
  "badgeText", "aboutTitle", "aboutText", "metaTitle", "metaDescription",
  "keywords", "ogImage", "trialDays", "companyCount", "userCount",
  "countryCount", "featureCount", "heroImage",
  "whyUsTitle", "whyUsSubtitle",
  "featuresTitle", "featuresSubtitle",
  "targetAudiencesTitle", "targetAudiencesSubtitle",
  "testimonialsTitle", "testimonialsSubtitle",
  "pricingTitle", "pricingSubtitle",
  "ctaTitle", "ctaSubtitle",
  "supportTitle", "supportSubtitle",
  "showCountries",
];

// GET /super-admin/landing-page
router.get("/super-admin/landing-page", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(siteSettingsTable)
      .where(inArray(siteSettingsTable.key, LANDING_KEYS));
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch landing page settings");
    res.status(500).json({ error: "Server error" });
  }
});

// POST /super-admin/landing-page
router.post("/super-admin/landing-page", async (req, res) => {
  try {
    const body = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(body)) {
      if (LANDING_KEYS.includes(key)) {
        await db
          .insert(siteSettingsTable)
          .values({ key, value: String(value ?? ""), updatedAt: new Date() })
          .onConflictDoUpdate({
            target: siteSettingsTable.key,
            set: { value: String(value ?? ""), updatedAt: new Date() },
          });
      }
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to save landing page settings");
    res.status(500).json({ error: "Server error" });
  }
});

/* ══════════════════  Articles (super-admin CRUD)  ══════════════════ */

// GET /super-admin/articles
router.get("/super-admin/articles", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(articlesTable)
      .orderBy(desc(articlesTable.createdAt));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch super-admin articles");
    res.status(500).json({ error: "Server error" });
  }
});

// POST /super-admin/articles
router.post("/super-admin/articles", async (req, res) => {
  const parsed = insertArticleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    const [row] = await db.insert(articlesTable).values(parsed.data).returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create article");
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /super-admin/articles/:id
router.put("/super-admin/articles/:id", async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  const parsed = updateArticleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    const [row] = await db
      .update(articlesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(articlesTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Article not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to update article");
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /super-admin/articles/:id
router.delete("/super-admin/articles/:id", async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  try {
    await db.delete(articlesTable).where(eq(articlesTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete article");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
