# Hesabat — دليل الـ Backup على VPS

> GitHub يحمي الـ **source code** فقط.
> الـ Backup ده بيحمي **بيانات العملاء** — فواتير، قيود محاسبية، ملفات مرفقة.

---

## ملخص سريع

| البند | التفاصيل |
|---|---|
| **أوقات التشغيل** | كل يوم الساعة 02:00 AM (توقيت السيرفر) |
| **مجلد الـ Backups** | `/var/backups/hesabat/` |
| **PostgreSQL** | `/var/backups/hesabat/postgres/hesabat_YYYY-MM-DD_HH-MM-SS.sql.gz` |
| **Uploads** | `/var/backups/hesabat/uploads/uploads_YYYY-MM-DD_HH-MM-SS.tar.gz` |
| **Log** | `/var/backups/hesabat/backup.log` |
| **Retention** | 7 أيام (Beta) ← غيّرها لـ 30 في Production |
| **Compress** | ✅ gzip |
| **Secrets/env** | ❌ لا تُحفظ أبداً — الـ backup للداتا فقط |

---

## هيكل المجلدات

```
/var/backups/hesabat/
├── postgres/
│   ├── hesabat_2026-06-12_02-00-01.sql.gz
│   ├── hesabat_2026-06-13_02-00-01.sql.gz
│   └── ...  (آخر 7 ملفات)
├── uploads/
│   ├── uploads_2026-06-12_02-00-05.tar.gz
│   └── ...  (آخر 7 ملفات)
├── backup.log
└── restore-test.log
```

---

## الـ Cron Job

**الجدول:**
```
0 2 * * * root /usr/local/bin/hesabat-backup
```

**ملف الـ Cron:** `/etc/cron.d/hesabat-backup`

**فحص الـ Cron:**
```bash
cat /etc/cron.d/hesabat-backup
```

---

## أوامر يدوية

### تشغيل Backup الآن
```bash
/usr/local/bin/hesabat-backup
```

### عرض الـ Backups الموجودة
```bash
ls -lh /var/backups/hesabat/postgres/
ls -lh /var/backups/hesabat/uploads/
```

### مشاهدة الـ Log
```bash
tail -50 /var/backups/hesabat/backup.log
```

### تشغيل Restore Test
```bash
/usr/local/bin/hesabat-restore-test
```

---

## Restore — استعادة الداتا

### ⚠️ تحذير
> الـ Restore بيمسح بيانات قاعدة البيانات الحالية ويستبدلها بالـ backup.
> اعمل backup جديد قبل أي restore.

### خطوات الاستعادة الكاملة

```bash
# 1. اختار الـ backup اللي عايز ترجع منه
ls -lh /var/backups/hesabat/postgres/

# 2. وقف التطبيق
pm2 stop hesabat-api

# 3. احذف قاعدة البيانات الحالية
sudo -u postgres psql -c "DROP DATABASE IF EXISTS hesabat_db;"
sudo -u postgres psql -c "CREATE DATABASE hesabat_db OWNER hesabat;"

# 4. استعادة الـ backup
gunzip -c /var/backups/hesabat/postgres/hesabat_YYYY-MM-DD_HH-MM-SS.sql.gz \
  | sudo -u postgres psql hesabat_db

# 5. استعادة الـ uploads (لو محتاج)
tar -xzf /var/backups/hesabat/uploads/uploads_YYYY-MM-DD_HH-MM-SS.tar.gz \
  -C /var/www/

# 6. تشغيل التطبيق
pm2 start hesabat-api
pm2 status
```

---

## Restore Test — اختبار سلامة الـ Backup

يتشغل تلقائياً مع أول إعداد وبعدين يدوياً:

```bash
/usr/local/bin/hesabat-restore-test
```

السكريبت ده:
1. بياخد آخر backup موجود
2. بيعمل DB مؤقت `hesabat_restore_test`
3. بيعمل restore فيه
4. بيتأكد إن الجداول الأساسية موجودة
5. بيحذف الـ DB المؤقت
6. **ما بيلمسش `hesabat_db` الأصلي خالص**

**النتيجة المتوقعة:**
```
✅ RESTORE TEST PASSED
   Backup: hesabat_2026-06-12_02-00-01.sql.gz
   All key tables verified
   Production DB (hesabat_db) was NOT touched
```

---

## تغيير الـ Retention للـ Production

لما تعمل Launch الكامل، غيّر الـ retention من 7 لـ 30 يوم:

```bash
# في /usr/local/bin/hesabat-backup
# غيّر السطر ده:
RETENTION_DAYS=7
# لـ:
RETENTION_DAYS=30
```

---

## ماذا يُحفظ وماذا لا يُحفظ

| | محفوظ؟ |
|---|---|
| بيانات الشركات والمستخدمين | ✅ |
| القيود المحاسبية والفواتير | ✅ |
| الملفات المرفقة (uploads) | ✅ |
| ملف `.env` وكلمات المرور | ❌ لا |
| الـ source code | ❌ ده على GitHub |
| node_modules / dist | ❌ غير ضروري |

---

## ماذا لو فشل الـ Backup؟

```bash
# شوف آخر 100 سطر من الـ log
tail -100 /var/backups/hesabat/backup.log

# تأكد إن PostgreSQL شغال
systemctl status postgresql

# تأكد إن المجلد موجود وعنده permissions
ls -la /var/backups/hesabat/
```
