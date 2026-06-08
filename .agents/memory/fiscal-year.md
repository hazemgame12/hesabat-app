---
name: Fiscal Year close/period-lock
description: How Hesabat fiscal-year close, period-locking, and per-year JV numbering work and the invariants that must not break.
---

# Fiscal Year (Hesabat)

## Carry-forward = YEAR-END CLOSING ENTRY (not next-year opening entry)
On close, zero each posted revenue/expense account's net balance **cumulative-from-genesis up to `endDate`** into a Retained Earnings equity leaf (code `319`, under equity parent `31`), dated `endDate`, status `posted`, balanced.

**Why:** Hesabat reports are cumulative-from-genesis. A next-year *opening* entry would double-count. Each subsequent close only consolidates the incremental P&L because prior closing entries already zeroed earlier activity. Reopen deletes the closing entry to undo.

## Hard invariants
- **Close must be race-safe:** lock the fiscal-year row (`.for("update")`) inside the tx, re-read status under the lock, compute totals inside the tx, and update with `WHERE status='open'`. Computing totals *before* the tx is a TOCTOU that can post duplicate closing entries / corrupt retained earnings.
- **Retained-earnings target must be a postable equity leaf.** If code `319` already exists as a group or non-equity account, fail loudly (don't post the year's net result to the wrong account).
- **Reopen must refuse** when the closing entry has a posted reversal (an entry with `reversedEntryId = closingEntryId`); else deleting only the original leaves a dangling reversal that distorts the books.

## Per-calendar-year JV numbering
`allocateEntryNo(tx, companyId, date)` (in `lib/journal-posting.ts`) takes the per-company advisory lock then computes `max(entry_no)+1` scoped to `extract(year from date)`. **Every** path that mints an entryNo must use it — including the Excel bulk-import path (each imported entry numbered by its OWN date's year). assertOpenPeriod/isPeriodClosed must guard every write path that dates a posted/draft entry, including bulk import.
