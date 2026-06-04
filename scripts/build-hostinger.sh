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

# Database migrations / seed SQL (run manually on Neon)
cp "$ROOT/hostinger-deploy-sql/migrate-ai-content-studio.sql" "$OUT/" 2>/dev/null || true
cp "$ROOT/hostinger-deploy-sql/migrate-social-autoposting.sql" "$OUT/" 2>/dev/null || true
cp "$ROOT/hostinger-deploy-sql/migrate-case-studies.sql" "$OUT/" 2>/dev/null || true

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

# ── استوديو المحتوى بالذكاء الاصطناعي (AI Content Studio) ──
# مفتاح Gemini المجاني من Google AI Studio (https://aistudio.google.com/apikey)
GEMINI_API_KEY=your_gemini_api_key_here
# (اختياري) بديل: مفتاح OpenAI لو حابب تستخدمه بدل Gemini
# OPENAI_API_KEY=sk-...
# (اختياري) تغيير الموديل الافتراضي
# AI_MODEL=gemini-2.5-flash

# ── النشر التلقائي على السوشيال ميديا (Social Auto-Posting) ──
# تُحفظ كأسرار (Secrets) ولا تُخزَّن في قاعدة البيانات أبداً.
# الرابط العام للموقع (مطلوب لإرفاق الصور في فيسبوك/إنستجرام)
SITE_URL=https://yourdomain.com

# ── إيميل نموذج التواصل (SMTP من Hostinger) ──
# بيانات بريد Hostinger (Email Accounts) عشان طلبات التواصل توصلك بالإيميل.
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=info@yourdomain.com
SMTP_PASS=your_email_password
# المُرسِل (غالباً نفس SMTP_USER)
SMTP_FROM=info@yourdomain.com
# الإيميل اللي هتوصله الطلبات (لو فاضي بيستخدم SMTP_USER)
LEAD_NOTIFICATION_TO=info@yourdomain.com

# ── رفع الصور (Image Uploads) ──
# مكان حفظ الصور المرفوعة من الداشبورد. خليه برّه مجلد dist عشان ميتمسحش مع كل تحديث.
UPLOADS_DIR=/home/youruser/uploads
# Facebook Page (Meta App موثّق + App Review لصلاحيات النشر)
# FACEBOOK_PAGE_ID=your_page_id
# FACEBOOK_PAGE_ACCESS_TOKEN=your_long_lived_page_token
# Instagram Business (مرتبط بصفحة فيسبوك، يستخدم نفس توكن الصفحة افتراضياً)
# INSTAGRAM_BUSINESS_ACCOUNT_ID=your_ig_business_account_id
# INSTAGRAM_ACCESS_TOKEN=optional_separate_token
# LinkedIn (LinkedIn Marketing Developer Platform approval)
# LINKEDIN_ACCESS_TOKEN=your_linkedin_token
# LINKEDIN_AUTHOR_URN=urn:li:organization:1234567
# (اختياري) إصدار Graph API
# GRAPH_API_VERSION=v21.0
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
   - GEMINI_API_KEY = مفتاح Gemini المجاني (لاستوديو المحتوى بالذكاء الاصطناعي)
   - SITE_URL      = الرابط العام للموقع (مطلوب لإرفاق الصور في النشر التلقائي)
   - بريد التواصل (SMTP من Hostinger) عشان طلبات النموذج توصلك إيميل:
     SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM / LEAD_NOTIFICATION_TO
   - UPLOADS_DIR = مكان حفظ الصور المرفوعة (خليه برّه dist عشان ميتمسحش مع التحديث)
   - مفاتيح السوشيال ميديا: تُدخَل من الداشبورد (ربط المنصات) وتُحفظ مشفّرة،
     أو اضبطها كمتغيرات بيئة (شوف .env.example):
     FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN
     INSTAGRAM_BUSINESS_ACCOUNT_ID
     LINKEDIN_ACCESS_TOKEN / LINKEDIN_AUTHOR_URN
4. حدّث قاعدة البيانات: شغّل الملفات التالية مرة واحدة على قاعدة البيانات:
   - migrate-ai-content-studio.sql (أعمدة status/scheduled_at + جدول social_posts)
   - migrate-social-autoposting.sql (أعمدة نتيجة النشر + جدول social_credentials المشفّر)
   - migrate-case-studies.sql (جدول دراسات الحالة case_studies)
5. شغّل الأمر: node dist/index.mjs
   أو من Script: npm start

=== الروابط ===
الموقع:        https://yourdomain.com/
المقالات:      https://yourdomain.com/articles
الداشبورد:     https://yourdomain.com/admin
استوديو المحتوى: https://yourdomain.com/admin/studio
ربط المنصات:    https://yourdomain.com/admin/social-connections
الـ API:       https://yourdomain.com/api/healthz
EOF

echo ""
echo "4️⃣  Creating zip archive..."
cd "$ROOT"
zip -r hostinger-deploy.zip hostinger-deploy/ -x "*.DS_Store"

echo ""
echo "✅ Done! File ready: hostinger-deploy.zip"
echo "   Size: $(du -sh hostinger-deploy.zip | cut -f1)"
