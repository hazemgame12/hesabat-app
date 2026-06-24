import { Router } from "express";
import { eq, count, sql, desc, asc, ilike, and, gte, lte, isNull, inArray } from "drizzle-orm";
import {
  db,
  companiesTable,
  usersTable,
  supportTicketsTable,
  subscriptionPlansTable,
  subscriptionsTable,
  superAdminsTable,
  siteSettingsTable,
  articlesTable,
  insertArticleSchema,
  updateArticleSchema,
} from "@workspace/db";
import { requireSuperAdmin, requireSuperAdminRole } from "../middleware/super-admin";
import { hashPassword } from "../lib/auth";
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
  subscriptionStatus: z.enum(["trial", "active", "expired", "cancelled", "suspended"]).optional(),
  planId: z.string().uuid().optional(),
  maxUsers: z.number().optional(),
  maxTransactions: z.number().optional(),
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
  country: z.string().min(1),
  maxUsers: z.number().min(1),
  maxTransactions: z.number().min(1),
  price: z.string().min(1),
  currency: z.string().min(1),
  billingCycle: z.enum(["monthly", "quarterly", "yearly"]),
  features: z.array(z.string()).optional(),
  showOnLanding: z.boolean().optional(),
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
    .values(body.data)
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
    .set({ ...body.data, updatedAt: new Date() })
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
  const tickets = await db
    .select()
    .from(supportTicketsTable)
    .orderBy(desc(supportTicketsTable.createdAt));
  res.json(tickets);
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
