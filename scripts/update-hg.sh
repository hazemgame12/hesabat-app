#!/bin/bash
# =============================================================
# HG Website — Quick Update (pull + rebuild + restart)
# Usage: bash /var/www/hesabat/scripts/update-hg.sh
# =============================================================

APP_DIR=/var/www/hesabat
HG_DIR=/var/www/hg-website

# ─── Ensure pnpm & node are in PATH ──────────────────────────
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
for _P in \
  "$HOME/.local/share/pnpm" \
  "$HOME/.pnpm" \
  "/usr/local/bin" \
  "/root/.local/share/pnpm"; do
  [ -d "$_P" ] && export PATH="$_P:$PATH"
done
# ─────────────────────────────────────────────────────────────

# ─── Phase 1: pull latest code, then re-exec THIS file ───────
# Running without HG_PULLED means we haven't fetched yet.
# After git reset, the local script file IS the newest version.
if [ -z "${HG_PULLED:-}" ]; then
  echo "⬇️  Pulling latest code from GitHub..."
  cd "$APP_DIR"
  git remote set-url origin https://github.com/hazemgame12/hesabat-app.git
  git fetch origin
  git reset --hard origin/main
  echo "✅ Code updated — $(git log --oneline -1)"
  echo ""
  echo "🔄  Re-executing updated script..."
  HG_PULLED=1 exec bash "$APP_DIR/scripts/update-hg.sh"
fi
# ─────────────────────────────────────────────────────────────

set -euo pipefail

cd "$APP_DIR"

echo ""
echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install --no-frozen-lockfile

echo ""
echo "🗄️  Loading .env and verifying DATABASE_URL points to correct DB..."
if [ -f "$APP_DIR/.env" ]; then
  set -a && source "$APP_DIR/.env" && set +a
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo "⚠️  DATABASE_URL not set — skipping DB checks"
else
  # Auto-detect correct DB: if companies table missing, try hesabat_db
  node "$APP_DIR/scripts/check-db-url.mjs" || true
  # Reload .env in case DATABASE_URL was updated by check-db-url.mjs
  if [ -f "$APP_DIR/.env" ]; then
    set -a && source "$APP_DIR/.env" && set +a
  fi
  echo ""
  echo "🗄️  Applying DB schema migrations..."
  node "$APP_DIR/scripts/migrate-vps.mjs" \
       "$APP_DIR/hostinger-deploy-sql" \
       "$APP_DIR/.applied-migrations" || true
fi

echo ""
echo "🔨 Building HG website frontend..."
PORT=3000 BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/hg-website run build
echo "✅ HG frontend built"

echo ""
echo "📋 Copying HG frontend into hg-api dist/public..."
mkdir -p "$HG_DIR/dist/public"
cp -r "$APP_DIR/artifacts/hg-website/dist/public/." "$HG_DIR/dist/public/"
echo "✅ HG frontend files copied"

echo ""
echo "🔨 Building API server..."
pnpm --filter @workspace/api-server run build
echo "✅ API built"

echo ""
echo "📋 Copying API server into hg-api dist..."
cp "$APP_DIR/artifacts/api-server/dist/index.mjs"                "$HG_DIR/dist/index.mjs"
cp "$APP_DIR/artifacts/api-server/dist/pino-worker.mjs"          "$HG_DIR/dist/pino-worker.mjs"          2>/dev/null || true
cp "$APP_DIR/artifacts/api-server/dist/pino-file.mjs"            "$HG_DIR/dist/pino-file.mjs"            2>/dev/null || true
cp "$APP_DIR/artifacts/api-server/dist/pino-pretty.mjs"          "$HG_DIR/dist/pino-pretty.mjs"          2>/dev/null || true
cp "$APP_DIR/artifacts/api-server/dist/thread-stream-worker.mjs" "$HG_DIR/dist/thread-stream-worker.mjs" 2>/dev/null || true
cp "$APP_DIR/.env" "$HG_DIR/.env" 2>/dev/null || true
echo "✅ API files copied"

# ── Restart API immediately (don't wait for Hesabat) ─────────
echo ""
echo "♻️  Restarting hesabat-api (new API bundle)..."
pm2 restart hesabat-api || true
pm2 save || true

# ── Copy pre-built Hesabat frontend (no VPS build needed) ────
echo ""
echo "📋 Copying Hesabat pre-built frontend..."
if test -f "$APP_DIR/artifacts/hesabat/dist/public/index.html"; then
  mkdir -p "$APP_DIR/artifacts/api-server/dist/public"
  cp -r "$APP_DIR/artifacts/hesabat/dist/public/." "$APP_DIR/artifacts/api-server/dist/public/"
  echo "✅ Hesabat frontend copied"
  pm2 restart hesabat-api || true
  pm2 save || true
else
  echo "⚠️  No pre-built Hesabat dist found in repo — skipping"
fi

echo ""
echo "♻️  Restarting hg-api process..."
pm2 restart hg-api || true
pm2 save || true

echo ""
echo "✅ Update complete! $(date '+%H:%M:%S')"
pm2 status
