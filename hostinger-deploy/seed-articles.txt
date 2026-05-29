-- HG Audit: seed 3 SEO-optimized bilingual articles
-- Run ONCE on the Neon production database (same place you ran seed-content.sql)
-- Safe to re-run: uses ON CONFLICT (slug) DO NOTHING

INSERT INTO articles
  (slug, category_ar, category_en, date, read_time_ar, read_time_en,
   title_ar, title_en, excerpt_ar, excerpt_en, content_ar, content_en, image, published)
VALUES
-- ========================================================================
-- ARTICLE 1: E-invoicing in Saudi Arabia (ZATCA / Fatoorah)
-- ========================================================================
(
  'e-invoicing-saudi-arabia-guide',
  'الضرائب', 'Taxation',
  '2026-05-20',
  '7 دقائق', '7 min read',
  'الفاتورة الإلكترونية في السعودية: الدليل الكامل للشركات 2026',
  'E-Invoicing in Saudi Arabia: The Complete 2026 Business Guide',
  'كل ما تحتاج معرفته عن منظومة الفاتورة الإلكترونية (فاتورة) من هيئة الزكاة والضريبة والجمارك، ومراحل التطبيق والمتطلبات والعقوبات.',
  'Everything you need to know about Saudi Arabia''s ZATCA e-invoicing system (Fatoorah): phases, requirements, and penalties.',
  '## ما هي الفاتورة الإلكترونية؟

الفاتورة الإلكترونية (فاتورة) هي منظومة أطلقتها هيئة الزكاة والضريبة والجمارك (ZATCA) في المملكة العربية السعودية لتحويل عملية إصدار الفواتير من الشكل الورقي إلى شكل إلكتروني منظم، بهدف رفع كفاءة الالتزام الضريبي ومكافحة التهرب.

## لماذا تهم شركتك؟

كل منشأة خاضعة لضريبة القيمة المضافة في السعودية ملزمة بتطبيق الفاتورة الإلكترونية. عدم الالتزام يعرّض شركتك لغرامات مالية كبيرة، إضافة إلى تعطّل العمليات التجارية مع عملائك ومورّديك.

## مراحل تطبيق المنظومة

### المرحلة الأولى: الإصدار (Generation)
بدأت في ديسمبر 2021، وتتطلب من جميع المنشآت إصدار وحفظ الفواتير إلكترونياً عبر نظام متوافق، مع التوقف عن استخدام الفواتير المكتوبة يدوياً.

### المرحلة الثانية: الربط والتكامل (Integration)
يتم تطبيقها على مراحل حسب حجم إيرادات المنشأة، وتتطلب ربط نظامك مباشرة مع منصة (فاتورة) التابعة للهيئة لإرسال الفواتير والتحقق منها لحظياً.

## المتطلبات الأساسية للالتزام

- استخدام نظام فوترة إلكتروني متوافق مع مواصفات الهيئة
- توليد رمز الاستجابة السريعة (QR Code) على فواتير المستهلك
- حفظ الفواتير بصيغة إلكترونية آمنة (XML أو PDF/A-3)
- تضمين كافة الحقول الإلزامية مثل الرقم الضريبي وتفاصيل الضريبة

## العقوبات في حال عدم الالتزام

تتراوح الغرامات بين تنبيهات أولية وغرامات مالية قد تصل إلى عشرات الآلاف من الريالات حسب نوع المخالفة وتكرارها، مثل عدم إصدار الفاتورة إلكترونياً أو حذف الفواتير بعد إصدارها.

## كيف تساعدك اتش جي؟

نحن في شركة اتش جي للاستشارات المالية نتولى عنك:

- تقييم جاهزية منشأتك لمنظومة الفاتورة الإلكترونية
- اختيار وتجهيز النظام المحاسبي المتوافق مع متطلبات الهيئة
- ربط أنظمتك بمنصة (فاتورة) في المرحلة الثانية
- تدريب فريقك وضمان التزامك المستمر لتجنّب أي غرامات

تواصل معنا اليوم لتجهيز شركتك بشكل كامل قبل أي موعد إلزامي.',
  '## What Is E-Invoicing?

E-invoicing (Fatoorah) is a system launched by the Zakat, Tax and Customs Authority (ZATCA) in Saudi Arabia to convert invoice issuance from paper to a structured electronic format, improving tax compliance and fighting evasion.

## Why It Matters for Your Business

Every business subject to VAT in Saudi Arabia is required to apply e-invoicing. Non-compliance exposes your company to significant fines and disrupts commercial operations with your clients and suppliers.

## Implementation Phases

### Phase One: Generation
Began in December 2021, requiring all businesses to issue and store invoices electronically through a compliant system, ending handwritten invoices.

### Phase Two: Integration
Rolled out in waves based on revenue size, requiring your system to connect directly with ZATCA''s Fatoorah platform for real-time invoice validation.

## Core Compliance Requirements

- Use an e-invoicing system compliant with ZATCA specifications
- Generate a QR code on consumer invoices
- Store invoices in a secure electronic format (XML or PDF/A-3)
- Include all mandatory fields such as VAT number and tax details

## Penalties for Non-Compliance

Penalties range from initial warnings to fines reaching tens of thousands of riyals depending on the violation type and frequency, such as failing to issue an electronic invoice or deleting invoices after issuance.

## How HG Helps You

At HG Financial Consulting, we handle:

- Assessing your readiness for the e-invoicing system
- Selecting and configuring a compliant accounting system
- Connecting your systems to the Fatoorah platform in Phase Two
- Training your team and ensuring ongoing compliance to avoid fines

Contact us today to fully prepare your business ahead of any mandatory deadline.',
  'https://hg-audit.com/wp-content/uploads/2024/10/taxes.jpg',
  true
),
-- ========================================================================
-- ARTICLE 2: Company formation in the UAE
-- ========================================================================
(
  'company-formation-uae-guide',
  'تأسيس الشركات', 'Company Formation',
  '2026-05-12',
  '6 دقائق', '6 min read',
  'خطوات تأسيس شركة في الإمارات: دليل المستثمر 2026',
  'How to Set Up a Company in the UAE: 2026 Investor Guide',
  'دليل عملي لتأسيس شركتك في الإمارات، يشمل الفرق بين المنطقة الحرة والبر الرئيسي، والتراخيص والتكاليف والخطوات.',
  'A practical guide to setting up your company in the UAE: free zone vs mainland, licenses, costs, and steps.',
  '## لماذا الإمارات وجهة مثالية للاستثمار؟

تُعد دولة الإمارات العربية المتحدة من أكثر الوجهات جاذبية للمستثمرين في المنطقة، بفضل اقتصادها المتنوّع، وموقعها الاستراتيجي، وأنظمتها الضريبية التنافسية، وبنيتها التحتية المتطوّرة.

## أولاً: اختيار نوع الكيان القانوني

قبل البدء، يجب تحديد الهيكل المناسب لنشاطك:

### المنطقة الحرة (Free Zone)
تتيح ملكية أجنبية كاملة بنسبة 100%، وإعفاءات ضريبية، وسهولة في إجراءات التأسيس. مناسبة للشركات التي تعمل في التصدير والخدمات الدولية.

### البر الرئيسي (Mainland)
يتيح لك العمل في السوق المحلي الإماراتي مباشرة والتعامل مع الجهات الحكومية، مع مرونة أكبر في اختيار موقع المكتب وعدد التأشيرات.

## ثانياً: تحديد النشاط التجاري والترخيص

يجب اختيار النشاط التجاري بدقة لأنه يحدّد نوع الرخصة المطلوبة (تجارية، مهنية، صناعية، أو سياحية). كل نشاط له متطلبات وموافقات خاصة.

## ثالثاً: خطوات التأسيس الأساسية

1. اختيار الاسم التجاري واعتماده
2. الحصول على الموافقة المبدئية من الجهة المختصة
3. تجهيز عقد التأسيس والمستندات القانونية
4. تأمين مقر أو عنوان تجاري معتمد
5. إصدار الرخصة التجارية
6. فتح حساب بنكي للشركة
7. استخراج تأشيرات الإقامة للملاك والموظفين

## رابعاً: الجوانب الضريبية

مع تطبيق ضريبة الشركات في الإمارات، أصبح من الضروري التخطيط الضريبي السليم منذ مرحلة التأسيس لضمان الالتزام والاستفادة من الإعفاءات المتاحة.

## كيف تساعدك اتش جي؟

نتولّى عنك كامل رحلة التأسيس:

- اختيار الكيان والمنطقة الأنسب لنشاطك وأهدافك
- إنهاء كافة الإجراءات والتراخيص الحكومية
- إعداد دراسة الجدوى والخطة المالية
- تجهيز هيكلك الضريبي والمحاسبي من اليوم الأول

ابدأ مشروعك في الإمارات بثقة مع فريق اتش جي.',
  '## Why the UAE Is an Ideal Investment Destination

The United Arab Emirates is among the most attractive destinations for investors in the region, thanks to its diversified economy, strategic location, competitive tax regime, and advanced infrastructure.

## First: Choosing the Legal Entity Type

Before starting, you must determine the right structure for your activity:

### Free Zone
Allows 100% foreign ownership, tax exemptions, and streamlined setup. Ideal for companies in export and international services.

### Mainland
Lets you operate directly in the local UAE market and deal with government entities, with greater flexibility in office location and visa numbers.

## Second: Defining the Business Activity and License

The business activity must be chosen carefully because it determines the license type required (commercial, professional, industrial, or tourism). Each activity has its own requirements and approvals.

## Third: Core Setup Steps

1. Choose and reserve the trade name
2. Obtain initial approval from the relevant authority
3. Prepare the memorandum of association and legal documents
4. Secure an approved business address
5. Issue the trade license
6. Open a corporate bank account
7. Obtain residence visas for owners and staff

## Fourth: Tax Considerations

With corporate tax now in effect in the UAE, proper tax planning from the setup stage is essential to ensure compliance and benefit from available exemptions.

## How HG Helps You

We handle your entire setup journey:

- Selecting the most suitable entity and zone for your activity and goals
- Completing all government procedures and licensing
- Preparing the feasibility study and financial plan
- Setting up your tax and accounting structure from day one

Start your UAE business with confidence alongside the HG team.',
  'https://hg-audit.com/wp-content/uploads/2024/10/corporate.jpg',
  true
),
-- ========================================================================
-- ARTICLE 3: When does your company need an auditor?
-- ========================================================================
(
  'when-your-company-needs-an-auditor',
  'المراجعة المالية', 'Financial Auditing',
  '2026-05-04',
  '5 دقائق', '5 min read',
  'متى تحتاج شركتك إلى مراجع حسابات؟ 6 علامات واضحة',
  'When Does Your Company Need an Auditor? 6 Clear Signs',
  'تعرّف على العلامات التي تدل على أن شركتك بحاجة لمراجع حسابات محترف، وكيف تحميك المراجعة المالية من المخاطر.',
  'Discover the signs that your company needs a professional auditor, and how financial auditing protects you from risk.',
  '## ما دور مراجع الحسابات؟

مراجع الحسابات هو الجهة المستقلة التي تفحص القوائم المالية لشركتك للتأكد من دقتها وصحتها وخلوّها من الأخطاء الجوهرية أو الغش، ويمنح أصحاب المصلحة الثقة في أرقامك.

## 6 علامات تدل على حاجتك لمراجع حسابات

### 1. نمو حجم أعمالك بسرعة
عندما تزداد إيراداتك وعملياتك، تصبح إدارة الأرقام يدوياً مصدراً للأخطاء، وتحتاج لرقابة احترافية.

### 2. التعامل مع بنوك أو مستثمرين
البنوك وجهات التمويل والمستثمرون يطلبون قوائم مالية مدقّقة قبل منحك تمويلاً أو الدخول كشركاء.

### 3. متطلبات قانونية أو ضريبية
كثير من الأنشطة والكيانات ملزمة قانونياً بتقديم قوائم مالية مراجعة بشكل سنوي.

### 4. وجود عدة شركاء أو مساهمين
المراجعة المستقلة تحمي حقوق جميع الأطراف وتمنع النزاعات حول الأرقام.

### 5. الشك في وجود أخطاء أو تلاعب
إذا لاحظت فروقات غير مبرّرة أو تراجعاً في الأرباح دون سبب واضح، فالمراجعة تكشف المشكلة.

### 6. التحضير لبيع الشركة أو التوسع
القوائم المدقّقة ترفع قيمة شركتك وتسهّل أي صفقة بيع أو اندماج.

## ماذا تكسب من المراجعة المالية؟

- اكتشاف الأخطاء والمخاطر مبكراً
- تعزيز ثقة البنوك والمستثمرين والشركاء
- الالتزام بالمتطلبات القانونية والضريبية
- قرارات إدارية مبنية على أرقام موثوقة

## كيف تساعدك اتش جي؟

نقدّم خدمات المراجعة والتدقيق المالي وفق أعلى المعايير الدولية، بفريق متخصص يمنحك تقريراً واضحاً وموثوقاً عن الوضع المالي لشركتك.

تواصل معنا لحجز جلسة تقييم مجانية.',
  '## What Does an Auditor Do?

An auditor is the independent party that examines your company''s financial statements to confirm their accuracy and freedom from material errors or fraud, giving stakeholders confidence in your numbers.

## 6 Signs You Need an Auditor

### 1. Your Business Is Growing Fast
As revenue and operations grow, managing numbers manually becomes error-prone and you need professional oversight.

### 2. Dealing With Banks or Investors
Banks, lenders, and investors require audited financial statements before granting financing or becoming partners.

### 3. Legal or Tax Requirements
Many activities and entities are legally required to submit audited financial statements annually.

### 4. Multiple Partners or Shareholders
Independent auditing protects the rights of all parties and prevents disputes over numbers.

### 5. Suspicion of Errors or Manipulation
If you notice unexplained discrepancies or a drop in profits without clear cause, an audit reveals the problem.

### 6. Preparing to Sell or Expand
Audited statements raise your company''s value and ease any sale or merger.

## What You Gain From Financial Auditing

- Early detection of errors and risks
- Stronger trust from banks, investors, and partners
- Compliance with legal and tax requirements
- Management decisions based on reliable numbers

## How HG Helps You

We provide financial auditing services to the highest international standards, with a specialized team delivering a clear, reliable report on your company''s financial position.

Contact us to book a free assessment session.',
  'https://hg-audit.com/wp-content/uploads/2024/10/finance3.jpg',
  true
)
ON CONFLICT (slug) DO NOTHING;
