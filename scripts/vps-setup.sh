#!/bin/bash
# =============================================================
# Hesabat — VPS First-Time Setup Script
# Run this ONCE on your Hostinger VPS as root
# Server: hesabat.hg-audit.com
# =============================================================
set -e

APP_DIR=/var/www/hesabat
APP_USER=hesabat
DOMAIN=hesabat.hg-audit.com
REPO=https://github.com/hazemgame12/hesabat-app.git

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Hesabat VPS Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. System packages ───────────────────────────────────────
apt-get update -y
apt-get install -y curl git nginx certbot python3-certbot-nginx ufw

# ── 2. Node.js 20 via nvm ───────────────────────────────────
if ! command -v node &>/dev/null; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  source "$NVM_DIR/nvm.sh"
  nvm install 20
  nvm alias default 20
fi

# ── 3. pnpm ─────────────────────────────────────────────────
if ! command -v pnpm &>/dev/null; then
  npm install -g pnpm@9
fi

# ── 4. PM2 ──────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2
  pm2 startup
fi

# ── 5. PostgreSQL ────────────────────────────────────────────
if ! command -v psql &>/dev/null; then
  apt-get install -y postgresql postgresql-contrib
  systemctl enable postgresql
  systemctl start postgresql
  # Create DB and user
  sudo -u postgres psql -c "CREATE USER hesabat WITH PASSWORD 'CHANGE_THIS_PASSWORD';"
  sudo -u postgres psql -c "CREATE DATABASE hesabat_db OWNER hesabat;"
  echo ""
  echo "⚠️  PostgreSQL created:"
  echo "   User: hesabat  |  DB: hesabat_db"
  echo "   Password: CHANGE_THIS_PASSWORD  ← غيّرها فوراً!"
  echo ""
fi

# ── 6. App directory ─────────────────────────────────────────
mkdir -p "$APP_DIR"
cd "$APP_DIR"

if [ ! -d ".git" ]; then
  git clone "$REPO" .
fi

# ── 7. Build ─────────────────────────────────────────────────
export NODE_ENV=production
pnpm install --frozen-lockfile
pnpm run typecheck:libs
NODE_ENV=production pnpm --filter @workspace/hesabat exec \
  vite build --config vite.production.config.ts
pnpm --filter @workspace/api-server run build

# ── 8. .env file ────────────────────────────────────────────
if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" << 'ENV'
# ⚠️  Fill in all values before starting the app

DATABASE_URL=postgresql://hesabat:CHANGE_THIS_PASSWORD@localhost:5432/hesabat_db
ADMIN_SECRET=CHANGE_THIS_STRONG_PASSWORD
SESSION_SECRET=CHANGE_THIS_RANDOM_LONG_STRING

NODE_ENV=production
PORT=4000

# Uploads directory (outside dist so it survives deploys)
UPLOADS_DIR=/var/www/hesabat-uploads
ENV
  mkdir -p /var/www/hesabat-uploads
  echo "⚠️  تم إنشاء .env — عدّله قبل تشغيل الأب!"
fi

# ── 9. PM2 start ────────────────────────────────────────────
pm2 delete hesabat-api 2>/dev/null || true
pm2 start "$APP_DIR/artifacts/api-server/dist/index.mjs" \
  --name hesabat-api \
  --interpreter none \
  --env production \
  -- --enable-source-maps
pm2 save

# ── 10. nginx config ─────────────────────────────────────────
cat > /etc/nginx/sites-available/hesabat << NGINX
server {
    listen 80;
    server_name $DOMAIN;

    # Serve static Hesabat frontend
    root $APP_DIR/artifacts/hesabat/dist/public;
    index index.html;

    # API — proxy to Node
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # SPA fallback — كل route يرجّع index.html
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/hesabat /etc/nginx/sites-enabled/hesabat
nginx -t && systemctl reload nginx

# ── 11. SSL via Certbot ───────────────────────────────────────
echo ""
echo "🔐 Installing SSL certificate for $DOMAIN ..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email info@hg-audit.com --redirect

# ── 12. Firewall ─────────────────────────────────────────────
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup complete!"
echo "   URL: https://$DOMAIN"
echo ""
echo "⚠️  تذكّر:"
echo "   1. عدّل $APP_DIR/.env بكلمات مرور حقيقية"
echo "   2. pm2 restart hesabat-api"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
