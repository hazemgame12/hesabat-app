# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

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

- DB schema (source of truth): `lib/db/src/schema/*.ts` (e.g. `social-posts.ts`, `site-settings.ts`, `articles.ts`)
- API routes: `artifacts/api-server/src/routes/*.ts` mounted in `routes/index.ts`
- Scheduler (auto-publish due content): `artifacts/api-server/src/lib/scheduler.ts`
- Social auto-posting adapters: `artifacts/api-server/src/lib/social/` (`config.ts`, `publishers.ts`, `connections.ts`, `dispatch.ts`)
- Frontend API client: `artifacts/hg-website/src/lib/api.ts`
- Admin pages: `artifacts/hg-website/src/pages/admin/*` (nav in `components/admin-layout.tsx`, routes in `App.tsx`)
- Hostinger deploy: `scripts/build-hostinger.sh`, SQL migrations in `hostinger-deploy-sql/`

## Architecture decisions

- Social platform credentials (Facebook/Instagram/LinkedIn) can be entered from the dashboard "ربط المنصات" page (connect/update/disconnect) OR set as env vars. Dashboard-entered creds are stored AES-256-GCM encrypted at rest in `social_credentials` (key derived from `CREDENTIALS_SECRET`/`SESSION_SECRET`/`ADMIN_SECRET`) — never plaintext in the DB. Resolution merges stored over env (stored wins); see `lib/social/config.ts` (`resolveFields`), `crypto.ts`, `store.ts`.
- Auto-publishing is driven by the existing DB-backed scheduler: when a scheduled social post becomes due it is marked `released` (website feed) AND dispatched to its external platform, with the per-post outcome persisted (`publishResult`/`publishError`/`platformPostId`/`publishedAt`/`publishAttempts`).
- "نشر الآن" (release) and "إعادة المحاولة" (retry) both run the same `attemptExternalPublish` dispatch; retry never throws and just re-records the outcome.
- Instagram requires a public image URL (2-step container publish). LinkedIn posts include the image via register-upload → upload-binary → reference-asset (text-only when no image); token validity is verified with a lightweight `/v2/me` call (401 ⇒ not connected, 403 tolerated).
- One-click OAuth ("Connect" buttons) lives in `lib/social/oauth.ts`. Developer *app* creds are env-only (`META_APP_ID`/`META_APP_SECRET` for Facebook+Instagram, `LINKEDIN_CLIENT_ID`/`LINKEDIN_CLIENT_SECRET`); when present the dashboard shows a Connect button (`oauthAvailable` on each connection status), otherwise it falls back to the manual key form. Flow: `GET /api/admin/social-connections/:platform/oauth-url` (adminAuth) returns the provider authorize URL carrying an HMAC-signed `state` (signed with `CREDENTIALS_SECRET`/`SESSION_SECRET`/`ADMIN_SECRET`, 10-min TTL); the provider redirects to the unauthenticated `GET /api/admin/social-connections/:platform/callback`, which verifies the signed state (proves admin-initiated), exchanges the code for a long-lived token, and persists it via the same encrypted store (never DB plaintext), then redirects back to `/admin/social-connections?connected=…` or `?social_error=…`. Meta: code → short-lived → long-lived user token → first Page's (non-expiring) Page token; Instagram additionally resolves the linked `instagram_business_account`. LinkedIn: code → access token → member URN via `/v2/userinfo`. Redirect URI is derived from `SITE_URL` (fallback `REPLIT_DOMAINS`) and must be registered in the provider app.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
