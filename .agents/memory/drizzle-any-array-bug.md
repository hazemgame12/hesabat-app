---
name: drizzle `= ANY(jsArray)` is broken
description: why filtering by a JS array via a drizzle sql template fails in Postgres, and the fix
---

Do **not** write `sql\`${col} = ANY(${jsArray})\`` in a drizzle `sql` template to filter
a column against a JS array.

**Why:** drizzle inlines a JS array as a comma-separated parameter list, so Postgres
receives `ANY(($1,$2,$3))` — a *row/tuple*, not an array — and throws
`op ANY/ALL (array) requires array on right side`. In dev this can stay hidden until the
endpoint is actually exercised (e.g. the VAT report had this latent bug because no UI
surfaced it).

**How to apply:** use `inArray(col, jsArray)` from `drizzle-orm` instead. Same set of
posted-invoice statuses is reused across the receivables/tax reports, so search for
`inArray(...Table.status, POSTED_INVOICE_STATUSES)` as the canonical pattern.
