import { Router } from "express";
import { eq, and, desc, count } from "drizzle-orm";
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
router.get("/support/tickets", requireAuth, async (req, res) => {
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
router.get("/support/tickets/:id", requireAuth, async (req, res) => {
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
router.post("/support/tickets/:id/comments", requireAuth, async (req, res) => {
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
      })
      .returning();
    res.status(201).json({ comment });
  } catch (err) {
    req.log.error({ err }, "Failed to add comment");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// User: vote on feature request
router.post("/support/tickets/:id/vote", requireAuth, async (req, res) => {
  const userId = req.auth!.userId;
  const ticketId = req.params.id as string;
  try {
    const [ticket] = await db
      .select({ type: supportTicketsTable.type, companyId: supportTicketsTable.companyId, userId: supportTicketsTable.userId })
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.id, ticketId))
      .limit(1);
    if (!ticket || ticket.companyId !== req.auth!.companyId || ticket.userId !== userId) {
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
