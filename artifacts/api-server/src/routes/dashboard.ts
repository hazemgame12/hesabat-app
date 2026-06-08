import { Router } from "express";
import { and, eq, gte, lte, count, inArray, sql } from "drizzle-orm";
import {
  db,
  accountsTable,
  journalEntriesTable,
  journalEntryLinesTable,
  bankAccountsTable,
  invoicesTable,
} from "@workspace/db";
import { requireAuth } from "../middleware/require-auth";
import { round2 } from "../lib/inventory-posting";

const router = Router();

// Active (non-draft, non-cancelled) invoice statuses with an open balance.
const OPEN_INVOICE_STATUSES = ["approved", "partially_paid"];

router.get("/dashboard/summary", requireAuth, async (req, res) => {
  const companyId = req.auth!.companyId;
  try {
    // Current fiscal year window for the P&L portion.
    const now = new Date();
    const yearStart = `${now.getUTCFullYear()}-01-01`;
    const yearEnd = `${now.getUTCFullYear()}-12-31`;

    const [grouped, plRows, cashRows, arRows, apRows] = await Promise.all([
      // Accounts grouped by type.
      db
        .select({ type: accountsTable.type, count: count() })
        .from(accountsTable)
        .where(eq(accountsTable.companyId, companyId))
        .groupBy(accountsTable.type),
      // Posted revenue/expense totals for the current year.
      db
        .select({
          type: accountsTable.type,
          debit: sql<string>`sum(${journalEntryLinesTable.debitBase})`,
          credit: sql<string>`sum(${journalEntryLinesTable.creditBase})`,
        })
        .from(journalEntryLinesTable)
        .innerJoin(
          journalEntriesTable,
          eq(journalEntriesTable.id, journalEntryLinesTable.entryId),
        )
        .innerJoin(
          accountsTable,
          eq(accountsTable.id, journalEntryLinesTable.accountId),
        )
        .where(
          and(
            eq(journalEntriesTable.companyId, companyId),
            eq(journalEntriesTable.status, "posted"),
            inArray(accountsTable.type, ["revenue", "expense"]),
            gte(journalEntriesTable.date, yearStart),
            lte(journalEntriesTable.date, yearEnd),
          ),
        )
        .groupBy(accountsTable.type),
      // Posted balance on accounts linked to cash/bank accounts (asset nature).
      db
        .select({
          debit: sql<string>`sum(${journalEntryLinesTable.debitBase})`,
          credit: sql<string>`sum(${journalEntryLinesTable.creditBase})`,
        })
        .from(journalEntryLinesTable)
        .innerJoin(
          journalEntriesTable,
          eq(journalEntriesTable.id, journalEntryLinesTable.entryId),
        )
        .innerJoin(
          bankAccountsTable,
          eq(bankAccountsTable.accountId, journalEntryLinesTable.accountId),
        )
        .where(
          and(
            eq(journalEntriesTable.companyId, companyId),
            eq(journalEntriesTable.status, "posted"),
            eq(bankAccountsTable.companyId, companyId),
          ),
        ),
      // Outstanding receivables (open sales invoices).
      db
        .select({
          total: sql<string>`sum(${invoicesTable.total})`,
          paid: sql<string>`sum(${invoicesTable.amountPaid})`,
        })
        .from(invoicesTable)
        .where(
          and(
            eq(invoicesTable.companyId, companyId),
            eq(invoicesTable.kind, "sales"),
            inArray(invoicesTable.status, OPEN_INVOICE_STATUSES),
          ),
        ),
      // Outstanding payables (open purchase invoices).
      db
        .select({
          total: sql<string>`sum(${invoicesTable.total})`,
          paid: sql<string>`sum(${invoicesTable.amountPaid})`,
        })
        .from(invoicesTable)
        .where(
          and(
            eq(invoicesTable.companyId, companyId),
            eq(invoicesTable.kind, "purchase"),
            inArray(invoicesTable.status, OPEN_INVOICE_STATUSES),
          ),
        ),
    ]);

    const accountsByType = grouped.map((g) => ({
      type: g.type,
      count: Number(g.count),
    }));
    const totalAccounts = accountsByType.reduce((sum, g) => sum + g.count, 0);

    let totalRevenue = 0;
    let totalExpenses = 0;
    for (const r of plRows) {
      const debit = Number(r.debit) || 0;
      const credit = Number(r.credit) || 0;
      if (r.type === "revenue") totalRevenue = round2(credit - debit);
      else if (r.type === "expense") totalExpenses = round2(debit - credit);
    }

    const cash = cashRows[0];
    const cashBalance = round2(
      (Number(cash?.debit) || 0) - (Number(cash?.credit) || 0),
    );

    const ar = arRows[0];
    const outstandingReceivables = round2(
      (Number(ar?.total) || 0) - (Number(ar?.paid) || 0),
    );
    const ap = apRows[0];
    const outstandingPayables = round2(
      (Number(ap?.total) || 0) - (Number(ap?.paid) || 0),
    );

    res.json({
      totalAccounts,
      accountsByType,
      fiscalYear: now.getUTCFullYear(),
      totalRevenue,
      totalExpenses,
      netProfit: round2(totalRevenue - totalExpenses),
      cashBalance,
      outstandingReceivables,
      outstandingPayables,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to build dashboard summary");
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

export default router;
