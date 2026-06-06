import { Router } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  usersTable,
  companiesTable,
  invitationsTable,
  type User,
} from "@workspace/db";
import { AcceptInvitationBody } from "@workspace/api-zod";
import { hashPassword, hashToken } from "../lib/auth";
import { createSession, setSessionCookie } from "../lib/session";

const router = Router();

// Resolves a usable (pending, non-expired) invitation by its raw token.
async function resolvePendingInvitation(token: string) {
  const rows = await db
    .select()
    .from(invitationsTable)
    .where(
      and(
        eq(invitationsTable.tokenHash, hashToken(token)),
        eq(invitationsTable.status, "pending"),
      ),
    )
    .limit(1);
  const invite = rows[0];
  if (!invite) return null;
  if (invite.expiresAt.getTime() < Date.now()) return null;
  return invite;
}

router.get("/invitations/:token", async (req, res) => {
  const token = req.params["token"] as string;
  try {
    const invite = await resolvePendingInvitation(token);
    if (!invite) {
      res.status(404).json({ error: "الدعوة غير صالحة أو منتهية الصلاحية" });
      return;
    }
    const company = await db
      .select({ name: companiesTable.name })
      .from(companiesTable)
      .where(eq(companiesTable.id, invite.companyId))
      .limit(1);
    res.json({
      companyName: company[0]?.name ?? "",
      email: invite.email,
      role: invite.role,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch invitation");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

router.post("/invitations/:token/accept", async (req, res) => {
  const token = req.params["token"] as string;
  const parsed = AcceptInvitationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
    return;
  }
  try {
    const invite = await resolvePendingInvitation(token);
    if (!invite) {
      res.status(404).json({ error: "الدعوة غير صالحة أو منتهية الصلاحية" });
      return;
    }

    // Email is globally unique; if it has been taken since the invite was sent,
    // we cannot create the account.
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, invite.email))
      .limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "هذا البريد الإلكتروني مسجل بالفعل" });
      return;
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const created = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(usersTable)
        .values({
          companyId: invite.companyId,
          email: invite.email,
          name: parsed.data.name,
          passwordHash,
          role: invite.role,
        })
        .returning();
      await tx
        .update(invitationsTable)
        .set({ status: "accepted", acceptedAt: new Date() })
        .where(eq(invitationsTable.id, invite.id));
      return user as User;
    });

    const company = await db
      .select({ name: companiesTable.name })
      .from(companiesTable)
      .where(eq(companiesTable.id, created.companyId))
      .limit(1);

    const sessionToken = await createSession(created.id);
    setSessionCookie(res, sessionToken);
    res.status(201).json({
      id: created.id,
      name: created.name,
      email: created.email,
      role: created.role,
      companyId: created.companyId,
      companyName: company[0]?.name ?? "",
    });
  } catch (err) {
    req.log.error({ err }, "Failed to accept invitation");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

export default router;
