#!/bin/bash
# =============================================================
# HG Website — Quick Update (pull + rebuild + restart)
# Usage: bash /var/www/hesabat/scripts/update-hg.sh
# =============================================================
set -euo pipefail

APP_DIR=/var/www/hesabat
HG_DIR=/var/www/hg-website
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

echo "⬇️  Pulling latest code from GitHub..."
cd "$APP_DIR"
git fetch origin && git reset --hard origin/main
echo "✅ Code updated — $(git log --oneline -1)"

echo ""
echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install --no-frozen-lockfile

echo ""
echo "🔨 Building HG website frontend..."
BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/hg-website run build
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
echo "✅ API files copied"

echo ""
echo "📋 Copying Hesabat frontend into hesabat-api dist/public..."
mkdir -p "$APP_DIR/artifacts/api-server/dist/public"
cp -r "$APP_DIR/artifacts/hesabat/dist/public/." "$APP_DIR/artifacts/api-server/dist/public/" 2>/dev/null || true
echo "✅ Hesabat frontend files copied"

echo ""
echo "♻️  Restarting both PM2 processes..."
pm2 restart hesabat-api hg-api
pm2 save

echo ""
echo "✅ Update complete! $(date '+%H:%M:%S')"
pm2 status
