import finance3 from "@assets/finance3.jpg";
import finance2 from "@assets/finance2-min.jpg";
import taxes from "@assets/taxes.jpg";
import finance4 from "@assets/finance4.jpg";
import corporate from "@assets/corporate.jpg";
import tech from "@assets/tech.jpg";

export interface ServiceContent {
  slug: string;
  image: string;
  titleAr: string;
  titleEn: string;
  fullDescAr: string;
  fullDescEn: string;
  featuresAr: string[];
  featuresEn: string[];
  faqAr: { q: string; a: string }[];
  faqEn: { q: string; a: string }[];
}

export const servicesContent: ServiceContent[] = [
  {
    slug: "financial-auditing",
    image: finance3,
    titleAr: "تدقيق القوائم المالية",
    titleEn: "Financial Statement Auditing",
    fullDescAr: `تُعدّ خدمة تدقيق القوائم المالية من أهم الخدمات التي تقدمها شركة اتش جي للاستشارات المالية. نعمل وفق أعلى المعايير المحلية والدولية لفحص وتقييم القوائم المالية للشركات والمنشآت، بهدف ضمان دقتها وموثوقيتها.

يتولى فريقنا المتخصص إجراء مراجعة شاملة ودقيقة لجميع السجلات والمستندات المالية، مما يتيح لك رؤية واضحة وشفافة حول الوضع المالي الفعلي لشركتك، ويساعدك على اتخاذ قرارات استراتيجية سليمة.`,
    fullDescEn: `Financial statement auditing is one of the most important services offered by HG Financial Consulting. We operate according to the highest local and international standards to examine and evaluate financial statements, ensuring their accuracy and reliability.

Our specialized team conducts a comprehensive and precise review of all financial records and documents, providing you with a clear and transparent view of your company's actual financial position and helping you make sound strategic decisions.`,
    featuresAr: [
      "تدقيق الميزانية العمومية وقائمة الدخل",
      "فحص التدفقات النقدية وقائمة التغيرات في حقوق الملكية",
      "مراجعة السياسات والإجراءات المحاسبية المتبعة",
      "اكتشاف الأخطاء والغش المالي والتلاعب في الحسابات",
      "إعداد تقارير التدقيق وفق معايير IFRS وISA",
      "تقديم توصيات لتحسين نظام الرقابة الداخلية",
      "الاعتماد من قِبل مراجعين قانونيين معتمدين",
      "تمثيل الشركة أمام الجهات الرقابية والحكومية",
    ],
    featuresEn: [
      "Balance sheet and income statement audit",
      "Review of cash flows and statement of equity changes",
      "Review of accounting policies and procedures",
      "Detection of errors, fraud, and financial manipulation",
      "Audit reports prepared per IFRS and ISA standards",
      "Recommendations to improve internal control systems",
      "Certification by licensed legal auditors",
      "Company representation before regulatory authorities",
    ],
    faqAr: [
      { q: "من يحتاج إلى تدقيق القوائم المالية؟", a: "جميع الشركات المساهمة والشركات ذات المسؤولية المحدودة التي يتجاوز رأس مالها حداً معيناً، والشركات التي تحتاج لتمويل بنكي أو تقارير مدققة للمستثمرين." },
      { q: "ما الفرق بين المراجعة الداخلية والخارجية؟", a: "المراجعة الداخلية تُجرى من قِبل موظفين داخل الشركة لأغراض إدارية، أما المراجعة الخارجية فتُجرى من قِبل طرف محايد كشركة اتش جي وتمنح ثقة أعلى للمستثمرين والجهات الرسمية." },
      { q: "كم تستغرق عملية التدقيق؟", a: "تعتمد على حجم الشركة وتعقيد عملياتها، وعادةً تتراوح بين أسبوعين وستة أسابيع للشركات المتوسطة." },
    ],
    faqEn: [
      { q: "Who needs financial statement auditing?", a: "All joint-stock companies and LLCs with capital above certain thresholds, as well as companies seeking bank financing or audited reports for investors." },
      { q: "What is the difference between internal and external audit?", a: "Internal audit is conducted by company employees for management purposes, while external audit is conducted by an independent party like HG, providing higher confidence to investors and official authorities." },
      { q: "How long does the audit process take?", a: "It depends on the company size and complexity of operations, typically ranging from two to six weeks for mid-sized companies." },
    ],
  },
  {
    slug: "bookkeeping",
    image: finance2,
    titleAr: "امساك الدفاتر المحاسبية",
    titleEn: "Bookkeeping & Accounting",
    fullDescAr: `تعتبر خدمة إمساك الدفاتر المحاسبية الركيزة الأساسية لأي عمل تجاري ناجح. في شركة اتش جي نتولى تسجيل وتصنيف وتحليل جميع العمليات المالية اليومية لشركتك بدقة واحترافية عالية.

نحن ندرك أن وقتك ثمين وأن الإدارة الصحيحة للسجلات المالية تتطلب خبرة متخصصة. لذا نوفر لك فريقاً محاسبياً متكاملاً يعمل على مدار السنة لضمان أن دفاترك محدثة ودقيقة وجاهزة في أي وقت.`,
    fullDescEn: `Bookkeeping is the fundamental pillar of any successful business. At HG, we handle the recording, classification, and analysis of all your company's daily financial transactions with precision and professionalism.

We understand that your time is valuable and that proper financial record management requires specialized expertise. That's why we provide a complete accounting team working year-round to ensure your books are always up-to-date, accurate, and ready at any time.`,
    featuresAr: [
      "إعداد الشجرة المحاسبية وإعداد دليل الحسابات",
      "تسجيل المبيعات والمشتريات والمصروفات اليومية",
      "إدارة الرواتب والأجور وحساب مستحقات الموظفين",
      "إدارة النقدية والبنوك والمطابقة الشهرية",
      "تتبع المخزون وإدارة الأصول الثابتة",
      "إعداد قوائم الأرباح والخسائر شهرياً",
      "إعداد الميزانية العمومية ربع سنوياً",
      "اجتماع شهري لمراجعة الأداء المالي",
    ],
    featuresEn: [
      "Chart of accounts setup and accounting guide preparation",
      "Daily recording of sales, purchases, and expenses",
      "Payroll management and employee entitlements calculation",
      "Cash and bank management with monthly reconciliation",
      "Inventory tracking and fixed asset management",
      "Monthly profit and loss statement preparation",
      "Quarterly balance sheet preparation",
      "Monthly meeting to review financial performance",
    ],
    faqAr: [
      { q: "هل أحتاج لشخص محاسب داخلي مع هذه الخدمة؟", a: "لا، خدمتنا تغني عن توظيف محاسب داخلي وتوفر عليك التكاليف مع ضمان جودة أعلى." },
      { q: "كيف أرسل لكم المستندات والفواتير؟", a: "نوفر طرقاً متعددة: واتساب، إيميل، أو نظام إلكتروني مشترك. نتكيف مع ما يناسبك." },
      { q: "هل يمكنني الاطلاع على البيانات في أي وقت؟", a: "نعم، نوفر تقارير دورية وتقدر دائماً تطلب تقرير في أي وقت خلال أوقات العمل." },
    ],
    faqEn: [
      { q: "Do I need an in-house accountant alongside this service?", a: "No, our service replaces an in-house accountant and saves you costs while guaranteeing higher quality." },
      { q: "How do I send you documents and invoices?", a: "We offer multiple methods: WhatsApp, email, or a shared electronic system. We adapt to whatever suits you." },
      { q: "Can I access data at any time?", a: "Yes, we provide periodic reports and you can always request a report at any time during business hours." },
    ],
  },
  {
    slug: "tax-services",
    image: taxes,
    titleAr: "خدمات الضرائب",
    titleEn: "Tax Services",
    fullDescAr: `تُقدم شركة اتش جي خدمات ضريبية متكاملة تشمل التخطيط الضريبي وإعداد جميع أنواع الإقرارات الضريبية والتمثيل أمام الجهات الضريبية. نساعدك على الامتثال الكامل للقوانين الضريبية مع تحقيق أقصى قدر من التوفير المشروع في الأعباء الضريبية.

فريقنا الضريبي المتخصص على دراية تامة بأحدث التعديلات التشريعية الضريبية في مصر والمملكة العربية السعودية، ويعمل بشكل استباقي للحفاظ على مصالحك وتجنب الغرامات والعقوبات.`,
    fullDescEn: `HG provides comprehensive tax services including tax planning, preparation of all types of tax returns, and representation before tax authorities. We help you achieve full compliance with tax laws while maximizing legitimate tax savings.

Our specialized tax team is fully aware of the latest tax legislative amendments in Egypt and Saudi Arabia, working proactively to protect your interests and avoid penalties.`,
    featuresAr: [
      "إعداد وتقديم إقرار ضريبة القيمة المضافة (شهري/ربع سنوي)",
      "إعداد إقرار ضريبة الدخل السنوي",
      "إعداد إقرار الزكاة للشركات في المملكة العربية السعودية",
      "تقديم الخصم والإضافة الربع سنوية",
      "الفحص الضريبي ومواجهة مأموريات الضرائب",
      "التمثيل أمام اللجان الضريبية وحل النزاعات",
      "التسجيل في منظومة الفاتورة الإلكترونية",
      "التخطيط الضريبي لتقليل الأعباء الضريبية بشكل قانوني",
    ],
    featuresEn: [
      "Preparation and filing of VAT returns (monthly/quarterly)",
      "Annual income tax return preparation",
      "Zakat return preparation for Saudi Arabia companies",
      "Quarterly withholding tax filing",
      "Tax inspection and tax authority examination handling",
      "Representation before tax committees and dispute resolution",
      "Registration in the e-invoicing system",
      "Tax planning to legally minimize tax burdens",
    ],
    faqAr: [
      { q: "متى يجب التسجيل في ضريبة القيمة المضافة؟", a: "في مصر، يجب التسجيل عند تجاوز المبيعات السنوية 500,000 جنيه. في السعودية الحد هو 375,000 ريال." },
      { q: "ما هي عقوبة التأخر في تقديم الإقرار الضريبي؟", a: "تتراوح الغرامات بين 1000 جنيه و50,000 جنيه في مصر حسب نوع الإقرار ومدة التأخير، بالإضافة لفوائد تأخير 1.5% شهرياً." },
      { q: "هل تقدمون خدمة الضرائب للشركات في السعودية؟", a: "نعم، لدينا خبرة في النظام الضريبي السعودي ونقدم جميع خدمات الزكاة وضريبة الشركات للمنشآت العاملة في المملكة." },
    ],
    faqEn: [
      { q: "When must you register for VAT?", a: "In Egypt, registration is required when annual sales exceed EGP 500,000. In Saudi Arabia, the threshold is SAR 375,000." },
      { q: "What is the penalty for late tax return filing?", a: "Fines range from EGP 1,000 to 50,000 in Egypt depending on return type and delay period, plus a monthly late interest of 1.5%." },
      { q: "Do you provide tax services for companies in Saudi Arabia?", a: "Yes, we have expertise in the Saudi tax system and provide all zakat and corporate tax services for businesses operating in the Kingdom." },
    ],
  },
  {
    slug: "feasibility-studies",
    image: finance4,
    titleAr: "اعداد دراسات الجدوى للمشروعات",
    titleEn: "Project Feasibility Studies",
    fullDescAr: `دراسة الجدوى هي الخطوة الأولى والأهم قبل البدء في أي مشروع استثماري. تُقدم شركة اتش جي دراسات جدوى شاملة ومعتمدة تغطي جميع الجوانب الاقتصادية والمالية والتسويقية والفنية لمشروعك.

دراساتنا تُعد وفق أعلى المعايير الاحترافية وتُقبل من البنوك ومؤسسات التمويل والجهات الحكومية، مما يفتح أمامك أبواب التمويل ويضمن انطلاقة ناجحة لمشروعك.`,
    fullDescEn: `A feasibility study is the first and most important step before starting any investment project. HG provides comprehensive and certified feasibility studies covering all economic, financial, marketing, and technical aspects of your project.

Our studies are prepared according to the highest professional standards and are accepted by banks, financing institutions, and government authorities, opening funding doors and ensuring a successful project launch.`,
    featuresAr: [
      "الدراسة التسويقية: تحليل السوق والطلب والمنافسين",
      "الدراسة الفنية: المتطلبات التقنية والمعدات والموقع",
      "الدراسة المالية: التكاليف والإيرادات ونقطة التعادل",
      "حساب معدل العائد على الاستثمار (ROI)",
      "تحليل المخاطر وسيناريوهات التعامل معها",
      "إعداد التدفقات النقدية التوقعية لـ 5 سنوات",
      "دراسة الجدوى القانونية والتراخيص المطلوبة",
      "اعتماد الدراسة من جهات رسمية معترف بها",
    ],
    featuresEn: [
      "Market study: market, demand, and competitor analysis",
      "Technical study: technical requirements, equipment, and location",
      "Financial study: costs, revenues, and break-even point",
      "Return on Investment (ROI) calculation",
      "Risk analysis and mitigation scenarios",
      "5-year projected cash flow preparation",
      "Legal feasibility and required licensing study",
      "Study certification from recognized official entities",
    ],
    faqAr: [
      { q: "هل دراسة الجدوى مقبولة من البنوك؟", a: "نعم، دراساتنا مُعدّة وفق متطلبات البنوك ومؤسسات التمويل وتحمل توقيعات معتمدة من مراجعين قانونيين." },
      { q: "كم تستغرق إعداد دراسة الجدوى؟", a: "تعتمد على نوع وحجم المشروع، عادةً من أسبوعين إلى أربعة أسابيع للمشاريع المتوسطة." },
      { q: "ماذا يحدث لو أظهرت الدراسة أن المشروع غير مجدي؟", a: "نُقدم لك تقريراً صادقاً وشاملاً. أفضل الاكتشاف مبكراً وتوفير رأس المال من الخسارة في مشروع فاشل." },
    ],
    faqEn: [
      { q: "Is the feasibility study accepted by banks?", a: "Yes, our studies are prepared according to bank and financing institution requirements and bear certified signatures from legal auditors." },
      { q: "How long does preparing a feasibility study take?", a: "It depends on the project type and size, typically two to four weeks for medium-sized projects." },
      { q: "What happens if the study shows the project is not viable?", a: "We provide you with an honest and comprehensive report. It's better to discover it early and save capital than to lose it in a failing project." },
    ],
  },
  {
    slug: "company-formation",
    image: corporate,
    titleAr: "خدمات تأسيس الشركات",
    titleEn: "Company Formation Services",
    fullDescAr: `تأسيس شركة في مصر أو المملكة العربية السعودية يستلزم المرور بإجراءات قانونية وإدارية متعددة قد تكون معقدة ومستهلكة للوقت. في شركة اتش جي نتولى عنك جميع هذه الإجراءات من الألف إلى الياء.

منذ اختيار الشكل القانوني المناسب وحتى استخراج جميع التراخيص والسجلات، فريقنا القانوني المتخصص يضمن أن شركتك تُؤسَّس على أسس صحيحة وسليمة من البداية، مما يوفر عليك الوقت والجهد والتكاليف.`,
    fullDescEn: `Company formation in Egypt or Saudi Arabia involves multiple legal and administrative procedures that can be complex and time-consuming. At HG, we handle all these procedures from A to Z on your behalf.

From choosing the appropriate legal structure to obtaining all licenses and registrations, our specialized legal team ensures your company is established on sound foundations from the start, saving you time, effort, and costs.`,
    featuresAr: [
      "اختيار الشكل القانوني المناسب (LLC، مساهمة، فردية)",
      "تسجيل الشركة في السجل التجاري",
      "استخراج البطاقة الضريبية وملف الضرائب",
      "التسجيل في التأمينات الاجتماعية",
      "فتح حساب بنكي للشركة",
      "استخراج الاشتراطات والتراخيص حسب النشاط",
      "إعداد عقد التأسيس والنظام الأساسي",
      "التسجيل في الغرف التجارية والهيئات المختصة",
    ],
    featuresEn: [
      "Choosing the appropriate legal structure (LLC, JSC, Sole Proprietorship)",
      "Company registration in the Commercial Register",
      "Tax card and tax file extraction",
      "Social insurance registration",
      "Opening a corporate bank account",
      "Obtaining requirements and licenses per business activity",
      "Preparing articles of association and bylaws",
      "Registration with chambers of commerce and relevant authorities",
    ],
    faqAr: [
      { q: "ما أفضل شكل قانوني لشركتي؟", a: "يعتمد على عدة عوامل: عدد الشركاء، حجم رأس المال، طبيعة النشاط، والمخاطر المحتملة. فريقنا يُرشدك لأفضل خيار مجاناً." },
      { q: "كم تستغرق إجراءات التأسيس؟", a: "في مصر، يتراوح من 5 إلى 15 يوم عمل حسب نوع الشركة والإجراءات المطلوبة. لدينا قنوات تسريع رسمية." },
      { q: "هل يمكن تأسيس شركة للمقيمين خارج مصر؟", a: "نعم، نقدم خدمة التأسيس عن بُعد بالتوكيل الرسمي مع استيفاء جميع المتطلبات القانونية." },
    ],
    faqEn: [
      { q: "What is the best legal structure for my company?", a: "It depends on several factors: number of partners, capital size, business nature, and potential risks. Our team guides you to the best option free of charge." },
      { q: "How long do formation procedures take?", a: "In Egypt, it ranges from 5 to 15 working days depending on company type and required procedures. We have official acceleration channels." },
      { q: "Can a company be formed for non-residents of Egypt?", a: "Yes, we provide remote formation services through official power of attorney while fulfilling all legal requirements." },
    ],
  },
  {
    slug: "technology-services",
    image: tech,
    titleAr: "خدمات التقنية المالية",
    titleEn: "Financial Technology Services",
    fullDescAr: `في عصر التحول الرقمي، لم يعد اعتماد التقنية في إدارة الأعمال المالية خياراً بل ضرورة. تُقدم شركة اتش جي حلولاً تقنية متكاملة تساعدك على الانتقال إلى المنظومة الرقمية بسلاسة وكفاءة.

نساعدك في الانضمام لمنظومة الفاتورة الإلكترونية الإلزامية، واختيار أنسب برامج المحاسبة، وتدريب فريقك لاستخدامها بشكل صحيح، مما يرفع من كفاءة العمل ويقلل الأخطاء البشرية.`,
    fullDescEn: `In the era of digital transformation, adopting technology in financial business management is no longer optional — it's a necessity. HG provides comprehensive technology solutions that help you transition to the digital ecosystem smoothly and efficiently.

We help you join the mandatory e-invoicing system, choose the most suitable accounting software, and train your team to use it correctly, increasing operational efficiency and reducing human errors.`,
    featuresAr: [
      "التسجيل والربط بمنظومة الفاتورة الإلكترونية",
      "الدعم الفني وحل مشكلات منظومة الفاتورة الإلكترونية",
      "اختيار وتركيب برامج المحاسبة المناسبة (QuickBooks, Odoo, Xero)",
      "تحويل البيانات المحاسبية من النظام القديم للجديد",
      "تدريب الفريق على استخدام البرامج المحاسبية",
      "الربط مع أنظمة نقاط البيع (POS)",
      "إعداد لوحات تحكم مالية وتقارير ذكية",
      "الدعم الفني المستمر بعد التطبيق",
    ],
    featuresEn: [
      "Registration and integration with the e-invoicing system",
      "Technical support and e-invoicing system issue resolution",
      "Selection and installation of suitable accounting software (QuickBooks, Odoo, Xero)",
      "Migration of accounting data from old to new system",
      "Team training on accounting software usage",
      "Integration with Point of Sale (POS) systems",
      "Financial dashboard and business intelligence report setup",
      "Ongoing technical support post-implementation",
    ],
    faqAr: [
      { q: "هل الفاتورة الإلكترونية إلزامية لجميع الشركات؟", a: "نعم، مصلحة الضرائب المصرية ألزمت جميع الشركات المسجلة ضريبياً بالانضمام للمنظومة الإلكترونية." },
      { q: "ما أفضل برنامج محاسبة تنصح به؟", a: "يعتمد على حجم شركتك وطبيعة نشاطها. نُجري تقييماً مجانياً ونوصي بالأنسب لك مع ضمان التطبيق الكامل." },
      { q: "كم تستغرق عملية التحول الرقمي؟", a: "عادةً من أسبوع إلى شهر حسب حجم البيانات والفريق. نُقدم دعماً مستمراً خلال الفترة الانتقالية وبعدها." },
    ],
    faqEn: [
      { q: "Is e-invoicing mandatory for all companies?", a: "Yes, the Egyptian Tax Authority has mandated all tax-registered companies to join the electronic system." },
      { q: "What accounting software do you recommend?", a: "It depends on your company size and business nature. We conduct a free assessment and recommend the most suitable option with full implementation guarantee." },
      { q: "How long does the digital transformation process take?", a: "Usually one week to one month depending on data size and team. We provide continuous support during and after the transition period." },
    ],
  },
];

export function getServiceBySlug(slug: string): ServiceContent | undefined {
  return servicesContent.find((s) => s.slug === slug);
}
