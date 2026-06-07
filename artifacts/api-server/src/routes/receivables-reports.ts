import { Router } from "express";
import { and, eq, gte, lte, inArray, desc, sql } from "drizzle-orm";
import {
  db,
  invoicesTable,
  customersTable,
  suppliersTable,
  accountsTable,
  costCentersTable,
  journalEntriesTable,
  journalEntryLinesTable,
  paymentsTable,
  paymentAllocationsTable,
} from "@workspace/db";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import { round2 } from "../lib/inventory-posting";

const router = Router();
const todayISO = () => new Date().toISOString().slice(0, 10);

// Active (non-draft, non-cancelled) invoice statuses.
const OUTSTANDING_STATUSES = ["approved", "partially_paid", "paid"];

// ---- Party statement ----
router.get(
  "/reports/party-statement",
  requireAuth,
  requireCapability("invoices:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const partyType = req.query["partyType"];
    const partyId = req.query["partyId"];
    const from = (req.query["from"] as string | undefined) || null;
    const to = (req.query["to"] as string | undefined) || null;
    if (
      (partyType !== "customer" && partyType !== "supplier") ||
      typeof partyId !== "string"
    ) {
      res.status(400).json({ error: "بيانات غير صحيحة" });
      return;
    }
    try {
      const isCustomer = partyType === "customer";
      let accountId: string;
      let partyName: string;
      if (isCustomer) {
        const [c] = await db
          .select()
          .from(customersTable)
          .where(
            and(
              eq(customersTable.id, partyId),
              eq(customersTable.companyId, companyId),
            ),
          )
          .limit(1);
        if (!c) {
          res.status(404).json({ error: "العميل غير موجود" });
          return;
        }
        accountId = c.accountId;
        partyName = c.nameAr;
      } else {
        const [s] = await db
          .select()
          .from(suppliersTable)
          .where(
            and(
              eq(suppliersTable.id, partyId),
              eq(suppliersTable.companyId, companyId),
            ),
          )
          .limit(1);
        if (!s) {
          res.status(404).json({ error: "المورد غير موجود" });
          return;
        }
        accountId = s.accountId;
        partyName = s.nameAr;
      }

      const [acc] = await db
        .select({ code: accountsTable.code })
        .from(accountsTable)
        .where(eq(accountsTable.id, accountId))
        .limit(1);

      // All posted lines on the subsidiary account, ordered by date.
      const lines = await db
        .select({
          date: journalEntriesTable.date,
          ref: journalEntriesTable.reference,
          description: journalEntryLinesTable.description,
          debit: journalEntryLinesTable.debitBase,
          credit: journalEntryLinesTable.creditBase,
        })
        .from(journalEntryLinesTable)
        .innerJoin(
          journalEntriesTable,
          eq(journalEntriesTable.id, journalEntryLinesTable.entryId),
        )
        .where(
          and(
            eq(journalEntriesTable.companyId, companyId),
            eq(journalEntriesTable.status, "posted"),
            eq(journalEntryLinesTable.accountId, accountId),
          ),
        )
        .orderBy(journalEntriesTable.date, journalEntriesTable.entryNo);

      // Sign: customer (asset) = debit - credit; supplier (liability) = credit - debit.
      const movement = (debit: number, credit: number) =>
        isCustomer ? debit - credit : credit - debit;

      let opening = 0;
      const entries: {
        date: string;
        ref: string | null;
        description: string;
        debit: number;
        credit: number;
        balance: number;
      }[] = [];
      let running = 0;
      for (const l of lines) {
        const debit = Number(l.debit);
        const credit = Number(l.credit);
        if (from && l.date < from) {
          opening = round2(opening + movement(debit, credit));
          continue;
        }
        if (to && l.date > to) continue;
        running =
          (entries.length === 0 ? opening : running) + movement(debit, credit);
        running = round2(running);
        entries.push({
          date: l.date,
          ref: l.ref ?? null,
          description: l.description ?? "",
          debit,
          credit,
          balance: running,
        });
      }
      const closing =
        entries.length === 0 ? opening : entries[entries.length - 1]!.balance;

      res.json({
        partyId,
        partyName,
        accountCode: acc?.code ?? "",
        openingBalance: round2(opening),
        closingBalance: round2(closing),
        entries,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to build party statement");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- AR / AP aging ----
router.get(
  "/reports/aging",
  requireAuth,
  requireCapability("invoices:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const type = req.query["type"];
    const asOf = (req.query["asOf"] as string | undefined) || todayISO();
    if (type !== "ar" && type !== "ap") {
      res.status(400).json({ error: "نوع التقرير غير صحيح" });
      return;
    }
    try {
      const kind = type === "ar" ? "sales" : "purchase";
      const invs = await db
        .select()
        .from(invoicesTable)
        .where(
          and(
            eq(invoicesTable.companyId, companyId),
            eq(invoicesTable.kind, kind),
            inArray(invoicesTable.status, ["approved", "partially_paid"]),
          ),
        );

      const partyIds = [
        ...new Set(
          invs
            .map((i) => (type === "ar" ? i.customerId : i.supplierId))
            .filter((x): x is string => !!x),
        ),
      ];
      const nameMap = new Map<string, string>();
      if (partyIds.length) {
        if (type === "ar") {
          const cs = await db
            .select({ id: customersTable.id, name: customersTable.nameAr })
            .from(customersTable)
            .where(inArray(customersTable.id, partyIds));
          for (const c of cs) nameMap.set(c.id, c.name);
        } else {
          const ss = await db
            .select({ id: suppliersTable.id, name: suppliersTable.nameAr })
            .from(suppliersTable)
            .where(inArray(suppliersTable.id, partyIds));
          for (const s of ss) nameMap.set(s.id, s.name);
        }
      }

      const asOfTime = new Date(asOf).getTime();
      type Bucket = {
        partyId: string;
        partyName: string;
        current: number;
        days30: number;
        days60: number;
        days90: number;
        days90plus: number;
        total: number;
      };
      const rows = new Map<string, Bucket>();
      for (const inv of invs) {
        const pid = (type === "ar" ? inv.customerId : inv.supplierId) ?? "";
        const balance = round2(Number(inv.total) - Number(inv.amountPaid));
        if (balance <= 0.005) continue;
        const row = rows.get(pid) ?? {
          partyId: pid,
          partyName: nameMap.get(pid) ?? "—",
          current: 0,
          days30: 0,
          days60: 0,
          days90: 0,
          days90plus: 0,
          total: 0,
        };
        const refDate = inv.dueDate || inv.date;
        const ageDays = Math.floor(
          (asOfTime - new Date(refDate).getTime()) / 86400000,
        );
        if (ageDays <= 0) row.current = round2(row.current + balance);
        else if (ageDays <= 30) row.days30 = round2(row.days30 + balance);
        else if (ageDays <= 60) row.days60 = round2(row.days60 + balance);
        else if (ageDays <= 90) row.days90 = round2(row.days90 + balance);
        else row.days90plus = round2(row.days90plus + balance);
        row.total = round2(row.total + balance);
        rows.set(pid, row);
      }

      res.json({ asOf, rows: [...rows.values()] });
    } catch (err) {
      req.log.error({ err }, "Failed to build aging report");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Outstanding invoices ----
router.get(
  "/reports/outstanding-invoices",
  requireAuth,
  requireCapability("invoices:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const kind = req.query["kind"];
    if (kind !== "sales" && kind !== "purchase") {
      res.status(400).json({ error: "النوع غير صحيح" });
      return;
    }
    try {
      const invs = await db
        .select()
        .from(invoicesTable)
        .where(
          and(
            eq(invoicesTable.companyId, companyId),
            eq(invoicesTable.kind, kind),
            inArray(invoicesTable.status, ["approved", "partially_paid"]),
          ),
        )
        .orderBy(invoicesTable.dueDate);

      const partyIds = [
        ...new Set(
          invs
            .map((i) => (kind === "sales" ? i.customerId : i.supplierId))
            .filter((x): x is string => !!x),
        ),
      ];
      const nameMap = new Map<string, string>();
      if (partyIds.length) {
        if (kind === "sales") {
          const cs = await db
            .select({ id: customersTable.id, name: customersTable.nameAr })
            .from(customersTable)
            .where(inArray(customersTable.id, partyIds));
          for (const c of cs) nameMap.set(c.id, c.name);
        } else {
          const ss = await db
            .select({ id: suppliersTable.id, name: suppliersTable.nameAr })
            .from(suppliersTable)
            .where(inArray(suppliersTable.id, partyIds));
          for (const s of ss) nameMap.set(s.id, s.name);
        }
      }

      const today = todayISO();
      const out = invs
        .map((inv) => {
          const balance = round2(Number(inv.total) - Number(inv.amountPaid));
          const pid = (kind === "sales" ? inv.customerId : inv.supplierId) ?? "";
          return {
            id: inv.id,
            invoiceNo: inv.invoiceNo,
            date: inv.date,
            dueDate: inv.dueDate ?? null,
            partyName: nameMap.get(pid) ?? "—",
            total: round2(Number(inv.total)),
            amountPaid: round2(Number(inv.amountPaid)),
            balance,
            status: inv.status,
            overdue: !!inv.dueDate && inv.dueDate < today && balance > 0.005,
          };
        })
        .filter((r) => r.balance > 0.005);

      res.json(out);
    } catch (err) {
      req.log.error({ err }, "Failed to list outstanding invoices");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Invoice summary (group by party or cost center) ----
router.get(
  "/reports/invoice-summary",
  requireAuth,
  requireCapability("invoices:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const kind = req.query["kind"];
    const groupBy = req.query["groupBy"];
    const from = (req.query["from"] as string | undefined) || null;
    const to = (req.query["to"] as string | undefined) || null;
    if (
      (kind !== "sales" && kind !== "purchase") ||
      (groupBy !== "party" && groupBy !== "costCenter")
    ) {
      res.status(400).json({ error: "بيانات غير صحيحة" });
      return;
    }
    try {
      const conds = [
        eq(invoicesTable.companyId, companyId),
        eq(invoicesTable.kind, kind),
        inArray(invoicesTable.status, OUTSTANDING_STATUSES),
      ];
      if (from) conds.push(gte(invoicesTable.date, from));
      if (to) conds.push(lte(invoicesTable.date, to));
      const invs = await db
        .select()
        .from(invoicesTable)
        .where(and(...conds));

      type Row = { key: string | null; label: string; count: number; total: number };
      const rows = new Map<string, Row>();

      // Resolve labels.
      const labelMap = new Map<string, string>();
      if (groupBy === "party") {
        const partyIds = [
          ...new Set(
            invs
              .map((i) => (kind === "sales" ? i.customerId : i.supplierId))
              .filter((x): x is string => !!x),
          ),
        ];
        if (partyIds.length) {
          if (kind === "sales") {
            const cs = await db
              .select({ id: customersTable.id, name: customersTable.nameAr })
              .from(customersTable)
              .where(inArray(customersTable.id, partyIds));
            for (const c of cs) labelMap.set(c.id, c.name);
          } else {
            const ss = await db
              .select({ id: suppliersTable.id, name: suppliersTable.nameAr })
              .from(suppliersTable)
              .where(inArray(suppliersTable.id, partyIds));
            for (const s of ss) labelMap.set(s.id, s.name);
          }
        }
      } else {
        const ccIds = [
          ...new Set(
            invs.map((i) => i.costCenterId).filter((x): x is string => !!x),
          ),
        ];
        if (ccIds.length) {
          const ccs = await db
            .select({ id: costCentersTable.id, name: costCentersTable.nameAr })
            .from(costCentersTable)
            .where(inArray(costCentersTable.id, ccIds));
          for (const c of ccs) labelMap.set(c.id, c.name);
        }
      }

      for (const inv of invs) {
        const key =
          groupBy === "party"
            ? (kind === "sales" ? inv.customerId : inv.supplierId) ?? null
            : inv.costCenterId ?? null;
        const mapKey = key ?? "__none__";
        const row = rows.get(mapKey) ?? {
          key,
          label: key ? labelMap.get(key) ?? "—" : "غير محدد",
          count: 0,
          total: 0,
        };
        row.count += 1;
        row.total = round2(row.total + Number(inv.total));
        rows.set(mapKey, row);
      }

      res.json([...rows.values()].sort((a, b) => b.total - a.total));
    } catch (err) {
      req.log.error({ err }, "Failed to build invoice summary");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// ---- Payments summary (collections or payments over a period) ----
router.get(
  "/reports/payments-summary",
  requireAuth,
  requireCapability("payments:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    const kind = req.query["kind"];
    const from = (req.query["from"] as string | undefined) || null;
    const to = (req.query["to"] as string | undefined) || null;
    if (kind !== "collection" && kind !== "payment") {
      res.status(400).json({ error: "النوع غير صحيح" });
      return;
    }
    try {
      const conds = [
        eq(paymentsTable.companyId, companyId),
        eq(paymentsTable.kind, kind),
      ];
      if (from) conds.push(gte(paymentsTable.date, from));
      if (to) conds.push(lte(paymentsTable.date, to));
      const rows = await db
        .select()
        .from(paymentsTable)
        .where(and(...conds))
        .orderBy(desc(paymentsTable.date), desc(paymentsTable.paymentNo));

      if (rows.length === 0) {
        res.json([]);
        return;
      }
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
          .where(inArray(customersTable.id, custIds));
        for (const c of cs) nameMap.set(c.id, c.name);
      }
      if (suppIds.length) {
        const ss = await db
          .select({ id: suppliersTable.id, name: suppliersTable.nameAr })
          .from(suppliersTable)
          .where(inArray(suppliersTable.id, suppIds));
        for (const s of ss) nameMap.set(s.id, s.name);
      }
      const cashMap = new Map<string, string>();
      const cashRows = await db
        .select({ id: accountsTable.id, name: accountsTable.nameAr })
        .from(accountsTable)
        .where(inArray(accountsTable.id, cashIds));
      for (const a of cashRows) cashMap.set(a.id, a.name);

      res.json(
        rows.map((r) => ({
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
        })),
      );
    } catch (err) {
      req.log.error({ err }, "Failed to build payments summary");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
