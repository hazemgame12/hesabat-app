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
