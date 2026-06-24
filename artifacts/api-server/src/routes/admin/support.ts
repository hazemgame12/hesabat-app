import { Router } from "express";
import { eq, and, desc, count, sql } from "drizzle-orm";
import {
  db,
  supportTicketsTable,
  ticketCommentsTable,
  featureVotesTable,
  usersTable,
  companiesTable,
} from "@workspace/db";
import { requireAuth } from "../../middleware/require-auth";
import { requireCapability } from "../../middleware/require-capability";

const router = Router();

// Admin: list all tickets with filters
router.get("/admin/support/tickets", requireAuth, requireCapability("support:admin"), async (req, res) => {
  const companyId = req.auth!.companyId;
  const { status, type, priority } = req.query as {
    status?: string;
    type?: string;
    priority?: string;
  };
  try {
    const filters = [eq(supportTicketsTable.companyId, companyId)];
    if (status && ["open", "in_progress", "resolved", "closed"].includes(status)) {
      filters.push(eq(supportTicketsTable.status, status as "open" | "in_progress" | "resolved" | "closed"));
    }
    if (type && ["issue", "feature_request"].includes(type)) {
      filters.push(eq(supportTicketsTable.type, type as "issue" | "feature_request"));
    }
    if (priority && ["low", "medium", "high", "critical"].includes(priority)) {
      filters.push(eq(supportTicketsTable.priority, priority as "low" | "medium" | "high" | "critical"));
    }
    const tickets = await db
      .select({
        id: supportTicketsTable.id,
        companyId: supportTicketsTable.companyId,
        userId: supportTicketsTable.userId,
        type: supportTicketsTable.type,
        subject: supportTicketsTable.subject,
        status: supportTicketsTable.status,
        priority: supportTicketsTable.priority,
        assignedTo: supportTicketsTable.assignedTo,
        createdAt: supportTicketsTable.createdAt,
        updatedAt: supportTicketsTable.updatedAt,
        userName: usersTable.name,
        userEmail: usersTable.email,
        companyName: companiesTable.name,
      })
      .from(supportTicketsTable)
      .leftJoin(usersTable, eq(usersTable.id, supportTicketsTable.userId))
      .leftJoin(companiesTable, eq(companiesTable.id, supportTicketsTable.companyId))
      .where(and(...filters))
      .orderBy(desc(supportTicketsTable.createdAt));
    // Fetch vote counts for all tickets
    const voteCounts = await db
      .select({
        ticketId: featureVotesTable.ticketId,
        count: count(),
      })
      .from(featureVotesTable)
      .groupBy(featureVotesTable.ticketId);
    const countMap = new Map(voteCounts.map((v) => [v.ticketId, v.count]));
    res.json({
      tickets: tickets.map((t) => ({
        ...t,
        votes: countMap.get(t.id) ?? 0,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list admin tickets");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// Admin: stats — MUST come before /:id
router.get("/admin/support/tickets/stats", requireAuth, requireCapability("support:admin"), async (req, res) => {
  const companyId = req.auth!.companyId;
  try {
    const totalResult = await db
      .select({ count: count() })
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.companyId, companyId));
    const openResult = await db
      .select({ count: count() })
      .from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.companyId, companyId), eq(supportTicketsTable.status, "open")));
    const inProgressResult = await db
      .select({ count: count() })
      .from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.companyId, companyId), eq(supportTicketsTable.status, "in_progress")));
    const resolvedResult = await db
      .select({ count: count() })
      .from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.companyId, companyId), eq(supportTicketsTable.status, "resolved")));
    const closedResult = await db
      .select({ count: count() })
      .from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.companyId, companyId), eq(supportTicketsTable.status, "closed")));
    const byType = await db
      .select({
        type: supportTicketsTable.type,
        count: count(),
      })
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.companyId, companyId))
      .groupBy(supportTicketsTable.type);
    const byPriority = await db
      .select({
        priority: supportTicketsTable.priority,
        count: count(),
      })
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.companyId, companyId))
      .groupBy(supportTicketsTable.priority);
    res.json({
      total: totalResult[0]?.count ?? 0,
      open: openResult[0]?.count ?? 0,
      inProgress: inProgressResult[0]?.count ?? 0,
      resolved: resolvedResult[0]?.count ?? 0,
      closed: closedResult[0]?.count ?? 0,
      byType,
      byPriority,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get stats");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// Admin: get ticket detail
router.get("/admin/support/tickets/:id", requireAuth, requireCapability("support:admin"), async (req, res) => {
  const companyId = req.auth!.companyId;
  const ticketId = req.params.id as string;
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
        assignedTo: supportTicketsTable.assignedTo,
        createdAt: supportTicketsTable.createdAt,
        updatedAt: supportTicketsTable.updatedAt,
        userName: usersTable.name,
        userEmail: usersTable.email,
        companyName: companiesTable.name,
      })
      .from(supportTicketsTable)
      .leftJoin(usersTable, eq(usersTable.id, supportTicketsTable.userId))
      .leftJoin(companiesTable, eq(companiesTable.id, supportTicketsTable.companyId))
      .where(
        and(
          eq(supportTicketsTable.id, ticketId),
          eq(supportTicketsTable.companyId, companyId),
        ),
      )
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
        body: ticketCommentsTable.body,
        isInternal: ticketCommentsTable.isInternal,
        createdAt: ticketCommentsTable.createdAt,
        userName: usersTable.name,
      })
      .from(ticketCommentsTable)
      .leftJoin(usersTable, eq(usersTable.id, ticketCommentsTable.userId))
      .where(eq(ticketCommentsTable.ticketId, ticketId))
      .orderBy(ticketCommentsTable.createdAt);
    const voteCount = await db
      .select({ count: count() })
      .from(featureVotesTable)
      .where(eq(featureVotesTable.ticketId, ticketId));
    res.json({
      ticket,
      comments,
      votes: voteCount[0]?.count ?? 0,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get admin ticket");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// Admin: update ticket
router.patch("/admin/support/tickets/:id", requireAuth, requireCapability("support:admin"), async (req, res) => {
  const companyId = req.auth!.companyId;
  const ticketId = req.params.id as string;
  const { status, priority, assignedTo } = req.body as {
    status?: string;
    priority?: string;
    assignedTo?: string | null;
  };
  try {
    const updates: Record<string, unknown> = {};
    if (status && ["open", "in_progress", "resolved", "closed"].includes(status)) {
      updates.status = status;
    }
    if (priority && ["low", "medium", "high", "critical"].includes(priority)) {
      updates.priority = priority;
    }
    if (assignedTo !== undefined) {
      updates.assignedTo = assignedTo;
    }
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "لا يوجد بيانات للتحديث" });
      return;
    }
    const [ticket] = await db
      .update(supportTicketsTable)
      .set(updates)
      .where(
        and(
          eq(supportTicketsTable.id, ticketId),
          eq(supportTicketsTable.companyId, companyId),
        ),
      )
      .returning();
    if (!ticket) {
      res.status(404).json({ error: "التذكرة غير موجودة" });
      return;
    }
    res.json({ ticket });
  } catch (err) {
    req.log.error({ err }, "Failed to update ticket");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// Admin: add comment (can be internal)
router.post("/admin/support/tickets/:id/comments", requireAuth, requireCapability("support:admin"), async (req, res) => {
  const companyId = req.auth!.companyId;
  const userId = req.auth!.userId;
  const ticketId = req.params.id as string;
  const { body: commentBody, isInternal } = req.body as {
    body?: string;
    isInternal?: boolean;
  };
  if (!commentBody || commentBody.trim().length === 0) {
    res.status(400).json({ error: "التعليق مطلوب" });
    return;
  }
  try {
    const [ticket] = await db
      .select({ id: supportTicketsTable.id })
      .from(supportTicketsTable)
      .where(
        and(
          eq(supportTicketsTable.id, ticketId),
          eq(supportTicketsTable.companyId, companyId),
        ),
      )
      .limit(1);
    if (!ticket) {
      res.status(404).json({ error: "التذكرة غير موجودة" });
      return;
    }
    const [comment] = await db
      .insert(ticketCommentsTable)
      .values({
        ticketId,
        userId,
        body: commentBody.trim(),
        isInternal: isInternal ?? false,
        isAdminReply: true,
        isReadByUser: false,
        isReadByAdmin: true,
      })
      .returning();
    res.status(201).json({ comment });
  } catch (err) {
    req.log.error({ err }, "Failed to add admin comment");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// Admin: unread count (user messages not yet seen by admin)
router.get("/admin/support/tickets/unread-count", requireAuth, requireCapability("support:admin"), async (req, res) => {
  const companyId = req.auth!.companyId;
  try {
    const [row] = await db
      .select({ count: count() })
      .from(ticketCommentsTable)
      .innerJoin(supportTicketsTable, eq(supportTicketsTable.id, ticketCommentsTable.ticketId))
      .where(
        and(
          eq(supportTicketsTable.companyId, companyId),
          eq(ticketCommentsTable.isAdminReply, false),
          eq(ticketCommentsTable.isInternal, false),
          eq(ticketCommentsTable.isReadByAdmin, false),
        ),
      );
    res.json({ count: row?.count ?? 0 });
  } catch (err) {
    req.log.error({ err }, "Failed to get admin unread count");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// Admin: mark ticket comments as read by admin
router.post("/admin/support/tickets/:id/mark-read", requireAuth, requireCapability("support:admin"), async (req, res) => {
  const companyId = req.auth!.companyId;
  const ticketId = req.params.id as string;
  try {
    const [ticket] = await db
      .select({ id: supportTicketsTable.id })
      .from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.id, ticketId), eq(supportTicketsTable.companyId, companyId)))
      .limit(1);
    if (!ticket) { res.status(404).json({ error: "التذكرة غير موجودة" }); return; }
    await db
      .update(ticketCommentsTable)
      .set({ isReadByAdmin: true })
      .where(and(eq(ticketCommentsTable.ticketId, ticketId), eq(ticketCommentsTable.isAdminReply, false)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to mark admin read");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

export default router;
