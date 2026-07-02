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
  auditLogTable,
  manualPaymentRequestsTable,
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
import { createImpersonationSession, setSessionCookie } from "../lib/session";
import { z } from "zod/v4";

const router = Router();

// All routes require super admin auth
router.use(requireSuperAdmin);

/** Write an audit log entry for super-admin subscription actions. */
async function logSubscriptionAudit(
  companyId: string,
  action: string,
  entityId: string,
  newValue: object,
) {
  await db.insert(auditLogTable).values({
    companyId,
    userId: null,
    action,
    entity: "subscription",
    entityId,
    newValue,
  });
}

/** Add months/quarters/years to a date based on billing cycle. */
function addBillingCycle(from: Date, cycle?: string): Date {
  const d = new Date(from);
  if (cycle === "yearly") d.setFullYear(d.getFullYear() + 1);
  else if (cycle === "quarterly") d.setMonth(d.getMonth() + 3);
  else d.setMonth(d.getMonth() + 1); // monthly default
  return d;
}

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

  const paymentRequests = await db
    .select({
      id: manualPaymentRequestsTable.id,
      companyId: manualPaymentRequestsTable.companyId,
      planId: manualPaymentRequestsTable.planId,
      amount: manualPaymentRequestsTable.amount,
      currency: manualPaymentRequestsTable.currency,
      billingCycle: manualPaymentRequestsTable.billingCycle,
      status: manualPaymentRequestsTable.status,
      notes: manualPaymentRequestsTable.notes,
      reviewerNotes: manualPaymentRequestsTable.reviewerNotes,
      reviewedAt: manualPaymentRequestsTable.reviewedAt,
      createdAt: manualPaymentRequestsTable.createdAt,
    })
    .from(manualPaymentRequestsTable)
    .where(eq(manualPaymentRequestsTable.companyId, id))
    .orderBy(desc(manualPaymentRequestsTable.createdAt));

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
    paymentRequests,
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

  // Audit subscription status changes
  if (data.subscriptionStatus !== undefined) {
    const actionMap: Record<string, string> = {
      active: "SUBSCRIPTION_ACTIVATED",
      suspended: "SUBSCRIPTION_SUSPENDED",
      expired: "SUBSCRIPTION_EXPIRED",
      cancelled: "SUBSCRIPTION_CANCELLED",
      trial: "SUBSCRIPTION_TRIAL",
    };
    const action = actionMap[data.subscriptionStatus] ?? "SUBSCRIPTION_STATUS_CHANGED";
    await logSubscriptionAudit(id, action, id, {
      subscriptionStatus: data.subscriptionStatus,
      changedBy: req.superAdmin?.email,
    });

    // When suspending, also update the current active subscription record's status
    if (data.subscriptionStatus === "suspended") {
      await db
        .update(subscriptionsTable)
        .set({ status: "suspended", updatedAt: new Date() })
        .where(
          and(
            eq(subscriptionsTable.companyId, id),
            eq(subscriptionsTable.status, "active"),
          ),
        );
    }
  }

  res.json(result[0]);
});

// GET /super-admin/companies/:id/subscription — subscription info + payment requests
router.get("/super-admin/companies/:id/subscription", async (req, res) => {
  const { id } = req.params;
  const companyRows = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, id))
    .limit(1);
  if (companyRows.length === 0) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  const company = companyRows[0]!;

  let plan = null;
  if (company.planId) {
    const planRows = await db
      .select()
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.id, company.planId))
      .limit(1);
    plan = planRows[0] ?? null;
  }

  const subscriptions = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.companyId, id))
    .orderBy(desc(subscriptionsTable.createdAt))
    .limit(10);

  const requests = await db
    .select()
    .from(manualPaymentRequestsTable)
    .where(eq(manualPaymentRequestsTable.companyId, id))
    .orderBy(desc(manualPaymentRequestsTable.createdAt))
    .limit(20);

  res.json({ company, plan, subscriptions, requests });
});

// POST /super-admin/companies/:id/subscription — activate / renew / extend / change plan / suspend
const SubscriptionAction = z.object({
  action: z.enum(["activate", "renew", "extend", "change_plan", "reactivate", "suspend"]),
  planId: z.string().uuid().optional(),
  billingCycle: z.enum(["monthly", "quarterly", "yearly"]).optional(),
  endsAt: z.string().datetime().optional(),
  amount: z.string().optional(),
  currency: z.string().optional(),
  notes: z.string().optional(),
});

router.post("/super-admin/companies/:id/subscription", async (req, res) => {
  const { id } = req.params;
  const body = SubscriptionAction.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.issues });
    return;
  }

  const { action, planId, billingCycle, endsAt, amount, currency, notes } = body.data;

  // Fetch company
  const companyRows = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, id))
    .limit(1);
  if (companyRows.length === 0) {
    res.status(404).json({ error: "Company not found" });
    return;
  }

  const now = new Date();
  const resolvedEndsAt = endsAt ? new Date(endsAt) : null;

  const companyUpdate: any = { updatedAt: now };
  let auditAction = "";
  let subscriptionInsert: any = null;

  if (action === "activate") {
    const cycleEnd = resolvedEndsAt ?? addBillingCycle(now, billingCycle);
    companyUpdate.subscriptionStatus = "active";
    if (planId) companyUpdate.planId = planId;
    subscriptionInsert = {
      companyId: id,
      planId: planId ?? companyRows[0]!.planId ?? "",
      status: "active",
      startedAt: now,
      endsAt: cycleEnd,
      billingCycle: billingCycle ?? "monthly",
      amount: amount ?? null,
      currency: currency ?? null,
      paymentProvider: "manual",
    };
    auditAction = "SUBSCRIPTION_ACTIVATED";
  } else if (action === "renew") {
    const cycleEnd = resolvedEndsAt ?? addBillingCycle(now, billingCycle);
    companyUpdate.subscriptionStatus = "active";
    subscriptionInsert = {
      companyId: id,
      planId: planId ?? companyRows[0]!.planId ?? "",
      status: "active",
      startedAt: now,
      endsAt: cycleEnd,
      billingCycle: billingCycle ?? "monthly",
      amount: amount ?? null,
      currency: currency ?? null,
      paymentProvider: "manual",
    };
    auditAction = "SUBSCRIPTION_RENEWED";
  } else if (action === "extend") {
    if (!resolvedEndsAt) {
      res.status(400).json({ error: "endsAt required for extend action" });
      return;
    }
    const currentStatus = companyRows[0]!.subscriptionStatus;
    // For trial extension: update trialEndsAt and keep trial status.
    // For active subscription extension: update active status and extend subscription record.
    if (currentStatus === "trial") {
      companyUpdate.trialEndsAt = resolvedEndsAt;
      // Keep status as trial
    } else {
      companyUpdate.subscriptionStatus = "active";
    }
    auditAction = "SUBSCRIPTION_EXTENDED";
  } else if (action === "change_plan") {
    if (!planId) {
      res.status(400).json({ error: "planId required for change_plan action" });
      return;
    }
    companyUpdate.planId = planId;
    auditAction = "SUBSCRIPTION_PACKAGE_CHANGED";
  } else if (action === "reactivate") {
    companyUpdate.subscriptionStatus = "active";
    auditAction = "SUBSCRIPTION_REACTIVATED";
  } else if (action === "suspend") {
    companyUpdate.subscriptionStatus = "suspended";
    auditAction = "SUBSCRIPTION_SUSPENDED";
  }

  await db.update(companiesTable).set(companyUpdate).where(eq(companiesTable.id, id));

  // When suspending, mark the current active subscription record as suspended too.
  if (action === "suspend") {
    await db
      .update(subscriptionsTable)
      .set({ status: "suspended", updatedAt: new Date() })
      .where(
        and(
          eq(subscriptionsTable.companyId, id),
          eq(subscriptionsTable.status, "active"),
        ),
      );
  }

  let newSubscription = null;
  if (subscriptionInsert) {
    const [s] = await db.insert(subscriptionsTable).values(subscriptionInsert).returning();
    newSubscription = s;
  }

  // For trial extension: also update the trial subscription record's trialEndsAt
  if (action === "extend" && companyRows[0]!.subscriptionStatus === "trial" && resolvedEndsAt) {
    await db
      .update(subscriptionsTable)
      .set({ trialEndsAt: resolvedEndsAt, updatedAt: new Date() })
      .where(
        and(
          eq(subscriptionsTable.companyId, id),
          eq(subscriptionsTable.status, "trial"),
        ),
      );
  }

  await logSubscriptionAudit(id, auditAction, id, {
    action,
    planId,
    billingCycle,
    endsAt: resolvedEndsAt?.toISOString(),
    amount,
    currency,
    notes,
    changedBy: req.superAdmin?.email,
  });

  res.json({ ok: true, subscription: newSubscription });
});

// POST /super-admin/companies/:id/impersonate — create impersonation session
router.post("/super-admin/companies/:id/impersonate", async (req, res) => {
  const { id: companyId } = req.params;

  // Find the owner user for this company
  const userRows = await db
    .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
    .from(usersTable)
    .where(and(eq(usersTable.companyId, companyId), eq(usersTable.role, "owner")))
    .limit(1);

  if (userRows.length === 0) {
    // Fallback: any active user in the company
    const anyUser = await db
      .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.companyId, companyId))
      .limit(1);
    if (anyUser.length === 0) {
      res.status(404).json({ error: "No users found in company" });
      return;
    }
    userRows.push(anyUser[0]!);
  }

  const targetUser = userRows[0]!;

  // Create short-lived impersonation session (4 hours)
  const token = await createImpersonationSession(targetUser.id, req.superAdmin!.superAdminId);
  setSessionCookie(res, token);

  // Audit log
  await logSubscriptionAudit(companyId, "SUPER_ADMIN_IMPERSONATE_START", companyId, {
    targetUserId: targetUser.id,
    targetUserEmail: targetUser.email,
    impersonatedBy: req.superAdmin?.email,
  });

  res.json({ ok: true, targetUserId: targetUser.id, targetUserEmail: targetUser.email });
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

/* ══════════════════  Manual Payment Requests  ══════════════════ */

// GET /super-admin/payment-requests — list all payment requests across all companies
// Query params: status, country, currency, companyId, dateFrom, dateTo
router.get("/super-admin/payment-requests", async (req, res) => {
  try {
    const { status, country, currency, companyId, dateFrom, dateTo } = req.query as Record<string, string | undefined>;

    const reviewerAlias = sql<string>`reviewer.email`.as("reviewerEmail");
    const reviewerNameAlias = sql<string>`reviewer.name`.as("reviewerName");

    const conditions = [];
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      conditions.push(eq(manualPaymentRequestsTable.status, status as "pending" | "approved" | "rejected"));
    }
    if (country) {
      conditions.push(eq(companiesTable.country, country));
    }
    if (currency) {
      conditions.push(eq(manualPaymentRequestsTable.currency, currency));
    }
    if (companyId) {
      conditions.push(eq(manualPaymentRequestsTable.companyId, companyId));
    }
    if (dateFrom) {
      conditions.push(gte(manualPaymentRequestsTable.createdAt, new Date(dateFrom)));
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      conditions.push(lte(manualPaymentRequestsTable.createdAt, to));
    }

    const rows = await db
      .select({
        id: manualPaymentRequestsTable.id,
        companyId: manualPaymentRequestsTable.companyId,
        companyName: companiesTable.name,
        country: companiesTable.country,
        planId: manualPaymentRequestsTable.planId,
        planNameAr: subscriptionPlansTable.nameAr,
        planNameEn: subscriptionPlansTable.nameEn,
        amount: manualPaymentRequestsTable.amount,
        currency: manualPaymentRequestsTable.currency,
        billingCycle: manualPaymentRequestsTable.billingCycle,
        status: manualPaymentRequestsTable.status,
        notes: manualPaymentRequestsTable.notes,
        proofUrl: manualPaymentRequestsTable.proofUrl,
        reviewedBySuperAdminId: manualPaymentRequestsTable.reviewedBySuperAdminId,
        reviewerNotes: manualPaymentRequestsTable.reviewerNotes,
        reviewedAt: manualPaymentRequestsTable.reviewedAt,
        createdAt: manualPaymentRequestsTable.createdAt,
        reviewerEmail: reviewerAlias,
        reviewerName: reviewerNameAlias,
      })
      .from(manualPaymentRequestsTable)
      .leftJoin(companiesTable, eq(manualPaymentRequestsTable.companyId, companiesTable.id))
      .leftJoin(subscriptionPlansTable, eq(manualPaymentRequestsTable.planId, subscriptionPlansTable.id))
      .leftJoin(
        sql`super_admins reviewer`,
        sql`reviewer.id = ${manualPaymentRequestsTable.reviewedBySuperAdminId}`,
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(
        sql`CASE ${manualPaymentRequestsTable.status} WHEN 'pending' THEN 0 ELSE 1 END`,
        desc(manualPaymentRequestsTable.createdAt),
      );

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list payment requests");
    res.status(500).json({ error: "Server error" });
  }
});

async function getPendingManualPaymentRequest(requestId: string, companyId?: string) {
  const [request] = await db
    .select()
    .from(manualPaymentRequestsTable)
    .where(
      companyId
        ? and(
            eq(manualPaymentRequestsTable.id, requestId),
            eq(manualPaymentRequestsTable.companyId, companyId),
          )
        : eq(manualPaymentRequestsTable.id, requestId),
    )
    .limit(1);

  if (!request) {
    return { error: "Request not found" as const };
  }

  if (request.status !== "pending") {
    return { error: "Request already reviewed" as const };
  }

  return { request };
}

async function approveManualPaymentRequest(params: {
  requestId: string;
  companyId?: string;
  notes?: string;
  superAdminId: string;
  superAdminEmail?: string;
}) {
  const lookup = await getPendingManualPaymentRequest(params.requestId, params.companyId);
  if ("error" in lookup) {
    return lookup;
  }

  const { request } = lookup;
  const now = new Date();

  await db
    .update(manualPaymentRequestsTable)
    .set({
      status: "approved",
      reviewedBySuperAdminId: params.superAdminId,
      reviewerNotes: params.notes ?? null,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(eq(manualPaymentRequestsTable.id, params.requestId));

  const endsAt = addBillingCycle(now, request.billingCycle);

  await db
    .update(companiesTable)
    .set({ subscriptionStatus: "active", planId: request.planId, updatedAt: now })
    .where(eq(companiesTable.id, request.companyId));

  await db.insert(subscriptionsTable).values({
    companyId: request.companyId,
    planId: request.planId,
    status: "active",
    startedAt: now,
    endsAt,
    billingCycle: request.billingCycle,
    amount: request.amount,
    currency: request.currency,
    paymentProvider: "manual",
  });

  await logSubscriptionAudit(request.companyId, "MANUAL_PAYMENT_APPROVED", params.requestId, {
    requestId: params.requestId,
    planId: request.planId,
    amount: request.amount,
    currency: request.currency,
    approvedBy: params.superAdminEmail,
    notes: params.notes,
  });

  return { ok: true as const, endsAt };
}

async function rejectManualPaymentRequest(params: {
  requestId: string;
  companyId?: string;
  notes?: string;
  superAdminId: string;
  superAdminEmail?: string;
}) {
  const lookup = await getPendingManualPaymentRequest(params.requestId, params.companyId);
  if ("error" in lookup) {
    return lookup;
  }

  const { request } = lookup;
  const now = new Date();

  await db
    .update(manualPaymentRequestsTable)
    .set({
      status: "rejected",
      reviewedBySuperAdminId: params.superAdminId,
      reviewerNotes: params.notes ?? null,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(eq(manualPaymentRequestsTable.id, params.requestId));

  await logSubscriptionAudit(request.companyId, "MANUAL_PAYMENT_REJECTED", params.requestId, {
    requestId: params.requestId,
    rejectedBy: params.superAdminEmail,
    notes: params.notes,
  });

  return { ok: true as const };
}

// POST /super-admin/payment-requests/:id/approve
router.post("/super-admin/payment-requests/:id/approve", async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body as { notes?: string };

  try {
    const result = await approveManualPaymentRequest({
      requestId: id,
      notes,
      superAdminId: req.superAdmin!.superAdminId,
      superAdminEmail: req.superAdmin?.email,
    });
    if ("error" in result) {
      res.status(result.error === "Request not found" ? 404 : 400).json({ error: result.error });
      return;
    }
    const approved = result as { ok: true; endsAt: Date };
    res.json({ ok: true, endsAt: approved.endsAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to approve payment request");
    res.status(500).json({ error: "Server error" });
  }
});

// POST /super-admin/companies/:companyId/payment-requests/:requestId/approve
router.post("/super-admin/companies/:companyId/payment-requests/:requestId/approve", async (req, res) => {
  const { companyId, requestId } = req.params;
  const { notes } = req.body as { notes?: string };

  try {
    const result = await approveManualPaymentRequest({
      requestId,
      companyId,
      notes,
      superAdminId: req.superAdmin!.superAdminId,
      superAdminEmail: req.superAdmin?.email,
    });
    if ("error" in result) {
      res.status(result.error === "Request not found" ? 404 : 400).json({ error: result.error });
      return;
    }
    const approved = result as { ok: true; endsAt: Date };
    res.json({ ok: true, endsAt: approved.endsAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to approve company payment request");
    res.status(500).json({ error: "Server error" });
  }
});

// POST /super-admin/payment-requests/:id/reject
router.post("/super-admin/payment-requests/:id/reject", async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body as { notes?: string };

  try {
    const result = await rejectManualPaymentRequest({
      requestId: id,
      notes,
      superAdminId: req.superAdmin!.superAdminId,
      superAdminEmail: req.superAdmin?.email,
    });
    if ("error" in result) {
      res.status(result.error === "Request not found" ? 404 : 400).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reject payment request");
    res.status(500).json({ error: "Server error" });
  }
});

// POST /super-admin/companies/:companyId/payment-requests/:requestId/reject
router.post("/super-admin/companies/:companyId/payment-requests/:requestId/reject", async (req, res) => {
  const { companyId, requestId } = req.params;
  const { notes } = req.body as { notes?: string };

  try {
    const result = await rejectManualPaymentRequest({
      requestId,
      companyId,
      notes,
      superAdminId: req.superAdmin!.superAdminId,
      superAdminEmail: req.superAdmin?.email,
    });
    if ("error" in result) {
      res.status(result.error === "Request not found" ? 404 : 400).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reject company payment request");
    res.status(500).json({ error: "Server error" });
  }
});

// GET /super-admin/companies/:id/overview
router.get("/super-admin/companies/:id/overview", async (req, res) => {
  const { id } = req.params;
  try {
    const [company] = await db
      .select({
        id: companiesTable.id,
        name: companiesTable.name,
        country: companiesTable.country,
        subscriptionStatus: companiesTable.subscriptionStatus,
        trialEndsAt: companiesTable.trialEndsAt,
        planId: companiesTable.planId,
        createdAt: companiesTable.createdAt,
      })
      .from(companiesTable)
      .where(eq(companiesTable.id, id))
      .limit(1);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    const [usersCount] = await db
      .select({ count: count() })
      .from(usersTable)
      .where(eq(usersTable.companyId, id));
    const [jeCount] = await db
      .select({ count: count() })
      .from(journalEntriesTable)
      .where(eq(journalEntriesTable.companyId, id));
    const [invCount] = await db
      .select({ count: count() })
      .from(invoicesTable)
      .where(eq(invoicesTable.companyId, id));
    const [custCount] = await db
      .select({ count: count() })
      .from(customersTable)
      .where(eq(customersTable.companyId, id));
    const [suppCount] = await db
      .select({ count: count() })
      .from(suppliersTable)
      .where(eq(suppliersTable.companyId, id));
    const [bankCount] = await db
      .select({ count: count() })
      .from(bankAccountsTable)
      .where(eq(bankAccountsTable.companyId, id));
    const [assetCount] = await db
      .select({ count: count() })
      .from(fixedAssetsTable)
      .where(eq(fixedAssetsTable.companyId, id));
    const [empCount] = await db
      .select({ count: count() })
      .from(employeesTable)
      .where(eq(employeesTable.companyId, id));
    res.json({
      company,
      summary: {
        usersCount: Number(usersCount?.count ?? 0),
        journalEntries: Number(jeCount?.count ?? 0),
        invoices: Number(invCount?.count ?? 0),
        customers: Number(custCount?.count ?? 0),
        suppliers: Number(suppCount?.count ?? 0),
        bankAccounts: Number(bankCount?.count ?? 0),
        fixedAssets: Number(assetCount?.count ?? 0),
        employees: Number(empCount?.count ?? 0),
      },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch company overview");
    res.status(500).json({ error: "Server error" });
  }
});

// GET /super-admin/companies/:id/activity
router.get("/super-admin/companies/:id/activity", async (req, res) => {
  const { id } = req.params;
  const limit = Math.min(Number(req.query["limit"] ?? 50), 200);
  try {
    const rows = await db
      .select({
        id: auditLogTable.id,
        action: auditLogTable.action,
        entity: auditLogTable.entity,
        entityId: auditLogTable.entityId,
        createdAt: auditLogTable.createdAt,
        userName: usersTable.name,
        userEmail: usersTable.email,
      })
      .from(auditLogTable)
      .leftJoin(usersTable, eq(auditLogTable.userId, usersTable.id))
      .where(eq(auditLogTable.companyId, id))
      .orderBy(desc(auditLogTable.createdAt))
      .limit(limit);
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch company activity");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
