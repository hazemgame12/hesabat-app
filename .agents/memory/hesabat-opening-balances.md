---
name: Hesabat opening balances module
description: Reset semantics (own-row vs JE-rebuilt) and the codegen body-naming collision for the opening-balances module.
---

# Hesabat opening balances module

One replaceable opening JE per company (`journal_entries.isOpeningBalance=true`), guarded by a
partial unique index `(company_id) WHERE is_opening_balance = true`. Imbalance is absorbed by
equity account `313`.

## Reset semantics: own-row rows vs JE-rebuilt rows
- **Accounts / customers / suppliers** are rebuilt purely from the opening JE → the client may
  OMIT zeros (omission = reset, because the JE is fully replaced each save).
- **Banks and inventory store opening state on their OWN rows** (`bank_accounts.openingBalance`,
  `inventory_items.quantityOnHand`/`averageCost`). The client MUST send the **full snapshot incl
  zeros**, and the server must update the own-row value for **every** provided bank/item (incl 0),
  pushing a JE line only when `|balance| > MONEY_EPS`.
- **Why:** filtering bank/inventory zeros on either client or server leaves a stale `openingBalance`
  that can never be cleared — the original reset bug. JE-rebuilt rows don't have this problem.
- **How to apply:** any opening-balance-style feature that mirrors state onto a non-JE row must
  send and process zeros for those rows; only the pure-JE-derived rows may drop zeros.

## Codegen body-naming collision (repo-wide rule)
A request body that `$ref`s a component named exactly `<operationId>Body` collides in Orval/codegen
(the generated zod schema is also `<operationId>Body`). Name the component DIFFERENTLY
(e.g. `OpeningBalancesInput`) → zod stays `SaveOpeningBalancesBody`, types become the component name,
no collision. **Bodies with nested arrays MUST use a $ref'd named input component, never inline.**

## Other guards
- Side-effect row updates (bank + inventory) are **sorted by id** before the update loops, then
  `lockCompanyEntryNo` runs last (inside `createDraftJournalEntry`) — keeps global lock order.
- POST **dedupes each input array by id (last-wins)** so a crafted payload can't double-post.
- A bank's linked ledger account must resolve to a company account or save throws `BANK_NOT_FOUND`.
