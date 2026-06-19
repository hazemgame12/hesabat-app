#!/bin/bash
# =============================================================
# Hesabat — Quick Update (pull + rebuild + restart)
# Usage: bash /var/www/hesabat/scripts/update.sh
# =============================================================
set -euo pipefail

APP_DIR=/var/www/hesabat
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
echo "🗄️  Applying DB schema migrations..."
if [ -f "$APP_DIR/.env" ]; then
  set -a && source "$APP_DIR/.env" && set +a
fi
pnpm --filter @workspace/db run push && echo "✅ DB schema up to date" \
  || { echo "⚠️  DB push failed — check DATABASE_URL in .env"; exit 1; }

echo ""
echo "🔨 Building frontend..."
NODE_ENV=production pnpm --filter @workspace/hesabat exec \
  vite build --config vite.production.config.ts

echo ""
echo "🔨 Building API server..."
pnpm --filter @workspace/api-server run build

echo ""
echo "📋 Copying frontend into API dist/public..."
mkdir -p "$APP_DIR/artifacts/api-server/dist/public"
cp -r "$APP_DIR/artifacts/hesabat/dist/public/." "$APP_DIR/artifacts/api-server/dist/public/"
echo "✅ Frontend files copied"

echo ""
echo "♻️  Restarting API..."
if pm2 describe hesabat-api &>/dev/null; then
  pm2 restart hesabat-api
else
  pm2 start "$APP_DIR/artifacts/api-server/dist/index.mjs" \
    --name hesabat-api --interpreter none -- --enable-source-maps
fi
pm2 save

echo ""
echo "✅ Update complete! $(date '+%H:%M:%S')"
pm2 status hesabat-api
