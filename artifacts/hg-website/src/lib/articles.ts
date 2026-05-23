export interface Article {
  id: string;
  slug: string;
  category: { ar: string; en: string };
  date: string;
  readTime: { ar: string; en: string };
  title: { ar: string; en: string };
  excerpt: { ar: string; en: string };
  content: { ar: string; en: string };
  image: string;
}

export const articles: Article[] = [
  {
    id: "1",
    slug: "vat-in-egypt",
    category: { ar: "الضرائب", en: "Taxation" },
    date: "2026-04-10",
    readTime: { ar: "5 دقائق", en: "5 min read" },
    title: {
      ar: "دليلك الشامل لضريبة القيمة المضافة في مصر",
      en: "Your Complete Guide to VAT in Egypt",
    },
    excerpt: {
      ar: "تعرف على كل ما يخص ضريبة القيمة المضافة في مصر، معدلاتها، وكيفية تقديم الإقرار الضريبي بشكل صحيح لتجنب الغرامات.",
      en: "Learn everything about Value Added Tax in Egypt — rates, filing deadlines, and how to submit your returns correctly to avoid penalties.",
    },
    content: {
      ar: `## ما هي ضريبة القيمة المضافة؟

ضريبة القيمة المضافة (VAT) هي ضريبة غير مباشرة تُفرض على معظم السلع والخدمات المباعة للاستخدام أو الاستهلاك. في مصر، تم تطبيق هذه الضريبة رسمياً عام 2016 بموجب القانون رقم 67 لسنة 2016.

## المعدل العام

المعدل العام لضريبة القيمة المضافة في مصر هو **14%** على معظم السلع والخدمات. هناك بعض السلع والخدمات المعفاة أو الخاضعة لمعدل مخفض.

## من يلتزم بالتسجيل؟

يجب على كل شخص طبيعي أو اعتباري يمارس نشاطاً تجارياً أو صناعياً أو مهنياً يتجاوز حجم مبيعاته السنوية **500,000 جنيه** التسجيل في منظومة ضريبة القيمة المضافة.

## خطوات تقديم الإقرار

1. **حساب الضريبة المستحقة**: الفرق بين الضريبة المحصلة على المبيعات والضريبة المدفوعة على المشتريات.
2. **تقديم الإقرار الشهري**: يُقدَّم الإقرار الضريبي خلال الشهر التالي.
3. **سداد المبلغ المستحق**: يتم السداد عبر البنوك المعتمدة أو المنظومة الإلكترونية.

## غرامات التأخير

تُفرض غرامات على التأخر في تقديم الإقرارات أو سداد الضريبة. لذلك من المهم الالتزام بالمواعيد المحددة.

## كيف نساعدك؟

في اتش جي للاستشارات المالية، نقدم خدمة متكاملة لإدارة ضريبة القيمة المضافة تشمل التسجيل، وإعداد الإقرارات الشهرية، والمتابعة مع مصلحة الضرائب.`,
      en: `## What is Value Added Tax?

Value Added Tax (VAT) is an indirect tax levied on most goods and services sold for use or consumption. In Egypt, VAT was officially implemented in 2016 under Law No. 67 of 2016.

## Standard Rate

The standard VAT rate in Egypt is **14%** on most goods and services. Some goods and services are exempt or subject to a reduced rate.

## Who Must Register?

Any natural or legal person conducting a commercial, industrial, or professional activity with annual sales exceeding **EGP 500,000** must register in the VAT system.

## Filing Steps

1. **Calculate tax due**: The difference between tax collected on sales and tax paid on purchases.
2. **Monthly return filing**: The tax return must be submitted during the following month.
3. **Payment**: Payment is made through approved banks or the electronic system.

## Late Penalties

Penalties are imposed for late submission of returns or late payment of tax. It is therefore important to comply with the specified deadlines.

## How We Help

At HG Financial Consulting, we provide a comprehensive VAT management service including registration, preparation of monthly returns, and follow-up with the Tax Authority.`,
    },
    image: "https://hg-audit.com/wp-content/uploads/2024/10/taxes.jpg",
  },
  {
    id: "2",
    slug: "importance-of-financial-auditing",
    category: { ar: "المراجعة المالية", en: "Financial Auditing" },
    date: "2026-03-22",
    readTime: { ar: "6 دقائق", en: "6 min read" },
    title: {
      ar: "أهمية تدقيق القوائم المالية لنمو أعمالك",
      en: "The Importance of Financial Statement Auditing for Business Growth",
    },
    excerpt: {
      ar: "يُعدّ تدقيق القوائم المالية ركيزة أساسية لأي شركة تسعى إلى النمو والاستدامة. تعرف على أهمية المراجعة وكيف تحمي شركتك.",
      en: "Financial statement auditing is a cornerstone for any company seeking growth and sustainability. Learn why auditing matters and how it protects your business.",
    },
    content: {
      ar: `## ما هو تدقيق القوائم المالية؟

تدقيق القوائم المالية هو عملية فحص ومراجعة منهجية لسجلات الشركة المالية من قِبل مدقق حسابات مستقل، بهدف التحقق من صحة ودقة البيانات المالية.

## لماذا يهم التدقيق؟

### 1. بناء الثقة مع الشركاء والمستثمرين
القوائم المالية المدققة تمنح الشركاء والمستثمرين والبنوك الثقة الكافية في صحة البيانات المالية للشركة.

### 2. الامتثال القانوني
كثير من الجهات الحكومية والتنظيمية تشترط تقديم قوائم مالية مدققة، خاصة للشركات المساهمة والشركات الكبيرة.

### 3. اكتشاف الأخطاء والاحتيال
يساعد التدقيق في الكشف المبكر عن الأخطاء المحاسبية أو أي تلاعب محتمل في الأرقام.

### 4. دعم اتخاذ القرار
البيانات المالية الدقيقة تمنح الإدارة رؤية واضحة لاتخاذ قرارات استراتيجية سليمة.

## متى تحتاج إلى مدقق حسابات؟

- عند تقديم طلب تمويل بنكي
- عند الدخول في شراكة تجارية جديدة
- عند التوسع وإضافة مستثمرين
- في نهاية كل سنة مالية

## خدماتنا في التدقيق

فريق اتش جي المتخصص يقدم خدمات تدقيق شاملة وفق أعلى المعايير المهنية الدولية.`,
      en: `## What is Financial Statement Auditing?

Financial statement auditing is a systematic examination and review of a company's financial records by an independent auditor, aimed at verifying the accuracy and correctness of the financial data.

## Why Does Auditing Matter?

### 1. Building Trust with Partners and Investors
Audited financial statements give partners, investors, and banks sufficient confidence in the accuracy of a company's financial data.

### 2. Legal Compliance
Many government and regulatory bodies require audited financial statements, especially for joint-stock companies and large corporations.

### 3. Detecting Errors and Fraud
Auditing helps in the early detection of accounting errors or any potential manipulation of figures.

### 4. Supporting Decision-Making
Accurate financial data gives management a clear vision to make sound strategic decisions.

## When Do You Need an Auditor?

- When applying for bank financing
- When entering a new business partnership
- When expanding and adding investors
- At the end of each financial year

## Our Auditing Services

HG's specialized team provides comprehensive auditing services according to the highest international professional standards.`,
    },
    image: "https://hg-audit.com/wp-content/uploads/2024/10/finance3.jpg",
  },
  {
    id: "3",
    slug: "company-formation-in-egypt",
    category: { ar: "تأسيس الشركات", en: "Company Formation" },
    date: "2026-03-05",
    readTime: { ar: "7 دقائق", en: "7 min read" },
    title: {
      ar: "كيف تؤسس شركتك في مصر: الخطوات والمتطلبات",
      en: "How to Form a Company in Egypt: Steps and Requirements",
    },
    excerpt: {
      ar: "دليل عملي لتأسيس شركتك في مصر، من اختيار الشكل القانوني المناسب وحتى استخراج كافة التراخيص اللازمة لممارسة النشاط.",
      en: "A practical guide to forming your company in Egypt — from choosing the right legal structure to obtaining all necessary licenses to start operations.",
    },
    content: {
      ar: `## أنواع الشركات في مصر

يمكنك تأسيس عدة أنواع من الشركات في مصر، أبرزها:

- **شركة ذات مسؤولية محدودة (LLC)**: الأكثر شيوعاً للشركات الصغيرة والمتوسطة
- **شركة مساهمة**: مناسبة للمشاريع الكبيرة التي تحتاج رأس مال ضخم
- **شركة توصية بالأسهم**
- **مؤسسة فردية**

## خطوات التأسيس

### المرحلة الأولى: الاستعداد
1. تحديد النشاط التجاري
2. اختيار الشكل القانوني المناسب
3. تحديد رأس المال المطلوب
4. اختيار أسماء الشركاء والمديرين

### المرحلة الثانية: الإجراءات الرسمية
1. **حجز اسم الشركة** في هيئة الاستثمار
2. **إعداد عقد التأسيس** وتوثيقه أمام الشهر العقاري
3. **التسجيل في السجل التجاري**
4. **الحصول على البطاقة الضريبية**
5. **التسجيل في منظومة ضريبة القيمة المضافة**

### المرحلة الثالثة: التراخيص
حسب طبيعة النشاط، قد تحتاج إلى تراخيص إضافية من جهات متخصصة.

## المتطلبات الأساسية

- صور بطاقات هوية الشركاء
- عنوان مقر الشركة
- رأس المال المطلوب (لا يقل عن 1000 جنيه للـ LLC)

## كيف نبسّط الأمر لك؟

نحن في اتش جي نتولى كامل إجراءات التأسيس نيابةً عنك، من البداية حتى الحصول على آخر ترخيص.`,
      en: `## Types of Companies in Egypt

You can form several types of companies in Egypt, most notably:

- **Limited Liability Company (LLC)**: The most common for small and medium businesses
- **Joint-Stock Company**: Suitable for large projects requiring significant capital
- **Partnership Limited by Shares**
- **Sole Proprietorship**

## Formation Steps

### Phase 1: Preparation
1. Define the business activity
2. Choose the appropriate legal structure
3. Determine required capital
4. Identify partners and directors

### Phase 2: Official Procedures
1. **Reserve the company name** at the Investment Authority
2. **Prepare the articles of association** and notarize them
3. **Register in the Commercial Register**
4. **Obtain a Tax Card**
5. **Register in the VAT system**

### Phase 3: Licenses
Depending on the nature of the activity, you may need additional licenses from specialized authorities.

## Basic Requirements

- Copies of partners' ID cards
- Company headquarters address
- Required capital (minimum EGP 1,000 for LLC)

## How We Simplify It For You

At HG, we handle all formation procedures on your behalf, from start to obtaining the last license.`,
    },
    image: "https://hg-audit.com/wp-content/uploads/2024/10/corporate.jpg",
  },
  {
    id: "4",
    slug: "feasibility-study-guide",
    category: { ar: "دراسات الجدوى", en: "Feasibility Studies" },
    date: "2026-02-18",
    readTime: { ar: "8 دقائق", en: "8 min read" },
    title: {
      ar: "دراسة الجدوى: مفتاح نجاح مشروعك قبل البدء",
      en: "Feasibility Study: The Key to Your Project's Success Before You Start",
    },
    excerpt: {
      ar: "قبل أن تبدأ أي مشروع، تحتاج إلى دراسة جدوى متكاملة. تعرف على مكونات دراسة الجدوى وكيف تساعدك في اتخاذ القرار الصحيح.",
      en: "Before starting any project, you need a comprehensive feasibility study. Learn about the components of a feasibility study and how it helps you make the right decision.",
    },
    content: {
      ar: `## ما هي دراسة الجدوى؟

دراسة الجدوى هي تحليل منهجي وشامل يُجرى قبل البدء في مشروع جديد، بهدف تقييم مدى قابلية المشروع للتنفيذ والنجاح من الناحية الاقتصادية والفنية والتسويقية والمالية.

## مكونات دراسة الجدوى الشاملة

### 1. الدراسة التسويقية
- تحليل السوق المستهدف وحجمه
- دراسة المنافسين
- تحديد الشريحة المستهدفة
- استراتيجية التسعير والتوزيع

### 2. الدراسة الفنية
- المتطلبات التقنية للمشروع
- الموقع والمساحة المطلوبة
- الآلات والمعدات اللازمة
- العمالة المطلوبة

### 3. الدراسة المالية
- تكاليف الإنشاء والتشغيل
- مصادر التمويل
- التدفقات النقدية المتوقعة
- نقطة التعادل (Break-even Point)
- معدل العائد على الاستثمار (ROI)

### 4. الدراسة القانونية والتنظيمية
- الشكل القانوني المناسب
- التراخيص والتصاريح المطلوبة

## لماذا تحتاج دراسة جدوى؟

1. **تقليل المخاطر**: تحديد نقاط الضعف قبل ضخ الأموال
2. **استقطاب التمويل**: البنوك والمستثمرون يشترطون دراسة جدوى متكاملة
3. **التخطيط الاستراتيجي**: وضع خارطة طريق واضحة للمشروع

## خدمتنا في إعداد دراسات الجدوى

فريقنا من المتخصصين يُعد دراسات جدوى احترافية معتمدة تلبي متطلبات البنوك وجهات التمويل المختلفة.`,
      en: `## What is a Feasibility Study?

A feasibility study is a systematic and comprehensive analysis conducted before starting a new project, aimed at evaluating the viability and likelihood of success from an economic, technical, marketing, and financial perspective.

## Components of a Comprehensive Feasibility Study

### 1. Market Study
- Analysis of target market and its size
- Competitor analysis
- Identifying the target segment
- Pricing and distribution strategy

### 2. Technical Study
- Technical requirements of the project
- Required location and space
- Necessary machinery and equipment
- Required workforce

### 3. Financial Study
- Construction and operational costs
- Financing sources
- Expected cash flows
- Break-even Point
- Return on Investment (ROI)

### 4. Legal and Regulatory Study
- Appropriate legal structure
- Required licenses and permits

## Why Do You Need a Feasibility Study?

1. **Risk Reduction**: Identify weaknesses before investing funds
2. **Attracting Financing**: Banks and investors require a comprehensive feasibility study
3. **Strategic Planning**: Setting a clear roadmap for the project

## Our Feasibility Study Service

Our team of specialists prepares professional certified feasibility studies that meet the requirements of banks and various financing entities.`,
    },
    image: "https://hg-audit.com/wp-content/uploads/2024/10/finance4.jpg",
  },
  {
    id: "5",
    slug: "bookkeeping-best-practices",
    category: { ar: "المحاسبة", en: "Accounting" },
    date: "2026-01-30",
    readTime: { ar: "5 دقائق", en: "5 min read" },
    title: {
      ar: "أفضل ممارسات امساك الدفاتر المحاسبية لأصحاب الأعمال",
      en: "Best Bookkeeping Practices for Business Owners",
    },
    excerpt: {
      ar: "امساك الدفاتر المحاسبية بشكل صحيح يحمي شركتك ويمنحك رؤية واضحة لأداء أعمالك. تعرف على أفضل الممارسات.",
      en: "Proper bookkeeping protects your business and gives you a clear picture of your performance. Learn the best practices every business owner should follow.",
    },
    content: {
      ar: `## لماذا يهم امساك الدفاتر؟

امساك الدفاتر المحاسبية هو الأساس الذي تقوم عليه إدارة أي عمل تجاري ناجح. فهو يمنحك صورة واضحة عن الوضع المالي لشركتك في أي وقت.

## أهم الممارسات

### 1. الفصل بين الحسابات الشخصية والتجارية
أول قاعدة أساسية: لا تخلط أموالك الشخصية بأموال شركتك. افتح حساباً بنكياً مستقلاً للشركة.

### 2. التسجيل الفوري للمعاملات
سجّل كل عملية مالية فور حدوثها — المبيعات، المصروفات، المشتريات — ولا تتركها تتراكم.

### 3. حفظ الفواتير والمستندات
احتفظ بنسخة من كل فاتورة مشتريات أو مبيعات. هذه الوثائق أساسية للمراجعة الضريبية.

### 4. المطابقة الشهرية مع البنك
قارن سجلاتك المحاسبية مع كشف حساب البنك شهرياً للتأكد من التطابق.

### 5. إعداد تقارير دورية
- قائمة الأرباح والخسائر الشهرية
- قائمة المركز المالي ربع سنوية
- تقرير التدفقات النقدية

### 6. الاستعانة بمحاسب متخصص
لا تعتمد على تسوية الحسابات بنفسك إذا لم يكن لديك خلفية محاسبية. المحاسب المتخصص يوفر عليك الوقت والمال.

## فائدة الدفاتر المنظمة

- سهولة التقدم للحصول على قروض بنكية
- تجنب المشاكل الضريبية
- اتخاذ قرارات مبنية على بيانات حقيقية

نحن في اتش جي نتولى امساك دفاترك المحاسبية باحترافية تامة.`,
      en: `## Why Does Bookkeeping Matter?

Bookkeeping is the foundation of any successful business. It gives you a clear picture of your company's financial position at any time.

## Best Practices

### 1. Separate Personal and Business Accounts
First golden rule: never mix your personal funds with your company's money. Open a separate bank account for your business.

### 2. Record Transactions Immediately
Record every financial transaction as soon as it occurs — sales, expenses, purchases — don't let them pile up.

### 3. Keep Invoices and Documents
Keep a copy of every purchase or sales invoice. These documents are essential for tax audits.

### 4. Monthly Bank Reconciliation
Compare your accounting records with your bank statement monthly to ensure they match.

### 5. Prepare Regular Reports
- Monthly profit and loss statement
- Quarterly balance sheet
- Cash flow report

### 6. Hire a Specialized Accountant
Don't rely on doing your own accounts if you don't have an accounting background. A specialized accountant saves you time and money.

## Benefits of Organized Books

- Easier access to bank loans
- Avoiding tax problems
- Making decisions based on real data

At HG, we handle your bookkeeping with complete professionalism.`,
    },
    image: "https://hg-audit.com/wp-content/uploads/2024/10/finance2-min.jpg",
  },
  {
    id: "6",
    slug: "technology-in-financial-management",
    category: { ar: "التقنية المالية", en: "Financial Technology" },
    date: "2026-01-12",
    readTime: { ar: "4 دقائق", en: "4 min read" },
    title: {
      ar: "كيف تغير التقنية وجه إدارة الأعمال المالية",
      en: "How Technology is Transforming Financial Business Management",
    },
    excerpt: {
      ar: "التحول الرقمي أصبح ضرورة لا اختياراً. تعرف على أحدث التقنيات التي تساعد الشركات في إدارة أعمالها المالية بكفاءة أعلى.",
      en: "Digital transformation is now a necessity, not an option. Discover the latest technologies helping businesses manage their finances more efficiently.",
    },
    content: {
      ar: `## التحول الرقمي في المحاسبة

شهدت السنوات الأخيرة طفرة هائلة في تقنيات إدارة الأعمال المالية. الشركات التي تعتمد على هذه التقنيات تتمتع بميزة تنافسية واضحة.

## أبرز التقنيات الحديثة

### 1. برامج المحاسبة السحابية
تتيح لك الوصول إلى بياناتك المالية من أي مكان وفي أي وقت، مع تحديث فوري وتلقائي.

### 2. أتمتة الفواتير
إصدار واستقبال الفواتير إلكترونياً يوفر الوقت ويقلل الأخطاء البشرية، كما يتوافق مع متطلبات منظومة الفاتورة الإلكترونية المصرية.

### 3. الفاتورة الإلكترونية في مصر
ألزمت مصلحة الضرائب المصرية كثيراً من الشركات بالانضمام إلى منظومة الفاتورة الإلكترونية. هذا يستدعي الاستعداد التقني المسبق.

### 4. تحليلات البيانات المالية
استخدام أدوات التحليل لفهم اتجاهات الأداء المالي ورسم توقعات دقيقة للمستقبل.

### 5. التوقيع الإلكتروني
تسريع إجراءات الموافقة على العقود والمستندات المالية.

## كيف نساعدك في التحول الرقمي؟

فريق الخدمات التقنية في اتش جي يساعدك على:
- الانضمام لمنظومة الفاتورة الإلكترونية
- اختيار وتطبيق البرنامج المحاسبي المناسب
- تدريب فريقك على الأدوات الرقمية الحديثة
- ربط أنظمتك المالية مع منظومة الضرائب

الاستثمار في التقنية المالية ليس تكلفة — إنه توفير على المدى البعيد.`,
      en: `## Digital Transformation in Accounting

Recent years have seen a massive leap in financial business management technologies. Companies that adopt these technologies enjoy a clear competitive advantage.

## Key Modern Technologies

### 1. Cloud Accounting Software
Gives you access to your financial data from anywhere, anytime, with instant automatic updates.

### 2. Invoice Automation
Issuing and receiving invoices electronically saves time and reduces human errors, while also complying with Egypt's e-invoicing system requirements.

### 3. Egypt's E-Invoicing System
The Egyptian Tax Authority has required many companies to join the e-invoicing system. This requires advance technical preparation.

### 4. Financial Data Analytics
Using analysis tools to understand financial performance trends and draw accurate future forecasts.

### 5. Electronic Signatures
Accelerating the approval process for contracts and financial documents.

## How We Help You with Digital Transformation

HG's technology services team helps you:
- Join the e-invoicing system
- Choose and implement the right accounting software
- Train your team on modern digital tools
- Connect your financial systems with the tax system

Investing in financial technology is not a cost — it's savings in the long run.`,
    },
    image: "https://hg-audit.com/wp-content/uploads/2024/10/tech.jpg",
  },
];

export function getArticleBySlug(slug: string): Article | undefined {
  return articles.find((a) => a.slug === slug);
}

export function formatDate(dateStr: string, lang: "ar" | "en"): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
