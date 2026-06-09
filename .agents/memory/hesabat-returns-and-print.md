---
name: Hesabat returns & print views
description: Durable decisions for credit/debit notes (returns) and the printable A4 document views.
---

# Credit/Debit notes (returns)

Credit notes (sales_return) and debit notes (purchase_return) are modeled as rows in the **existing invoices table** keyed by `kind`, not a separate table, and reuse the existing `invoices:*` capabilities. They are **service/account lines only in v1** — inventory and fixed-asset returns are deliberately deferred (would need stock/asset reversal logic).
**Why:** reuses posting, numbering, payments, and AR/AP plumbing; deferring stock/asset returns keeps v1 safe.
**How to apply:** a return must reference a posted source invoice of the same company, same party, and matching kind; cap its total at the source total. Validate that cross-row FK (`relatedInvoiceId`) to the caller's company before write, like every other cross-row FK.

# Print/document views are auth-gated separately

The printable A4 views live at top-level routes (`/print/invoice/:id`, `/print/payment/:id`) **outside** the main `ProtectedRoutes`/`AppLayout` tree (they are chrome-less for printing). They therefore need their **own** UI auth guard — server data is already 401-protected, but without a client guard an unauthenticated user sees a broken shell instead of a login redirect.
**How to apply:** any new chrome-less/full-screen route added outside `ProtectedRoutes` must wrap itself in an auth guard (current-user check → redirect to `/login` on error) and render an explicit not-found/error state on query failure, never a perpetual spinner.
