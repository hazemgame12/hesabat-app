# Hesabat — VPS Deployment Plan
## Beta → Production Strategy على Hostinger VPS

> **مبدأ أساسي:** Replit يفضل شغّال كـ Development IDE.
> لا نوقف Replit ولا نحوّل traffic للـ Production إلا بعد اعتماد الـ Beta كامل.

---

## 1. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        المطوّر / Developer                          │
│                                                                     │
│   ┌──────────────┐   checkpoint/push   ┌──────────────────────┐    │
│   │   Replit     │────────────────────→│  GitHub              │    │
│   │  (Dev IDE)   │                     │  hazemgame12/        │    │
│   │  dev only    │                     │  hesabat-app         │    │
│   └──────────────┘                     └──────────┬───────────┘    │
│                                                   │                 │
└───────────────────────────────────────────────────┼─────────────────┘
                                                    │
                              ┌─────────────────────┴──────────────────┐
                              │         GitHub Actions (CI/CD)          │
                              │                                         │
                              │  push → beta  ──→  auto deploy          │
                              │  push → main  ──→  manual trigger only  │
                              └──────────────┬──────────────────────────┘
                                             │ SSH + rsync
                                             │
          ┌──────────────────────────────────▼──────────────────────────────┐
          │                    Hostinger VPS (Ubuntu 24.04)                  │
          │                                                                  │
          │   ┌────────────────────────────────────────────────────────┐    │
          │   │                  nginx (port 80 / 443)                 │    │
          │   │                                                        │    │
          │   │  beta.hesabat.com  ──┐        app.hesabat.com  ──┐    │    │
          │   └─────────────────────┼────────────────────────────┼────┘    │
          │                         │                            │          │
          │   ┌─────────────────────▼──┐    ┌───────────────────▼──┐       │
          │   │   PM2: hesabat-beta    │    │  PM2: hesabat-api    │       │
          │   │   port: 4001           │    │  port: 4000          │       │
          │   │   /var/www/hesabat     │    │  /var/www/hesabat    │       │
          │   │   DB: hesabat_beta_db  │    │  DB: hesabat_db      │       │
          │   └────────────┬───────────┘    └──────────┬───────────┘       │
          │                │                            │                   │
          │   ┌────────────▼────────────────────────────▼──────────────┐   │
          │   │               PostgreSQL 16                             │   │
          │   │   hesabat_beta_db  (Beta — بيانات تجريبية)             │   │
          │   │   hesabat_db       (Production — بيانات حقيقية)         │   │
          │   └─────────────────────────────────────────────────────────┘  │
          │                                                                  │
          │   ┌─────────────────────────────────────────────────────────┐   │
          │   │  /var/backups/hesabat/  (daily 02:00 AM, 7-day retain)  │   │
          │   │  /var/www/hesabat-uploads/  (ملفات مرفقة Production)    │   │
          │   │  /var/www/hesabat-uploads-beta/  (ملفات Beta)           │   │
          │   └─────────────────────────────────────────────────────────┘   │
          └──────────────────────────────────────────────────────────────────┘

SSL: Let's Encrypt (Certbot) — يتجدد تلقائياً كل 90 يوم
```

---

## 2. Domain Strategy

| Domain | الغرض | الجمهور |
|---|---|---|
| `beta.hesabat.com` | Staging / اختبار | مجموعة Beta صغيرة |
| `app.hesabat.com` | Production | كل العملاء |
| Replit URL | Development فقط | المطوّر فقط |

> **ملاحظة:** `hesabat.hg-audit.com` القديم — ممكن يفضل كـ alias أو نلغيه بعد launch.

---

## 3. Required DNS Changes

في Hostinger → Domains → `hesabat.com` → DNS Zone:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `beta` | `YOUR_VPS_IP` | 3600 |
| A | `app` | `YOUR_VPS_IP` | 3600 |

> **وقت انتشار الـ DNS:** 5 دقائق على Hostinger عادةً (max 24 ساعة globally).

---

## 4. Server Components

| Component | الإصدار | الوظيفة |
|---|---|---|
| Ubuntu | 24.04 LTS | نظام التشغيل |
| Node.js | 20 LTS | تشغيل API Server |
| PostgreSQL | 16 | قاعدة البيانات |
| nginx | latest | Reverse Proxy + Static Files |
| PM2 | latest | Process Manager + Auto-restart |
| Certbot | latest | SSL / HTTPS |
| pnpm | 9 | Package Manager |

---

## 5. Environment Variables

### Beta (`.env.beta`)
```env
NODE_ENV=production
PORT=4001
DATABASE_URL=postgresql://hesabat:BETA_PASSWORD@localhost:5432/hesabat_beta_db
ADMIN_SECRET=BETA_ADMIN_SECRET
SESSION_SECRET=BETA_SESSION_SECRET_RANDOM_LONG
UPLOADS_DIR=/var/www/hesabat-uploads-beta
APP_ENV=beta
```

### Production (`.env.production`)
```env
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://hesabat:PROD_PASSWORD@localhost:5432/hesabat_db
ADMIN_SECRET=PROD_ADMIN_SECRET_STRONG
SESSION_SECRET=PROD_SESSION_SECRET_RANDOM_LONG
UPLOADS_DIR=/var/www/hesabat-uploads
APP_ENV=production
```

> ⚠️ كلمات المرور تختلف بين Beta وProduction. لا تشاركهم مع أي أحد.

---

## 6. GitHub Actions Workflow Strategy

### الآن (Beta Phase)
```
push → beta branch  →  Auto deploy → beta.hesabat.com  ✅
push → main branch  →  Manual trigger only              ⏸️
```

### بعد اعتماد Beta (Production Phase)
```
push → main branch  →  Auto deploy → app.hesabat.com  ✅
```

**GitHub Secrets المطلوبة:**

| Secret | القيمة |
|---|---|
| `VPS_HOST` | IP الـ VPS |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | Private SSH Key |
| `BETA_DB_PASSWORD` | كلمة مرور Beta DB |
| `PROD_DB_PASSWORD` | كلمة مرور Production DB |
| `BETA_ADMIN_SECRET` | Admin secret للـ Beta |
| `PROD_ADMIN_SECRET` | Admin secret للـ Production |
| `BETA_SESSION_SECRET` | Session secret للـ Beta |
| `PROD_SESSION_SECRET` | Session secret للـ Production |

---

## 7. Monitoring & Logging

### PM2 Monitoring
```bash
pm2 status                     # حالة كل الـ processes
pm2 logs hesabat-beta          # logs البيتا
pm2 logs hesabat-api           # logs البرودكشن
pm2 monit                      # dashboard مباشر
```

### nginx Logs
```bash
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
tail -f /var/log/nginx/beta.hesabat.com.access.log
tail -f /var/log/nginx/app.hesabat.com.access.log
```

### Backup Logs
```bash
tail -50 /var/backups/hesabat/backup.log
```

### Health Check URLs
```
https://beta.hesabat.com/api/healthz   ← Beta API
https://app.hesabat.com/api/healthz    ← Production API
```

---

## 8. Backup Strategy (مطبّق بالفعل)

| البند | التفاصيل |
|---|---|
| وقت التشغيل | 02:00 AM يومياً |
| PostgreSQL | `pg_dump` → gzip → `/var/backups/hesabat/postgres/` |
| Uploads | tar.gz → `/var/backups/hesabat/uploads/` |
| Retention | 7 أيام (Beta) → 30 يوم (Production) |
| Restore Test | تلقائي مع كل إعداد |

---

## 9. Deployment Steps (الترتيب التنفيذي)

### المرحلة أ — إعداد الـ VPS (مرة واحدة) ⏱️ 30-45 دقيقة

```
[ ] 1. SSH للـ VPS كـ root
[ ] 2. تشغيل vps-setup.sh (يثبّت كل حاجة تلقائياً)
[ ] 3. إعداد ملفات .env.beta و .env.production
[ ] 4. تشغيل beta-setup.sh (يضيف البيتا على نفس السيرفر)
[ ] 5. إضافة DNS records لـ beta.hesabat.com و app.hesabat.com
```

### المرحلة ب — اختبار البيتا ⏱️ 1-2 أسبوع

```
[ ] 6. إضافة GitHub Secrets
[ ] 7. Push على beta branch → يشتغل تلقائياً على beta.hesabat.com
[ ] 8. اختبار مع مجموعة Beta
[ ] 9. مراجعة logs ومشاكل
[ ] 10. Bugfixes → push على beta → اختبار
```

### المرحلة ج — Production Cutover ⏱️ 1-2 ساعة

```
[ ] 11. اعتماد البيتا (لا مشاكل خطيرة)
[ ] 12. تشغيل Production Deploy يدوياً من GitHub Actions
[ ] 13. التحقق من app.hesabat.com
[ ] 14. تحويل beta users للـ production
[ ] 15. إعلان الـ Launch ✅
```

---

## 10. Rollback Plan

### لو فشل Deploy على Beta
```bash
# على الـ VPS
cd /var/www/hesabat
git log --oneline -5          # شوف الـ commits
git checkout <previous-hash>  # ارجع للـ commit السابق
pm2 restart hesabat-beta
```

### لو فشل Deploy على Production
```bash
# على الـ VPS
cd /var/www/hesabat
git log --oneline -5
git checkout <previous-hash>
NODE_ENV=production pnpm --filter @workspace/hesabat exec vite build --config vite.production.config.ts
pnpm --filter @workspace/api-server run build
pm2 restart hesabat-api
```

### لو فسدت قاعدة البيانات (أسوأ سيناريو)
```bash
# استعادة من آخر backup
pm2 stop hesabat-api
sudo -u postgres psql -c "DROP DATABASE hesabat_db;"
sudo -u postgres psql -c "CREATE DATABASE hesabat_db OWNER hesabat;"
gunzip -c /var/backups/hesabat/postgres/hesabat_LATEST.sql.gz | sudo -u postgres psql hesabat_db
pm2 start hesabat-api
```

> وقت الاستعادة المتوقع: **5-10 دقائق** من آخر backup.

---

## 11. Production Cutover Plan (تفصيلي)

### قبل الـ Cutover بيوم
- [ ] آخر backup يدوي لـ Replit DB
- [ ] Export بيانات Replit بـ `pg_dump` وإرسالها للـ VPS
- [ ] اختبار الـ import على Beta DB أولاً
- [ ] تأكيد اشتغال كل الـ features على Beta

### يوم الـ Cutover
- [ ] إشعار المستخدمين بـ maintenance window (30 دقيقة)
- [ ] وقف كتابة بيانات جديدة على Replit
- [ ] آخر `pg_dump` من Replit → import على Production DB
- [ ] تشغيل Production deploy من GitHub Actions
- [ ] اختبار سريع على `app.hesabat.com`
- [ ] تحويل الـ DNS (لو في domain موحّد) → Production
- [ ] فتح التطبيق للمستخدمين

### بعد الـ Cutover
- [ ] مراقبة logs لأول 2 ساعة
- [ ] Replit يفضل شغّال للـ Development بس
- [ ] تأكيد Backup اليوم التالي ✅

---

## 12. Estimated Deployment Time

| المرحلة | الوقت التقديري |
|---|---|
| VPS Setup (vps-setup.sh) | 30-45 دقيقة |
| DNS Propagation | 5 دقائق - 1 ساعة |
| SSL Installation | 5 دقائق |
| Beta Environment Setup | 15 دقائق |
| First Deploy (GitHub Actions) | 8-12 دقيقة |
| **إجمالي أول deployment** | **~1.5 ساعة** |
| Beta Testing Period | 1-2 أسبوع |
| Production Cutover | 1-2 ساعة |

---

## 13. Final Deployment Checklist

### VPS Ready
- [ ] VPS شغّال وعنده IP ثابت
- [ ] SSH Access شغّال من جهازك
- [ ] Ubuntu 24.04 مثبّت

### DNS
- [ ] A record: `beta` → VPS IP
- [ ] A record: `app` → VPS IP
- [ ] DNS منتشر (تقدر تتحقق بـ `ping beta.hesabat.com`)

### GitHub
- [ ] Repo: `hazemgame12/hesabat-app` فيه الكود
- [ ] Secret: `VPS_HOST` متحوط
- [ ] Secret: `VPS_USER` متحوط
- [ ] Secret: `VPS_SSH_KEY` متحوط
- [ ] Workflow `.github/workflows/deploy.yml` موجود
- [ ] Workflow `.github/workflows/deploy-beta.yml` موجود

### VPS Software (يتثبّت تلقائياً بـ vps-setup.sh)
- [ ] Node.js 20 ✅
- [ ] pnpm 9 ✅
- [ ] PM2 ✅
- [ ] PostgreSQL 16 ✅
- [ ] nginx ✅
- [ ] Certbot / SSL ✅
- [ ] UFW Firewall (22, 80, 443 فقط) ✅

### Environment
- [ ] `/var/www/hesabat/.env` معبّي (Production)
- [ ] `/var/www/hesabat/.env.beta` معبّي (Beta)
- [ ] كلمات مرور قوية (مش `CHANGE_THIS`)
- [ ] `SESSION_SECRET` عشوائي وطويل (min 64 char)

### Application
- [ ] `pm2 status` يظهر hesabat-api و hesabat-beta كـ online
- [ ] `https://beta.hesabat.com` يفتح
- [ ] `https://beta.hesabat.com/api/healthz` يرجع 200
- [ ] SSL شغّال (🔒 في المتصفح)

### Backups
- [ ] `/var/backups/hesabat/postgres/` فيه backup
- [ ] Restore test نجح
- [ ] Cron job شغّال: `cat /etc/cron.d/hesabat-backup`

### Beta Testing
- [ ] تسجيل دخول شغّال
- [ ] إنشاء شركة شغّال
- [ ] قيود محاسبية شغّالة
- [ ] فواتير شغّالة
- [ ] ملفات مرفقة شغّالة
- [ ] لا errors في `pm2 logs hesabat-beta`

### Production Cutover (لاحقاً)
- [ ] Beta approved من المستخدمين
- [ ] بيانات Replit منقولة للـ Production DB
- [ ] `https://app.hesabat.com` يفتح ويشتغل كامل
- [ ] Backup أول Production DB ✅
- [ ] الـ Launch ✅

---

## ما هو خارج نطاق هذا الـ Plan

- Email notifications لو فشل الـ backup (ممكن نضيفها لاحقاً)
- Horizontal scaling (مش محتاجين دلوقتي)
- Redis caching (مش محتاجين في Beta)
- نقل بيانات Replit الحالية (خطوة منفصلة)
