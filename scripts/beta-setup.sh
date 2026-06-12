#!/bin/bash
# =============================================================
# Hesabat — Beta Environment Setup Script
# Run AFTER vps-setup.sh on the same VPS
# Adds beta.hesabat.com alongside the production setup
# =============================================================
set -e

APP_DIR=/var/www/hesabat
BETA_DOMAIN=beta.hg-audit.com
PROD_DOMAIN=hesabat.hg-audit.com
BETA_PORT=4001

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Hesabat Beta Environment Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Beta PostgreSQL database ──────────────────────────────
echo "Setting up Beta PostgreSQL database ..."
sudo -u postgres psql -c "CREATE DATABASE hesabat_beta_db OWNER hesabat;" 2>/dev/null \
  && echo "   ✅ hesabat_beta_db created" \
  || echo "   ⚠️  hesabat_beta_db already exists — skipping"

# ── 2. Uploads directory for Beta ────────────────────────────
mkdir -p /var/www/hesabat-uploads-beta
echo "   ✅ /var/www/hesabat-uploads-beta created"

# ── 3. .env.beta file ────────────────────────────────────────
if [ ! -f "$APP_DIR/.env.beta" ]; then
  cat > "$APP_DIR/.env.beta" << 'ENV'
# ⚠️  Fill in all values before starting Beta
NODE_ENV=production
PORT=4001
DATABASE_URL=postgresql://hesabat:BETA_DB_PASSWORD@localhost:5432/hesabat_beta_db
ADMIN_SECRET=BETA_ADMIN_SECRET
SESSION_SECRET=BETA_SESSION_SECRET_RANDOM_64_CHARS_MIN
UPLOADS_DIR=/var/www/hesabat-uploads-beta
APP_ENV=beta
ENV
  echo "   ✅ .env.beta created — ⚠️  عدّله قبل تشغيل البيتا!"
else
  echo "   ✅ .env.beta already exists"
fi

# ── 4. Run Drizzle migrations on Beta DB ─────────────────────
echo "Running DB migrations on hesabat_beta_db ..."
cd "$APP_DIR"
# Load beta env then push schema
set -a && source .env.beta && set +a
pnpm --filter @workspace/db run push || echo "   ⚠️  Migration failed — check .env.beta DATABASE_URL"

# ── 5. Start Beta PM2 process ────────────────────────────────
echo "Starting PM2 process for Beta ..."
pm2 delete hesabat-beta 2>/dev/null || true
ENV_FILE="$APP_DIR/.env.beta" pm2 start \
  "$APP_DIR/artifacts/api-server/dist/index.mjs" \
  --name hesabat-beta \
  --interpreter none \
  -- --enable-source-maps
pm2 save
echo "   ✅ PM2 hesabat-beta started on port $BETA_PORT"

# ── 6. nginx server block for Beta ───────────────────────────
cat > /etc/nginx/sites-available/hesabat-beta << NGINX
server {
    listen 80;
    server_name $BETA_DOMAIN;

    # Beta banner header
    add_header X-Environment "beta" always;

    # Serve static Hesabat frontend
    root $APP_DIR/artifacts/hesabat/dist/public;
    index index.html;

    # API — proxy to Beta Node process
    location /api/ {
        proxy_pass http://127.0.0.1:$BETA_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX

# nginx server block for Production
cat > /etc/nginx/sites-available/hesabat-prod << NGINX
server {
    listen 80;
    server_name $PROD_DOMAIN;

    # Serve static Hesabat frontend
    root $APP_DIR/artifacts/hesabat/dist/public;
    index index.html;

    # API — proxy to Production Node process
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

    # SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/hesabat-beta /etc/nginx/sites-enabled/hesabat-beta
ln -sf /etc/nginx/sites-available/hesabat-prod /etc/nginx/sites-enabled/hesabat-prod

nginx -t && systemctl reload nginx
echo "   ✅ nginx configured for $BETA_DOMAIN and $PROD_DOMAIN"

# ── 7. SSL for both domains ───────────────────────────────────
echo "Installing SSL certificates ..."
certbot --nginx \
  -d "$BETA_DOMAIN" \
  -d "$PROD_DOMAIN" \
  --non-interactive \
  --agree-tos \
  --email info@hg-audit.com \
  --redirect \
  && echo "   ✅ SSL installed for $BETA_DOMAIN and $PROD_DOMAIN" \
  || echo "   ⚠️  SSL failed — تأكد إن الـ DNS منتشر على IP الـ VPS"

# ── 8. Separate nginx access logs per domain ─────────────────
sed -i "s|access_log /var/log/nginx/access.log;|access_log /var/log/nginx/beta.hesabat.com.access.log;|" \
  /etc/nginx/sites-available/hesabat-beta 2>/dev/null || true
sed -i "s|access_log /var/log/nginx/access.log;|access_log /var/log/nginx/app.hesabat.com.access.log;|" \
  /etc/nginx/sites-available/hesabat-prod 2>/dev/null || true
nginx -t && systemctl reload nginx 2>/dev/null || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Beta environment ready!"
echo ""
echo "   Beta:        https://$BETA_DOMAIN"
echo "   Production:  https://$PROD_DOMAIN"
echo ""
echo "⚠️  اللي لازم تعمله دلوقتي:"
echo "   1. nano $APP_DIR/.env.beta"
echo "      ← غيّر BETA_DB_PASSWORD و BETA_ADMIN_SECRET و BETA_SESSION_SECRET"
echo "   2. pm2 restart hesabat-beta"
echo "   3. تحقق: curl https://$BETA_DOMAIN/api/healthz"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
