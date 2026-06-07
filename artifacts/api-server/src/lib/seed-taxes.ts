import { eq } from "drizzle-orm";
import { db, accountsTable, taxesTable, companiesTable } from "@workspace/db";
import {
  DEFAULT_TAX_ACCOUNT_CODES,
  taxTemplatesFor,
  type TaxTemplate,
} from "@workspace/locale";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Ensures the tax liability accounts referenced by the country templates exist
// for this company, creating any missing ones under parent "21" (current
// liabilities). Returns/extends a code→id map. Used by the seed-defaults path
// for companies whose chart predates these accounts; for fresh signups the
// accounts are already present so this is a no-op.
async function ensureTaxAccounts(
  tx: Tx,
  companyId: string,
  templates: TaxTemplate[],
  codeToId: Map<string, string>,
): Promise<void> {
  const parentId = codeToId.get("21") ?? null;
  const neededKinds = new Set(templates.map((t) => t.kind));
  for (const kind of neededKinds) {
    const acct = DEFAULT_TAX_ACCOUNT_CODES[kind];
    if (codeToId.has(acct.code)) continue;
    const [row] = await tx
      .insert(accountsTable)
      .values({
        companyId,
        code: acct.code,
        nameAr: acct.nameAr,
        nameEn: acct.nameEn,
        type: "liability",
        parentId,
        isGroup: false,
      })
      .returning({ id: accountsTable.id });
    if (row) codeToId.set(acct.code, row.id);
  }
}

// Seeds the default tax types for the given country, each linked to its
// chart-of-accounts account. `codeToId` maps account code → id (e.g. the map
// returned by seedDefaultAccounts). Must run inside a transaction. Returns the
// number of taxes inserted.
export async function seedDefaultTaxes(
  tx: Tx,
  companyId: string,
  country: string,
  codeToId: Map<string, string>,
): Promise<number> {
  const templates = taxTemplatesFor(country);
  if (templates.length === 0) return 0;
  await ensureTaxAccounts(tx, companyId, templates, codeToId);
  let inserted = 0;
  for (const tpl of templates) {
    await tx.insert(taxesTable).values({
      companyId,
      nameAr: tpl.nameAr,
      nameEn: tpl.nameEn,
      kind: tpl.kind,
      rate: String(tpl.rate),
      serviceNature: tpl.serviceNatureAr ?? null,
      linkedAccountId: codeToId.get(tpl.accountCode) ?? null,
      isActive: true,
    });
    inserted++;
  }
  return inserted;
}

// Builds a code→id map from a company's existing accounts. Used by the
// seed-defaults endpoint for pre-existing companies (no signup map available).
export async function loadAccountCodeMap(
  tx: Tx,
  companyId: string,
): Promise<Map<string, string>> {
  const rows = await tx
    .select({ id: accountsTable.id, code: accountsTable.code })
    .from(accountsTable)
    .where(eq(accountsTable.companyId, companyId));
  const map = new Map<string, string>();
  for (const r of rows) map.set(r.code, r.id);
  return map;
}

// Takes a row-level lock on the company row so concurrent seed-defaults calls
// serialize on it (prevents two requests from both passing the "no taxes yet"
// precheck and double-seeding). Must run inside a transaction.
export async function lockCompanyRow(
  tx: Tx,
  companyId: string,
): Promise<{ country: string } | null> {
  const [row] = await tx
    .select({ country: companiesTable.country })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .for("update");
  return row ?? null;
}

// In-transaction variant of companyHasTaxes — used after locking the company
// row so the check and the seeding are atomic.
export async function companyHasTaxesTx(
  tx: Tx,
  companyId: string,
): Promise<boolean> {
  const rows = await tx
    .select({ id: taxesTable.id })
    .from(taxesTable)
    .where(eq(taxesTable.companyId, companyId))
    .limit(1);
  return rows.length > 0;
}
