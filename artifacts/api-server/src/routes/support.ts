import { Router } from "express";
import { eq, and, desc, count, sql } from "drizzle-orm";
import {
  db,
  supportTicketsTable,
  ticketCommentsTable,
  featureVotesTable,
} from "@workspace/db";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";

const router = Router();

// User: list my tickets
router.get("/support/tickets", requireAuth, requireCapability("support:read"), async (req, res) => {
  const companyId = req.auth!.companyId;
  const userId = req.auth!.userId;
  try {
    const tickets = await db
      .select()
      .from(supportTicketsTable)
      .where(
        and(
          eq(supportTicketsTable.companyId, companyId),
          eq(supportTicketsTable.userId, userId),
        ),
      )
      .orderBy(desc(supportTicketsTable.createdAt));
    res.json({ tickets });
  } catch (err) {
    req.log.error({ err }, "Failed to list tickets");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// User: list all company feature requests (cross-user, with vote counts)
router.get("/support/feature-requests", requireAuth, requireCapability("support:read"), async (req, res) => {
  const companyId = req.auth!.companyId;
  const userId = req.auth!.userId;
  try {
    const tickets = await db
      .select()
      .from(supportTicketsTable)
      .where(
        and(
          eq(supportTicketsTable.companyId, companyId),
          eq(supportTicketsTable.type, "feature_request"),
        ),
      )
      .orderBy(desc(supportTicketsTable.createdAt));
    // Fetch vote counts per ticket
    const voteCounts = await db
      .select({
        ticketId: featureVotesTable.ticketId,
        count: count(),
      })
      .from(featureVotesTable)
      .groupBy(featureVotesTable.ticketId);
    // Fetch current user's votes
    const userVotes = await db
      .select({ ticketId: featureVotesTable.ticketId })
      .from(featureVotesTable)
      .where(eq(featureVotesTable.userId, userId));
    const userVotedSet = new Set(userVotes.map((v) => v.ticketId));
    const countMap = new Map(voteCounts.map((v) => [v.ticketId, v.count]));
    res.json({
      tickets: tickets.map((t) => ({
        ...t,
        votes: countMap.get(t.id) ?? 0,
        userVoted: userVotedSet.has(t.id),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list feature requests");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// User: create ticket
router.post("/support/tickets", requireAuth, requireCapability("support:create"), async (req, res) => {
  const companyId = req.auth!.companyId;
  const userId = req.auth!.userId;
  const { type, subject, body, priority } = req.body as {
    type?: string;
    subject?: string;
    body?: string;
    priority?: string;
  };
  if (!type || !subject || !body || !["issue", "feature_request"].includes(type)) {
    res.status(400).json({ error: "البيانات غير صالحة" });
    return;
  }
  const validPriority = ["low", "medium", "high", "critical"].includes(priority ?? "")
    ? (priority as "low" | "medium" | "high" | "critical")
    : "medium";
  try {
    const [ticket] = await db
      .insert(supportTicketsTable)
      .values({
        companyId,
        userId,
        type: type as "issue" | "feature_request",
        subject,
        body,
        priority: validPriority,
      })
      .returning();
    res.status(201).json({ ticket });
  } catch (err) {
    req.log.error({ err }, "Failed to create ticket");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// User: get ticket detail with comments
router.get("/support/tickets/:id", requireAuth, requireCapability("support:read"), async (req, res) => {
  const companyId = req.auth!.companyId;
  const userId = req.auth!.userId;
  const ticketId = req.params.id as string;
  try {
    const [ticket] = await db
      .select()
      .from(supportTicketsTable)
      .where(
        and(
          eq(supportTicketsTable.id, ticketId),
          eq(supportTicketsTable.companyId, companyId),
          eq(supportTicketsTable.userId, userId),
        ),
      )
      .limit(1);
    if (!ticket) {
      res.status(404).json({ error: "التذكرة غير موجودة" });
      return;
    }
    const comments = await db
      .select()
      .from(ticketCommentsTable)
      .where(
        and(
          eq(ticketCommentsTable.ticketId, ticketId),
          eq(ticketCommentsTable.isInternal, false),
        ),
      )
      .orderBy(ticketCommentsTable.createdAt);
    const voteCount = await db
      .select({ count: count() })
      .from(featureVotesTable)
      .where(eq(featureVotesTable.ticketId, ticketId));
    const userVoted = await db
      .select({ id: featureVotesTable.id })
      .from(featureVotesTable)
      .where(
        and(
          eq(featureVotesTable.ticketId, ticketId),
          eq(featureVotesTable.userId, userId),
        ),
      )
      .limit(1);
    res.json({
      ticket,
      comments,
      votes: voteCount[0]?.count ?? 0,
      userVoted: !!userVoted.length,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get ticket");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// User: add comment
router.post("/support/tickets/:id/comments", requireAuth, requireCapability("support:create"), async (req, res) => {
  const userId = req.auth!.userId;
  const ticketId = req.params.id as string;
  const { body: commentBody } = req.body as { body?: string };
  if (!commentBody || commentBody.trim().length === 0) {
    res.status(400).json({ error: "التعليق مطلوب" });
    return;
  }
  try {
    // Verify ticket exists and belongs to the requesting user
    const [ticket] = await db
      .select({ companyId: supportTicketsTable.companyId, userId: supportTicketsTable.userId })
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.id, ticketId))
      .limit(1);
    if (!ticket || ticket.companyId !== req.auth!.companyId || ticket.userId !== userId) {
      res.status(404).json({ error: "التذكرة غير موجودة" });
      return;
    }
    const [comment] = await db
      .insert(ticketCommentsTable)
      .values({
        ticketId,
        userId,
        body: commentBody.trim(),
        isAdminReply: false,
        isReadByUser: true,
        isReadByAdmin: false,
      })
      .returning();
    res.status(201).json({ comment });
  } catch (err) {
    req.log.error({ err }, "Failed to add comment");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// User: unread count (admin replies not yet seen by user)
router.get("/support/tickets/unread-count", requireAuth, requireCapability("support:read"), async (req, res) => {
  const companyId = req.auth!.companyId;
  const userId = req.auth!.userId;
  try {
    const [row] = await db
      .select({ count: count() })
      .from(ticketCommentsTable)
      .innerJoin(supportTicketsTable, eq(supportTicketsTable.id, ticketCommentsTable.ticketId))
      .where(
        and(
          eq(supportTicketsTable.companyId, companyId),
          eq(supportTicketsTable.userId, userId),
          eq(ticketCommentsTable.isAdminReply, true),
          eq(ticketCommentsTable.isReadByUser, false),
        ),
      );
    res.json({ count: row?.count ?? 0 });
  } catch (err) {
    req.log.error({ err }, "Failed to get unread count");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// User: mark ticket comments as read
router.post("/support/tickets/:id/mark-read", requireAuth, requireCapability("support:read"), async (req, res) => {
  const companyId = req.auth!.companyId;
  const userId = req.auth!.userId;
  const ticketId = req.params.id as string;
  try {
    const [ticket] = await db
      .select({ id: supportTicketsTable.id })
      .from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.id, ticketId), eq(supportTicketsTable.companyId, companyId), eq(supportTicketsTable.userId, userId)))
      .limit(1);
    if (!ticket) { res.status(404).json({ error: "التذكرة غير موجودة" }); return; }
    await db
      .update(ticketCommentsTable)
      .set({ isReadByUser: true })
      .where(and(eq(ticketCommentsTable.ticketId, ticketId), eq(ticketCommentsTable.isAdminReply, true)));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to mark read");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// User: reopen a resolved/closed ticket
router.post("/support/tickets/:id/reopen", requireAuth, requireCapability("support:create"), async (req, res) => {
  const companyId = req.auth!.companyId;
  const userId = req.auth!.userId;
  const ticketId = req.params.id as string;
  try {
    const [ticket] = await db
      .select({ status: supportTicketsTable.status })
      .from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.id, ticketId), eq(supportTicketsTable.companyId, companyId), eq(supportTicketsTable.userId, userId)))
      .limit(1);
    if (!ticket) { res.status(404).json({ error: "التذكرة غير موجودة" }); return; }
    if (!["resolved", "closed"].includes(ticket.status)) {
      res.status(400).json({ error: "يمكن إعادة فتح التذاكر المحلولة أو المغلقة فقط" });
      return;
    }
    const [updated] = await db
      .update(supportTicketsTable)
      .set({ status: "open" })
      .where(eq(supportTicketsTable.id, ticketId))
      .returning();
    res.json({ ticket: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to reopen ticket");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// User: vote on feature request (any company user can vote)
router.post("/support/tickets/:id/vote", requireAuth, requireCapability("support:read"), async (req, res) => {
  const userId = req.auth!.userId;
  const ticketId = req.params.id as string;
  try {
    const [ticket] = await db
      .select({ type: supportTicketsTable.type, companyId: supportTicketsTable.companyId })
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.id, ticketId))
      .limit(1);
    if (!ticket || ticket.companyId !== req.auth!.companyId) {
      res.status(404).json({ error: "التذكرة غير موجودة" });
      return;
    }
    if (ticket.type !== "feature_request") {
      res.status(400).json({ error: "يمكن التصويت فقط على طلبات الميزات" });
      return;
    }
    // Check if already voted
    const existing = await db
      .select({ id: featureVotesTable.id })
      .from(featureVotesTable)
      .where(
        and(
          eq(featureVotesTable.ticketId, ticketId),
          eq(featureVotesTable.userId, userId),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      // Toggle: remove vote
      await db
        .delete(featureVotesTable)
        .where(
          and(
            eq(featureVotesTable.ticketId, ticketId),
            eq(featureVotesTable.userId, userId),
          ),
        );
      res.json({ voted: false });
      return;
    }
    await db
      .insert(featureVotesTable)
      .values({ ticketId, userId })
      .returning();
    res.json({ voted: true });
  } catch (err) {
    req.log.error({ err }, "Failed to vote");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

export default router;
