---
name: Hesabat bank module
description: Banks, Cash & Reconciliation design constraints worth keeping consistent.
---

# Hesabat Banks, Cash & Reconciliation

- **Bank/cash account links to an EXISTING leaf chart account** — it is NOT auto-created (unlike customers/suppliers subsidiary accounts). Re-validate the linked account belongs to the company AND is leaf on every write.
  - **Why:** users want their bank/cash mapped onto their own chart; avoids polluting the chart with system accounts.
- **Movements post POSTED journal entries**, not drafts (real cash events, mirrors payments/invoicing).
- **Transfer between two bank accounts = TWO linked `bank_movements` rows (shared `transferGroupId`) but ONE journal entry** (Dr destination linked account / Cr source).
- **Delete a movement is blocked if it OR — for transfers — EITHER linked group row is cleared/reconciled.** Always load ALL `transferGroupId` rows (company-scoped) before deciding, never just the selected row.
  - **Why:** a reconciliation clears only one leg; deleting the other leg would corrupt a completed reconciliation.
- **bookBalance = openingBalance + Σ posted movement effects ≤ periodEnd.** Opening balance is NOT posted as an opening JE (GL = movements only) — deferred limitation.
- **Reconciliation match** must validate each `statementLineMatches.movementId` belongs to THIS reconciliation's account+period set (tenant isolation) before writing `matchedMovementId`.
- Hard-delete of the JE on movement delete is the established convention (payments module does the same) — not a reversal entry.

- **`isAdjustment` flag distinguishes adjust-created movements.** Regular cleared movements and adjust-created movements both get `isCleared=true`+`reconciliationId`, so they are otherwise indistinguishable. The reconciliation report's "entries created" relies on `bank_movements.isAdjustment`.
