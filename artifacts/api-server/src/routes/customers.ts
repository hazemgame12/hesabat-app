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
import {
  exportWorkbook,
  handleXlsxUpload,
  parseSheet,
} from "../lib/excel";

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

// ---- Excel export / import -------------------------------------------------

// Streams all of the company's customers as an .xlsx workbook (round-trips the
// import format; balance/accountCode are informational extras).
router.get(
  "/customers/export",
  requireAuth,
  requireCapability("customers:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    try {
      const rows = await db
        .select({
          customer: customersTable,
          accountCode: accountsTable.code,
          controlCode: sql<string>`(
            select c.code from ${accountsTable} c
            where c.id = ${customersTable.controlAccountId}
          )`,
        })
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
      await exportWorkbook(res, {
        sheetName: "Customers",
        fileName: "customers-export",
        columns: [
          { header: "code", value: (r) => r.customer.code },
          { header: "nameAr", value: (r) => r.customer.nameAr },
          { header: "nameEn", value: (r) => r.customer.nameEn ?? "" },
          { header: "type", value: (r) => r.customer.type },
          { header: "taxNumber", value: (r) => r.customer.taxNumber ?? "" },
          {
            header: "commercialRegistration",
            value: (r) => r.customer.commercialRegistration ?? "",
          },
          { header: "phone", value: (r) => r.customer.phone ?? "" },
          { header: "email", value: (r) => r.customer.email ?? "" },
          { header: "address", value: (r) => r.customer.address ?? "" },
          { header: "currency", value: (r) => r.customer.currency ?? "" },
          {
            header: "creditLimit",
            value: (r) =>
              r.customer.creditLimit === null
                ? ""
                : Number(r.customer.creditLimit),
          },
          {
            header: "creditPeriodDays",
            value: (r) => r.customer.creditPeriodDays ?? "",
          },
          { header: "controlAccountCode", value: (r) => r.controlCode ?? "" },
          {
            header: "balance",
            value: (r) => {
              const b = balances.get(r.customer.accountId);
              return round2(b ? b.debit - b.credit : 0);
            },
          },
        ],
        rows,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to export customers");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// Bulk-creates customers from an .xlsx (round-trips the export format). Each row
// becomes a customer + its subsidiary account under the given control account.
// All-or-nothing: any invalid row aborts the whole import.
router.post(
  "/customers/import",
  requireAuth,
  requireCapability("customers:create"),
  handleXlsxUpload,
  async (req, res) => {
    const companyId = req.auth!.companyId;
    if (!req.file) {
      res.status(400).json({ error: "لم يتم رفع أي ملف" });
      return;
    }
    try {
      const sheet = await parseSheet(req.file.buffer);
      if (!sheet) {
        res.status(400).json({ error: "الملف لا يحتوي على بيانات" });
        return;
      }
      if (!sheet.has("code") || !sheet.has("nameAr")) {
        res.status(400).json({
          error: "صيغة الملف غير صحيحة. الأعمدة المطلوبة: code, nameAr, controlAccountCode",
        });
        return;
      }

      // Resolve control accounts by code (must be group accounts).
      const groupAccounts = await db
        .select({
          id: accountsTable.id,
          code: accountsTable.code,
          type: accountsTable.type,
          isGroup: accountsTable.isGroup,
        })
        .from(accountsTable)
        .where(eq(accountsTable.companyId, companyId));
      const accByCode = new Map(groupAccounts.map((a) => [a.code, a]));
      const existing = await db
        .select({ code: customersTable.code })
        .from(customersTable)
        .where(eq(customersTable.companyId, companyId));
      const existingCodes = new Set(existing.map((e) => e.code));

      type Row = {
        code: string;
        nameAr: string;
        nameEn: string | null;
        type: "individual" | "company";
        taxNumber: string | null;
        commercialRegistration: string | null;
        phone: string | null;
        email: string | null;
        address: string | null;
        currency: string | null;
        creditLimit: number | null;
        creditPeriodDays: number | null;
        control: { id: string; code: string; type: string };
      };
      const parsed: Row[] = [];
      const seen = new Set<string>();
      for (const { rowNo, row } of sheet.rows) {
        const code = sheet.str(row, "code");
        const nameAr = sheet.str(row, "nameAr");
        if (!code && !nameAr) continue; // skip blank rows
        if (!code || !nameAr) {
          res.status(400).json({ error: `السطر ${rowNo}: code و nameAr مطلوبان` });
          return;
        }
        if (seen.has(code) || existingCodes.has(code)) {
          res.status(400).json({ error: `السطر ${rowNo}: كود العميل ${code} مكرر` });
          return;
        }
        const controlCode = sheet.str(row, "controlAccountCode");
        if (!controlCode) {
          res.status(400).json({
            error: `السطر ${rowNo}: controlAccountCode مطلوب`,
          });
          return;
        }
        const control = accByCode.get(controlCode);
        if (!control) {
          res.status(400).json({
            error: `السطر ${rowNo}: الحساب الرئيسي ${controlCode} غير موجود`,
          });
          return;
        }
        if (!control.isGroup) {
          res.status(400).json({
            error: `السطر ${rowNo}: ${controlCode} ليس حسابًا تجميعيًا`,
          });
          return;
        }
        const typeRaw = sheet.str(row, "type");
        const creditLimit = sheet.has("creditLimit")
          ? sheet.str(row, "creditLimit")
          : "";
        const creditPeriod = sheet.has("creditPeriodDays")
          ? sheet.str(row, "creditPeriodDays")
          : "";
        seen.add(code);
        parsed.push({
          code,
          nameAr,
          nameEn: sheet.str(row, "nameEn") || null,
          type: typeRaw === "individual" ? "individual" : "company",
          taxNumber: sheet.str(row, "taxNumber") || null,
          commercialRegistration:
            sheet.str(row, "commercialRegistration") || null,
          phone: sheet.str(row, "phone") || null,
          email: sheet.str(row, "email") || null,
          address: sheet.str(row, "address") || null,
          currency: sheet.str(row, "currency") || null,
          creditLimit: creditLimit ? sheet.num(row, "creditLimit") : null,
          creditPeriodDays: creditPeriod ? sheet.num(row, "creditPeriodDays") : null,
          control: { id: control.id, code: control.code, type: control.type },
        });
      }
      if (parsed.length === 0) {
        res.status(400).json({ error: "الملف لا يحتوي على عملاء" });
        return;
      }

      await db.transaction(async (tx) => {
        for (const r of parsed) {
          const childCode = await generateChildAccountCode(
            tx,
            companyId,
            r.control.id,
            r.control.code,
          );
          const [account] = await tx
            .insert(accountsTable)
            .values({
              companyId,
              code: childCode,
              nameAr: r.nameAr,
              nameEn: r.nameEn,
              type: r.control.type,
              parentId: r.control.id,
              isGroup: false,
            })
            .returning();
          await tx.insert(customersTable).values({
            companyId,
            code: r.code,
            nameAr: r.nameAr,
            nameEn: r.nameEn,
            type: r.type,
            taxNumber: r.taxNumber,
            commercialRegistration: r.commercialRegistration,
            phone: r.phone,
            email: r.email,
            address: r.address,
            currency: r.currency,
            creditLimit: r.creditLimit === null ? null : String(r.creditLimit),
            creditPeriodDays: r.creditPeriodDays,
            controlAccountId: r.control.id,
            accountId: account!.id,
            isActive: true,
          });
        }
      });
      res.json({ imported: parsed.length });
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "يوجد كود عميل مكرر في الملف" });
        return;
      }
      req.log.error({ err }, "Failed to import customers");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
