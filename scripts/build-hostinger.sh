#!/bin/bash
set -e

echo "🔨 Building HG Website for Hostinger deployment..."

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/hostinger-deploy"

rm -rf "$OUT"
mkdir -p "$OUT"

echo ""
echo "1️⃣  Building React frontend (BASE_PATH=/ PORT=3000)..."
cd "$ROOT/artifacts/hg-website"
PORT=3000 BASE_PATH=/ NODE_ENV=production pnpm run build

echo ""
echo "2️⃣  Building API server..."
cd "$ROOT/artifacts/api-server"
pnpm run build

echo ""
echo "3️⃣  Assembling deployment package..."
cp -r "$ROOT/artifacts/api-server/dist" "$OUT/dist"
mkdir -p "$OUT/dist/public"
cp -r "$ROOT/artifacts/hg-website/dist/public/." "$OUT/dist/public/"

cat > "$OUT/package.json" << 'EOF'
{
  "name": "hg-website",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node dist/index.mjs"
  },
  "engines": {
    "node": ">=20"
  }
}
EOF

cat > "$OUT/.env.example" << 'EOF'
# قاعدة البيانات (PostgreSQL)
DATABASE_URL=postgresql://user:password@localhost:5432/hg_db

# كلمة سر لوحة التحكم
ADMIN_SECRET=your_strong_password_here

# Session secret (أي نص عشوائي طويل)
SESSION_SECRET=your_random_session_secret_here

# Port السيرفر (Hostinger بتحدده تلقائياً)
PORT=3000
EOF

cat > "$OUT/README.txt" << 'EOF'
=== HG Financial Consulting — Hostinger Deployment ===

1. ارفع محتوى هذا الملف المضغوط على Hostinger (Node.js app directory)
2. في cPanel أو Hostinger Panel، اضبط:
   - Entry point: dist/index.mjs
   - Node.js version: 20+
3. أضف متغيرات البيئة (Environment Variables):
   - DATABASE_URL  = رابط PostgreSQL بتاعك
   - ADMIN_SECRET  = كلمة مرور الداشبورد
   - SESSION_SECRET = نص عشوائي طويل
   - PORT          = البورت اللي Hostinger بيحدده
4. شغّل الأمر: node dist/index.mjs
   أو من Script: npm start

=== الروابط ===
الموقع:      https://yourdomain.com/
المقالات:    https://yourdomain.com/articles
الداشبورد:   https://yourdomain.com/admin
الـ API:     https://yourdomain.com/api/healthz
EOF

echo ""
echo "4️⃣  Creating zip archive..."
cd "$ROOT"
zip -r hostinger-deploy.zip hostinger-deploy/ -x "*.DS_Store"

echo ""
echo "✅ Done! File ready: hostinger-deploy.zip"
echo "   Size: $(du -sh hostinger-deploy.zip | cut -f1)"
