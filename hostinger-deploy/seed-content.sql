-- HG Audit: seed 3 case studies + 1 new service
-- Run once on the Neon production database

-- 1) Create case_studies table if missing (schema must exist before INSERT)
CREATE TABLE IF NOT EXISTS case_studies (
  id            serial PRIMARY KEY,
  slug          text NOT NULL UNIQUE,
  title_ar      text NOT NULL,
  title_en      text NOT NULL,
  client_name   text NOT NULL DEFAULT '',
  industry_ar   text NOT NULL DEFAULT '',
  industry_en   text NOT NULL DEFAULT '',
  summary_ar    text NOT NULL DEFAULT '',
  summary_en    text NOT NULL DEFAULT '',
  challenge_ar  text NOT NULL DEFAULT '',
  challenge_en  text NOT NULL DEFAULT '',
  solution_ar   text NOT NULL DEFAULT '',
  solution_en   text NOT NULL DEFAULT '',
  results_ar    text NOT NULL DEFAULT '',
  results_en    text NOT NULL DEFAULT '',
  image         text NOT NULL DEFAULT '',
  "order"       integer NOT NULL DEFAULT 0,
  published     boolean NOT NULL DEFAULT true,
  created_at    timestamp NOT NULL DEFAULT NOW(),
  updated_at    timestamp NOT NULL DEFAULT NOW()
);

INSERT INTO case_studies (slug, title_ar, title_en, client_name, industry_ar, industry_en, summary_ar, summary_en, challenge_ar, challenge_en, solution_ar, solution_en, results_ar, results_en, image, "order", published)
VALUES
('riyadh-contracting-vat-savings',
 'كيف وفّرنا 4.2 مليون ريال لشركة مقاولات بالرياض في سنة واحدة',
 'How We Saved 4.2M SAR for a Riyadh Contractor in One Year',
 'عميل في قطاع المقاولات — الرياض',
 'المقاولات والإنشاءات', 'Construction & Contracting',
 'شركة مقاولات سعودية بإيرادات تتجاوز 180 مليون ريال كانت تواجه فروقات ضريبية ومخالفات في الفوترة الإلكترونية. تدخّلنا أعاد لها 4.2 مليون ريال وضمن التزامها الكامل مع هيئة الزكاة والضريبة (ZATCA).',
 'A Saudi contractor with 180M+ SAR revenue faced VAT mismatches and e-invoicing violations. Our intervention recovered 4.2M SAR and ensured full ZATCA compliance.',
 E'## الوضع قبل التدخل\n\n- **فروقات في إقرارات ضريبة القيمة المضافة** بقيمة تتجاوز 3 ملايين ريال خلال 18 شهر\n- **عدم التوافق مع نظام الفوترة الإلكترونية ZATCA** ومخاطر غرامات قد تصل إلى 50 ألف ريال شهرياً\n- **تجاوز التكاليف في 7 مشاريع نشطة** بمتوسط 14% فوق الميزانية المعتمدة\n- **ضعف توثيق فواتير الموردين** أدى لرفض خصم ضريبة المدخلات\n- **غياب نظام محاسبة تكاليف للمشاريع** يربط بين الإيراد والتكلفة الفعلية لكل عقد',
 E'## Before our engagement\n\n- **VAT return discrepancies** exceeding 3M SAR across 18 months\n- **Non-compliance with ZATCA e-invoicing** with monthly fine exposure up to 50K SAR\n- **Cost overruns on 7 active projects** averaging 14% above approved budgets\n- **Weak supplier invoice documentation** leading to rejected input VAT claims\n- **No project-level cost accounting** linking revenue to actual contract cost',
 E'## نهجنا المتكامل\n\n1. **تدقيق ضريبي شامل لـ 18 شهر** مع إعادة بناء سجلات ضريبة المدخلات\n2. **تطبيق نظام الفوترة الإلكترونية المرحلة الثانية** والربط المباشر مع ZATCA\n3. **بناء نظام محاسبة تكاليف للمشاريع** يتتبع كل عقد على حدة\n4. **برنامج تدريبي** لفريق المشتريات والمالية على متطلبات التوثيق الضريبي\n5. **لوحة تحكم شهرية** تُظهر هامش الربح الفعلي لكل مشروع',
 E'## Our integrated approach\n\n1. **Full 18-month tax audit** with rebuilt input-VAT records\n2. **ZATCA Phase 2 e-invoicing rollout** with direct platform integration\n3. **Project cost accounting system** tracking each contract individually\n4. **Training program** for procurement and finance teams on tax documentation\n5. **Monthly dashboard** showing real margin per project',
 E'## النتائج خلال 12 شهر\n\n- 💰 **استرداد 4.2 مليون ريال** من ضريبة المدخلات المرفوضة سابقاً\n- ✅ **توافق 100% مع ZATCA** بدون أي غرامات\n- 📊 **تقليل تجاوز التكاليف من 14% إلى 3%**\n- ⚡ **تسريع دورة الفوترة بنسبة 38%**\n- 📈 **زيادة هامش الربح الإجمالي من 11% إلى 17%**',
 E'## Results within 12 months\n\n- 💰 **4.2M SAR recovered** in previously rejected input VAT\n- ✅ **100% ZATCA compliance** with zero penalties\n- 📊 **Cost overruns reduced from 14% to 3%**\n- ⚡ **Invoicing cycle accelerated by 38%**\n- 📈 **Gross margin increased from 11% to 17%**',
 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=1600&q=80', 1, true),

('dubai-realestate-financial-restructuring',
 'إعادة هيكلة مالية لمطوّر عقاري في دبي رفعت هامش الربح 27%',
 'Financial Restructuring for a Dubai Developer that Boosted Margins by 27%',
 'مجموعة تطوير عقاري — الإمارات',
 'التطوير العقاري', 'Real Estate Development',
 'مجموعة تطوير عقاري إماراتية بثلاثة مشاريع نشطة بقيمة 740 مليون درهم كانت تعاني من ضغوط سيولة وعدم التزام بمعايير IFRS 15. صمّمنا خطة هيكلة رفعت الهامش 27% وأمّنت تمويل إضافي بـ 18 مليون درهم.',
 'A UAE real estate group with three active projects worth 740M AED faced liquidity pressure and IFRS 15 non-compliance. Our restructuring lifted margins 27% and secured 18M AED additional financing.',
 E'## التحديات الرئيسية\n\n- **اختلال التدفق النقدي** بين مراحل المشاريع وسداد التمويل البنكي\n- **عدم تطبيق صحيح لـ IFRS 15** في الاعتراف بإيرادات العقود طويلة الأجل\n- **تكاليف تمويل مرتفعة** تستهلك 18% من الإيراد التشغيلي\n- **عدم وجود توقعات مالية متجدّدة** للقرارات التشغيلية\n- **مخاطر تأخير التسليم** لأحد المشاريع بسبب ضغط السيولة',
 E'## Key challenges\n\n- **Cash flow misalignment** between project phases and bank repayments\n- **Incorrect IFRS 15 application** for long-term contract revenue recognition\n- **High financing costs** consuming 18% of operating revenue\n- **No rolling financial forecasts** for operational decisions\n- **Delivery delay risk** on one project due to liquidity strain',
 E'## خارطة العمل\n\n1. **نموذج تدفقات نقدية 36 شهر** لكل مشروع على حدة مع سيناريوهات حساسية\n2. **إعادة بناء سياسة الاعتراف بالإيراد** وفق IFRS 15 وتعديل القوائم المالية الـ 3 سنوات السابقة\n3. **التفاوض مع 4 بنوك** للحصول على تسهيلات أفضل وإعادة جدولة\n4. **هيكلة قانونية لكيان SPV منفصل** لكل مشروع لعزل المخاطر\n5. **لوحة قيادة تنفيذية أسبوعية** للإدارة العليا',
 E'## Action roadmap\n\n1. **36-month cash flow model** per project with sensitivity scenarios\n2. **Rebuilt revenue recognition policy** per IFRS 15 with 3-year restated financials\n3. **Negotiation with 4 banks** for improved facilities and rescheduling\n4. **SPV legal structuring** for each project to isolate risk\n5. **Weekly executive dashboard** for senior management',
 E'## الأثر المالي\n\n- 📈 **هامش الربح ارتفع من 19% إلى 24.1%** (+27% نسبي)\n- 💵 **تأمين خط ائتمان إضافي بـ 18 مليون درهم** بفائدة أقل 2.3%\n- 🏗️ **تسليم 100% من المشاريع في موعدها**\n- 💸 **تقليل تكلفة التمويل من 18% إلى 11% من الإيراد**\n- 📊 **شهادة نظافة من المدقق الخارجي** لأول مرة منذ 5 سنوات',
 E'## Financial impact\n\n- 📈 **Profit margin rose from 19% to 24.1%** (+27% relative)\n- 💵 **Secured 18M AED additional credit line** at 2.3% lower rate\n- 🏗️ **100% on-time project delivery**\n- 💸 **Financing cost reduced from 18% to 11% of revenue**\n- 📊 **First clean external audit opinion in 5 years**',
 'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1600&q=80', 2, true),

('jeddah-retail-chain-erp',
 'نظام محاسبي موحّد لسلسلة تجزئة في جدة قلّل دورة الإقفال من 21 يوم لـ 3 أيام',
 'Unified Accounting for a Jeddah Retail Chain — Monthly Close from 21 to 3 Days',
 'سلسلة تجزئة سعودية — جدة',
 'تجارة التجزئة', 'Retail',
 'سلسلة تجزئة سعودية بـ 14 فرع كانت تعاني من تقارير متضاربة وفاقد مخزون مرتفع. تطبيق نظام ERP موحّد ومعالجة الفجوات الضريبية حقّق توفير سنوي يتجاوز 2.8 مليون ريال.',
 'A 14-branch Saudi retail chain suffered from inconsistent reporting and high inventory shrinkage. A unified ERP rollout and tax gap closure delivered annual savings exceeding 2.8M SAR.',
 E'## نقاط الألم قبل المشروع\n\n- **14 فرع بأنظمة محاسبية مختلفة** وتقارير لا تتطابق\n- **فاقد مخزون 6.4%** من إجمالي قيمة البضاعة سنوياً\n- **دورة إقفال شهرية تستغرق 21 يوم** تُؤخّر القرارات\n- **فجوات في احتساب ضريبة القيمة المضافة** بين الفروع\n- **غياب رؤية لحظية** لأداء المبيعات على مستوى الصنف والفرع',
 E'## Pain points before the project\n\n- **14 branches on different accounting systems** with non-matching reports\n- **Inventory shrinkage of 6.4%** of total stock value annually\n- **21-day monthly close cycle** delaying decisions\n- **VAT calculation gaps** across branches\n- **No real-time visibility** into product/branch performance',
 E'## الحل المنفّذ\n\n1. **تطبيق نظام ERP موحّد** (Odoo + تخصيصات) لجميع الفروع خلال 4 أشهر\n2. **مركزة إمساك الدفاتر** من قسم محاسبي موحّد بدلاً من فرق متفرّقة\n3. **ربط نقاط البيع مباشرة بـ ZATCA** للفوترة الإلكترونية\n4. **سياسة مخزون جديدة** مع جرد دوري شهري وأنظمة تنبيه\n5. **لوحات تحكم تنفيذية لحظية** للمبيعات والربحية حسب الفرع والصنف',
 E'## Solution delivered\n\n1. **Unified ERP rollout** (Odoo + customizations) across all branches in 4 months\n2. **Centralized bookkeeping** under one accounting hub instead of fragmented teams\n3. **Direct POS-to-ZATCA integration** for e-invoicing\n4. **New inventory policy** with monthly cycle counts and alerting\n5. **Real-time executive dashboards** for sales and profitability by branch/SKU',
 E'## النتائج المُحقّقة\n\n- ⏱️ **دورة الإقفال الشهري من 21 يوم إلى 3 أيام**\n- 📦 **فاقد المخزون انخفض 62%** (من 6.4% إلى 2.4%)\n- 💰 **توفير سنوي 2.8 مليون ريال** بين ضرائب مستردة وفاقد مخزون\n- ✅ **100% توافق مع ZATCA** على مستوى الـ 14 فرع\n- 📱 **رؤية فورية** للإدارة العليا عبر الموبايل',
 E'## Outcomes achieved\n\n- ⏱️ **Monthly close from 21 days to 3 days**\n- 📦 **Inventory shrinkage down 62%** (from 6.4% to 2.4%)\n- 💰 **Annual savings of 2.8M SAR** across recovered taxes and reduced shrinkage\n- ✅ **100% ZATCA compliance** across all 14 branches\n- 📱 **Real-time visibility** for senior management on mobile',
 'https://images.unsplash.com/photo-1555529669-2269763671c0?w=1600&q=80', 3, true)
ON CONFLICT (slug) DO UPDATE SET
  title_ar=EXCLUDED.title_ar, title_en=EXCLUDED.title_en,
  client_name=EXCLUDED.client_name,
  industry_ar=EXCLUDED.industry_ar, industry_en=EXCLUDED.industry_en,
  summary_ar=EXCLUDED.summary_ar, summary_en=EXCLUDED.summary_en,
  challenge_ar=EXCLUDED.challenge_ar, challenge_en=EXCLUDED.challenge_en,
  solution_ar=EXCLUDED.solution_ar, solution_en=EXCLUDED.solution_en,
  results_ar=EXCLUDED.results_ar, results_en=EXCLUDED.results_en,
  image=EXCLUDED.image, "order"=EXCLUDED."order", published=EXCLUDED.published, updated_at=NOW();

-- New service: Bookkeeping & Tax Compliance (KSA & UAE)
INSERT INTO services (title_ar, title_en, description_ar, description_en, image, "order", published)
SELECT
  'إمساك الدفاتر والامتثال الضريبي — السعودية والإمارات',
  'Bookkeeping & Tax Compliance — KSA & UAE',
  'خدمة محاسبية متكاملة لشركات السعودية والإمارات تشمل إمساك الدفاتر اليومي، إعداد القوائم المالية الشهرية، وإدارة الإقرارات الضريبية بالكامل. نتولّى ملفك مع هيئة الزكاة والضريبة (ZATCA) وضريبة الشركات الإماراتية والـ VAT، مع تقارير مالية واضحة تساعدك تتخذ قرارات أسرع وأذكى.',
  'End-to-end accounting service for KSA and UAE businesses: daily bookkeeping, monthly financial statements, and full tax return management. We handle your ZATCA filings, UAE Corporate Tax, and VAT compliance — backed by clear financial reports that help you decide faster and smarter.',
  'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1600&q=80',
  100, true
WHERE NOT EXISTS (
  SELECT 1 FROM services WHERE title_ar = 'إمساك الدفاتر والامتثال الضريبي — السعودية والإمارات'
);

SELECT id, slug, title_ar FROM case_studies ORDER BY "order";
SELECT id, title_ar FROM services ORDER BY "order";
