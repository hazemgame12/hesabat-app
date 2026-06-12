#!/bin/bash
# =============================================================
# Hesabat — Full VPS Bootstrap (ONE command)
# Run this as root on a fresh Ubuntu 24.04 VPS
# Domain: app.hesabat.com
# =============================================================
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/hazemgame12/hesabat-app/main/scripts/full-deploy.sh | bash
# OR:
#   bash /var/www/hesabat/scripts/full-deploy.sh
# =============================================================
set -euo pipefail

APP_DIR=/var/www/hesabat
REPO=https://github.com/hazemgame12/hesabat-app.git
DOMAIN=hesabat.hg-audit.com
LOG=/var/log/hesabat-deploy.log
START_TIME=$(date +%s)

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }
section() {
  echo "" | tee -a "$LOG"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG"
  echo "  $*" | tee -a "$LOG"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG"
}

section "Hesabat Beta — Full VPS Deploy"
log "Log: $LOG"

# ── Step 1: Clone / update repo ──────────────────────────────
section "Step 1/8 — Clone repository"
if [ -d "$APP_DIR/.git" ]; then
  log "Repo exists — pulling latest..."
  cd "$APP_DIR" && git fetch origin && git checkout main && git pull origin main
else
  log "Cloning repo..."
  mkdir -p "$APP_DIR"
  git clone "$REPO" "$APP_DIR"
  cd "$APP_DIR"
fi
log "✅ Repo ready at $APP_DIR"

# ── Step 2: Run vps-setup.sh ─────────────────────────────────
section "Step 2/8 — VPS setup (Node, PG, nginx, PM2, SSL)"
bash "$APP_DIR/scripts/vps-setup.sh"

# ── Step 3: Load NVM for this session ────────────────────────
section "Step 3/8 — Load runtime"
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
node --version && pnpm --version && log "✅ Runtime ready"

# ── Step 4: Build application ────────────────────────────────
section "Step 4/8 — Build"
cd "$APP_DIR"
pnpm install --no-frozen-lockfile
pnpm run typecheck:libs
NODE_ENV=production pnpm --filter @workspace/hesabat exec \
  vite build --config vite.production.config.ts
pnpm --filter @workspace/api-server run build
log "✅ Build complete"

# ── Step 5: Database migrations ──────────────────────────────
section "Step 5/8 — Database migrations"
if [ -f "$APP_DIR/.env" ]; then
  set -a && source "$APP_DIR/.env" && set +a
  pnpm --filter @workspace/db run push && log "✅ DB schema up to date" \
    || log "⚠️  DB push failed — check .env DATABASE_URL"
else
  log "⚠️  .env not found — skipping migrations. Edit $APP_DIR/.env first."
fi

# ── Step 6: Start / reload PM2 ───────────────────────────────
section "Step 6/8 — Start application"
cd "$APP_DIR"
if pm2 describe hesabat-api &>/dev/null; then
  pm2 reload hesabat-api --env production
  log "✅ hesabat-api reloaded"
else
  pm2 start "$APP_DIR/artifacts/api-server/dist/index.mjs" \
    --name hesabat-api \
    --interpreter none \
    -- --enable-source-maps
  log "✅ hesabat-api started"
fi
pm2 save
sleep 3

# ── Step 7: Backup system ────────────────────────────────────
section "Step 7/8 — Backup & restore test"
cp "$APP_DIR/scripts/backup.sh" /usr/local/bin/hesabat-backup
cp "$APP_DIR/scripts/restore-test.sh" /usr/local/bin/hesabat-restore-test
chmod +x /usr/local/bin/hesabat-backup /usr/local/bin/hesabat-restore-test

CRON_FILE=/etc/cron.d/hesabat-backup
if ! grep -qF "hesabat-backup" "$CRON_FILE" 2>/dev/null; then
  echo "0 2 * * * root /usr/local/bin/hesabat-backup >> /var/backups/hesabat/backup.log 2>&1" \
    > "$CRON_FILE"
  chmod 644 "$CRON_FILE"
  log "✅ Backup cron installed (daily 02:00 AM)"
fi

log "Running first manual backup..."
/usr/local/bin/hesabat-backup && BACKUP_OK="✅ Backup succeeded" \
  || BACKUP_OK="⚠️  Backup failed — check /var/backups/hesabat/backup.log"
log "$BACKUP_OK"

log "Running restore test..."
/usr/local/bin/hesabat-restore-test && RESTORE_OK="✅ Restore test passed" \
  || RESTORE_OK="⚠️  Restore test failed — check /var/backups/hesabat/restore-test.log"
log "$RESTORE_OK"

# ── Step 8: Health check ─────────────────────────────────────
section "Step 8/8 — Health check"
sleep 5
HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" "https://$DOMAIN/api/healthz" 2>/dev/null || \
            curl -sk -o /dev/null -w "%{http_code}" "http://127.0.0.1:4000/api/healthz" 2>/dev/null || \
            echo "000")

if [ "$HTTP_CODE" = "200" ]; then
  HEALTH="✅ API responding (HTTP 200)"
else
  HEALTH="⚠️  API returned HTTP $HTTP_CODE (might still be starting)"
fi
log "$HEALTH"

# ── Final summary ─────────────────────────────────────────────
ELAPSED=$(( $(date +%s) - START_TIME ))
ELAPSED_MIN=$(( ELAPSED / 60 ))
ELAPSED_SEC=$(( ELAPSED % 60 ))

section "Deployment Complete"
cat << SUMMARY | tee -a "$LOG"

  🚀 Hesabat Beta is live!

  URL:          https://$DOMAIN
  Admin URL:    https://$DOMAIN/super-admin/login
  API Health:   https://$DOMAIN/api/healthz

  PM2:          pm2 status
  nginx:        systemctl status nginx
  Logs:         pm2 logs hesabat-api
  Backups:      ls -lh /var/backups/hesabat/postgres/

  $BACKUP_OK
  $RESTORE_OK
  $HEALTH

  Deploy time:  ${ELAPSED_MIN}m ${ELAPSED_SEC}s
  Full log:     $LOG

  ⚠️  BEFORE OPENING TO TESTERS:
  1. Edit $APP_DIR/.env with real passwords
  2. pm2 restart hesabat-api
  3. Add UptimeRobot monitor: https://uptimerobot.com
     Monitor URL: https://$DOMAIN/api/healthz
     Alert email: info@hg-audit.com

SUMMARY
