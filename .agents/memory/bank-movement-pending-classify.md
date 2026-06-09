---
name: Bank movement pending/classify invariant
description: How "pending" bank movements work and the movement↔journal-entry sync rule the PATCH classify endpoint must keep.
---

# Bank movements: pending vs posted, and the JE-sync invariant

Bank-statement Excel import inserts movements as **pending** (unclassified): only
date / debit(مدين=in) / credit(دائن=out) / bank-description(وصف البنك→`notes`) are
parsed; no counterpart, no journal entry. The user later classifies each row
in-app (picks counterpart account + writes their own `description`/البيان), which
posts the balanced journal entry.

**`pending` is DERIVED, not a column.** `status = "pending"` ⇔ `journalEntryId IS NULL`,
else `"posted"`. The only schema addition is the `notes` text column. Do not add a
status column.

**Invariant — movement and its JE must never drift:**
- `journalEntryId IS NULL` ⇔ no counterpart ⇔ pending.
- `journalEntryId` set ⇔ has counterpart ⇔ posted, and the JE lines must match the
  movement's current direction/amount/date.

**How to apply (PATCH /bank/movements/:id):** when the resulting counterpart is set,
(re)post: create a new posted JE and delete the old one. When the counterpart is
**cleared** (null) on a previously posted row, you MUST delete the old JE and set
`journalEntryId = null` — otherwise the row stays "posted" and the stale JE diverges
from the edited movement. Block transfers (`transferGroupId`/type=transfer) and
cleared/reconciled rows from this endpoint.

**Why:** balance sums (`movementSums`) filter `isNotNull(journalEntryId)`, so pending
rows never move the balance. If a cleared-counterpart edit left the JE behind, the
balance and ledger would silently disagree with the movement.
