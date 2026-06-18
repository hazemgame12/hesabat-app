---
name: VPS HG website deployment
description: Setup and gotchas for running hg-api (HG website API) on the VPS alongside hesabat-api
---

## Setup
- PM2 process `hg-api` runs from `/var/www/hg-website/dist/index.mjs` on port 3000
- ecosystem config at `/var/www/hg-website/ecosystem.config.cjs`
- DB: `hg_db` on localhost PostgreSQL (user: hg_user)
- Frontend static files: `/var/www/hg-website/dist/public/` (built with `PORT=3000 BASE_PATH=/ pnpm --filter @workspace/hg-website run build`)
- Nginx vhost: `/etc/nginx/sites-available/hg-audit` (server_name: hg-audit.com www.hg-audit.com)

## Critical rules

**superAdminRouter blocks all routes after it:**
`superAdminRouter` (in `routes/super-admin.ts`) has `router.use(requireSuperAdmin)` as a global middleware (no path prefix). This intercepts ALL requests passing through it and returns 401 for unauthenticated users. All HG website public routes (articlesRouter, settingsRouter, etc.) MUST be mounted in `routes/index.ts` BEFORE `superAdminRouter`, otherwise they all return 401.

**Why:** `router.use(someRouter)` with no path mounts the router for ALL requests. The requireSuperAdmin global middleware in superAdminRouter runs for every request, terminating unauthenticated ones.

**How to apply:** In `routes/index.ts`, verify HG routes (articlesRouter, settingsRouter, servicesRouter, packagesRouter, leadsRouter, caseStudiesRouter, uploadsRouter, socialPostsRouter, aiRouter) always appear before `router.use(superAdminRouter)`.

**VPS localhost resolves to IPv6:**
The VPS resolves `localhost` to `[::1]` (IPv6), but PM2 processes listen on `0.0.0.0` (IPv4). Nginx `proxy_pass http://localhost:PORT` silently fails (connection refused). Always use `127.0.0.1` in Nginx proxy_pass configs on this VPS.

**How to apply:** Both `/etc/nginx/sites-available/hesabat` and `/etc/nginx/sites-available/hg-audit` must use `proxy_pass http://127.0.0.1:PORT`.

## deploy.sh steps
Must include copying the API server build to hg-website:
1. `git pull`
2. `CI=true pnpm install --ignore-scripts`
3. `pnpm --filter @workspace/api-server run build`
4. `cp artifacts/api-server/dist/index.mjs /var/www/hg-website/dist/index.mjs` + pino workers
5. `pm2 restart hesabat-api hg-api`

## Pending
- DNS for hg-audit.com needs to point to 76.13.150.226 before SSL can be set up
- After DNS: `certbot --nginx -d hg-audit.com -d www.hg-audit.com`
