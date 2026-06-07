import { Router } from "express";
import { and, eq, asc, sql } from "drizzle-orm";
import {
  db,
  suppliersTable,
  accountsTable,
  journalEntryLinesTable,
  type Supplier,
} from "@workspace/db";
import { CreateSupplierBody, UpdateSupplierBody } from "@workspace/api-zod";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import {
  generateChildAccountCode,
  loadControlAccount,
  postedBalancesByAccount,
  isUniqueViolation,
  isForeignKeyViolation,
} from "../lib/party-ledger";

const router = Router();

const round2 = (n: number) => Math.round(n * 100) / 100;

function toSupplier(row: Supplier, accountCode: string, balance: number) {
  return {
    id: row.id,
    code: row.code,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    type: row.type as "individual" | "company",
    taxNumber: row.taxNumber,
    commercialRegistration: row.commercialRegistration,
    phone: row.phone,
    email: row.email,
    address: row.address,
    currency: row.currency,
    creditPeriodDays: row.creditPeriodDays,
    controlAccountId: row.controlAccountId,
    accountId: row.accountId,
    accountCode,
    balance: round2(balance),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get(
  "/suppliers",
  requireAuth,
  requireCapability("suppliers:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    try {
      const rows = await db
        .select({ supplier: suppliersTable, accountCode: accountsTable.code })
        .from(suppliersTable)
        .innerJoin(
          accountsTable,
          and(
            eq(accountsTable.id, suppliersTable.accountId),
            eq(accountsTable.companyId, companyId),
          ),
        )
        .where(eq(suppliersTable.companyId, companyId))
        .orderBy(asc(suppliersTable.code));
      const balances = await postedBalancesByAccount(companyId);
      res.json(
        rows.map(({ supplier, accountCode }) => {
          const b = balances.get(supplier.accountId);
          // Payables are liabilities → balance = credit − debit.
          const balance = b ? b.credit - b.debit : 0;
          return toSupplier(supplier, accountCode, balance);
        }),
      );
    } catch (err) {
      req.log.error({ err }, "Failed to list suppliers");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.post(
  "/suppliers",
  requireAuth,
  requireCapability("suppliers:create"),
  async (req, res) => {
    const parsed = CreateSupplierBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const d = parsed.data;
    try {
      const control = await loadControlAccount(d.controlAccountId, companyId);
      if (!control) {
        res.status(400).json({ error: "الحساب الرئيسي غير موجود" });
        return;
      }
      if (!control.isGroup) {
        res.status(400).json({ error: "يجب اختيار حساب تجميعي كحساب رئيسي" });
        return;
      }
      const [dupe] = await db
        .select({ id: suppliersTable.id })
        .from(suppliersTable)
        .where(
          and(
            eq(suppliersTable.companyId, companyId),
            eq(suppliersTable.code, d.code),
          ),
        )
        .limit(1);
      if (dupe) {
        res.status(409).json({ error: "كود المورد مستخدم بالفعل" });
        return;
      }
      const created = await db.transaction(async (tx) => {
        const childCode = await generateChildAccountCode(
          tx,
          companyId,
          control.id,
          control.code,
        );
        const [account] = await tx
          .insert(accountsTable)
          .values({
            companyId,
            code: childCode,
            nameAr: d.nameAr,
            nameEn: d.nameEn ?? null,
            type: control.type,
            parentId: control.id,
            isGroup: false,
          })
          .returning();
        const [supplier] = await tx
          .insert(suppliersTable)
          .values({
            companyId,
            code: d.code,
            nameAr: d.nameAr,
            nameEn: d.nameEn ?? null,
            type: d.type,
            taxNumber: d.taxNumber ?? null,
            commercialRegistration: d.commercialRegistration ?? null,
            phone: d.phone ?? null,
            email: d.email ?? null,
            address: d.address ?? null,
            currency: d.currency ?? null,
            creditPeriodDays: d.creditPeriodDays ?? null,
            controlAccountId: control.id,
            accountId: account!.id,
            isActive: d.isActive ?? true,
          })
          .returning();
        return { supplier: supplier!, accountCode: account!.code };
      });
      res
        .status(201)
        .json(toSupplier(created.supplier, created.accountCode, 0));
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "كود المورد مستخدم بالفعل" });
        return;
      }
      req.log.error({ err }, "Failed to create supplier");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.patch(
  "/suppliers/:id",
  requireAuth,
  requireCapability("suppliers:update"),
  async (req, res) => {
    const id = req.params["id"] as string;
    if (!id) {
      res.status(400).json({ error: "معرّف غير صحيح" });
      return;
    }
    const parsed = UpdateSupplierBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const d = parsed.data;
    try {
      const [existing] = await db
        .select()
        .from(suppliersTable)
        .where(
          and(
            eq(suppliersTable.id, id),
            eq(suppliersTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "المورد غير موجود" });
        return;
      }

      let control: { id: string; code: string; type: string } | null = null;
      if (
        d.controlAccountId !== undefined &&
        d.controlAccountId !== existing.controlAccountId
      ) {
        const c = await loadControlAccount(d.controlAccountId, companyId);
        if (!c) {
          res.status(400).json({ error: "الحساب الرئيسي غير موجود" });
          return;
        }
        if (!c.isGroup) {
          res.status(400).json({ error: "يجب اختيار حساب تجميعي كحساب رئيسي" });
          return;
        }
        control = c;
      }

      const updates: Partial<typeof suppliersTable.$inferInsert> = {};
      if (d.code !== undefined) updates.code = d.code;
      if (d.nameAr !== undefined) updates.nameAr = d.nameAr;
      if (d.nameEn !== undefined) updates.nameEn = d.nameEn;
      if (d.type !== undefined) updates.type = d.type;
      if (d.taxNumber !== undefined) updates.taxNumber = d.taxNumber;
      if (d.commercialRegistration !== undefined)
        updates.commercialRegistration = d.commercialRegistration;
      if (d.phone !== undefined) updates.phone = d.phone;
      if (d.email !== undefined) updates.email = d.email;
      if (d.address !== undefined) updates.address = d.address;
      if (d.currency !== undefined) updates.currency = d.currency;
      if (d.creditPeriodDays !== undefined)
        updates.creditPeriodDays = d.creditPeriodDays;
      if (d.isActive !== undefined) updates.isActive = d.isActive;
      if (control) updates.controlAccountId = control.id;

      const updated = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(suppliersTable)
          .set(updates)
          .where(
            and(
              eq(suppliersTable.id, id),
              eq(suppliersTable.companyId, companyId),
            ),
          )
          .returning();
        const accountUpdates: Partial<typeof accountsTable.$inferInsert> = {};
        if (d.nameAr !== undefined) accountUpdates.nameAr = d.nameAr;
        if (d.nameEn !== undefined) accountUpdates.nameEn = d.nameEn;
        if (control) {
          accountUpdates.parentId = control.id;
          accountUpdates.type = control.type;
        }
        if (Object.keys(accountUpdates).length > 0) {
          await tx
            .update(accountsTable)
            .set(accountUpdates)
            .where(
              and(
                eq(accountsTable.id, existing.accountId),
                eq(accountsTable.companyId, companyId),
              ),
            );
        }
        const [acc] = await tx
          .select({ code: accountsTable.code })
          .from(accountsTable)
          .where(
            and(
              eq(accountsTable.id, existing.accountId),
              eq(accountsTable.companyId, companyId),
            ),
          )
          .limit(1);
        return { row: row!, accountCode: acc!.code };
      });

      const balances = await postedBalancesByAccount(companyId);
      const b = balances.get(existing.accountId);
      const balance = b ? b.credit - b.debit : 0;
      res.json(toSupplier(updated.row, updated.accountCode, balance));
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "كود المورد مستخدم بالفعل" });
        return;
      }
      req.log.error({ err }, "Failed to update supplier");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.delete(
  "/suppliers/:id",
  requireAuth,
  requireCapability("suppliers:delete"),
  async (req, res) => {
    const id = req.params["id"] as string;
    if (!id) {
      res.status(400).json({ error: "معرّف غير صحيح" });
      return;
    }
    const companyId = req.auth!.companyId;
    try {
      const [existing] = await db
        .select()
        .from(suppliersTable)
        .where(
          and(
            eq(suppliersTable.id, id),
            eq(suppliersTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "المورد غير موجود" });
        return;
      }
      const [{ cnt }] = await db
        .select({ cnt: sql<number>`count(*)::int` })
        .from(journalEntryLinesTable)
        .where(
          and(
            eq(journalEntryLinesTable.companyId, companyId),
            eq(journalEntryLinesTable.accountId, existing.accountId),
          ),
        );
      if (cnt > 0) {
        res.status(400).json({
          error: "لا يمكن حذف مورد له حركات مالية مرتبطة بحسابه",
        });
        return;
      }
      await db.transaction(async (tx) => {
        await tx
          .delete(suppliersTable)
          .where(
            and(
              eq(suppliersTable.id, id),
              eq(suppliersTable.companyId, companyId),
            ),
          );
        await tx
          .delete(accountsTable)
          .where(
            and(
              eq(accountsTable.id, existing.accountId),
              eq(accountsTable.companyId, companyId),
            ),
          );
      });
      res.json({ status: "ok" });
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        res.status(400).json({
          error: "لا يمكن حذف مورد له حركات مالية مرتبطة بحسابه",
        });
        return;
      }
      req.log.error({ err }, "Failed to delete supplier");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
