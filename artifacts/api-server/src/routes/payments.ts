import { Router } from "express";
import { and, eq, inArray, desc, sql } from "drizzle-orm";
import {
  db,
  paymentsTable,
  paymentAllocationsTable,
  invoicesTable,
  customersTable,
  suppliersTable,
  accountsTable,
  companiesTable,
  journalEntriesTable,
  type Payment,
} from "@workspace/db";
import { CreatePaymentBody } from "@workspace/api-zod";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import {
  createDraftJournalEntry,
  lockCompanyEntryNo,
} from "../lib/journal-posting";
import { round2 } from "../lib/inventory-posting";

const router = Router();

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const MONEY_EPS = 0.005;

async function loadBaseCurrency(companyId: string): Promise<string> {
  const [company] = await db
    .select({ baseCurrency: companiesTable.baseCurrency })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);
  return (company?.baseCurrency || "EGP").toUpperCase();
}

async function isLeafAccount(
  accountId: string,
  companyId: string,
): Promise<boolean> {
  const [acc] = await db
    .select({ isGroup: accountsTable.isGroup })
    .from(accountsTable)
    .where(
      and(
        eq(accountsTable.id, accountId),
        eq(accountsTable.companyId, companyId),
      ),
    )
    .limit(1);
  return !!acc && !acc.isGroup;
}

// Allocates the next per-(company, kind) payment number under an advisory lock.
async function nextPaymentNo(
  tx: Tx,
  companyId: string,
  kind: string,
): Promise<number> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${companyId + ":pay:" + kind}))`,
  );
  const [{ maxNo }] = await tx
    .select({ maxNo: sql<number>`coalesce(max(${paymentsTable.paymentNo}), 0)` })
    .from(paymentsTable)
    .where(
      and(eq(paymentsTable.companyId, companyId), eq(paymentsTable.kind, kind)),
    );
  return Number(maxNo) + 1;
}

function invoiceStatusFor(total: number, amountPaid: number): string {
  if (amountPaid >= total - MONEY_EPS) return "paid";
  if (amountPaid > MONEY_EPS) return "partially_paid";
  return "approved";
}

// ---- List ----
router.get(
  "/payments",
  requireAuth,
  requireCapability("payments:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const kind = req.query["kind"];
    if (kind !== "collection" && kind !== "payment") {
      res.status(400).json({ error: "نوع العملية غير صحيح" });
      return;
    }
    try {
      const rows = await db
        .select()
        .from(paymentsTable)
        .where(
          and(
            eq(paymentsTable.companyId, companyId),
            eq(paymentsTable.kind, kind),
          ),
        )
        .orderBy(desc(paymentsTable.paymentNo));
      res.json(await serializePayments(rows, companyId));
    } catch (err) {
      req.log.error({ err }, "Failed to list payments");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// Serializes payments with party names, cash account names, and allocations.
async function serializePayments(rows: Payment[], companyId: string) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const allocs = await db
    .select({
      id: paymentAllocationsTable.id,
      paymentId: paymentAllocationsTable.paymentId,
      invoiceId: paymentAllocationsTable.invoiceId,
      amount: paymentAllocationsTable.amount,
      invoiceNo: invoicesTable.invoiceNo,
    })
    .from(paymentAllocationsTable)
    .leftJoin(
      invoicesTable,
      eq(invoicesTable.id, paymentAllocationsTable.invoiceId),
    )
    .where(inArray(paymentAllocationsTable.paymentId, ids));
  const byPayment = new Map<string, typeof allocs>();
  for (const a of allocs) {
    const list = byPayment.get(a.paymentId) ?? [];
    list.push(a);
    byPayment.set(a.paymentId, list);
  }

  const custIds = [
    ...new Set(rows.map((r) => r.customerId).filter((x): x is string => !!x)),
  ];
  const suppIds = [
    ...new Set(rows.map((r) => r.supplierId).filter((x): x is string => !!x)),
  ];
  const cashIds = [...new Set(rows.map((r) => r.cashAccountId))];
  const nameMap = new Map<string, string>();
  if (custIds.length) {
    const cs = await db
      .select({ id: customersTable.id, name: customersTable.nameAr })
      .from(customersTable)
      .where(
        and(
          eq(customersTable.companyId, companyId),
          inArray(customersTable.id, custIds),
        ),
      );
    for (const c of cs) nameMap.set(c.id, c.name);
  }
  if (suppIds.length) {
    const ss = await db
      .select({ id: suppliersTable.id, name: suppliersTable.nameAr })
      .from(suppliersTable)
      .where(
        and(
          eq(suppliersTable.companyId, companyId),
          inArray(suppliersTable.id, suppIds),
        ),
      );
    for (const s of ss) nameMap.set(s.id, s.name);
  }
  const cashMap = new Map<string, string>();
  const cashRows = await db
    .select({ id: accountsTable.id, name: accountsTable.nameAr })
    .from(accountsTable)
    .where(
      and(
        eq(accountsTable.companyId, companyId),
        inArray(accountsTable.id, cashIds),
      ),
    );
  for (const a of cashRows) cashMap.set(a.id, a.name);

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as "collection" | "payment",
    paymentNo: r.paymentNo,
    date: r.date,
    partyId: r.customerId ?? r.supplierId,
    partyName: nameMap.get(r.customerId ?? r.supplierId ?? "") ?? null,
    method: r.method as "cash" | "bank" | "cheque" | "card",
    cashAccountId: r.cashAccountId,
    cashAccountName: cashMap.get(r.cashAccountId) ?? null,
    amount: Number(r.amount),
    currency: r.currency,
    exchangeRate: Number(r.exchangeRate),
    notes: r.notes,
    journalEntryId: r.journalEntryId,
    allocations: (byPayment.get(r.id) ?? []).map((a) => ({
      id: a.id,
      invoiceId: a.invoiceId,
      invoiceNo: a.invoiceNo ?? null,
      amount: Number(a.amount),
    })),
    createdAt: r.createdAt.toISOString(),
  }));
}

// ---- Create ----
router.post(
  "/payments",
  requireAuth,
  requireCapability("payments:create"),
  async (req, res) => {
    const parsed = CreatePaymentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const d = parsed.data;
    if (d.amount <= 0) {
      res.status(400).json({ error: "المبلغ يجب أن يكون أكبر من صفر" });
      return;
    }
    const baseCurrency = await loadBaseCurrency(companyId);
    try {
      // Resolve party and its subsidiary account.
      const invoiceKind = d.kind === "collection" ? "sales" : "purchase";
      let partyAccountId: string;
      let partyId: string;
      let partyName: string;
      if (d.kind === "collection") {
        if (!d.customerId) {
          res.status(400).json({ error: "يجب اختيار العميل" });
          return;
        }
        const [c] = await db
          .select()
          .from(customersTable)
          .where(
            and(
              eq(customersTable.id, d.customerId),
              eq(customersTable.companyId, companyId),
            ),
          )
          .limit(1);
        if (!c) {
          res.status(400).json({ error: "العميل غير موجود" });
          return;
        }
        partyAccountId = c.accountId;
        partyId = c.id;
        partyName = c.nameAr;
      } else {
        if (!d.supplierId) {
          res.status(400).json({ error: "يجب اختيار المورد" });
          return;
        }
        const [s] = await db
          .select()
          .from(suppliersTable)
          .where(
            and(
              eq(suppliersTable.id, d.supplierId),
              eq(suppliersTable.companyId, companyId),
            ),
          )
          .limit(1);
        if (!s) {
          res.status(400).json({ error: "المورد غير موجود" });
          return;
        }
        partyAccountId = s.accountId;
        partyId = s.id;
        partyName = s.nameAr;
      }

      if (!(await isLeafAccount(d.cashAccountId, companyId))) {
        res
          .status(400)
          .json({ error: "حساب النقدية/البنك غير صحيح أو حساب رئيسي" });
        return;
      }

      // Validate allocations: invoices belong to company + same party + kind,
      // and each allocation does not exceed the invoice's outstanding balance.
      const allocs = d.allocations ?? [];
      const allocSum = round2(allocs.reduce((s, a) => s + a.amount, 0));
      if (allocSum > d.amount + MONEY_EPS) {
        res
          .status(400)
          .json({ error: "إجمالي التخصيصات أكبر من مبلغ العملية" });
        return;
      }
      // Aggregate allocations by invoice so duplicate rows for the same invoice
      // are summed (not validated/applied independently against a stale base).
      const allocByInvoice = new Map<string, number>();
      for (const a of allocs) {
        allocByInvoice.set(
          a.invoiceId,
          round2((allocByInvoice.get(a.invoiceId) ?? 0) + a.amount),
        );
      }
      const invIds = [...allocByInvoice.keys()];
      const invMap = new Map<
        string,
        { total: number; amountPaid: number; id: string }
      >();
      if (invIds.length) {
        const invs = await db
          .select()
          .from(invoicesTable)
          .where(
            and(
              eq(invoicesTable.companyId, companyId),
              inArray(invoicesTable.id, invIds),
            ),
          );
        for (const inv of invs) {
          if (inv.kind !== invoiceKind) {
            res
              .status(400)
              .json({ error: "نوع الفاتورة لا يطابق نوع العملية" });
            return;
          }
          const matchesParty =
            d.kind === "collection"
              ? inv.customerId === partyId
              : inv.supplierId === partyId;
          if (!matchesParty) {
            res
              .status(400)
              .json({ error: "الفاتورة لا تخص الطرف المحدد" });
            return;
          }
          if (inv.status === "draft" || inv.status === "cancelled") {
            res
              .status(400)
              .json({ error: "لا يمكن السداد على فاتورة غير معتمدة" });
            return;
          }
          invMap.set(inv.id, {
            id: inv.id,
            total: Number(inv.total),
            amountPaid: Number(inv.amountPaid),
          });
        }
        // Aggregate allocations by invoice (a payment may list the same invoice
        // more than once) and best-effort check each against its balance. The
        // authoritative check runs inside the tx under a row lock.
        for (const [invoiceId, amount] of allocByInvoice) {
          const inv = invMap.get(invoiceId);
          if (!inv) {
            res.status(400).json({ error: "إحدى الفواتير غير موجودة" });
            return;
          }
          const balance = round2(inv.total - inv.amountPaid);
          if (amount > balance + MONEY_EPS) {
            res.status(400).json({
              error: "مبلغ التخصيص أكبر من المتبقي على الفاتورة",
            });
            return;
          }
        }
      }

      const rate = Number(d.exchangeRate ?? 1);
      const amountBase = round2(d.amount * rate);
      const created = await db.transaction(async (tx) => {
        // GLOBAL LOCK ORDER: invoice rows first, THEN the company entry-no
        // advisory lock — identical to the approve handler — so approve and
        // payment-allocation on the same invoice can never deadlock. Lock each
        // allocated invoice in deterministic (sorted id) order, re-read balance,
        // authoritatively check the aggregated allocation, and apply once.
        for (const [invoiceId, amount] of [...allocByInvoice].sort((a, b) =>
          a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
        )) {
          const [inv] = await tx
            .select({
              total: invoicesTable.total,
              amountPaid: invoicesTable.amountPaid,
              status: invoicesTable.status,
            })
            .from(invoicesTable)
            .where(
              and(
                eq(invoicesTable.id, invoiceId),
                eq(invoicesTable.companyId, companyId),
              ),
            )
            .for("update")
            .limit(1);
          if (!inv) throw new Error("INVOICE_NOT_FOUND");
          if (inv.status === "draft" || inv.status === "cancelled")
            throw new Error("INVOICE_NOT_APPROVED");
          const total = Number(inv.total);
          const balance = round2(total - Number(inv.amountPaid));
          if (amount > balance + MONEY_EPS) throw new Error("OVER_ALLOCATION");
          const newPaid = round2(Number(inv.amountPaid) + amount);
          await tx
            .update(invoicesTable)
            .set({
              amountPaid: String(newPaid),
              status: invoiceStatusFor(total, newPaid),
            })
            .where(
              and(
                eq(invoicesTable.id, invoiceId),
                eq(invoicesTable.companyId, companyId),
              ),
            );
        }

        await lockCompanyEntryNo(tx, companyId);
        const paymentNo = await nextPaymentNo(tx, companyId, d.kind);

        const cashLine = {
          accountId: d.cashAccountId,
          description:
            d.kind === "collection"
              ? `تحصيل من ${partyName}`
              : `دفعة إلى ${partyName}`,
          debit: d.kind === "collection" ? amountBase : 0,
          credit: d.kind === "collection" ? 0 : amountBase,
        };
        const partyLine = {
          accountId: partyAccountId,
          description:
            d.kind === "collection"
              ? `تحصيل من ${partyName}`
              : `دفعة إلى ${partyName}`,
          debit: d.kind === "collection" ? 0 : amountBase,
          credit: d.kind === "collection" ? amountBase : 0,
        };
        const entry = await createDraftJournalEntry(tx, {
          companyId,
          baseCurrency,
          date: d.date,
          reference: `${d.kind === "collection" ? "سند قبض" : "سند صرف"} #${paymentNo}`,
          notes: d.notes ?? null,
          createdBy: req.auth!.userId,
          status: "posted",
          lines: [cashLine, partyLine],
        });

        const [payment] = await tx
          .insert(paymentsTable)
          .values({
            companyId,
            kind: d.kind,
            paymentNo,
            date: d.date,
            customerId: d.kind === "collection" ? partyId : null,
            supplierId: d.kind === "payment" ? partyId : null,
            method: d.method,
            cashAccountId: d.cashAccountId,
            amount: String(round2(d.amount)),
            currency: d.currency ?? null,
            exchangeRate: String(rate),
            notes: d.notes ?? null,
            journalEntryId: entry.id,
            createdBy: req.auth!.userId,
          })
          .returning();

        if (allocs.length) {
          // Invoice balances were already locked + updated at the top of this
          // tx (global lock order); here we only persist the allocation rows.
          await tx.insert(paymentAllocationsTable).values(
            allocs.map((a) => ({
              paymentId: payment!.id,
              companyId,
              invoiceId: a.invoiceId,
              amount: String(round2(a.amount)),
            })),
          );
        }
        return payment!;
      });
      const [serialized] = await serializePayments([created], companyId);
      res.status(201).json(serialized);
    } catch (err) {
      if (err instanceof Error && err.message === "OVER_ALLOCATION") {
        res
          .status(400)
          .json({ error: "مبلغ التخصيص أكبر من المتبقي على الفاتورة" });
        return;
      }
      if (err instanceof Error && err.message === "INVOICE_NOT_FOUND") {
        res.status(400).json({ error: "إحدى الفواتير غير موجودة" });
        return;
      }
      if (err instanceof Error && err.message === "INVOICE_NOT_APPROVED") {
        res
          .status(400)
          .json({ error: "لا يمكن السداد على فاتورة غير معتمدة" });
        return;
      }
      req.log.error({ err }, "Failed to create payment");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Delete (reverse) ----
router.delete(
  "/payments/:id",
  requireAuth,
  requireCapability("payments:delete"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const id = req.params["id"] as string;
    try {
      const [payment] = await db
        .select()
        .from(paymentsTable)
        .where(
          and(
            eq(paymentsTable.id, id),
            eq(paymentsTable.companyId, companyId),
          ),
        )
        .limit(1);
      if (!payment) {
        res.status(404).json({ error: "العملية غير موجودة" });
        return;
      }
      const allocs = await db
        .select()
        .from(paymentAllocationsTable)
        .where(eq(paymentAllocationsTable.paymentId, id));
      // Aggregate the reversal amount per invoice (a payment may hold several
      // allocation rows for one invoice) so each invoice is locked + reversed
      // exactly once.
      const reverseByInvoice = new Map<string, number>();
      for (const a of allocs) {
        reverseByInvoice.set(
          a.invoiceId,
          round2((reverseByInvoice.get(a.invoiceId) ?? 0) + Number(a.amount)),
        );
      }
      await db.transaction(async (tx) => {
        // Lock each affected invoice FOR UPDATE in deterministic (sorted id)
        // order, then read-modify-write its balance so a concurrent payment
        // create/delete on the same invoice can't clobber amountPaid/status.
        for (const [invoiceId, amount] of [...reverseByInvoice].sort((a, b) =>
          a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
        )) {
          const [inv] = await tx
            .select({
              total: invoicesTable.total,
              amountPaid: invoicesTable.amountPaid,
            })
            .from(invoicesTable)
            .where(
              and(
                eq(invoicesTable.id, invoiceId),
                eq(invoicesTable.companyId, companyId),
              ),
            )
            .for("update")
            .limit(1);
          if (inv) {
            const newPaid = round2(Number(inv.amountPaid) - amount);
            const clamped = newPaid < 0 ? 0 : newPaid;
            await tx
              .update(invoicesTable)
              .set({
                amountPaid: String(clamped),
                status: invoiceStatusFor(Number(inv.total), clamped),
              })
              .where(
                and(
                  eq(invoicesTable.id, invoiceId),
                  eq(invoicesTable.companyId, companyId),
                ),
              );
          }
        }
        // Delete the payment (allocations cascade).
        await tx
          .delete(paymentsTable)
          .where(
            and(
              eq(paymentsTable.id, id),
              eq(paymentsTable.companyId, companyId),
            ),
          );
        // Delete its journal entry (lines cascade).
        if (payment.journalEntryId) {
          const { journalEntriesTable } = await import("@workspace/db");
          await tx
            .delete(journalEntriesTable)
            .where(eq(journalEntriesTable.id, payment.journalEntryId));
        }
      });
      res.json({ status: "ok" });
    } catch (err) {
      req.log.error({ err }, "Failed to delete payment");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
