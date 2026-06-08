---
name: Audit log design
description: How the Hesabat audit trail is meant to behave — append-only, best-effort, owner/manager only.
---

# Audit log

The audit trail is **append-only**: there is intentionally no create/update/delete HTTP route. Rows are written only server-side via the `safeAudit`/`writeAudit` helper.

**Best-effort writes (critical rule):** audit inserts must run *after* the core business work succeeds and must never throw into the caller. `safeAudit` swallows + logs failures. A broken audit insert must never roll back or fail a journal transaction.
**Why:** auditing is observability, not a business invariant; losing one audit row is acceptable, corrupting/blocking a posted journal entry is not.
**How to apply:** when wiring audit into a new module, call `safeAudit(db, {...}, req.log)` post-commit (outside the tx), not inside it. Pass a compact summary in `oldValue`/`newValue` (scalars/status), not the full row.

**Access:** `GET /audit` gated by capability `audit:read`, granted to **owner + manager only**. Always scoped by `req.auth.companyId` (tenant isolation). Filters: entity/userId/from/to/limit (limit capped at 500). Malformed from/to dates return 400, not 500.
