import { Router } from "express";
import { and, eq, asc, sql } from "drizzle-orm";
import {
  db,
  customersTable,
  accountsTable,
  journalEntryLinesTable,
  type Customer,
} from "@workspace/db";
import { CreateCustomerBody, UpdateCustomerBody } from "@workspace/api-zod";
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

function toCustomer(
  row: Customer,
  accountCode: string,
  balance: number,
) {
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
    creditLimit: row.creditLimit === null ? null : Number(row.creditLimit),
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
  "/customers",
  requireAuth,
  requireCapability("customers:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    try {
      const rows = await db
        .select({ customer: customersTable, accountCode: accountsTable.code })
        .from(customersTable)
        .innerJoin(
          accountsTable,
          and(
            eq(accountsTable.id, customersTable.accountId),
            eq(accountsTable.companyId, companyId),
          ),
        )
        .where(eq(customersTable.companyId, companyId))
        .orderBy(asc(customersTable.code));
      const balances = await postedBalancesByAccount(companyId);
      res.json(
        rows.map(({ customer, accountCode }) => {
          const b = balances.get(customer.accountId);
          // Receivables are assets → balance = debit − credit.
          const balance = b ? b.debit - b.credit : 0;
          return toCustomer(customer, accountCode, balance);
        }),
      );
    } catch (err) {
      req.log.error({ err }, "Failed to list customers");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.post(
  "/customers",
  requireAuth,
  requireCapability("customers:create"),
  async (req, res) => {
    const parsed = CreateCustomerBody.safeParse(req.body);
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
        .select({ id: customersTable.id })
        .from(customersTable)
        .where(
          and(
            eq(customersTable.companyId, companyId),
            eq(customersTable.code, d.code),
          ),
        )
        .limit(1);
      if (dupe) {
        res.status(409).json({ error: "كود العميل مستخدم بالفعل" });
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
        const [customer] = await tx
          .insert(customersTable)
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
            creditLimit:
              d.creditLimit === undefined || d.creditLimit === null
                ? null
                : String(d.creditLimit),
            creditPeriodDays: d.creditPeriodDays ?? null,
            controlAccountId: control.id,
            accountId: account!.id,
            isActive: d.isActive ?? true,
          })
          .returning();
        return { customer: customer!, accountCode: account!.code };
      });
      res
        .status(201)
        .json(toCustomer(created.customer, created.accountCode, 0));
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "كود العميل مستخدم بالفعل" });
        return;
      }
      req.log.error({ err }, "Failed to create customer");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.patch(
  "/customers/:id",
  requireAuth,
  requireCapability("customers:update"),
  async (req, res) => {
    const id = req.params["id"] as string;
    if (!id) {
      res.status(400).json({ error: "معرّف غير صحيح" });
      return;
    }
    const parsed = UpdateCustomerBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const d = parsed.data;
    try {
      const [existing] = await db
        .select()
        .from(customersTable)
        .where(
          and(
            eq(customersTable.id, id),
            eq(customersTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "العميل غير موجود" });
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

      const updates: Partial<typeof customersTable.$inferInsert> = {};
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
      if (d.creditLimit !== undefined)
        updates.creditLimit =
          d.creditLimit === null ? null : String(d.creditLimit);
      if (d.creditPeriodDays !== undefined)
        updates.creditPeriodDays = d.creditPeriodDays;
      if (d.isActive !== undefined) updates.isActive = d.isActive;
      if (control) updates.controlAccountId = control.id;

      const updated = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(customersTable)
          .set(updates)
          .where(
            and(
              eq(customersTable.id, id),
              eq(customersTable.companyId, companyId),
            ),
          )
          .returning();
        // Keep the subsidiary account in sync with the party's name and parent.
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
      const balance = b ? b.debit - b.credit : 0;
      res.json(toCustomer(updated.row, updated.accountCode, balance));
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "كود العميل مستخدم بالفعل" });
        return;
      }
      req.log.error({ err }, "Failed to update customer");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.delete(
  "/customers/:id",
  requireAuth,
  requireCapability("customers:delete"),
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
        .from(customersTable)
        .where(
          and(
            eq(customersTable.id, id),
            eq(customersTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "العميل غير موجود" });
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
          error: "لا يمكن حذف عميل له حركات مالية مرتبطة بحسابه",
        });
        return;
      }
      await db.transaction(async (tx) => {
        await tx
          .delete(customersTable)
          .where(
            and(
              eq(customersTable.id, id),
              eq(customersTable.companyId, companyId),
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
          error: "لا يمكن حذف عميل له حركات مالية مرتبطة بحسابه",
        });
        return;
      }
      req.log.error({ err }, "Failed to delete customer");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
