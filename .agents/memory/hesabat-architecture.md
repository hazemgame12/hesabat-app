---
name: Hesabat multi-tenant accounting SaaS
description: Architecture, tenant-isolation rules, and auth model for the حسابات/Hesabat accounting app
---

# Hesabat (حسابات) — multi-tenant cloud accounting for Egyptian SMEs

Arabic-first (RTL, Cairo font), navy+sand theme derived from approved mockups. Frontend artifact slug `hesabat` at `/hesabat/`; backend lives in the shared `@workspace/api-server`; schema in `@workspace/db`. Contract-first: define in `lib/api-spec/openapi.yaml` → codegen → server validates with `@workspace/api-zod`, frontend uses `@workspace/api-client-react` hooks.

## Tenant isolation (CRITICAL — strict, no real data until proven)
- Shared Postgres; every business table carries `company_id`. All reads/writes scope by `req.auth.companyId` (set by `requireAuth`).
- **Foreign-key columns that reference other rows (e.g. account `parentId`) MUST be re-validated to belong to the caller's company before insert/update.** A plain FK only checks the id exists globally, so an attacker can link to another tenant's row by id (also an existence oracle). Pattern: `parentBelongsToCompany(parentId, companyId)` query before writing; reject 400 otherwise. Apply this to EVERY future cross-row reference (journal lines → accounts, invoices → customers, etc.).
- **Why:** code review caught exactly this gap on accounts `parentId` in the first slice.

## Auth model (native, zero vendor lock)
- Passwords: `node:crypto` scrypt, stored `scrypt$<salt>$<hash>` (no native deps, portable to any VPS).
- Session: random token; only its SHA-256 is stored in `sessions`; delivered as httpOnly SameSite=Lax cookie (`secure` only in production). `resolveSession` joins session→user→company and deletes expired rows.
- API client must send the cookie: `credentials: "include"` is set in `lib/api-client-react/src/custom-fetch.ts` (hand-edited, NOT overwritten by codegen).

## Roles, permissions & invitations
- Single source of truth is the shared `@workspace/permissions` lib (ROLES, capability matrix, `hasCapability`, `ASSIGNABLE_ROLES`). Server enforces; frontend only hides UI. Never trust the client.
- `owner` is fixed to the company creator: it is NOT in `ASSIGNABLE_ROLES`, cannot be invited, set, removed, or self-demoted. Guard every member mutation: scope by companyId, block self-target, block owner-target, require an assignable role.
- Employee onboarding is invite-link based (no email dependency): create returns the raw token ONCE; DB stores only its SHA-256 (reuse `hashToken`/`generateSessionToken` from `lib/auth`, same as sessions). Accept is a PUBLIC route (token is the credential) that creates the user + session in one tx and marks the invite accepted. `users.email` is GLOBALLY unique → invite-create and accept must 409 if the email already exists.
- Re-invite check must filter `status=pending AND expiresAt>now` — an expired-but-pending row must not block a fresh invite.

## Frontend gotcha
- React Query default `retry: 3` made the auth-gated pages blank for ~7s (3 retries of the 401 from `useGetCurrentUser` kept `isLoading` true). Fix: QueryClient `defaultOptions.queries.retry = false`. Any auth-probe-on-load pattern needs retry disabled.
- Frontend imports entity types (`Account`, `AccountInput`) from `@workspace/api-client-react`, NOT from `@workspace/api-zod` (that's the server-side validation lib and isn't a hesabat dependency).

## Country/locale catalog has TWO sources of truth (keep in lockstep)
- The shared `@workspace/locale` catalog (countries, currencies, tax templates) drives the signup/company dropdowns, but the openapi `country`/`baseCurrency` enums (SignupInput + company-update schemas) are a SEPARATE source of truth. **Adding a country or currency requires editing BOTH** — generated client types narrow to the openapi enum, so a locale-only addition compiles in libs but breaks the hesabat typecheck. **Why:** adding the Gulf countries passed `typecheck:libs` but failed hesabat until the openapi enums were widened too.

## "Seed-on-first-use" backfill endpoints must check existence inside a locked tx
- Any endpoint that one-shot seeds defaults for a tenant (e.g. country taxes) must take a row lock on the parent (`SELECT … FOR UPDATE` on the company row) and re-check "already seeded?" INSIDE the same transaction, then 409 on conflict. An out-of-transaction precheck lets two concurrent clicks both pass and double-seed. **Why:** code review flagged exactly this race on the tax seed-defaults route. Apply to future payroll/inventory "seed defaults" actions.

## Period-unique posting (payroll runs, depreciation) — guard the race two ways
- One-shot-per-period postings (payroll run per `(company, period)`, depreciation per `(asset, period)`) need BOTH a pre-tx existence check (fast, friendly 409) AND a post-tx catch of the Postgres `23505` unique-violation mapped to 409. The pre-check alone races: two concurrent requests can both pass it, then one insert throws and would otherwise leak as a generic 500. **Why:** code review flagged the payroll-run double-post returning 500 under concurrency. (Seed-defaults uses `SELECT … FOR UPDATE` instead; either approach works, but a unique constraint + 23505 catch is simplest when one already exists.)
- Manual-amount modules (payroll): validate business invariants (e.g. per-employee net ≥ 0 when deductions > gross) and return 400 BEFORE calling `createDraftJournalEntry`, so a bad input never surfaces as a 500 from the balance/validation inside journal-posting.
- Run-line tables snapshot the human-readable name (`employeeName`) and use `onDelete restrict` on the entity FK, so historical runs survive employee edits/deletes.
