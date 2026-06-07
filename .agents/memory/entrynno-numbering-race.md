---
name: Journal entryNo numbering race
description: Hesabat per-company journal entry numbers race under concurrent posting; must take an advisory lock before allocating.
---

# Journal entryNo numbering race

Per-company journal `entryNo` is allocated as `max(entry_no)+1` with no DB unique
constraint on `(company_id, entry_no)`. Concurrent posting that does NOT contend on
the same row locks (e.g. two inventory movements on *different* items, each locking
only its own item row) can read the same `max` and mint duplicate entry numbers.

**Rule:** every transaction that allocates an entry number for a company MUST first
call `lockCompanyEntryNo(tx, companyId)` (in `artifacts/api-server/src/lib/journal-posting.ts`),
a `pg_advisory_xact_lock(hashtext(companyId))` that serializes allocation per company
and auto-releases on commit/rollback.

**Why:** there is no unique constraint to fall back on, so an unserialized allocator
silently produces duplicate, ambiguous journal references. Caught in code review of
the Inventory module, which amplified concurrent draft-entry creation.

**How to apply:** call it at the very top of the transaction, before the `max(entry_no)`
select. Already wired into `createDraftJournalEntry` and both `routes/journal.ts`
allocation sites (manual create + Excel import). Any future module that mints entry
numbers (payroll, etc.) must do the same. hashtext is int4 so cross-company key
collisions are possible but harmless — at worst two companies briefly serialize.
