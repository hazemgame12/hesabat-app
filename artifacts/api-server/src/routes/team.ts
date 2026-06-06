import { Router } from "express";
import { and, eq, asc, gt } from "drizzle-orm";
import {
  db,
  usersTable,
  invitationsTable,
  type Invitation,
} from "@workspace/db";
import { isAssignableRole } from "@workspace/permissions";
import { UpdateMemberRoleBody, CreateInvitationBody } from "@workspace/api-zod";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import { generateSessionToken, hashToken } from "../lib/auth";

const router = Router();

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function toMember(
  row: {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: Date;
  },
  selfId: string,
) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
    isSelf: row.id === selfId,
  };
}

function toInvitation(row: Invitation) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

// ---- Members ----

router.get(
  "/team/members",
  requireAuth,
  requireCapability("team:manage"),
  async (req, res) => {
    try {
      const rows = await db
        .select({
          id: usersTable.id,
          name: usersTable.name,
          email: usersTable.email,
          role: usersTable.role,
          createdAt: usersTable.createdAt,
        })
        .from(usersTable)
        .where(eq(usersTable.companyId, req.auth!.companyId))
        .orderBy(asc(usersTable.createdAt));
      res.json(rows.map((r) => toMember(r, req.auth!.userId)));
    } catch (err) {
      req.log.error({ err }, "Failed to list team members");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.patch(
  "/team/members/:id",
  requireAuth,
  requireCapability("team:manage"),
  async (req, res) => {
    const id = req.params["id"] as string;
    const parsed = UpdateMemberRoleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const newRole = parsed.data.role as string;
    if (!isAssignableRole(newRole)) {
      res.status(400).json({ error: "الدور المحدد غير صالح" });
      return;
    }
    if (id === req.auth!.userId) {
      res.status(400).json({ error: "لا يمكنك تغيير دورك الخاص" });
      return;
    }
    try {
      const target = await db
        .select({ id: usersTable.id, role: usersTable.role })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.id, id),
            eq(usersTable.companyId, req.auth!.companyId),
          ),
        )
        .limit(1);
      if (target.length === 0) {
        res.status(404).json({ error: "العضو غير موجود" });
        return;
      }
      if (target[0]!.role === "owner") {
        res.status(403).json({ error: "لا يمكن تعديل دور صاحب الشركة" });
        return;
      }
      const [row] = await db
        .update(usersTable)
        .set({ role: newRole })
        .where(
          and(
            eq(usersTable.id, id),
            eq(usersTable.companyId, req.auth!.companyId),
          ),
        )
        .returning({
          id: usersTable.id,
          name: usersTable.name,
          email: usersTable.email,
          role: usersTable.role,
          createdAt: usersTable.createdAt,
        });
      res.json(toMember(row!, req.auth!.userId));
    } catch (err) {
      req.log.error({ err }, "Failed to update member role");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.delete(
  "/team/members/:id",
  requireAuth,
  requireCapability("team:manage"),
  async (req, res) => {
    const id = req.params["id"] as string;
    if (id === req.auth!.userId) {
      res.status(400).json({ error: "لا يمكنك إزالة نفسك" });
      return;
    }
    try {
      const target = await db
        .select({ id: usersTable.id, role: usersTable.role })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.id, id),
            eq(usersTable.companyId, req.auth!.companyId),
          ),
        )
        .limit(1);
      if (target.length === 0) {
        res.status(404).json({ error: "العضو غير موجود" });
        return;
      }
      if (target[0]!.role === "owner") {
        res.status(403).json({ error: "لا يمكن إزالة صاحب الشركة" });
        return;
      }
      await db
        .delete(usersTable)
        .where(
          and(
            eq(usersTable.id, id),
            eq(usersTable.companyId, req.auth!.companyId),
          ),
        );
      res.json({ status: "ok" });
    } catch (err) {
      req.log.error({ err }, "Failed to remove member");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Invitations ----

router.get(
  "/team/invitations",
  requireAuth,
  requireCapability("team:manage"),
  async (req, res) => {
    try {
      const rows = await db
        .select()
        .from(invitationsTable)
        .where(
          and(
            eq(invitationsTable.companyId, req.auth!.companyId),
            eq(invitationsTable.status, "pending"),
          ),
        )
        .orderBy(asc(invitationsTable.createdAt));
      res.json(rows.map(toInvitation));
    } catch (err) {
      req.log.error({ err }, "Failed to list invitations");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.post(
  "/team/invitations",
  requireAuth,
  requireCapability("team:manage"),
  async (req, res) => {
    const parsed = CreateInvitationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const role = parsed.data.role as string;
    if (!isAssignableRole(role)) {
      res.status(400).json({ error: "الدور المحدد غير صالح" });
      return;
    }
    const email = parsed.data.email.toLowerCase().trim();
    try {
      // Already a registered user (email is globally unique)?
      const existingUser = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, email))
        .limit(1);
      if (existingUser.length > 0) {
        res
          .status(409)
          .json({ error: "هذا البريد الإلكتروني مسجل بالفعل" });
        return;
      }
      // An existing *non-expired* pending invitation for this email in this
      // company? Expired-but-pending invites should not block a fresh invite.
      const existingInvite = await db
        .select({ id: invitationsTable.id })
        .from(invitationsTable)
        .where(
          and(
            eq(invitationsTable.companyId, req.auth!.companyId),
            eq(invitationsTable.email, email),
            eq(invitationsTable.status, "pending"),
            gt(invitationsTable.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (existingInvite.length > 0) {
        res
          .status(409)
          .json({ error: "تمت دعوة هذا البريد الإلكتروني بالفعل" });
        return;
      }

      const token = generateSessionToken();
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
      const [row] = await db
        .insert(invitationsTable)
        .values({
          companyId: req.auth!.companyId,
          email,
          role,
          tokenHash: hashToken(token),
          invitedByUserId: req.auth!.userId,
          status: "pending",
          expiresAt,
        })
        .returning();
      res.status(201).json({
        id: row!.id,
        email: row!.email,
        role: row!.role,
        expiresAt: row!.expiresAt.toISOString(),
        token,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to create invitation");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.delete(
  "/team/invitations/:id",
  requireAuth,
  requireCapability("team:manage"),
  async (req, res) => {
    const id = req.params["id"] as string;
    try {
      const deleted = await db
        .update(invitationsTable)
        .set({ status: "revoked" })
        .where(
          and(
            eq(invitationsTable.id, id),
            eq(invitationsTable.companyId, req.auth!.companyId),
            eq(invitationsTable.status, "pending"),
          ),
        )
        .returning({ id: invitationsTable.id });
      if (deleted.length === 0) {
        res.status(404).json({ error: "الدعوة غير موجودة" });
        return;
      }
      res.json({ status: "ok" });
    } catch (err) {
      req.log.error({ err }, "Failed to revoke invitation");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
