import { Router } from "express";
import { and, eq, asc } from "drizzle-orm";
import {
  db,
  accountsTable,
  currenciesTable,
  companiesTable,
  type Account,
} from "@workspace/db";
import { CreateAccountBody, UpdateAccountBody } from "@workspace/api-zod";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import { seedDefaultAccounts } from "../lib/seed-accounts";
import { exportWorkbook, handleXlsxUpload, parseSheet } from "../lib/excel";

const ACCOUNT_TYPES = [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
] as const;
type AccountTypeEnum = (typeof ACCOUNT_TYPES)[number];

const router = Router();

function toAccount(row: Account) {
  return {
    id: row.id,
    code: row.code,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    type: row.type,
    currencyType: row.currencyType ?? "base",
    currency: row.currency,
    parentId: row.parentId,
    isGroup: row.isGroup,
    createdAt: row.createdAt.toISOString(),
  };
}

const CURRENCY_TYPES = ["base", "fixed", "multi"] as const;

// Normalizes the currency type + assigned currency for an account write: fixed
// accounts require an explicit currency; base/multi accounts never carry one.
function normalizeAccountCurrency(input: {
  currencyType?: string | null;
  currency?: string | null;
}): { currencyType: string; currency: string | null } | { error: string } {
  const currencyType = input.currencyType ?? "base";
  if (!CURRENCY_TYPES.includes(currencyType as (typeof CURRENCY_TYPES)[number])) {
    return { error: "نوع عملة الحساب غير صحيح" };
  }
  if (currencyType === "fixed") {
    const currency = (input.currency ?? "").trim();
    if (!currency) {
      return { error: "يجب تحديد العملة للحساب ذو العملة الثابتة" };
    }
    return { currencyType, currency };
  }
  return { currencyType, currency: null };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  );
}

// Validates that a fixed account's assigned currency is the company base
// currency or an active company currency. Returns true when acceptable.
async function fixedCurrencyIsValid(
  currency: string,
  companyId: string,
): Promise<boolean> {
  const [company] = await db
    .select({ baseCurrency: companiesTable.baseCurrency })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);
  if (company && company.baseCurrency === currency) return true;
  const rows = await db
    .select({ id: currenciesTable.id })
    .from(currenciesTable)
    .where(
      and(
        eq(currenciesTable.companyId, companyId),
        eq(currenciesTable.code, currency),
        eq(currenciesTable.isActive, true),
      ),
    )
    .limit(1);
  return rows.length > 0;
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

router.post(
  "/accounts/seed-defaults",
  requireAuth,
  requireCapability("accounts:create"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    try {
      const existing = await db
        .select({ id: accountsTable.id })
        .from(accountsTable)
        .where(eq(accountsTable.companyId, companyId))
        .limit(1);
      if (existing.length > 0) {
        res.status(409).json({ error: "يوجد دليل حسابات بالفعل" });
        return;
      }
      const rows = await db.transaction(async (tx) => {
        await seedDefaultAccounts(tx, companyId);
        return tx
          .select()
          .from(accountsTable)
          .where(eq(accountsTable.companyId, companyId))
          .orderBy(asc(accountsTable.code));
      });
      res.status(201).json(rows.map(toAccount));
    } catch (err) {
      req.log.error({ err }, "Failed to seed default accounts");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

router.post("/accounts", requireAuth, requireCapability("accounts:create"), async (req, res) => {
  const parsed = CreateAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
    return;
  }
  const parentId = parsed.data.parentId ?? null;
  const cur = normalizeAccountCurrency(parsed.data);
  if ("error" in cur) {
    res.status(400).json({ error: cur.error });
    return;
  }
  try {
    if (
      parentId &&
      !(await parentBelongsToCompany(parentId, req.auth!.companyId))
    ) {
      res.status(400).json({ error: "الحساب الرئيسي غير موجود" });
      return;
    }
    if (
      cur.currency &&
      !(await fixedCurrencyIsValid(cur.currency, req.auth!.companyId))
    ) {
      res.status(400).json({ error: "العملة المحددة غير مفعّلة" });
      return;
    }
    const [row] = await db
      .insert(accountsTable)
      .values({
        companyId: req.auth!.companyId,
        code: parsed.data.code,
        nameAr: parsed.data.nameAr,
        nameEn: parsed.data.nameEn ?? null,
        type: parsed.data.type,
        currencyType: cur.currencyType,
        currency: cur.currency,
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

router.patch("/accounts/:id", requireAuth, requireCapability("accounts:update"), async (req, res) => {
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
  if (parsed.data.nameAr !== undefined) updates["nameAr"] = parsed.data.nameAr;
  if (parsed.data.nameEn !== undefined) updates["nameEn"] = parsed.data.nameEn;
  if (parsed.data.type !== undefined) updates["type"] = parsed.data.type;
  let fixedCurrencyToValidate: string | null = null;
  if (parsed.data.currencyType !== undefined) {
    const cur = normalizeAccountCurrency(parsed.data);
    if ("error" in cur) {
      res.status(400).json({ error: cur.error });
      return;
    }
    updates["currencyType"] = cur.currencyType;
    updates["currency"] = cur.currency;
    fixedCurrencyToValidate = cur.currency;
  }
  if (parsed.data.parentId !== undefined)
    updates["parentId"] = parsed.data.parentId;
  if (parsed.data.isGroup !== undefined)
    updates["isGroup"] = parsed.data.isGroup;
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "لا توجد بيانات للتحديث" });
    return;
  }
  try {
    if (
      fixedCurrencyToValidate &&
      !(await fixedCurrencyIsValid(fixedCurrencyToValidate, req.auth!.companyId))
    ) {
      res.status(400).json({ error: "العملة المحددة غير مفعّلة" });
      return;
    }
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

router.delete("/accounts/:id", requireAuth, requireCapability("accounts:delete"), async (req, res) => {
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

// ---- Excel export / import -------------------------------------------------

// Streams all of the company's accounts as an .xlsx workbook (round-trips the
// import format; parentCode resolves the parent's code, blank for roots).
router.get(
  "/accounts/export",
  requireAuth,
  requireCapability("accounts:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    try {
      const rows = await db
        .select()
        .from(accountsTable)
        .where(eq(accountsTable.companyId, companyId))
        .orderBy(asc(accountsTable.code));
      const idToCode = new Map(rows.map((r) => [r.id, r.code]));
      await exportWorkbook(res, {
        sheetName: "Accounts",
        fileName: "accounts-export",
        columns: [
          { header: "code", value: (r) => r.code },
          { header: "nameAr", value: (r) => r.nameAr },
          { header: "nameEn", value: (r) => r.nameEn ?? "" },
          { header: "type", value: (r) => r.type },
          { header: "isGroup", value: (r) => (r.isGroup ? "true" : "false") },
          {
            header: "parentCode",
            value: (r) => (r.parentId ? idToCode.get(r.parentId) ?? "" : ""),
          },
        ],
        rows,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to export accounts");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// Bulk-creates accounts from an .xlsx (round-trips the export format). Rows are
// topologically ordered so a parent (existing or earlier in the file) is always
// inserted before its children. All-or-nothing: any invalid row aborts.
router.post(
  "/accounts/import",
  requireAuth,
  requireCapability("accounts:create"),
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
      if (!sheet.has("code") || !sheet.has("nameAr") || !sheet.has("type")) {
        res.status(400).json({
          error: "صيغة الملف غير صحيحة. الأعمدة المطلوبة: code, nameAr, type",
        });
        return;
      }

      // Existing accounts of this company (for duplicate + parent resolution).
      const existingAccounts = await db
        .select({
          id: accountsTable.id,
          code: accountsTable.code,
          isGroup: accountsTable.isGroup,
        })
        .from(accountsTable)
        .where(eq(accountsTable.companyId, companyId));
      const existingByCode = new Map(existingAccounts.map((a) => [a.code, a]));

      const truthy = (v: string) =>
        ["true", "1", "yes", "y", "نعم"].includes(v.trim().toLowerCase());

      type Row = {
        rowNo: number;
        code: string;
        nameAr: string;
        nameEn: string | null;
        type: AccountTypeEnum;
        isGroup: boolean;
        parentCode: string | null;
      };
      const parsed: Row[] = [];
      const byCode = new Map<string, Row>();
      for (const { rowNo, row } of sheet.rows) {
        const code = sheet.str(row, "code");
        const nameAr = sheet.str(row, "nameAr");
        const typeRaw = sheet.str(row, "type");
        if (!code && !nameAr && !typeRaw) continue; // skip blank rows
        if (!code || !nameAr) {
          res
            .status(400)
            .json({ error: `السطر ${rowNo}: code و nameAr مطلوبان` });
          return;
        }
        if (!ACCOUNT_TYPES.includes(typeRaw as AccountTypeEnum)) {
          res.status(400).json({
            error: `السطر ${rowNo}: نوع الحساب ${typeRaw} غير صحيح`,
          });
          return;
        }
        if (byCode.has(code) || existingByCode.has(code)) {
          res
            .status(400)
            .json({ error: `السطر ${rowNo}: رمز الحساب ${code} مكرر` });
          return;
        }
        const parentCode = sheet.str(row, "parentCode") || null;
        const r: Row = {
          rowNo,
          code,
          nameAr,
          nameEn: sheet.str(row, "nameEn") || null,
          type: typeRaw as AccountTypeEnum,
          isGroup: sheet.has("isGroup") ? truthy(sheet.str(row, "isGroup")) : false,
          parentCode,
        };
        parsed.push(r);
        byCode.set(code, r);
      }
      if (parsed.length === 0) {
        res.status(400).json({ error: "الملف لا يحتوي على حسابات" });
        return;
      }

      // Validate parent references (must exist in file or DB, and be a group).
      for (const r of parsed) {
        if (!r.parentCode) continue;
        if (r.parentCode === r.code) {
          res.status(400).json({
            error: `السطر ${r.rowNo}: لا يمكن أن يكون الحساب رئيساً لنفسه`,
          });
          return;
        }
        const fileParent = byCode.get(r.parentCode);
        const dbParent = existingByCode.get(r.parentCode);
        if (!fileParent && !dbParent) {
          res.status(400).json({
            error: `السطر ${r.rowNo}: الحساب الرئيسي ${r.parentCode} غير موجود`,
          });
          return;
        }
        const parentIsGroup = fileParent ? fileParent.isGroup : dbParent!.isGroup;
        if (!parentIsGroup) {
          res.status(400).json({
            error: `السطر ${r.rowNo}: ${r.parentCode} ليس حسابًا تجميعيًا`,
          });
          return;
        }
      }

      // Topological depth so parents always precede children at insert time.
      const depthCache = new Map<string, number>();
      const depthOf = (code: string, stack: Set<string>): number => {
        const cached = depthCache.get(code);
        if (cached !== undefined) return cached;
        const r = byCode.get(code);
        // Not in the file → an existing DB account, treat as a root for ordering.
        if (!r || !r.parentCode || !byCode.has(r.parentCode)) {
          depthCache.set(code, 0);
          return 0;
        }
        if (stack.has(code)) {
          throw new Error(`CYCLE:${r.rowNo}`);
        }
        stack.add(code);
        const d = 1 + depthOf(r.parentCode, stack);
        stack.delete(code);
        depthCache.set(code, d);
        return d;
      };
      try {
        for (const r of parsed) depthOf(r.code, new Set());
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("CYCLE:")) {
          const rowNo = e.message.slice("CYCLE:".length);
          res.status(400).json({
            error: `السطر ${rowNo}: يوجد تسلسل دائري في الحسابات الرئيسية`,
          });
          return;
        }
        throw e;
      }
      const ordered = [...parsed].sort(
        (a, b) => depthCache.get(a.code)! - depthCache.get(b.code)!,
      );

      await db.transaction(async (tx) => {
        const codeToId = new Map<string, string>(
          existingAccounts.map((a) => [a.code, a.id]),
        );
        for (const r of ordered) {
          const parentId = r.parentCode
            ? codeToId.get(r.parentCode) ?? null
            : null;
          const [account] = await tx
            .insert(accountsTable)
            .values({
              companyId,
              code: r.code,
              nameAr: r.nameAr,
              nameEn: r.nameEn,
              type: r.type,
              parentId,
              isGroup: r.isGroup,
            })
            .returning();
          codeToId.set(r.code, account!.id);
        }
      });
      res.json({ imported: parsed.length });
    } catch (err) {
      req.log.error({ err }, "Failed to import accounts");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
