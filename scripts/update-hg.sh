#!/bin/bash
# =============================================================
# HG Website — Quick Update (pull + rebuild + restart)
# Usage: bash /var/www/hesabat/scripts/update-hg.sh
# =============================================================

# ─── Self-update via curl (runs before set -e so failures are safe) ───────────
# This lets the script pull its own latest version from GitHub even if git
# fetch fails.  The public repo URL works without any authentication.
if [ -z "${HG_SELF_UPDATED:-}" ]; then
  _TMP=$(mktemp /tmp/update-hg-XXXXXX.sh)
  if curl -sLf \
       "https://raw.githubusercontent.com/hazemgame12/hesabat-app/main/scripts/update-hg.sh" \
       -o "$_TMP" 2>/dev/null && [ -s "$_TMP" ]; then
    echo "🔄  Self-updated script from GitHub — re-executing..."
    HG_SELF_UPDATED=1 exec bash "$_TMP"
  fi
  rm -f "$_TMP"
  echo "⚠️  curl self-update failed — running existing version"
fi
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

APP_DIR=/var/www/hesabat
HG_DIR=/var/www/hg-website

# ─── Ensure pnpm & node are in PATH ───────────────────────────────────────────
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

# Common pnpm install locations (fallback if nvm did not add it)
for _P in \
  "$HOME/.local/share/pnpm" \
  "$HOME/.pnpm" \
  "/usr/local/bin" \
  "/root/.local/share/pnpm"; do
  [ -d "$_P" ] && export PATH="$_P:$PATH"
done
# ──────────────────────────────────────────────────────────────────────────────

echo "⬇️  Pulling latest code from GitHub..."
cd "$APP_DIR"

# Force HTTPS so the fetch works even when no SSH agent is available
git remote set-url origin https://github.com/hazemgame12/hesabat-app.git

# Fetch + reset as two separate commands so set -euo pipefail catches failures
git fetch origin
git reset --hard origin/main
echo "✅ Code updated — $(git log --oneline -1)"

echo ""
echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install --no-frozen-lockfile

echo ""
echo "🗄️  Applying DB schema migrations..."
if [ -f "$APP_DIR/.env" ]; then
  set -a && source "$APP_DIR/.env" && set +a
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo "⚠️  DATABASE_URL not set — skipping migrations"
else
  SQL_DIR="$APP_DIR/hostinger-deploy-sql"
  APPLIED_LOG="$APP_DIR/.applied-migrations"
  touch "$APPLIED_LOG"
  for sql_file in "$SQL_DIR"/migrate-*.sql; do
    [ -f "$sql_file" ] || continue
    fname=$(basename "$sql_file")
    if grep -qF "$fname" "$APPLIED_LOG" 2>/dev/null; then
      echo "  ⏭  $fname (already applied)"
    else
      echo "  ▶  Applying $fname ..."
      if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$sql_file"; then
        echo "$fname" >> "$APPLIED_LOG"
        echo "  ✅ $fname applied"
      else
        echo "  ⚠️  $fname FAILED — skipping (will retry next deploy)"
      fi
    fi
  done
  echo "✅ DB schema up to date"
fi

echo ""
echo "🔨 Building HG website frontend..."
PORT=3000 BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/hg-website run build
echo "✅ Frontend built"

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
cp "$APP_DIR/artifacts/api-server/dist/index.mjs"              "$HG_DIR/dist/index.mjs"
cp "$APP_DIR/artifacts/api-server/dist/pino-worker.mjs"        "$HG_DIR/dist/pino-worker.mjs"        2>/dev/null || true
cp "$APP_DIR/artifacts/api-server/dist/pino-file.mjs"          "$HG_DIR/dist/pino-file.mjs"          2>/dev/null || true
cp "$APP_DIR/artifacts/api-server/dist/pino-pretty.mjs"        "$HG_DIR/dist/pino-pretty.mjs"        2>/dev/null || true
cp "$APP_DIR/artifacts/api-server/dist/thread-stream-worker.mjs" "$HG_DIR/dist/thread-stream-worker.mjs" 2>/dev/null || true
# Propagate .env to hg-api working dir so load-env.ts picks it up on restart
cp "$APP_DIR/.env" "$HG_DIR/.env" 2>/dev/null || true
echo "✅ API files copied"

echo ""
echo "🔨 Building Hesabat frontend..."
PORT=3000 BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/hesabat run build
test -f "$APP_DIR/artifacts/hesabat/dist/public/index.html" || \
  { echo "❌ Hesabat build produced no index.html — aborting before copy/restart"; exit 1; }
echo "✅ Hesabat frontend built"

echo ""
echo "📋 Copying Hesabat frontend into hesabat-api dist/public..."
mkdir -p "$APP_DIR/artifacts/api-server/dist/public"
cp -r "$APP_DIR/artifacts/hesabat/dist/public/." "$APP_DIR/artifacts/api-server/dist/public/"
echo "✅ Hesabat frontend files copied"

echo ""
echo "♻️  Restarting both PM2 processes..."
pm2 restart hesabat-api hg-api
pm2 save

echo ""
echo "✅ Update complete! $(date '+%H:%M:%S')"
pm2 status
