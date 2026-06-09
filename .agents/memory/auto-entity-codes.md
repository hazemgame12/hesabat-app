---
name: Auto entity codes (Hesabat)
description: How Hesabat auto-generates internal entity codes (PREFIX-YEAR-NNNN), the fiscal-year keying decision, and the desync collision trap.
---

# Auto-generated entity codes

All internal entity codes are generated server-side via `generateEntityCode` (artifacts/api-server/src/lib/codes.ts), backed by the `code_sequences` table (atomic `onConflictDoUpdate` increment). Format: `PREFIX-YEAR-NNNN` (4-digit zero-padded, reset per fiscal year). Prefixes: CUS/SUP/EMP/ITM/FA/SI/PI.

**Exceptions that stay manual:** chart-of-accounts codes (user-meaningful hierarchy) and currency ISO codes. Never auto-generate these.

## Fiscal-year keying — the rule
`resolveFiscalYear` keys the sequence on the **4-digit year label** (e.g. `"2026"`), NOT the `fiscal_years` row id.
**Why:** two different fiscal_years rows can map to the same visible year; keying on row.id let two rows both emit `...-2026-0001`, producing duplicate visible codes. Keying on the label makes the counter match what the user sees.
**How to apply:** any new auto-coded entity must derive its fiscal key from the year label. Document-dated entities use the document date (invoices=date, assets=acquisitionDate, employees=hireDate); non-dated masters (customers/suppliers/inventory) use today.

## Codes are immutable
`code` is omitted from every `*Update` OpenAPI schema and no update handler writes `code`. Once issued, a code never changes.

## The desync collision trap
If `code_sequences` ever falls out of sync with codes already present in a table (e.g. you change the keying scheme mid-stream, or seed rows in the auto-format), the next generate produces a code that already exists → unique-constraint 23505 → the create transaction rolls back (so the counter never advances) → that entity type is **permanently stuck** for that company until the conflicting row or stale sequence is removed.
**Why it matters:** customers/suppliers/employees/inventory have `unique(company_id, code)`; invoices/fixed_assets have a **partial** `unique(company_id, code) WHERE code IS NOT NULL` (preserves legacy null-coded rows, enforces uniqueness on all new auto codes). So every auto-coded table now errors on a duplicate rather than silently emitting one.
**How to apply:** never hand-seed rows using the auto `PREFIX-YEAR-NNNN` format, and if you change the sequence keying, wipe `code_sequences` for the affected company so counters re-derive cleanly. Create handlers intentionally have no manual dup-check — the sequence is the single source of truth.
