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

# ── 10. nginx — Rate Limiting + config ───────────────────────
# Inject rate-limit zones into the http block (idempotent)
NGINX_CONF=/etc/nginx/nginx.conf
if ! grep -q "hesabat_login" "$NGINX_CONF"; then
  sed -i '/http {/a\\n\t# Hesabat rate limits\n\tlimit_req_zone $binary_remote_addr zone=hesabat_login:10m rate=5r/m;\n\tlimit_req_zone $binary_remote_addr zone=hesabat_api:10m rate=60r/m;\n\tlimit_req_status 429;\n' "$NGINX_CONF"
  echo "   ✅ Rate limiting zones added to nginx.conf"
fi

cat > /etc/nginx/sites-available/hesabat << NGINX
server {
    listen 80;
    server_name $DOMAIN;

    root $APP_DIR/artifacts/hesabat/dist/public;
    index index.html;

    # ── Rate-limited auth endpoints ──────────────────────────
    location = /api/auth/login {
        limit_req zone=hesabat_login burst=5 nodelay;
        limit_req_log_level warn;
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location = /api/auth/forgot-password {
        limit_req zone=hesabat_login burst=2 nodelay;
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location = /api/auth/reset-password {
        limit_req zone=hesabat_login burst=2 nodelay;
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # ── General API — rate limited ────────────────────────────
    location /api/ {
        limit_req zone=hesabat_api burst=30 nodelay;
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

    # ── SPA fallback ──────────────────────────────────────────
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/hesabat /etc/nginx/sites-enabled/hesabat
nginx -t && systemctl reload nginx
echo "   ✅ nginx configured with rate limiting"

# ── 11. SSL via Certbot ───────────────────────────────────────
echo ""
echo "🔐 Installing SSL certificate for $DOMAIN ..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email info@hg-audit.com --redirect

# ── 12. Firewall ─────────────────────────────────────────────
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# ── 13. Backup system ────────────────────────────────────────
echo ""
echo "🗄️  Setting up daily backup system ..."

BACKUP_ROOT=/var/backups/hesabat
mkdir -p "$BACKUP_ROOT/postgres" "$BACKUP_ROOT/uploads"

# Copy backup scripts
cp "$APP_DIR/scripts/backup.sh" /usr/local/bin/hesabat-backup
cp "$APP_DIR/scripts/restore-test.sh" /usr/local/bin/hesabat-restore-test
chmod +x /usr/local/bin/hesabat-backup /usr/local/bin/hesabat-restore-test

# Install cron job — daily at 2:00 AM server time
CRON_LINE="0 2 * * * root /usr/local/bin/hesabat-backup >> /var/backups/hesabat/backup.log 2>&1"
CRON_FILE=/etc/cron.d/hesabat-backup

if ! grep -qF "hesabat-backup" "$CRON_FILE" 2>/dev/null; then
  echo "$CRON_LINE" > "$CRON_FILE"
  chmod 644 "$CRON_FILE"
  echo "   ✅ Cron job installed: daily at 02:00 AM"
else
  echo "   ✅ Cron job already installed"
fi

# Run first backup immediately to verify it works
echo "   Running first backup now ..."
/usr/local/bin/hesabat-backup && echo "   ✅ First backup succeeded" || echo "   ⚠️  First backup failed — check $BACKUP_ROOT/backup.log"

# Run restore test
echo "   Running restore test ..."
/usr/local/bin/hesabat-restore-test && echo "   ✅ Restore test passed" || echo "   ⚠️  Restore test failed — check $BACKUP_ROOT/restore-test.log"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup complete!"
echo "   URL: https://$DOMAIN"
echo ""
echo "⚠️  تذكّر:"
echo "   1. عدّل $APP_DIR/.env بكلمات مرور حقيقية"
echo "   2. pm2 restart hesabat-api"
echo "   3. Backups: $BACKUP_ROOT (daily 02:00 AM, 7-day retention)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
