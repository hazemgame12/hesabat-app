---
name: Hesabat bank reconciliation — canonical difference & report variance
description: The single source of truth for a reconciliation's difference and how the variance report must be presented
---

# Bank reconciliation: canonical `difference`

## The one rule
`difference = statementBalance − clearedBookBalance` — EVERYWHERE (the live detail, the report, the persisted column, and the account-list "latest difference"). `clearedBookBalance` = opening + only the *cleared/reconciled* movements up to periodEnd.

**Why:** the persisted difference once used `statement − FULL bookBalance` while the detail/report used the cleared basis, so the account list showed a different number than the reconciliation detail and never reached zero when fully matched.

**How to apply:** any flow that changes the cleared set OR the statement balance must re-persist `difference` on this same basis — so every reconciliation mutation (create, match, adjust, complete) recomputes and stores it, not just create+complete. It trends to zero as items clear; at create (nothing cleared) it equals `statement − opening`.

## Outstanding items basis
Outstanding (uncleared) items used by the report must include ALL uncleared movements up to periodEnd — including ones brought forward from before the period start — NOT just in-period movements. The book/cleared balances cover all history ≤ periodEnd, so restricting outstanding to in-period breaks the variance identity for carried-forward items.

## Report variance presentation (method consistency)
The variance report shows the bank-side flow: statement → +deposits-in-transit − outstanding-checks → adjusted statement balance. Pair that with the **FULL** book balance, NOT the cleared one.
- Identity: `adjustedStatementBalance − fullBookBalance == statementBalance − clearedBookBalance == difference` (algebraically the same, because net outstanding == fullBook − clearedBook).
- **Never** pair the adjusted statement balance with the cleared book balance — that mixes the two standard reconciliation methods, so the two bold numbers won't subtract to the displayed difference.
