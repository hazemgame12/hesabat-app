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
