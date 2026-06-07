import { and, eq, like, sql } from "drizzle-orm";
import { db, accountsTable, journalEntriesTable, journalEntryLinesTable } from "@workspace/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  );
}

// Postgres FK-violation (e.g. deleting an account still referenced by a journal
// line under a restrict constraint when the pre-check raced).
export function isForeignKeyViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23503"
  );
}

// Serializes subsidiary-account code allocation per company so two concurrent
// party creates under the same company can't read the same max suffix and race
// to the same code. Transaction-scoped advisory lock auto-releases on commit.
export async function lockCompanyAccountCode(
  tx: Tx,
  companyId: string,
): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${companyId}))`);
}

// Loads a control (parent) account and confirms it belongs to the company.
export async function loadControlAccount(
  accountId: string,
  companyId: string,
): Promise<{ id: string; code: string; type: string; isGroup: boolean } | null> {
  const [row] = await db
    .select({
      id: accountsTable.id,
      code: accountsTable.code,
      type: accountsTable.type,
      isGroup: accountsTable.isGroup,
    })
    .from(accountsTable)
    .where(and(eq(accountsTable.id, accountId), eq(accountsTable.companyId, companyId)))
    .limit(1);
  return row ?? null;
}

// Generates the next subsidiary account code under a control account, e.g. for
// control "112" → "112001", "112002", ... It scans existing accounts whose code
// begins with the control code and picks the next numeric suffix, padding to at
// least 3 digits. Runs inside the create transaction.
export async function generateChildAccountCode(
  tx: Tx,
  companyId: string,
  controlAccountId: string,
  controlCode: string,
): Promise<string> {
  await lockCompanyAccountCode(tx, companyId);
  const siblings = await tx
    .select({ code: accountsTable.code })
    .from(accountsTable)
    .where(
      and(
        eq(accountsTable.companyId, companyId),
        like(accountsTable.code, `${controlCode}%`),
      ),
    );
  let maxSuffix = 0;
  for (const s of siblings) {
    if (s.code === controlCode) continue;
    if (!s.code.startsWith(controlCode)) continue;
    const tail = s.code.slice(controlCode.length);
    if (!/^\d+$/.test(tail)) continue;
    const n = Number(tail);
    if (Number.isFinite(n) && n > maxSuffix) maxSuffix = n;
  }
  const next = maxSuffix + 1;
  const width = Math.max(3, String(maxSuffix).length);
  return `${controlCode}${String(next).padStart(width, "0")}`;
}

// Sums posted journal-line debits/credits per account for a company. Only
// entries with status='posted' count toward party balances (no stored balance,
// single source of truth in the ledger).
export async function postedBalancesByAccount(
  companyId: string,
): Promise<Map<string, { debit: number; credit: number }>> {
  const rows = await db
    .select({
      accountId: journalEntryLinesTable.accountId,
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
      ),
    );
  const map = new Map<string, { debit: number; credit: number }>();
  for (const r of rows) {
    const cur = map.get(r.accountId) ?? { debit: 0, credit: 0 };
    cur.debit += Number(r.debit);
    cur.credit += Number(r.credit);
    map.set(r.accountId, cur);
  }
  return map;
}
