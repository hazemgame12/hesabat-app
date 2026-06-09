---
name: Auto entity codes (Hesabat)
description: Durable decisions behind Hesabat's auto-generated entity codes — fiscal-year keying, immutability, and the desync collision trap.
---

# Auto-generated entity codes

Hesabat issues internal entity codes server-side in `PREFIX-YEAR-NNNN` form, backed by an atomic per-company/per-year counter. Chart-of-accounts codes and currency ISO codes stay manual on purpose (user-meaningful) — never auto-generate those.

## Fiscal-year keying
Key the counter on the **4-digit year label** (e.g. `"2026"`), NOT the fiscal-year row id.
**Why:** two fiscal-year rows can map to the same visible year; keying on row id let both emit `...-2026-0001`, producing duplicate visible codes. Keying on the label makes the counter match what the user sees.
**How to apply:** any new auto-coded entity derives its fiscal key from the year label — document-dated entities from the document date, non-dated masters from today.

## Codes are immutable
Once issued a code never changes; it is excluded from every update path. Treat this as a contract when adding new coded entities.

## The desync collision trap
**Why it matters:** if the counter ever falls out of sync with codes already present (changed keying mid-stream, or rows hand-seeded in the auto format), the next generate collides on the unique constraint, the create tx rolls back so the counter never advances, and that entity type is **permanently stuck** for that company until the conflicting row or stale counter is cleared.
**How to apply:** never hand-seed rows in the `PREFIX-YEAR-NNNN` format; if you change the keying scheme, wipe the affected company's counters so they re-derive cleanly. There is intentionally no manual dup-check in create handlers — the counter is the single source of truth.
