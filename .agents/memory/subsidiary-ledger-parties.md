---
name: Subsidiary-ledger parties (customers/suppliers)
description: Why Hesabat customers/suppliers carry no stored balance and the rules for auto-creating their subsidiary accounts.
---

# Subsidiary-ledger model for customers & suppliers

Customers and suppliers in Hesabat do NOT store a balance. Each party auto-gets its
own leaf account under a control GROUP account (customers→`112` receivables/asset,
suppliers→`211` payables/liability). Balance is derived on read from POSTED journal
lines on that subsidiary account.

**Why:** single source of truth. A stored balance would double-bookkeep and could
drift from the ledger; deriving it guarantees the control account in the trial
balance always equals the sum of its subsidiaries. Customer balance = debit − credit
(asset); supplier = credit − debit (liability); only `status='posted'` lines count.

**How to apply (any future party-like master data — e.g. banks, employees-as-AP):**
- Re-validate the control account belongs to the company AND `isGroup` on every write
  (create + control re-parent). A plain FK is not enough under multi-tenancy.
- Child account codes are allocated by reading the max sibling suffix; this races
  under concurrent creates. `generateChildAccountCode` already takes a per-company
  `pg_advisory_xact_lock(hashtext(companyId))` (mirrors `lockCompanyEntryNo`) so
  concurrent creates get unique sequential codes instead of spurious 409s. Reuse it.
- Scope EVERY account read by `companyId`, including joins and post-update code
  lookups — not just the party-table queries.
- Block delete if any journal line exists on the subsidiary account (pre-check count)
  AND catch the `23503` FK-violation post-tx → map to a business 400 (the pre-check
  can race).
