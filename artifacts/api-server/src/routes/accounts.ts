import { Router } from "express";
import { and, eq, asc } from "drizzle-orm";
import { db, accountsTable, type Account } from "@workspace/db";
import { CreateAccountBody, UpdateAccountBody } from "@workspace/api-zod";
import { requireAuth } from "../middleware/require-auth";

const router = Router();

function toAccount(row: Account) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    parentId: row.parentId,
    isGroup: row.isGroup,
    createdAt: row.createdAt.toISOString(),
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  );
}

// Ensures a referenced parent account belongs to the authenticated company,
// preventing cross-tenant parent linkage (and existence-oracle leaks).
async function parentBelongsToCompany(
  parentId: string,
  companyId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: accountsTable.id })
    .from(accountsTable)
    .where(
      and(eq(accountsTable.id, parentId), eq(accountsTable.companyId, companyId)),
    )
    .limit(1);
  return rows.length > 0;
}

router.get("/accounts", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.companyId, req.auth!.companyId))
      .orderBy(asc(accountsTable.code));
    res.json(rows.map(toAccount));
  } catch (err) {
    req.log.error({ err }, "Failed to list accounts");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

router.post("/accounts", requireAuth, async (req, res) => {
  const parsed = CreateAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
    return;
  }
  const parentId = parsed.data.parentId ?? null;
  try {
    if (
      parentId &&
      !(await parentBelongsToCompany(parentId, req.auth!.companyId))
    ) {
      res.status(400).json({ error: "الحساب الرئيسي غير موجود" });
      return;
    }
    const [row] = await db
      .insert(accountsTable)
      .values({
        companyId: req.auth!.companyId,
        code: parsed.data.code,
        name: parsed.data.name,
        type: parsed.data.type,
        parentId,
        isGroup: parsed.data.isGroup ?? false,
      })
      .returning();
    res.status(201).json(toAccount(row as Account));
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "رمز الحساب مستخدم بالفعل" });
      return;
    }
    req.log.error({ err }, "Failed to create account");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

router.patch("/accounts/:id", requireAuth, async (req, res) => {
  const id = req.params["id"] as string;
  if (!id) {
    res.status(400).json({ error: "معرّف غير صحيح" });
    return;
  }
  const parsed = UpdateAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
    return;
  }
  const updates: Record<string, unknown> = {};
  if (parsed.data.code !== undefined) updates["code"] = parsed.data.code;
  if (parsed.data.name !== undefined) updates["name"] = parsed.data.name;
  if (parsed.data.type !== undefined) updates["type"] = parsed.data.type;
  if (parsed.data.parentId !== undefined)
    updates["parentId"] = parsed.data.parentId;
  if (parsed.data.isGroup !== undefined)
    updates["isGroup"] = parsed.data.isGroup;
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "لا توجد بيانات للتحديث" });
    return;
  }
  try {
    const nextParentId = updates["parentId"] as string | null | undefined;
    if (nextParentId) {
      if (nextParentId === id) {
        res.status(400).json({ error: "لا يمكن أن يكون الحساب رئيساً لنفسه" });
        return;
      }
      if (!(await parentBelongsToCompany(nextParentId, req.auth!.companyId))) {
        res.status(400).json({ error: "الحساب الرئيسي غير موجود" });
        return;
      }
    }
    const [row] = await db
      .update(accountsTable)
      .set(updates)
      .where(
        and(
          eq(accountsTable.id, id),
          eq(accountsTable.companyId, req.auth!.companyId),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "الحساب غير موجود" });
      return;
    }
    res.json(toAccount(row as Account));
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "رمز الحساب مستخدم بالفعل" });
      return;
    }
    req.log.error({ err }, "Failed to update account");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

router.delete("/accounts/:id", requireAuth, async (req, res) => {
  const id = req.params["id"] as string;
  if (!id) {
    res.status(400).json({ error: "معرّف غير صحيح" });
    return;
  }
  try {
    const deleted = await db
      .delete(accountsTable)
      .where(
        and(
          eq(accountsTable.id, id),
          eq(accountsTable.companyId, req.auth!.companyId),
        ),
      )
      .returning({ id: accountsTable.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: "الحساب غير موجود" });
      return;
    }
    res.json({ status: "ok" });
  } catch (err) {
    req.log.error({ err }, "Failed to delete account");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

export default router;
