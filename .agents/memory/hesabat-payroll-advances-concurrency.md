---
name: Hesabat payroll/advances concurrency
description: Why payroll advance balance updates must happen entirely inside the run transaction under the company lock.
---

# Payroll advance deduction must be computed in-transaction

When a payroll run auto-deducts advance installments, ALL advance reads and the
`totalRepaid` write must happen INSIDE the `db.transaction`, after acquiring
`lockCompanyEntryNo(tx, companyId)` and re-reading the advances `.for("update")`.
Bump `totalRepaid` with SQL arithmetic (`totalRepaid + amount`), never an
absolute precomputed value.

**Why:** the original code read advance balances pre-tx (unlocked) and wrote an
absolute `newTotalRepaid` inside the tx. Two concurrent runs on *different*
periods don't conflict on any row lock, so they both read the same balance and
the second write silently overwrites the first → a lost installment. Reading
under `FOR UPDATE` + the per-company advisory lock + arithmetic update closes it.
The advisory lock is re-entrant (pg_advisory_xact_lock stacks) so
`createDraftJournalEntry` taking it again in the same tx is fine.

**How to apply:** any future module that mutates a running balance (totalRepaid,
amountPaid, quantityOnHand, etc.) from inside a consolidated posting run must
lock the row it mutates and update arithmetically, not write an absolute value
derived from a stale pre-lock read. Surface in-tx validation failures via a
custom Error subclass caught in the route's catch → 400.

# "settled"/JE-backed statuses can never be set via plain create/update

A status that implies a posted/draft JE link (custody `settled`) must be set
ONLY by the dedicated endpoint that creates the JE. Reject it in BOTH `POST`
(create) and `PATCH` (update) handlers, not just one — the architect caught the
create path being left open after the update path was guarded.

**Why:** the Zod body still permits the enum value, so a raw API caller bypasses
the intended "settle only via Excel upload" invariant if either handler accepts
it. Hiding the option in the frontend dropdown is not enough.
