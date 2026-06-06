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

## Frontend gotcha
- React Query default `retry: 3` made the auth-gated pages blank for ~7s (3 retries of the 401 from `useGetCurrentUser` kept `isLoading` true). Fix: QueryClient `defaultOptions.queries.retry = false`. Any auth-probe-on-load pattern needs retry disabled.
- Frontend imports entity types (`Account`, `AccountInput`) from `@workspace/api-client-react`, NOT from `@workspace/api-zod` (that's the server-side validation lib and isn't a hesabat dependency).
