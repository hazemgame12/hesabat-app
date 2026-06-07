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

## Country-linked taxes (seeding pattern)
- Country/currency catalog + tax templates live in shared `@workspace/locale` (`TAX_KINDS` vat/wht/income/payroll/zakat, `TAX_TEMPLATES` per country, `taxTemplatesFor`, `DEFAULT_TAX_ACCOUNT_CODES`). Signup/company dropdowns iterate this catalog, so adding a country/currency there auto-propagates to the UI — but the openapi `country`/`baseCurrency` enums (in SignupInput + company update schemas) are a SEPARATE source of truth and MUST be expanded in lockstep or hesabat typecheck fails (generated types narrow the enum).
- At signup, taxes auto-seed inside the signup tx: `seedDefaultAccounts` returns a code→id Map, fed to `seedDefaultTaxes`; each tax links to its chart account. `ensureTaxAccounts` lazily creates any missing tax-liability account under parent `21` for older charts. No schema change — `taxes.kind` is a free text column.
- Backfill endpoint `POST /taxes/seed-defaults`: do the "already seeded?" check INSIDE the same tx after a `SELECT … FOR UPDATE` lock on the company row (`lockCompanyRow`/`companyHasTaxesTx`), else two concurrent clicks both pass an out-of-tx precheck and double-seed. **Why:** code review flagged exactly this race. Return 409 on conflict.
