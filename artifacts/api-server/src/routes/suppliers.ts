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
import { safeAudit } from "../lib/audit";
import { generateEntityCode, todayDate } from "../lib/codes";
import {
  generateChildAccountCode,
  loadControlAccount,
  postedBalancesByAccount,
  isUniqueViolation,
  isForeignKeyViolation,
} from "../lib/party-ledger";
import { exportWorkbook, handleXlsxUpload, parseSheet } from "../lib/excel";

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
    governorate: row.governorate,
    city: row.city,
    postalCode: row.postalCode,
    streetAddress: row.streetAddress,
    eInvoiceEnabled: row.eInvoiceEnabled,
    gln: row.gln,
    externalErpCode: row.externalErpCode,
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
      const created = await db.transaction(async (tx) => {
        const code = await generateEntityCode(
          tx,
          companyId,
          "supplier",
          todayDate(),
        );
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
            code,
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
      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "create",
          entity: "supplier",
          entityId: created.supplier.id,
          entityLabel: `${created.supplier.code} - ${created.supplier.nameAr}`,
          newValue: {
            code: created.supplier.code,
            nameAr: created.supplier.nameAr,
            type: created.supplier.type,
          },
        },
        req.log,
      );
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
      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "update",
          entity: "supplier",
          entityId: updated.row.id,
          entityLabel: `${updated.row.code} - ${updated.row.nameAr}`,
          oldValue: {
            code: existing.code,
            nameAr: existing.nameAr,
            type: existing.type,
          },
          newValue: {
            code: updated.row.code,
            nameAr: updated.row.nameAr,
            type: updated.row.type,
          },
        },
        req.log,
      );
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
      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "delete",
          entity: "supplier",
          entityId: existing.id,
          entityLabel: `${existing.code} - ${existing.nameAr}`,
          oldValue: {
            code: existing.code,
            nameAr: existing.nameAr,
            type: existing.type,
          },
        },
        req.log,
      );
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

// ---- Excel export / import -------------------------------------------------

router.get(
  "/suppliers/export",
  requireAuth,
  requireCapability("suppliers:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    try {
      const rows = await db
        .select({
          supplier: suppliersTable,
          accountCode: accountsTable.code,
          controlCode: sql<string>`(
            select c.code from ${accountsTable} c
            where c.id = ${suppliersTable.controlAccountId}
          )`,
        })
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
      await exportWorkbook(res, {
        sheetName: "Suppliers",
        fileName: "suppliers-export",
        columns: [
          { header: "code", value: (r) => r.supplier.code },
          { header: "nameAr", value: (r) => r.supplier.nameAr },
          { header: "nameEn", value: (r) => r.supplier.nameEn ?? "" },
          { header: "type", value: (r) => r.supplier.type },
          { header: "taxNumber", value: (r) => r.supplier.taxNumber ?? "" },
          {
            header: "commercialRegistration",
            value: (r) => r.supplier.commercialRegistration ?? "",
          },
          { header: "phone", value: (r) => r.supplier.phone ?? "" },
          { header: "email", value: (r) => r.supplier.email ?? "" },
          { header: "address", value: (r) => r.supplier.address ?? "" },
          { header: "currency", value: (r) => r.supplier.currency ?? "" },
          {
            header: "creditPeriodDays",
            value: (r) => r.supplier.creditPeriodDays ?? "",
          },
          { header: "controlAccountCode", value: (r) => r.controlCode ?? "" },
          {
            header: "balance",
            value: (r) => {
              const b = balances.get(r.supplier.accountId);
              return round2(b ? b.credit - b.debit : 0);
            },
          },
        ],
        rows,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to export suppliers");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.post(
  "/suppliers/import",
  requireAuth,
  requireCapability("suppliers:create"),
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
        .select({ code: suppliersTable.code })
        .from(suppliersTable)
        .where(eq(suppliersTable.companyId, companyId));
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
        creditPeriodDays: number | null;
        control: { id: string; code: string; type: string };
      };
      const parsed: Row[] = [];
      const seen = new Set<string>();
      for (const { rowNo, row } of sheet.rows) {
        const code = sheet.str(row, "code");
        const nameAr = sheet.str(row, "nameAr");
        if (!code && !nameAr) continue;
        if (!code || !nameAr) {
          res.status(400).json({ error: `السطر ${rowNo}: code و nameAr مطلوبان` });
          return;
        }
        if (seen.has(code) || existingCodes.has(code)) {
          res.status(400).json({ error: `السطر ${rowNo}: كود المورد ${code} مكرر` });
          return;
        }
        const controlCode = sheet.str(row, "controlAccountCode");
        if (!controlCode) {
          res.status(400).json({ error: `السطر ${rowNo}: controlAccountCode مطلوب` });
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
          commercialRegistration: sheet.str(row, "commercialRegistration") || null,
          phone: sheet.str(row, "phone") || null,
          email: sheet.str(row, "email") || null,
          address: sheet.str(row, "address") || null,
          currency: sheet.str(row, "currency") || null,
          creditPeriodDays: creditPeriod ? sheet.num(row, "creditPeriodDays") : null,
          control: { id: control.id, code: control.code, type: control.type },
        });
      }
      if (parsed.length === 0) {
        res.status(400).json({ error: "الملف لا يحتوي على موردين" });
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
          await tx.insert(suppliersTable).values({
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
            creditPeriodDays: r.creditPeriodDays,
            controlAccountId: r.control.id,
            accountId: account!.id,
            isActive: true,
          });
        }
      });
      await safeAudit(
        db,
        {
          companyId,
          userId: req.auth!.userId,
          action: "import",
          entity: "supplier",
          entityLabel: `${parsed.length} مورد`,
          newValue: { imported: parsed.length },
        },
        req.log,
      );
      res.json({ imported: parsed.length });
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "يوجد كود مورد مكرر في الملف" });
        return;
      }
      req.log.error({ err }, "Failed to import suppliers");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
