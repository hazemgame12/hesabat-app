# Hesabat & HG — Accounting SaaS + Consulting Website

A pnpm monorepo holding two products: **حسابات / Hesabat** (a multi-tenant cloud accounting SaaS for Egyptian SMEs) and the **HG Financial Consulting** marketing website + admin dashboard.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- DB schema (source of truth): `lib/db/src/schema/*.ts`
- API routes: `artifacts/api-server/src/routes/*.ts` mounted in `routes/index.ts`
- Shared libs: `@workspace/permissions` (roles/capabilities), `@workspace/locale` (countries/currencies/tax templates), `lib/db` (`@workspace/db`), codegen → `@workspace/api-zod` + `@workspace/api-client-react`
- **Hesabat** frontend: `artifacts/hesabat` (route `/hesabat/`) — pages in `src/pages/*`, nav in the sidebar, routes in `App.tsx`
- **HG website** frontend: `artifacts/hg-website` — API client `src/lib/api.ts`, admin pages `src/pages/admin/*` (nav in `components/admin-layout.tsx`)
- Hostinger deploy: `scripts/build-hostinger.sh`, SQL migrations in `hostinger-deploy-sql/`

## Products

### حسابات / Hesabat — cloud accounting SaaS
Arabic-first (RTL, Cairo), navy+sand theme. 12 milestones shipped: chart of accounts, team/roles/invitations, company profile, journal entries (multi-currency + attachments + Excel), currencies & FX rates, fixed assets & depreciation, country-linked taxes, inventory (weighted-avg, single warehouse), payroll & employees, customers & suppliers (subsidiary ledger), invoicing (line-typed sales/purchase + payments + AR/AP reports), banks/cash/reconciliation, advances & custodies.

**Read `docs/hesabat-architecture.md` before extending Hesabat.** It holds the full detail: the core architecture rules (tenant isolation, native auth, roles, invitations, concurrency-safe entryNo) and every milestone module (schema, posting logic, capabilities, routes, frontend, out-of-scope). Key rules to never break:
- **Strict tenant isolation:** every business table has `company_id`; scope all queries by `req.auth.companyId` AND re-validate any cross-row FK (e.g. account `parentId`) to the caller's company before write.
- **Concurrency-safe journal numbering:** any tx that allocates `entryNo` must call `lockCompanyEntryNo(tx, companyId)` first. Global lock order in multi-lock txs = business rows (sorted) → `lockCompanyEntryNo`.
- **Roles/permissions** live only in `@workspace/permissions`; the server enforces via `requireCapability`, the frontend only hides UI.

### HG Financial Consulting — website + admin
Marketing site + admin dashboard with social auto-posting (Facebook/Instagram/LinkedIn) and one-click OAuth.

**See `docs/hg-social-architecture.md`** for the full social/OAuth detail (encrypted credential storage, scheduler-driven publishing, OAuth flow, target selection, token-expiry tracking).

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- `docs/hesabat-architecture.md` — full Hesabat architecture + all 12 milestone modules.
- `docs/hesabat-tax-reports.md` — country-aware tax reports (EG VAT Form 10 / WHT Form 41 / payroll) + GCC framework.
- `docs/hg-social-architecture.md` — HG website social auto-posting + OAuth detail.
- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
