# Hesabat — دليل الـ Deployment على Hostinger VPS

**الهدف:** `hesabat.hg-audit.com` على Hostinger VPS  
**الآلية:** كل push على `main` → GitHub Actions → VPS تلقائياً

---

## الخطوة ١ — ربط Replit بـ GitHub

1. افتح الـ repo: `https://github.com/hazemgame12/hesabat-app`
2. في Replit: **Version Control** → **Connect to GitHub** → اختر الـ repo
3. من الآن كل checkpoint في Replit بيتنزل على GitHub تلقائياً

---

## الخطوة ٢ — GitHub Secrets (مرة واحدة)

افتح: `https://github.com/hazemgame12/hesabat-app/settings/secrets/actions`  
اضغط **New repository secret** لكل واحدة:

| الاسم | القيمة |
|---|---|
| `VPS_HOST` | IP الـ VPS بتاعك من Hostinger |
| `VPS_USER` | `root` (أو اليوزر اللي بتستخدمه) |
| `VPS_SSH_KEY` | محتوى ملف `~/.ssh/id_rsa` من جهازك (Private Key) |

**عشان تعرف SSH Key بتاعك:**
```bash
cat ~/.ssh/id_rsa
```
انسخ كل شيء من `-----BEGIN` للـ `-----END` وحطه في الـ Secret.

---

## الخطوة ٣ — إعداد الـ VPS (مرة واحدة)

اتصل بالـ VPS عن طريق SSH:
```bash
ssh root@YOUR_VPS_IP
```

ثم شغّل السكريبت:
```bash
curl -fsSL https://raw.githubusercontent.com/hazemgame12/hesabat-app/main/scripts/vps-setup.sh | bash
```

أو يدوياً:
```bash
git clone https://github.com/hazemgame12/hesabat-app /var/www/hesabat
cd /var/www/hesabat
bash scripts/vps-setup.sh
```

بعد ما يخلص، عدّل ملف البيئة:
```bash
nano /var/www/hesabat/.env
```
غيّر:
- `CHANGE_THIS_PASSWORD` → كلمة مرور PostgreSQL قوية
- `CHANGE_THIS_STRONG_PASSWORD` → كلمة مرور الـ admin
- `CHANGE_THIS_RANDOM_LONG_STRING` → نص عشوائي طويل

ثم:
```bash
pm2 restart hesabat-api
```

---

## الخطوة ٤ — DNS على Hostinger

في لوحة تحكم Hostinger → **Domains** → `hg-audit.com` → **DNS Zone**:

أضف record:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `hesabat` | `YOUR_VPS_IP` | 3600 |

---

## الخطوة ٥ — التحقق

بعد 5-10 دقائق:
```
https://hesabat.hg-audit.com        ← صفحة حسابات
https://hesabat.hg-audit.com/api/healthz  ← API صحة
```

---

## بعد كده — كيف يشتغل التحديث؟

1. تعديل في Replit → Checkpoint تلقائي → Push إلى GitHub
2. GitHub Actions يشتغل (5-10 دقائق build)
3. الـ VPS يسحب الكود الجديد ويعيد تشغيل الأب
4. الموقع اتحدّث بدون downtime

---

## أوامر مفيدة على الـ VPS

```bash
# حالة الأب
pm2 status

# لوجز مباشرة
pm2 logs hesabat-api

# إعادة تشغيل يدوي
pm2 restart hesabat-api

# حالة nginx
systemctl status nginx

# تجديد SSL (تلقائي عن طريق certbot)
certbot renew --dry-run
```

---

## ملاحظات مهمة

- **قاعدة البيانات** على الـ VPS نفسه (PostgreSQL local) — البيانات في Replit **لن تنتقل تلقائياً**
- عشان تنقل بيانات Replit للـ VPS: اتصل بنا نعمل export/import
- الـ SSL (HTTPS) يتجدد تلقائياً كل 3 شهور عن طريق Certbot
