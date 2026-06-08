import { Router } from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  journalEntriesTable,
  journalEntryLinesTable,
  accountsTable,
  bankAccountsTable,
  customersTable,
  suppliersTable,
  inventoryItemsTable,
  companiesTable,
} from "@workspace/db";
import { SaveOpeningBalancesBody } from "@workspace/api-zod";
import { requireAuth } from "../middleware/require-auth";
import { requireCapability } from "../middleware/require-capability";
import {
  createDraftJournalEntry,
  type DraftPostingLine,
} from "../lib/journal-posting";
import { round2, round4 } from "../lib/inventory-posting";

const router = Router();

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const OPENING_EQUITY_CODE = "313";
const OPENING_EQUITY_PARENT_CODE = "31";
const MONEY_EPS = 0.005;

// Domain errors thrown inside the transaction and mapped to a 400 response.
const BAD_REQUEST_ERRORS = new Set([
  "ACCOUNT_NOT_FOUND",
  "ACCOUNT_IS_GROUP",
  "LINE_BOTH_SIDES",
  "BANK_NOT_FOUND",
  "CUSTOMER_NOT_FOUND",
  "SUPPLIER_NOT_FOUND",
  "ITEM_NOT_FOUND",
]);

async function loadBaseCurrency(companyId: string): Promise<string> {
  const [company] = await db
    .select({ baseCurrency: companiesTable.baseCurrency })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);
  return (company?.baseCurrency || "EGP").toUpperCase();
}

// Splits a signed amount into a debit/credit pair given the account's normal
// side. A positive amount sits on the normal side; a negative one flips.
function sideFor(
  normalDebit: boolean,
  amount: number,
): { debit: number; credit: number } {
  const a = round2(amount);
  if (normalDebit) {
    return a >= 0 ? { debit: a, credit: 0 } : { debit: 0, credit: -a };
  }
  return a >= 0 ? { debit: 0, credit: a } : { debit: -a, credit: 0 };
}

// Finds the per-company opening-balance equity account, creating it on demand
// for companies seeded before this account existed.
async function findOrCreateOpeningEquity(
  tx: Tx,
  companyId: string,
): Promise<string> {
  const [existing] = await tx
    .select({ id: accountsTable.id })
    .from(accountsTable)
    .where(
      and(
        eq(accountsTable.companyId, companyId),
        eq(accountsTable.code, OPENING_EQUITY_CODE),
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const [parent] = await tx
    .select({ id: accountsTable.id })
    .from(accountsTable)
    .where(
      and(
        eq(accountsTable.companyId, companyId),
        eq(accountsTable.code, OPENING_EQUITY_PARENT_CODE),
      ),
    )
    .limit(1);

  const [created] = await tx
    .insert(accountsTable)
    .values({
      companyId,
      code: OPENING_EQUITY_CODE,
      nameAr: "رصيد افتتاحي",
      nameEn: "Opening Balance Equity",
      type: "equity",
      isGroup: false,
      parentId: parent?.id ?? null,
    })
    .returning({ id: accountsTable.id });
  return created!.id;
}

// GET /opening-balances — returns the saved opening values so the screen can
// repopulate. Banks come from their stored openingBalance and inventory from
// the items' on-hand/average cost; plain accounts, customers and suppliers are
// reverse-mapped from the opening journal entry's lines.
router.get(
  "/opening-balances",
  requireAuth,
  requireCapability("journal:read"),
  async (req, res) => {
    const companyId = req.auth!.companyId;
    try {
      const [entry] = await db
        .select({ id: journalEntriesTable.id, date: journalEntriesTable.date })
        .from(journalEntriesTable)
        .where(
          and(
            eq(journalEntriesTable.companyId, companyId),
            eq(journalEntriesTable.isOpeningBalance, true),
          ),
        )
        .limit(1);

      const lines = entry
        ? await db
            .select({
              accountId: journalEntryLinesTable.accountId,
              debit: journalEntryLinesTable.debitBase,
              credit: journalEntryLinesTable.creditBase,
            })
            .from(journalEntryLinesTable)
            .where(eq(journalEntryLinesTable.entryId, entry.id))
        : [];

      const [banks, customers, suppliers, items, equity] = await Promise.all([
        db
          .select({
            id: bankAccountsTable.id,
            accountId: bankAccountsTable.accountId,
            openingBalance: bankAccountsTable.openingBalance,
          })
          .from(bankAccountsTable)
          .where(eq(bankAccountsTable.companyId, companyId)),
        db
          .select({
            id: customersTable.id,
            accountId: customersTable.accountId,
          })
          .from(customersTable)
          .where(eq(customersTable.companyId, companyId)),
        db
          .select({
            id: suppliersTable.id,
            accountId: suppliersTable.accountId,
          })
          .from(suppliersTable)
          .where(eq(suppliersTable.companyId, companyId)),
        db
          .select({
            id: inventoryItemsTable.id,
            inventoryAccountId: inventoryItemsTable.inventoryAccountId,
            quantityOnHand: inventoryItemsTable.quantityOnHand,
            averageCost: inventoryItemsTable.averageCost,
          })
          .from(inventoryItemsTable)
          .where(eq(inventoryItemsTable.companyId, companyId)),
        db
          .select({ id: accountsTable.id })
          .from(accountsTable)
          .where(
            and(
              eq(accountsTable.companyId, companyId),
              eq(accountsTable.code, OPENING_EQUITY_CODE),
            ),
          )
          .limit(1),
      ]);

      const equityId = equity[0]?.id ?? null;
      const custByAccount = new Map(customers.map((c) => [c.accountId, c.id]));
      const suppByAccount = new Map(suppliers.map((s) => [s.accountId, s.id]));
      const bankAccountIds = new Set(banks.map((b) => b.accountId));
      const inventoryAccountIds = new Set(
        items.map((i) => i.inventoryAccountId),
      );

      const accountsOut: { accountId: string; debit: number; credit: number }[] =
        [];
      const customersOut: { customerId: string; balance: number }[] = [];
      const suppliersOut: { supplierId: string; balance: number }[] = [];

      for (const l of lines) {
        const debit = round2(Number(l.debit));
        const credit = round2(Number(l.credit));
        if (equityId && l.accountId === equityId) continue;
        if (custByAccount.has(l.accountId)) {
          customersOut.push({
            customerId: custByAccount.get(l.accountId)!,
            balance: round2(debit - credit),
          });
        } else if (suppByAccount.has(l.accountId)) {
          suppliersOut.push({
            supplierId: suppByAccount.get(l.accountId)!,
            balance: round2(credit - debit),
          });
        } else if (bankAccountIds.has(l.accountId)) {
          // Reported from the bank's stored opening balance below.
        } else if (inventoryAccountIds.has(l.accountId)) {
          // Reported from the item's on-hand/average cost below.
        } else {
          accountsOut.push({ accountId: l.accountId, debit, credit });
        }
      }

      const banksOut = banks
        .map((b) => ({
          bankAccountId: b.id,
          balance: round2(Number(b.openingBalance)),
        }))
        .filter((b) => Math.abs(b.balance) > MONEY_EPS);

      const inventoryOut = items
        .map((i) => ({
          itemId: i.id,
          quantity: round4(Number(i.quantityOnHand)),
          unitCost: round4(Number(i.averageCost)),
        }))
        .filter((i) => Math.abs(i.quantity) > 0.00005);

      res.json({
        date: entry?.date ?? null,
        hasOpeningEntry: Boolean(entry),
        accounts: accountsOut,
        banks: banksOut,
        customers: customersOut,
        suppliers: suppliersOut,
        inventory: inventoryOut,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to load opening balances");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

// POST /opening-balances — replaces the company's single opening-balance entry
// with one balanced, posted journal entry. Any imbalance is absorbed by the
// opening-balance equity account so the entry always balances.
router.post(
  "/opening-balances",
  requireAuth,
  requireCapability("journal:create"),
  async (req, res) => {
    const parsed = SaveOpeningBalancesBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "البيانات المدخلة غير صحيحة" });
      return;
    }
    const companyId = req.auth!.companyId;
    const userId = req.auth!.userId;
    const raw = parsed.data;

    // Collapse any duplicate ids in each array (last one wins) so a crafted
    // payload cannot post two lines to the same account or double-update a row.
    const dedupe = <T>(rows: T[] | undefined, key: (r: T) => string): T[] =>
      Array.from(
        new Map((rows ?? []).map((r) => [key(r), r])).values(),
      );
    const body = {
      date: raw.date,
      accounts: dedupe(raw.accounts, (a) => a.accountId),
      banks: dedupe(raw.banks, (b) => b.bankAccountId),
      customers: dedupe(raw.customers, (c) => c.customerId),
      suppliers: dedupe(raw.suppliers, (s) => s.supplierId),
      inventory: dedupe(raw.inventory, (i) => i.itemId),
    };

    try {
      const baseCurrency = await loadBaseCurrency(companyId);

      const result = await db.transaction(async (tx) => {
        // Replace any prior opening entry as a unit (lines cascade-delete).
        await tx
          .delete(journalEntriesTable)
          .where(
            and(
              eq(journalEntriesTable.companyId, companyId),
              eq(journalEntriesTable.isOpeningBalance, true),
            ),
          );

        const lines: DraftPostingLine[] = [];
        const bankUpdates: { id: string; balance: number }[] = [];
        const itemUpdates: { id: string; qty: number; cost: number }[] = [];

        // ---- Ledger accounts ----
        const accInputs = (body.accounts ?? []).filter(
          (a) =>
            Math.abs(round2(a.debit)) > MONEY_EPS ||
            Math.abs(round2(a.credit)) > MONEY_EPS,
        );
        if (accInputs.length) {
          const accs = await tx
            .select({ id: accountsTable.id, isGroup: accountsTable.isGroup })
            .from(accountsTable)
            .where(
              and(
                eq(accountsTable.companyId, companyId),
                inArray(
                  accountsTable.id,
                  accInputs.map((a) => a.accountId),
                ),
              ),
            );
          const accMap = new Map(accs.map((a) => [a.id, a]));
          for (const a of accInputs) {
            const acc = accMap.get(a.accountId);
            if (!acc) throw new Error("ACCOUNT_NOT_FOUND");
            if (acc.isGroup) throw new Error("ACCOUNT_IS_GROUP");
            const debit = round2(a.debit);
            const credit = round2(a.credit);
            if (debit > MONEY_EPS && credit > MONEY_EPS)
              throw new Error("LINE_BOTH_SIDES");
            lines.push({
              accountId: a.accountId,
              debit,
              credit,
              description: "رصيد افتتاحي",
            });
          }
        }

        // ---- Bank / cash accounts ----
        // Process every provided bank (including zeros) so the stored
        // openingBalance can be reset; only emit a journal line when non-zero.
        const bankInputs = body.banks ?? [];
        if (bankInputs.length) {
          const banks = await tx
            .select({
              id: bankAccountsTable.id,
              accountId: bankAccountsTable.accountId,
            })
            .from(bankAccountsTable)
            .where(
              and(
                eq(bankAccountsTable.companyId, companyId),
                inArray(
                  bankAccountsTable.id,
                  bankInputs.map((b) => b.bankAccountId),
                ),
              ),
            );
          const bankMap = new Map(banks.map((b) => [b.id, b]));
          const linkedAccs = banks.length
            ? await tx
                .select({ id: accountsTable.id, type: accountsTable.type })
                .from(accountsTable)
                .where(
                  and(
                    eq(accountsTable.companyId, companyId),
                    inArray(
                      accountsTable.id,
                      banks.map((b) => b.accountId),
                    ),
                  ),
                )
            : [];
          const accType = new Map(linkedAccs.map((a) => [a.id, a.type]));
          for (const b of bankInputs) {
            const bank = bankMap.get(b.bankAccountId);
            if (!bank) throw new Error("BANK_NOT_FOUND");
            const type = accType.get(bank.accountId);
            // The bank's linked ledger account must belong to this company.
            if (type === undefined) throw new Error("BANK_NOT_FOUND");
            const normalDebit = type === "asset" || type === "expense";
            const balance = round2(b.balance);
            if (Math.abs(balance) > MONEY_EPS) {
              lines.push({
                accountId: bank.accountId,
                ...sideFor(normalDebit, balance),
                description: "رصيد افتتاحي - حساب نقدي/بنكي",
              });
            }
            bankUpdates.push({ id: bank.id, balance });
          }
        }

        // ---- Customers (receivables) ----
        const custInputs = (body.customers ?? []).filter(
          (c) => Math.abs(round2(c.balance)) > MONEY_EPS,
        );
        if (custInputs.length) {
          const custs = await tx
            .select({
              id: customersTable.id,
              accountId: customersTable.accountId,
            })
            .from(customersTable)
            .where(
              and(
                eq(customersTable.companyId, companyId),
                inArray(
                  customersTable.id,
                  custInputs.map((c) => c.customerId),
                ),
              ),
            );
          const custMap = new Map(custs.map((c) => [c.id, c.accountId]));
          for (const c of custInputs) {
            const accountId = custMap.get(c.customerId);
            if (!accountId) throw new Error("CUSTOMER_NOT_FOUND");
            lines.push({
              accountId,
              ...sideFor(true, c.balance),
              description: "رصيد افتتاحي - عميل",
            });
          }
        }

        // ---- Suppliers (payables) ----
        const suppInputs = (body.suppliers ?? []).filter(
          (s) => Math.abs(round2(s.balance)) > MONEY_EPS,
        );
        if (suppInputs.length) {
          const supps = await tx
            .select({
              id: suppliersTable.id,
              accountId: suppliersTable.accountId,
            })
            .from(suppliersTable)
            .where(
              and(
                eq(suppliersTable.companyId, companyId),
                inArray(
                  suppliersTable.id,
                  suppInputs.map((s) => s.supplierId),
                ),
              ),
            );
          const suppMap = new Map(supps.map((s) => [s.id, s.accountId]));
          for (const s of suppInputs) {
            const accountId = suppMap.get(s.supplierId);
            if (!accountId) throw new Error("SUPPLIER_NOT_FOUND");
            lines.push({
              accountId,
              ...sideFor(false, s.balance),
              description: "رصيد افتتاحي - مورد",
            });
          }
        }

        // ---- Inventory items ----
        const invInputs = body.inventory ?? [];
        if (invInputs.length) {
          const items = await tx
            .select({
              id: inventoryItemsTable.id,
              inventoryAccountId: inventoryItemsTable.inventoryAccountId,
            })
            .from(inventoryItemsTable)
            .where(
              and(
                eq(inventoryItemsTable.companyId, companyId),
                inArray(
                  inventoryItemsTable.id,
                  invInputs.map((i) => i.itemId),
                ),
              ),
            );
          const itemMap = new Map(
            items.map((i) => [i.id, i.inventoryAccountId]),
          );
          for (const i of invInputs) {
            const invAccountId = itemMap.get(i.itemId);
            if (!invAccountId) throw new Error("ITEM_NOT_FOUND");
            const qty = round4(i.quantity);
            const cost = round4(i.unitCost);
            const value = round2(qty * cost);
            if (Math.abs(value) > MONEY_EPS) {
              lines.push({
                accountId: invAccountId,
                ...sideFor(true, value),
                description: "رصيد افتتاحي - مخزون",
              });
            }
            itemUpdates.push({ id: i.itemId, qty, cost });
          }
        }

        // Apply inventory + bank side effects regardless (allows resetting).
        // Sort by id so concurrent saves acquire row locks in a consistent
        // order (business rows before lockCompanyEntryNo).
        itemUpdates.sort((a, b) => a.id.localeCompare(b.id));
        bankUpdates.sort((a, b) => a.id.localeCompare(b.id));
        for (const it of itemUpdates) {
          await tx
            .update(inventoryItemsTable)
            .set({
              quantityOnHand: String(it.qty),
              averageCost: String(it.cost),
            })
            .where(
              and(
                eq(inventoryItemsTable.id, it.id),
                eq(inventoryItemsTable.companyId, companyId),
              ),
            );
        }
        for (const b of bankUpdates) {
          await tx
            .update(bankAccountsTable)
            .set({
              openingBalance: String(b.balance),
              openingBalanceDate: body.date,
            })
            .where(
              and(
                eq(bankAccountsTable.id, b.id),
                eq(bankAccountsTable.companyId, companyId),
              ),
            );
        }

        if (lines.length === 0) {
          return { entryId: null as string | null, entryNo: null as number | null };
        }

        // Balancing line to the opening-balance equity account.
        let totalDebit = 0;
        let totalCredit = 0;
        for (const l of lines) {
          totalDebit += l.debit;
          totalCredit += l.credit;
        }
        const diff = round2(totalDebit - totalCredit);
        if (Math.abs(diff) > MONEY_EPS) {
          const equityId = await findOrCreateOpeningEquity(tx, companyId);
          lines.push({
            accountId: equityId,
            ...sideFor(false, diff),
            description: "رصيد افتتاحي - حقوق الملكية",
          });
        }

        const created = await createDraftJournalEntry(tx, {
          companyId,
          baseCurrency,
          date: body.date,
          reference: "رصيد افتتاحي",
          notes: null,
          status: "posted",
          isOpeningBalance: true,
          createdBy: userId ?? null,
          lines,
        });
        return { entryId: created.id, entryNo: created.entryNo };
      });

      res.json({ ...result, balanced: true });
    } catch (err) {
      if (err instanceof Error && BAD_REQUEST_ERRORS.has(err.message)) {
        res.status(400).json({ error: err.message });
        return;
      }
      req.log.error({ err }, "Failed to save opening balances");
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  },
);

export default router;
