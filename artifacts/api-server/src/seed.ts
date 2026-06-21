import { db, articlesTable, servicesTable, packagesTable, siteSettingsTable, DEFAULT_SETTINGS } from "@workspace/db";
import { sql, like } from "drizzle-orm";
import { logger } from "./lib/logger";

const seedData = [
  {
    slug: "vat-in-egypt",
    categoryAr: "الضرائب", categoryEn: "Taxation",
    date: "2026-04-10",
    readTimeAr: "5 دقائق", readTimeEn: "5 min read",
    titleAr: "دليلك الشامل لضريبة القيمة المضافة في مصر",
    titleEn: "Your Complete Guide to VAT in Egypt",
    excerptAr: "تعرف على كل ما يخص ضريبة القيمة المضافة في مصر، معدلاتها، وكيفية تقديم الإقرار الضريبي بشكل صحيح لتجنب الغرامات.",
    excerptEn: "Learn everything about Value Added Tax in Egypt — rates, filing deadlines, and how to submit your returns correctly to avoid penalties.",
    contentAr: `## ما هي ضريبة القيمة المضافة؟\n\nضريبة القيمة المضافة (VAT) هي ضريبة غير مباشرة تُفرض على معظم السلع والخدمات. في مصر، تم تطبيقها رسمياً عام 2016 بموجب القانون رقم 67.\n\n## المعدل العام\n\nالمعدل العام هو **14%** على معظم السلع والخدمات.\n\n## من يلتزم بالتسجيل؟\n\nكل من يتجاوز حجم مبيعاته السنوية **500,000 جنيه** يجب عليه التسجيل.\n\n## خطوات تقديم الإقرار\n\n1. حساب الضريبة المستحقة\n2. تقديم الإقرار الشهري\n3. سداد المبلغ المستحق\n\n## كيف نساعدك؟\n\nفي اتش جي نقدم خدمة متكاملة لإدارة ضريبة القيمة المضافة تشمل التسجيل وإعداد الإقرارات الشهرية.`,
    contentEn: `## What is Value Added Tax?\n\nVAT is an indirect tax levied on most goods and services. In Egypt, it was officially implemented in 2016 under Law No. 67.\n\n## Standard Rate\n\nThe standard VAT rate in Egypt is **14%** on most goods and services.\n\n## Who Must Register?\n\nAny person with annual sales exceeding **EGP 500,000** must register.\n\n## Filing Steps\n\n1. Calculate tax due\n2. Submit monthly return\n3. Make payment\n\n## How We Help\n\nAt HG we provide a comprehensive VAT management service including registration and monthly return preparation.`,
    image: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&auto=format&fit=crop",
    published: true,
  },
  {
    slug: "importance-of-financial-auditing",
    categoryAr: "المراجعة المالية", categoryEn: "Financial Auditing",
    date: "2026-03-22",
    readTimeAr: "6 دقائق", readTimeEn: "6 min read",
    titleAr: "أهمية تدقيق القوائم المالية لنمو أعمالك",
    titleEn: "The Importance of Financial Statement Auditing for Business Growth",
    excerptAr: "يُعدّ تدقيق القوائم المالية ركيزة أساسية لأي شركة تسعى إلى النمو والاستدامة.",
    excerptEn: "Financial statement auditing is a cornerstone for any company seeking growth and sustainability.",
    contentAr: `## ما هو تدقيق القوائم المالية؟\n\nهو عملية فحص منهجية لسجلات الشركة المالية من قِبل مدقق مستقل.\n\n## لماذا يهم التدقيق؟\n\n### 1. بناء الثقة\nالقوائم المدققة تمنح المستثمرين الثقة الكافية.\n\n### 2. الامتثال القانوني\nكثير من الجهات تشترط تقديم قوائم مدققة.\n\n### 3. اكتشاف الأخطاء\nيساعد في الكشف المبكر عن الأخطاء المحاسبية.\n\n## خدماتنا في التدقيق\n\nفريق اتش جي يقدم خدمات تدقيق وفق أعلى المعايير الدولية.`,
    contentEn: `## What is Financial Statement Auditing?\n\nIt's a systematic examination of a company's financial records by an independent auditor.\n\n## Why Does Auditing Matter?\n\n### 1. Building Trust\nAudited statements give investors sufficient confidence.\n\n### 2. Legal Compliance\nMany regulatory bodies require audited financial statements.\n\n### 3. Detecting Errors\nHelps in early detection of accounting errors.\n\n## Our Auditing Services\n\nHG's team provides auditing services according to the highest international standards.`,
    image: "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=800&auto=format&fit=crop",
    published: true,
  },
  {
    slug: "company-formation-in-egypt",
    categoryAr: "تأسيس الشركات", categoryEn: "Company Formation",
    date: "2026-03-05",
    readTimeAr: "7 دقائق", readTimeEn: "7 min read",
    titleAr: "كيف تؤسس شركتك في مصر: الخطوات والمتطلبات",
    titleEn: "How to Form a Company in Egypt: Steps and Requirements",
    excerptAr: "دليل عملي لتأسيس شركتك في مصر من اختيار الشكل القانوني وحتى استخراج التراخيص.",
    excerptEn: "A practical guide to forming your company in Egypt — from choosing the legal structure to obtaining all necessary licenses.",
    contentAr: `## أنواع الشركات في مصر\n\n- **شركة ذات مسؤولية محدودة (LLC)**\n- **شركة مساهمة**\n- **مؤسسة فردية**\n\n## خطوات التأسيس\n\n1. تحديد النشاط التجاري\n2. حجز اسم الشركة\n3. إعداد عقد التأسيس\n4. التسجيل في السجل التجاري\n5. الحصول على البطاقة الضريبية\n\n## كيف نبسّط الأمر لك؟\n\nنحن في اتش جي نتولى كامل إجراءات التأسيس نيابةً عنك.`,
    contentEn: `## Types of Companies in Egypt\n\n- **Limited Liability Company (LLC)**\n- **Joint-Stock Company**\n- **Sole Proprietorship**\n\n## Formation Steps\n\n1. Define the business activity\n2. Reserve the company name\n3. Prepare articles of association\n4. Register in the Commercial Register\n5. Obtain a Tax Card\n\n## How We Simplify It\n\nAt HG, we handle all formation procedures on your behalf.`,
    image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&auto=format&fit=crop",
    published: true,
  },
  {
    slug: "feasibility-study-guide",
    categoryAr: "دراسات الجدوى", categoryEn: "Feasibility Studies",
    date: "2026-02-18",
    readTimeAr: "8 دقائق", readTimeEn: "8 min read",
    titleAr: "دراسة الجدوى: مفتاح نجاح مشروعك قبل البدء",
    titleEn: "Feasibility Study: The Key to Your Project's Success Before You Start",
    excerptAr: "قبل أن تبدأ أي مشروع، تحتاج إلى دراسة جدوى متكاملة تقييم مدى قابلية المشروع للنجاح.",
    excerptEn: "Before starting any project, you need a comprehensive feasibility study to evaluate its viability.",
    contentAr: `## ما هي دراسة الجدوى؟\n\nهي تحليل شامل يُجرى قبل البدء في مشروع جديد.\n\n## مكونات دراسة الجدوى\n\n### 1. الدراسة التسويقية\n- تحليل السوق\n- دراسة المنافسين\n\n### 2. الدراسة المالية\n- تكاليف التشغيل\n- معدل العائد على الاستثمار (ROI)\n- نقطة التعادل\n\n### 3. الدراسة الفنية\n- المتطلبات التقنية\n- الآلات والمعدات\n\n## خدمتنا\n\nفريقنا يُعد دراسات جدوى احترافية معتمدة تلبي متطلبات البنوك.`,
    contentEn: `## What is a Feasibility Study?\n\nIt's a systematic analysis conducted before starting a new project.\n\n## Components\n\n### 1. Market Study\n- Target market analysis\n- Competitor analysis\n\n### 2. Financial Study\n- Operational costs\n- Return on Investment (ROI)\n- Break-even point\n\n### 3. Technical Study\n- Technical requirements\n- Machinery and equipment\n\n## Our Service\n\nOur team prepares certified feasibility studies meeting bank requirements.`,
    image: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&auto=format&fit=crop",
    published: true,
  },
  {
    slug: "bookkeeping-best-practices",
    categoryAr: "المحاسبة", categoryEn: "Accounting",
    date: "2026-01-30",
    readTimeAr: "5 دقائق", readTimeEn: "5 min read",
    titleAr: "أفضل ممارسات امساك الدفاتر المحاسبية لأصحاب الأعمال",
    titleEn: "Best Bookkeeping Practices for Business Owners",
    excerptAr: "امساك الدفاتر المحاسبية بشكل صحيح يحمي شركتك ويمنحك رؤية واضحة لأداء أعمالك.",
    excerptEn: "Proper bookkeeping protects your business and gives you a clear picture of your performance.",
    contentAr: `## لماذا يهم امساك الدفاتر؟\n\nهو الأساس الذي تقوم عليه إدارة أي عمل تجاري ناجح.\n\n## أهم الممارسات\n\n### 1. الفصل بين الحسابات\nلا تخلط أموالك الشخصية بأموال شركتك.\n\n### 2. التسجيل الفوري\nسجّل كل عملية مالية فور حدوثها.\n\n### 3. حفظ الفواتير\naحتفظ بنسخة من كل فاتورة.\n\n### 4. المطابقة الشهرية\nقارن سجلاتك مع كشف حساب البنك شهرياً.\n\n## نحن في اتش جي نتولى امساك دفاترك باحترافية تامة.`,
    contentEn: `## Why Does Bookkeeping Matter?\n\nIt's the foundation of any successful business.\n\n## Best Practices\n\n### 1. Separate Accounts\nNever mix personal funds with business money.\n\n### 2. Record Immediately\nRecord every transaction as soon as it occurs.\n\n### 3. Keep Invoices\nKeep a copy of every invoice.\n\n### 4. Monthly Reconciliation\nCompare records with bank statement monthly.\n\n## At HG, we handle your bookkeeping with complete professionalism.`,
    image: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800&auto=format&fit=crop",
    published: true,
  },
  {
    slug: "technology-in-financial-management",
    categoryAr: "التقنية المالية", categoryEn: "Financial Technology",
    date: "2026-01-12",
    readTimeAr: "4 دقائق", readTimeEn: "4 min read",
    titleAr: "كيف تغير التقنية وجه إدارة الأعمال المالية",
    titleEn: "How Technology is Transforming Financial Business Management",
    excerptAr: "التحول الرقمي أصبح ضرورة لا اختياراً. تعرف على أحدث التقنيات التي تساعد الشركات.",
    excerptEn: "Digital transformation is now a necessity. Discover the latest technologies helping businesses manage finances efficiently.",
    contentAr: `## التحول الرقمي في المحاسبة\n\nشهدت السنوات الأخيرة طفرة هائلة في تقنيات إدارة الأعمال المالية.\n\n## أبرز التقنيات الحديثة\n\n### 1. برامج المحاسبة السحابية\nالوصول إلى بياناتك من أي مكان وفي أي وقت.\n\n### 2. الفاتورة الإلكترونية\nألزمت مصلحة الضرائب الشركات بالانضمام للمنظومة الإلكترونية.\n\n### 3. تحليلات البيانات\nفهم اتجاهات الأداء المالي ورسم توقعات دقيقة.\n\n## كيف نساعدك في التحول الرقمي؟\n\n- الانضمام لمنظومة الفاتورة الإلكترونية\n- اختيار البرنامج المحاسبي المناسب\n- تدريب فريقك على الأدوات الرقمية`,
    contentEn: `## Digital Transformation in Accounting\n\nRecent years have seen a massive leap in financial management technologies.\n\n## Key Modern Technologies\n\n### 1. Cloud Accounting Software\nAccess your financial data from anywhere, anytime.\n\n### 2. E-Invoicing\nThe Egyptian Tax Authority requires companies to join the e-invoicing system.\n\n### 3. Data Analytics\nUnderstand financial performance trends and draw accurate forecasts.\n\n## How We Help\n\n- Join the e-invoicing system\n- Choose the right accounting software\n- Train your team on digital tools`,
    image: "https://images.unsplash.com/photo-1518186285589-2f7649de83e0?w=800&auto=format&fit=crop",
    published: true,
  },
];

const servicesData = [
  { titleAr: "المراجعة والتدقيق المالي", titleEn: "Financial Auditing", descriptionAr: "مراجعة شاملة للقوائم المالية وفق أعلى المعايير الدولية لضمان الدقة والشفافية", descriptionEn: "Comprehensive review of financial statements according to international standards", image: "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=800&auto=format&fit=crop", order: 1, published: true },
  { titleAr: "الاستشارات الضريبية", titleEn: "Tax Consulting", descriptionAr: "حلول ضريبية متكاملة تشمل التخطيط الضريبي وإعداد الإقرارات والتمثيل أمام الجهات الضريبية", descriptionEn: "Comprehensive tax solutions including planning, returns preparation, and tax authority representation", image: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&auto=format&fit=crop", order: 2, published: true },
  { titleAr: "تأسيس الشركات", titleEn: "Company Formation", descriptionAr: "نتولى كامل إجراءات تأسيس شركتك من اختيار الشكل القانوني حتى استخراج جميع التراخيص", descriptionEn: "We handle all company formation procedures from legal structure selection to licensing", image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&auto=format&fit=crop", order: 3, published: true },
  { titleAr: "الخدمات المحاسبية", titleEn: "Accounting Services", descriptionAr: "إمساك الدفاتر وإعداد القوائم المالية وفق المعايير المحلية والدولية بدقة واحترافية", descriptionEn: "Bookkeeping and financial statement preparation according to local and international standards", image: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800&auto=format&fit=crop", order: 4, published: true },
  { titleAr: "دراسات الجدوى الاقتصادية", titleEn: "Feasibility Studies", descriptionAr: "دراسات جدوى شاملة ومعتمدة تغطي الجوانب التسويقية والمالية والفنية لمشروعك", descriptionEn: "Comprehensive certified feasibility studies covering marketing, financial and technical aspects", image: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&auto=format&fit=crop", order: 5, published: true },
  { titleAr: "التحول الرقمي المالي", titleEn: "Financial Digital Transformation", descriptionAr: "مساعدتك في الانضمام لمنظومة الفاتورة الإلكترونية واختيار أفضل برامج المحاسبة", descriptionEn: "Helping you join the e-invoicing system and select the best accounting software", image: "https://images.unsplash.com/photo-1518186285589-2f7649de83e0?w=800&auto=format&fit=crop", order: 6, published: true },
];

const features = [
  { ar: "تأسيس شركة واحدة", en: "1 Company Formation" },
  { ar: "مراجعة مالية سنوية", en: "Annual Financial Audit" },
  { ar: "إقرار ضريبي سنوي", en: "Annual Tax Return" },
  { ar: "إمساك الدفاتر الشهري", en: "Monthly Bookkeeping" },
  { ar: "إعداد القوائم المالية", en: "Financial Statements Preparation" },
  { ar: "استشارة ضريبية (ساعتان/شهر)", en: "Tax Consulting (2 hrs/month)" },
  { ar: "تمثيل أمام الجهات الضريبية", en: "Tax Authority Representation" },
  { ar: "تقرير مالي شهري", en: "Monthly Financial Report" },
  { ar: "دراسة جدوى اقتصادية", en: "Economic Feasibility Study" },
  { ar: "استشارات غير محدودة", en: "Unlimited Consulting" },
  { ar: "مدير حساب مخصص", en: "Dedicated Account Manager" },
];

const packagesData = [
  {
    titleAr: "الشركات الناشئة",
    titleEn: "Startups",
    descriptionAr: "مثالي للشركات الصغيرة والناشئة",
    descriptionEn: "Ideal for small and startup companies",
    featuresAr: features.slice(0, 4).map(f => f.ar),
    featuresEn: features.slice(0, 4).map(f => f.en),
    highlighted: false,
    order: 1,
    published: true,
  },
  {
    titleAr: "الشركات المتوسطة",
    titleEn: "Growing Companies",
    descriptionAr: "مناسب للشركات في مرحلة النمو",
    descriptionEn: "Suitable for companies in the growth phase",
    featuresAr: features.slice(0, 8).map(f => f.ar),
    featuresEn: features.slice(0, 8).map(f => f.en),
    highlighted: true,
    order: 2,
    published: true,
  },
  {
    titleAr: "الشركات الكبيرة",
    titleEn: "Large Companies",
    descriptionAr: "حل متكامل للشركات الكبيرة والمتعددة الفروع",
    descriptionEn: "Comprehensive solution for large and multi-branch companies",
    featuresAr: features.map(f => f.ar),
    featuresEn: features.map(f => f.en),
    highlighted: false,
    order: 3,
    published: true,
  },
];

export async function seedArticles() {
  try {
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(articlesTable);
    if (count > 0) { logger.info({ count }, "Articles already seeded, skipping"); return; }
    await db.insert(articlesTable).values(seedData);
    logger.info({ count: seedData.length }, "Seeded articles");
  } catch (err) { logger.error({ err }, "Article seed failed"); }
}

export async function seedServices() {
  try {
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(servicesTable);
    if (count > 0) { logger.info({ count }, "Services already seeded, skipping"); return; }
    await db.insert(servicesTable).values(servicesData);
    logger.info({ count: servicesData.length }, "Seeded services");
  } catch (err) { logger.error({ err }, "Services seed failed"); }
}

export async function seedPackages() {
  try {
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(packagesTable);
    if (count > 0) { logger.info({ count }, "Packages already seeded, skipping"); return; }
    await db.insert(packagesTable).values(packagesData);
    logger.info({ count: packagesData.length }, "Seeded packages");
  } catch (err) { logger.error({ err }, "Packages seed failed"); }
}

export async function seedSettings() {
  try {
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(siteSettingsTable);
    if (count > 0) { logger.info({ count }, "Settings already seeded, skipping"); return; }
    const entries = Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value }));
    await db.insert(siteSettingsTable).values(entries);
    logger.info({ count: entries.length }, "Seeded settings");
  } catch (err) { logger.error({ err }, "Settings seed failed"); }
}

const wpImageMap: Record<string, string> = {
  "taxes.jpg": "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&auto=format&fit=crop",
  "finance3.jpg": "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=800&auto=format&fit=crop",
  "corporate.jpg": "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&auto=format&fit=crop",
  "finance4.jpg": "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&auto=format&fit=crop",
  "finance2-min.jpg": "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800&auto=format&fit=crop",
  "tech.jpg": "https://images.unsplash.com/photo-1518186285589-2f7649de83e0?w=800&auto=format&fit=crop",
};

export async function fixWordPressImageUrls() {
  try {
    const rows = await db
      .select({ id: articlesTable.id, image: articlesTable.image })
      .from(articlesTable)
      .where(like(articlesTable.image, "%wp-content/uploads%"));
    if (rows.length === 0) return;
    let fixed = 0;
    for (const row of rows) {
      if (!row.image) continue;
      const filename = row.image.split("/").pop() ?? "";
      const newUrl = wpImageMap[filename];
      if (newUrl) {
        await db.update(articlesTable).set({ image: newUrl }).where(sql`id = ${row.id}`);
        fixed++;
      }
    }
    if (fixed > 0) logger.info({ fixed }, "Fixed WordPress image URLs in articles");
  } catch (err) { logger.error({ err }, "fixWordPressImageUrls failed"); }
}
