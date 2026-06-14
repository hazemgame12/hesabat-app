#!/bin/bash
# =============================================================
# Hesabat — Quick VPS Update (git pull + build + reload)
# Run from any directory on the VPS:
#   bash /var/www/hesabat/scripts/update-vps.sh
# =============================================================
set -euo pipefail

APP_DIR=/var/www/hesabat
LOG=/var/log/hesabat-deploy.log

log()     { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }
section() { echo -e "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n  $*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG"; }
START=$(date +%s)

section "Hesabat — VPS Update"

# ── 1. Pull latest code ──────────────────────────────────────
section "1/5 — git pull"
cd "$APP_DIR"
git fetch origin
git checkout main
git pull origin main
log "✅ Code updated — $(git log -1 --format='%h %s')"

# Re-exec self so the rest of the script runs from the NEWLY pulled version.
# Only do this on the first run (HESABAT_REEXECED not set).
if [ -z "${HESABAT_REEXECED:-}" ]; then
  export HESABAT_REEXECED=1
  exec bash "$APP_DIR/scripts/update-vps.sh" "$@"
fi

# ── 2. Load NVM ──────────────────────────────────────────────
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

# ── 3. Install deps ──────────────────────────────────────────
section "2/5 — pnpm install"
pnpm install --no-frozen-lockfile
log "✅ Dependencies ready"

# ── 4. Build ─────────────────────────────────────────────────
section "3/5 — build"
pnpm run typecheck:libs

NODE_ENV=production pnpm --filter @workspace/hesabat exec \
  vite build --config vite.production.config.ts
log "✅ Frontend built → artifacts/hesabat/dist"

pnpm --filter @workspace/api-server run build
log "✅ API server built → artifacts/api-server/dist"

# ── 5. DB migration ──────────────────────────────────────────
section "4/5 — DB push"
if [ -f "$APP_DIR/.env" ]; then
  set -a && source "$APP_DIR/.env" && set +a
  pnpm --filter @workspace/db run push && log "✅ DB schema up to date" \
    || log "⚠️  DB push failed — check DATABASE_URL in .env"
else
  log "⚠️  .env not found — skipping DB push"
fi

# ── 6. Reload PM2 ────────────────────────────────────────────
section "5/5 — reload PM2"
pm2 reload hesabat-api
pm2 save
log "✅ hesabat-api reloaded"

# ── Health check ─────────────────────────────────────────────
sleep 3
HTTP=$(curl -sk -o /dev/null -w "%{http_code}" "http://127.0.0.1:4000/api/healthz" 2>/dev/null || echo "000")
[ "$HTTP" = "200" ] \
  && log "✅ API healthy (HTTP 200)" \
  || log "⚠️  API returned HTTP $HTTP — run: pm2 logs hesabat-api"

ELAPSED=$(( $(date +%s) - START ))
log "🚀 Done in ${ELAPSED}s"
