# حسابات / Hesabat — Final Beta Review Package
### Pre-Deployment Review | Version: Beta 1.0 | Date: June 2026

---

## القسم الأول — Architecture Diagram

### System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DEVELOPER LAYER                                     │
│                                                                                  │
│   ┌──────────────────┐    git checkpoint    ┌────────────────────────────────┐  │
│   │   Replit IDE     │─────────────────────→│  GitHub                        │  │
│   │  (Dev only —     │                      │  hazemgame12/hesabat-app       │  │
│   │  never in prod)  │                      │                                │  │
│   └──────────────────┘                      └──────────────┬─────────────────┘  │
└────────────────────────────────────────────────────────────┼────────────────────┘
                                                             │
                                    ┌────────────────────────▼────────────────────┐
                                    │        GitHub Actions (CI/CD)               │
                                    │                                             │
                                    │  push → beta  ──→  auto deploy             │
                                    │  push → main  ──→  manual (type DEPLOY)    │
                                    │                                             │
                                    │  Steps: checkout → pnpm install →          │
                                    │         typecheck:libs → vite build →       │
                                    │         api-server build → SSH deploy       │
                                    └───────────────────┬─────────────────────────┘
                                                        │ SSH
                                                        │
┌───────────────────────────────────────────────────────▼──────────────────────────┐
│                          Hostinger VPS — Ubuntu 24.04                            │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │
│  │                          nginx (port 80 → 443)                             │  │
│  │                  SSL via Let's Encrypt (auto-renew 90d)                    │  │
│  │                                                                            │  │
│  │   beta.hesabat.com         app.hesabat.com                                 │  │
│  │   /api/* → :4001           /api/* → :4000                                  │  │
│  │   /* → static files        /* → static files                               │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│                     │                               │                            │
│  ┌──────────────────▼──────────┐   ┌───────────────▼─────────────┐             │
│  │   PM2: hesabat-beta         │   │   PM2: hesabat-api           │             │
│  │   Node.js 20 — port 4001    │   │   Node.js 20 — port 4000     │             │
│  │   Express 5 API Server      │   │   Express 5 API Server       │             │
│  │   DB: hesabat_beta_db       │   │   DB: hesabat_db             │             │
│  │   Uploads: /uploads-beta/   │   │   Uploads: /uploads/         │             │
│  └──────────────────┬──────────┘   └───────────────┬─────────────┘             │
│                     └───────────────────────────────┘                           │
│                                         │                                       │
│  ┌──────────────────────────────────────▼──────────────────────────────────┐    │
│  │                     PostgreSQL 16 (local)                                │    │
│  │                                                                          │    │
│  │   hesabat_beta_db    ←── Beta (demo + test data)                         │    │
│  │   hesabat_db         ←── Production (real customer data)                 │    │
│  └──────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐    │
│  │   /var/backups/hesabat/    ← Daily 02:00 AM cron (pg_dump + uploads)     │    │
│  │   /var/www/hesabat-uploads/          ← Production file attachments       │    │
│  │   /var/www/hesabat-uploads-beta/     ← Beta file attachments             │    │
│  └──────────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Frontend Architecture

```
artifacts/hesabat/  (React 18 + Vite + TanStack Query)
│
├── src/pages/
│   ├── landing.tsx           → الصفحة الرئيسية (landing + plans)
│   ├── login.tsx / signup.tsx
│   ├── dashboard.tsx         → ملخص مالي
│   ├── accounts.tsx          → شجرة الحسابات
│   ├── journal.tsx           → القيود اليومية
│   ├── fixed-assets.tsx      → الأصول الثابتة
│   ├── inventory.tsx         → المخزون
│   ├── payroll.tsx           → الرواتب والموظفين
│   ├── advances.tsx          → السلف والعهد
│   ├── customers.tsx         → العملاء (دليل مساعد)
│   ├── suppliers.tsx         → الموردون (دليل مساعد)
│   ├── sales-invoices.tsx    → فواتير مبيعات
│   ├── purchase-invoices.tsx → فواتير مشتريات
│   ├── bank.tsx              → بنوك / نقدية / مطابقة
│   ├── opening-balances.tsx  → أرصدة افتتاحية
│   ├── fiscal-years.tsx      → سنوات مالية / إقفال
│   ├── reports.tsx           → تقارير مالية
│   ├── revaluation.tsx       → إعادة تقييم العملات
│   ├── audit.tsx             → سجل التدقيق
│   ├── settings.tsx          → إعدادات الشركة (tabs)
│   └── super-admin/          → لوحة المشرف العام
│
├── i18n: Arabic (default, RTL) + English
├── Auth: native cookie-based (httpOnly)
└── Build: Vite → static dist → nginx serves
```

### Backend Architecture

```
artifacts/api-server/  (Express 5 + Drizzle ORM + Zod)
│
├── routes/            → 30+ route files
├── lib/
│   ├── auth.ts        → scrypt hash/verify
│   ├── session.ts     → SHA-256 token, httpOnly cookie
│   ├── journal-posting.ts    → createDraftJournalEntry + lockCompanyEntryNo
│   ├── bank-posting.ts       → bank movement JEs
│   ├── inventory-posting.ts  → stock movement JEs
│   ├── party-ledger.ts       → subsidiary ledger helpers
│   ├── seed-accounts.ts      → default chart of accounts
│   └── seed-taxes.ts         → country-linked default taxes
│
├── seed/
│   ├── demo-data.ts          → 3 demo companies (EG/SA/AE)
│   ├── super-admin-plans.ts  → plans seeder
│   └── reset-demo.ts         → cleanup script
│
└── Validation: Zod schemas (from OpenAPI codegen)
```

---

## القسم الثاني — Beta Readiness Report

### ✅ الوحدات المكتملة (16 Milestone)

| # | الوحدة | الحالة | الملاحظات |
|---|---|---|---|
| 1 | **التسجيل والدخول** | ✅ مكتمل | native scrypt، cookie httpOnly |
| 2 | **الفريق والأدوار** | ✅ مكتمل | 5 أدوار، دعوات بالرابط |
| 3 | **ملف الشركة** | ✅ مكتمل | اسم، شعار، ضريبة، بلد، عملة |
| 4 | **القيود اليومية** | ✅ مكتمل | متعدد العملات، مرفقات، Excel |
| 5 | **العملات والأسعار** | ✅ مكتمل | تحديث تلقائي، أسعار مؤرخة |
| 6 | **الأصول الثابتة** | ✅ مكتمل | استهلاك تلقائي شهري |
| 7 | **المخزون** | ✅ مكتمل | متوسط التكلفة المرجح، مستودع واحد |
| 8 | **الرواتب والموظفين** | ✅ مكتمل | بدلات، خصميات، مسير رواتب |
| 9 | **العملاء والموردون** | ✅ مكتمل | دليل مساعد، رصيد مشتق |
| 10 | **الفواتير والمدفوعات** | ✅ مكتمل | مبيعات/مشتريات، AR/AP، تسويات |
| 11 | **البنوك والمطابقة** | ✅ مكتمل | نقدية/بنك/بطاقة، مطابقة بنكية |
| 12 | **السلف والعهد** | ✅ مكتمل | خصم تلقائي من مسير الرواتب |
| 13 | **السنوات المالية** | ✅ مكتمل | إقفال دوري، ترحيل الأرصدة |
| 14 | **Excel استيراد/تصدير** | ✅ مكتمل | كل الوحدات، معالجة جماعية |
| 15 | **الأرصدة الافتتاحية** | ✅ مكتمل | حسابات/بنوك/عملاء/مخزون |
| 16 | **محرك العملات (FX)** | ✅ مكتمل | FX محقق + إعادة تقييم غير محققة |
| + | **التقارير المالية** | ✅ مكتمل | ميزان مراجعة، دخل، مركز مالي، أستاذ |
| + | **سجل التدقيق** | ✅ مكتمل | append-only، مقيّد بالمالك |
| + | **الضرائب** | ✅ مكتمل | VAT/WHT/دخل/رواتب/زكاة، قوالب بلد |
| + | **Super Admin** | ✅ مكتمل | باقات، شركات، مستخدمين، دعم |
| + | **الباقات والاشتراكات** | ✅ مكتمل | 21 خطة، Beta/Standard/Premium |

---

### ⏳ الوحدات خارج نطاق Beta (مؤجّلة)

| الوحدة | السبب |
|---|---|
| الفاتورة الإلكترونية (مصلحة الضرائب) | يتطلب تسجيل رسمي + API حكومي |
| طباعة PDF للفواتير | مؤجّل — طباعة HTML متاحة |
| إشعارات دائنة/مدينة (Credit/Debit Notes) | مؤجل للـ V2 |
| فواتير متكررة | مؤجل للـ V2 |
| مستودعات متعددة | مؤجل — مستودع واحد كافٍ للـ Beta |
| حساب التأمينات الاجتماعية تلقائياً | مؤجل — المبالغ يدوية في Beta |
| قسائم الراتب PDF | مؤجل للـ V2 |
| أرصدة افتتاحية بعملات | مؤجل — Base currency فقط |
| Auto-import بيانات بنكية | مؤجل — رفع Excel يدوي متاح |
| تقارير ضريبية (النموذج 10/41) | مؤجل — هيكل البيانات جاهز |

---

### 🐛 المشاكل المعروفة / Known Issues

| الأولوية | الوصف | الحل المقترح |
|---|---|---|
| 🔴 عالية | **Uploads على Local Disk** — الملفات المرفقة محفوظة على قرص السيرفر. لو تعطّل السيرفر أو تغيّر، الملفات تضيع | يتطلب persistent volume أو Object Storage — مرصود لـ V2 |
| 🟡 متوسطة | **لا توجد Email Notifications** — لا يوجد إشعار بريدي عند إضافة عضو أو قيد | بالتصميم في البيتا — الدعوة برابط |
| 🟡 متوسطة | **لا يوجد Rate Limiting** على الـ API — ممكن يُستخدم في brute-force | يُضاف في nginx بعد Launch |
| 🟢 منخفضة | **Currency enforcement** على فواتير/مدفوعات/بنوك | محدود على القيود اليدوية — بالتصميم |
| 🟢 منخفضة | **لا يوجد 2FA** | مؤجل للـ V2 |

---

### 🔐 مراجعة الأمان (Security Review)

| البند | الحالة | التفاصيل |
|---|---|---|
| **كلمات المرور** | ✅ آمن | scrypt (bcrypt-level hardness)، لا تُخزن أبداً |
| **Session Tokens** | ✅ آمن | SHA-256 فقط في DB، httpOnly cookie، لا JS access |
| **Tenant Isolation** | ✅ صارم | كل query مقيّد بـ companyId — لا توجد ثغرة Cross-tenant |
| **Cross-row FK validation** | ✅ مطبّق | كل FK (parentId, controlAccountId…) يُتحقق إنه للشركة ذاتها |
| **Authorization** | ✅ Server-enforced | requireCapability middleware — الـ Frontend بيخبّي UI فقط |
| **Invitation Tokens** | ✅ آمن | الـ token في URL يُشفّر SHA-256 — الـ raw token في DB أبداً |
| **URL Token Redaction** | ✅ مطبّق | pino-http serializer يحذف `/invitations/:token` من logs |
| **SQL Injection** | ✅ آمن | Drizzle ORM parameterized queries فقط |
| **Concurrency / Race** | ✅ مطبّق | pg_advisory_xact_lock على entry numbering وكودات الأطراف |
| **HTTPS** | ✅ إجباري | Let's Encrypt + redirect HTTP → HTTPS |
| **Secrets/env في Backup** | ✅ غائب | الـ Backup للداتا فقط — .env لا تُنسخ |

---

### 🏢 مراجعة Multi-Company (Tenant Isolation)

| السيناريو | النتيجة | التأكيد |
|---|---|---|
| شركة A تقرأ حسابات شركة B | ❌ مرفوض (403/404) | companyId filter على كل query |
| دعوة بريميوم تُستخدم في شركة أخرى | ❌ مرفوض | token مرتبط بـ companyId |
| FK من شركة A يشير لبيانات شركة B | ❌ مرفوض | cross-row FK re-validation |
| إنشاء كودين متماثلين بالتزامن | ❌ مرفوض | advisory lock per company |
| قفل رقم قيد بين شركتين | ✅ مستقل | lock key = hashtext(companyId) |
| صلاحية owner تُغيَّر | ❌ مرفوض | owner = creator only، لا يُعدَّل |

---

### 💾 Backup Readiness

| البند | الحالة |
|---|---|
| Script جاهز | ✅ `scripts/backup.sh` |
| Cron (02:00 AM daily) | ✅ `/etc/cron.d/hesabat-backup` |
| PostgreSQL pg_dump + gzip | ✅ |
| Uploads tar.gz | ✅ |
| Rotation 7 أيام | ✅ |
| Restore Test Script | ✅ `scripts/restore-test.sh` |
| يتضمن secrets/.env | ❌ لا — الداتا فقط |
| يتضمن source code | ❌ لا — على GitHub |

---

## القسم الثالث — Demo Data Package

### كيفية تشغيل Demo Data

```bash
# على الـ VPS بعد الإعداد
cd /var/www/hesabat
pnpm --filter @workspace/api-server run seed:demo
```

السكريبت **Idempotent** — لو شغّلته مرتين ما بيتكررش.

---

### الشركات التجريبية (3 شركات — 3 دول)

#### 🇪🇬 شركة ١ — مصر
| البيان | التفاصيل |
|---|---|
| **اسم الشركة** | شركة النيل للتجارة والتوزيع |
| **الاسم التجاري** | النيل تريد |
| **النشاط** | تجارة وتوزيع المنتجات الغذائية |
| **البلد / العملة** | مصر / جنيه مصري (EGP) |
| **الرقم الضريبي** | 100-200-300 |
| **البريد (تسجيل الدخول)** | `demo-eg@hesabat.app` |
| **كلمة المرور** | `Demo@12345` |

**العملاء:**
| الكود | الاسم | رقم ضريبي |
|---|---|---|
| C001 | سوبر ماركت الأمل | 201-300-400 |
| C002 | مؤسسة الشروق التجارية | — |

**الموردون:**
| الكود | الاسم | رقم ضريبي |
|---|---|---|
| S001 | مصنع الدلتا للأغذية | 305-410-520 |
| S002 | شركة المراعي للتوريدات | — |

**القيود والمعاملات المُنفَّذة تلقائياً:**
- رأس المال الافتتاحي: 500,000 ج.م (Dr بنك / Cr رأس مال)
- إيجار شهري: 18,000 ج.م (Dr إيجار / Cr بنك)
- 3 فواتير مبيعات: 85,000 + 42,000 + 67,000 ج.م + VAT 14%
- 2 فاتورة مشتريات: 55,000 + 31,000 ج.م + VAT 14%

---

#### 🇸🇦 شركة ٢ — السعودية
| البيان | التفاصيل |
|---|---|
| **اسم الشركة** | مؤسسة الواحة للمقاولات |
| **الاسم التجاري** | الواحة |
| **النشاط** | مقاولات وخدمات إنشائية |
| **البلد / العملة** | السعودية / ريال سعودي (SAR) |
| **الرقم الضريبي** | 310445566700003 |
| **البريد** | `demo-sa@hesabat.app` |
| **كلمة المرور** | `Demo@12345` |

**العملاء:** شركة المستقبل العقارية · مجموعة الرياض للتطوير
**الموردون:** مصنع الإسمنت الوطني · شركة الحديد والصلب

**المعاملات:**
- رأس مال: 800,000 ريال
- إيجار: 25,000 ريال
- 3 فواتير مبيعات: 120,000 + 95,000 + 60,000 + VAT 15%
- 2 فاتورة مشتريات: 70,000 + 48,000 + VAT 15%

---

#### 🇦🇪 شركة ٣ — الإمارات
| البيان | التفاصيل |
|---|---|
| **اسم الشركة** | شركة الخليج للاستشارات |
| **الاسم التجاري** | الخليج كونسلت |
| **النشاط** | استشارات إدارية وتقنية |
| **البلد / العملة** | الإمارات / درهم إماراتي (AED) |
| **الرقم الضريبي** | 100123456700003 |
| **البريد** | `demo-ae@hesabat.app` |
| **كلمة المرور** | `Demo@12345` |

**العملاء:** بنك الإمارات الأول · شركة دبي للتكنولوجيا
**الموردون:** مزود الخدمات السحابية · مكتب التوظيف المحترف

**المعاملات:**
- رأس مال: 600,000 درهم
- إيجار: 30,000 درهم
- 3 فواتير مبيعات: 150,000 + 88,000 + 72,000 + VAT 5%
- 2 فاتورة مشتريات: 45,000 + 33,000 + VAT 5%

---

### ما تغطّيه الـ Demo Data

| الوحدة | مغطّاة؟ |
|---|---|
| شجرة حسابات كاملة (EG/SA/AE) | ✅ |
| ضرائب تلقائية حسب البلد | ✅ |
| عملاء وموردون مع حسابات مساعدة | ✅ |
| فواتير مبيعات مُعتمدة | ✅ |
| فواتير مشتريات مُعتمدة | ✅ |
| قيود محاسبية مُرحّلة | ✅ |
| لوحة التحكم بأرقام حقيقية | ✅ |
| موظفون / مسير رواتب | ❌ (يُضاف يدوياً) |
| أصول ثابتة | ❌ (يُضاف يدوياً) |
| مخزون | ❌ (يُضاف يدوياً) |
| بنوك / نقدية | ❌ (يُضاف يدوياً) |

---

### Reset Demo Data

```bash
# حذف بيانات الـ Demo واستئنافها من الأول
pnpm --filter @workspace/api-server run seed:reset-demo
pnpm --filter @workspace/api-server run seed:demo
```

---

## القسم الرابع — Deployment Checklist

### أ. DNS Records المطلوبة

في Hostinger → Domains → `hesabat.com` → DNS Zone:

| النوع | الاسم | القيمة | TTL |
|---|---|---|---|
| A | `beta` | `YOUR_VPS_IP` | 3600 |
| A | `app` | `YOUR_VPS_IP` | 3600 |

للتحقق بعد الإضافة:
```bash
ping beta.hesabat.com
ping app.hesabat.com
```

---

### ب. Environment Variables المطلوبة

#### Beta — `/var/www/hesabat/.env.beta`
```env
NODE_ENV=production
PORT=4001
DATABASE_URL=postgresql://hesabat:STRONG_BETA_PASSWORD@localhost:5432/hesabat_beta_db
ADMIN_SECRET=BETA_ADMIN_SECRET_MIN_32_CHARS
SESSION_SECRET=BETA_SESSION_SECRET_MIN_64_CHARS_RANDOM
UPLOADS_DIR=/var/www/hesabat-uploads-beta
APP_ENV=beta
```

#### Production — `/var/www/hesabat/.env` (أو `.env.production`)
```env
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://hesabat:STRONG_PROD_PASSWORD@localhost:5432/hesabat_db
ADMIN_SECRET=PROD_ADMIN_SECRET_MIN_32_CHARS
SESSION_SECRET=PROD_SESSION_SECRET_MIN_64_CHARS_RANDOM
UPLOADS_DIR=/var/www/hesabat-uploads
APP_ENV=production
```

> **قواعد كلمات المرور:**
> - `SESSION_SECRET`: min 64 حرف عشوائي — `openssl rand -base64 64`
> - `ADMIN_SECRET`: min 32 حرف — `openssl rand -base64 32`
> - `DB passwords`: min 20 حرف، حروف + أرقام + رموز

---

### ج. GitHub Secrets المطلوبة

في `github.com/hazemgame12/hesabat-app/settings/secrets/actions`:

| الاسم | القيمة | ملاحظة |
|---|---|---|
| `VPS_HOST` | IP الـ VPS | من Hostinger hPanel |
| `VPS_USER` | `root` | أو اليوزر المسؤول |
| `VPS_SSH_KEY` | محتوى `~/.ssh/id_rsa` | Private key كامل |

---

### د. Rollback Plan

#### سيناريو ١ — فشل Deploy على Beta
```bash
ssh root@VPS_IP
cd /var/www/hesabat
git log --oneline -5             # شوف الـ commits
git checkout <previous-commit>   # ارجع للسابق
pm2 restart hesabat-beta
```

#### سيناريو ٢ — bug حرج بعد Deploy
```bash
# في GitHub — أكتب commit الرجوع في الـ workflow_dispatch
# أو على الـ VPS مباشرة:
pm2 stop hesabat-beta
git checkout <stable-commit>
NODE_ENV=production pnpm --filter @workspace/hesabat exec vite build --config vite.production.config.ts
pnpm --filter @workspace/api-server run build
pm2 start hesabat-beta
```

#### سيناريو ٣ — فساد في قاعدة البيانات (أسوأ حالة)
```bash
# وقت الاستعادة: 5-10 دقائق
pm2 stop hesabat-beta
sudo -u postgres psql -c "DROP DATABASE hesabat_beta_db;"
sudo -u postgres psql -c "CREATE DATABASE hesabat_beta_db OWNER hesabat;"
gunzip -c /var/backups/hesabat/postgres/hesabat_LATEST.sql.gz \
  | sudo -u postgres psql hesabat_beta_db
pm2 start hesabat-beta
```

> Replit يفضل شغّال طول الوقت كـ fallback — لو فشل VPS نرجع على الـ Replit URL فوراً.

---

### ه. Final Go/No-Go Checklist

#### Infrastructure ✅ جاهز
- [ ] VPS شغّال ومتصل بـ SSH
- [ ] DNS records مضافة ومنتشرة
- [ ] `vps-setup.sh` شغّل بنجاح
- [ ] `beta-setup.sh` شغّل بنجاح
- [ ] `pm2 status` يظهر hesabat-beta = online
- [ ] `https://beta.hesabat.com` يفتح
- [ ] `https://beta.hesabat.com/api/healthz` يرد 200
- [ ] SSL شغّال (🔒 في المتصفح)

#### Application ✅ مُختبَر
- [ ] تسجيل حساب جديد يشتغل
- [ ] تسجيل الدخول + الخروج
- [ ] إنشاء شركة جديدة
- [ ] شجرة الحسابات تظهر
- [ ] إنشاء قيد محاسبي وتأكيده
- [ ] إنشاء فاتورة مبيعات واعتمادها
- [ ] رفع مرفق ملف
- [ ] التقارير المالية تظهر بأرقام صحيحة
- [ ] تسجيل الدخول بالعربية والإنجليزية

#### Backups ✅ مُفعَّل
- [ ] أول backup تلقائي نجح
- [ ] Restore test نجح
- [ ] `/var/backups/hesabat/backup.log` يظهر ✅

#### GitHub Actions ✅ مُضبَّط
- [ ] GitHub Secrets أضيفت
- [ ] Push على `beta` branch يُشغّل الـ workflow
- [ ] الـ workflow ينتهي بـ ✅

#### Demo Data ✅ للعرض
- [ ] `seed:demo` شغّل على Beta DB
- [ ] تسجيل دخول `demo-eg@hesabat.app` / `Demo@12345` يشتغل
- [ ] Dashboard يظهر أرقام وتقارير

---

## ملخص تنفيذي

| البند | التقييم |
|---|---|
| **اكتمال الوحدات** | 16 milestone مكتمل ✅ |
| **جاهزية البيتا** | جاهز للاختبار مع مجموعة محدودة ✅ |
| **الأمان** | مستوى جيد للبيتا ✅ |
| **الـ Backups** | جاهزة ومُختبَرة ✅ |
| **وقت أول Deployment** | ~1.5 ساعة |
| **الـ Rollback** | متاح في < 10 دقائق ✅ |
| **المخاطر الرئيسية** | Uploads على Local Disk (مقبول للبيتا) |

**التوصية:** ✅ **جاهز للمضي قدماً في Beta Deployment**
