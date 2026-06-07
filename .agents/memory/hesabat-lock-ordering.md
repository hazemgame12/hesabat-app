---
name: Hesabat global lock-order contract
description: The fixed row→advisory lock order every multi-lock Hesabat transaction must follow to avoid cross-route deadlocks.
---

# Hesabat lock-order contract

**Rule:** any transaction that takes BOTH a business row lock (`SELECT … FOR UPDATE`)
and the per-company journal advisory lock (`lockCompanyEntryNo` =
`pg_advisory_xact_lock(hashtext(companyId))`) MUST acquire them in this order:

1. business row lock(s) first — and when locking many rows of the same kind
   (e.g. several invoices for one payment's allocations), lock them in a
   **deterministic sorted order** (sort by id) so concurrent transactions can't
   form a cycle among themselves;
2. THEN `lockCompanyEntryNo` (and only then mint entry numbers / post the JE).

**Why:** the invoice approve flow naturally locks the invoice row first, then the
entry lock. The payment-create flow originally did the reverse (entry lock, then
invoice rows), which is a classic A-holds-X-wants-Y / B-holds-Y-wants-X deadlock
cycle between approve and payment-allocation on the same company. Postgres would
abort one with `40P01`. Caught by architect review; fixed by reordering payments
to lock invoice rows first.

**How to apply:** when adding any new module that both touches a business row and
mints a journal entry (e.g. credit notes, invoice cancellation/reversal, refunds),
lock the business rows first (sorted), then `lockCompanyEntryNo`. Never take the
advisory lock before a row lock you'll also need.
