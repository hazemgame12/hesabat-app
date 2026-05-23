import { createContext, useContext, useState, ReactNode } from "react";

type Lang = "ar" | "en";

interface Translations {
  dir: "rtl" | "ltr";
  navbar: {
    home: string;
    services: string;
    packages: string;
    about: string;
    contact: string;
    switchLang: string;
  };
  hero: {
    subtitle: string;
    title: string;
    body: string;
    cta: string;
    explore: string;
  };
  about: {
    badge: string;
    title: string;
    p1: string;
    p2: string;
    founderTitle: string;
    founderRole: string;
    yearsLabel: string;
  };
  services: {
    badge: string;
    title: string;
    body: string;
    more: string;
    items: { title: string; desc: string }[];
  };
  stats: {
    years: string;
    projects: string;
    employees: string;
    clients: string;
  };
  packages: {
    badge: string;
    title: string;
    body: string;
    popular: string;
    cta: string;
    items: { title: string; desc: string }[];
    features: string[];
  };
  partners: {
    badge: string;
    title: string;
    body: string;
  };
  contact: {
    badge: string;
    title: string;
    body: string;
    infoTitle: string;
    phone: string;
    email: string;
    address: string;
    addressVal: string;
    whatsapp: string;
    formTitle: string;
    name: string;
    namePlaceholder: string;
    phonePlaceholder: string;
    emailPlaceholder: string;
    message: string;
    messagePlaceholder: string;
    send: string;
    sending: string;
    sent: string;
  };
  footer: {
    tagline: string;
    quickLinks: string;
    services: string;
    getInTouch: string;
    copyright: string;
    design: string;
    links: { label: string; id: string }[];
    serviceLinks: string[];
  };
}

const ar: Translations = {
  dir: "rtl",
  navbar: {
    home: "الصفحة الرئيسية",
    services: "خدماتنا",
    packages: "الباقات",
    about: "من نحن",
    contact: "تواصل معنا",
    switchLang: "English",
  },
  hero: {
    subtitle: "HG FINANCIAL CONSULTING",
    title: "شركة اتش جي للاستشارات المالية",
    body: "شركة مهنية احترافية متخصص في تقديم خدمات الإستشارات المالية المتكاملة",
    cta: "حجز جلسة مجانية",
    explore: "اكتشف خدماتنا",
  },
  about: {
    badge: "من نحن",
    title: "نبذة عنا | اتش جي لخدمات الاستشارات المالية",
    p1: "تأسست شركة اتش جي للاستشارات المالية لتكون واحدة من اهم صروح المجال المحاسبي والمالي في الوطن العربي – وذلك من خلال الاعتماد على كوادرها التي تؤهلها لكسب احترام عملائنا.",
    p2: "نقدم في اتش جي فريقًا من المحترفين المؤهلين لتقديم أعلى مستوى من الخدمات المالية والمحاسبية. سواء كنت رائد أعمال أو شركة قائمة، فإننا نقدم لك الدعم والخبرة اللازمة لتحقيق النجاح المالي. خدماتنا تشمل: المحاسبة، الضرائب، المراجعة، دراسات الجدوى، والاستشارات المالية المتخصصة.",
    founderTitle: "أ/ حازم جميل سيد سليم",
    founderRole: "مؤسس الشركة",
    yearsLabel: "عاماً من الخبرة في الاستشارات المالية",
  },
  services: {
    badge: "خدماتنا",
    title: "خدماتنا | اتش جي للاستشارات المالية والضرائب",
    body: "نحن شركة مهنية احترافية متخصص في تقديم خدمات مالية متكاملة لدعم نمو أعمالك وتحقيق أهدافك الاستراتيجية.",
    more: "المزيد",
    items: [
      { title: "تدقيق القوائم المالية", desc: "خدمات تدقيق وفحص القوائم المالية واعتمادها من قِبل خبراء متخصصين" },
      { title: "امساك الدفاتر المحاسبية", desc: "إدارة وتسجيل العمليات المالية اليومية باحترافية عالية" },
      { title: "خدمات الضرائب", desc: "تقديم الإقرارات الضريبية والمتابعة الدورية مع الجهات الحكومية" },
      { title: "اعداد دراسات جدوى للمشروعات", desc: "دراسات جدوى احترافية لضمان نجاح مشاريعك" },
      { title: "خدمات تأسيس الشركات", desc: "إجراءات تأسيس الشركات والتسجيل القانوني بسهولة ويسر" },
      { title: "خدمات التقنية", desc: "حلول تقنية متكاملة لدعم إدارة الأعمال المالية" },
    ],
  },
  stats: {
    years: "سنة خبرة",
    projects: "مشاريع مكتملة",
    employees: "الموظفين الماهرون",
    clients: "العملاء النشطين",
  },
  packages: {
    badge: "الباقات",
    title: "باقات خدماتنا",
    body: "اختر الباقة التي تناسب حجم شركتك واحتياجاتك المالية",
    popular: "الأكثر طلباً",
    cta: "احصل على عرض سعر",
    items: [
      { title: "الشركات الصغيرة", desc: "عدد الموظفين من ١ الي ٥" },
      { title: "الشركات المتوسطة", desc: "عدد الموظفين من ٦ الي ١٠" },
      { title: "الشركات الكبيرة", desc: "من ١٠ موظفين فاكثر" },
    ],
    features: [
      "اعداد الشجرة المحاسبية",
      "تسجيل المبيعات، المصروفات، والمشتريات",
      "تسجيل الرواتب والأجور",
      "إدارة النقدية، المخزون، والأصول",
      "تقديم إقرار القيمة المضافة (شهري أو ربع سنوي)",
      "تقديم الخصم والاضافة الربع سنوية",
      "اعداد التسوية المرتبات الشهرية وربع سنوية",
      "تسوية كشف حساب البنك",
      "تقديم الإقرار الدخل واقرار الزكاة السنوي",
      "التقارير المالية (قائمة الأرباح والخسائر - قائمة المركز المالي - التدفق النقدي)",
      "اجتماع شهري لمناقشة وشرح التقارير المالية",
    ],
  },
  partners: {
    badge: "شركاؤنا",
    title: "شركاؤنا",
    body: "تعرف على بعض من عملائنا وشركاء نجاحنا",
  },
  contact: {
    badge: "تواصل معنا",
    title: "كيف يمكننا مساعدتك؟",
    body: "فريقنا من الخبراء جاهز للرد على استفساراتك وتقديم الاستشارة المالية التي تناسب أعمالك",
    infoTitle: "معلومات التواصل",
    phone: "رقم الهاتف",
    email: "البريد الإلكتروني",
    address: "العنوان",
    addressVal: "مصر / المملكة العربية السعودية",
    whatsapp: "تواصل عبر واتساب",
    formTitle: "أرسل رسالة",
    name: "الاسم الكامل",
    namePlaceholder: "اكتب اسمك الكامل",
    phonePlaceholder: "رقم هاتفك",
    emailPlaceholder: "بريدك الإلكتروني",
    message: "رسالتك",
    messagePlaceholder: "اكتب تفاصيل استفسارك هنا...",
    send: "إرسال الرسالة",
    sending: "جاري الإرسال...",
    sent: "تم الإرسال بنجاح!",
  },
  footer: {
    tagline: "شركة مهنية احترافية متخصص في تقديم خدمات الإستشارات المالية المتكاملة، نساعدك في تحقيق أهدافك الاستراتيجية والمالية.",
    quickLinks: "روابط سريعة",
    services: "أهم الخدمات",
    getInTouch: "التواصل",
    copyright: "© حقوق النشر 2026. شركة اتش جي للاستشارات المالية. جميع الحقوق محفوظة.",
    design: "تصميم:",
    links: [
      { label: "من نحن", id: "about" },
      { label: "خدماتنا", id: "services" },
      { label: "باقاتنا", id: "packages" },
      { label: "تواصل معنا", id: "contact" },
    ],
    serviceLinks: [
      "تدقيق القوائم المالية",
      "امساك الدفاتر المحاسبية",
      "خدمات الضرائب",
      "دراسات جدوى المشروعات",
      "تأسيس الشركات",
      "الخدمات التقنية",
    ],
  },
};

const en: Translations = {
  dir: "ltr",
  navbar: {
    home: "Home",
    services: "Services",
    packages: "Packages",
    about: "About Us",
    contact: "Contact",
    switchLang: "عربي",
  },
  hero: {
    subtitle: "HG FINANCIAL CONSULTING",
    title: "HG Financial Consulting",
    body: "A professional firm specialized in providing comprehensive financial consulting services",
    cta: "Book a Free Session",
    explore: "Explore Our Services",
  },
  about: {
    badge: "About Us",
    title: "About HG Financial Consulting",
    p1: "HG Financial Consulting was established to be one of the most important pillars of the accounting and financial sector in the Arab world — relying on its qualified staff to earn the respect and trust of our clients.",
    p2: "At HG, we offer a team of qualified professionals to provide the highest level of financial and accounting services. Whether you are an entrepreneur or an established company, we provide the support and expertise needed to achieve financial success. Our services include: accounting, tax, audit, feasibility studies, and specialized financial consulting.",
    founderTitle: "Hazem Gamel Sayed Selim",
    founderRole: "Founder",
    yearsLabel: "Years of Experience in Financial Consulting",
  },
  services: {
    badge: "Our Services",
    title: "HG Financial & Tax Consulting Services",
    body: "We are a professional firm specialized in providing comprehensive financial services to support your business growth and achieve your strategic goals.",
    more: "Learn More",
    items: [
      { title: "Financial Statement Auditing", desc: "Auditing and reviewing financial statements certified by specialized experts" },
      { title: "Bookkeeping", desc: "Managing and recording daily financial operations with high professionalism" },
      { title: "Tax Services", desc: "Filing tax returns and periodic follow-up with government authorities" },
      { title: "Feasibility Studies", desc: "Professional feasibility studies to ensure the success of your projects" },
      { title: "Company Formation", desc: "Company formation procedures and legal registration made easy" },
      { title: "Technology Services", desc: "Comprehensive technology solutions to support financial business management" },
    ],
  },
  stats: {
    years: "Years of Experience",
    projects: "Completed Projects",
    employees: "Skilled Employees",
    clients: "Active Clients",
  },
  packages: {
    badge: "Packages",
    title: "Our Service Packages",
    body: "Choose the package that suits your company size and financial needs",
    popular: "Most Popular",
    cta: "Get a Quote",
    items: [
      { title: "Small Companies", desc: "1 to 5 employees" },
      { title: "Medium Companies", desc: "6 to 10 employees" },
      { title: "Large Companies", desc: "10+ employees" },
    ],
    features: [
      "Preparing the chart of accounts",
      "Recording sales, expenses, and purchases",
      "Recording salaries and wages",
      "Managing cash, inventory, and assets",
      "Submitting VAT returns (monthly or quarterly)",
      "Quarterly withholding tax submission",
      "Monthly and quarterly payroll reconciliation",
      "Bank statement reconciliation",
      "Annual income tax and zakat return",
      "Financial reports (P&L, Balance Sheet, Cash Flow)",
      "Monthly meeting to review and discuss financial reports",
    ],
  },
  partners: {
    badge: "Our Partners",
    title: "Our Partners",
    body: "Meet some of our clients and success partners",
  },
  contact: {
    badge: "Contact Us",
    title: "How Can We Help You?",
    body: "Our team of experts is ready to answer your inquiries and provide financial consulting tailored to your business",
    infoTitle: "Contact Information",
    phone: "Phone",
    email: "Email",
    address: "Address",
    addressVal: "Egypt / Saudi Arabia",
    whatsapp: "Chat on WhatsApp",
    formTitle: "Send a Message",
    name: "Full Name",
    namePlaceholder: "Enter your full name",
    phonePlaceholder: "Your phone number",
    emailPlaceholder: "Your email address",
    message: "Message",
    messagePlaceholder: "Write your inquiry details here...",
    send: "Send Message",
    sending: "Sending...",
    sent: "Sent Successfully!",
  },
  footer: {
    tagline: "A professional firm specialized in providing comprehensive financial consulting services, helping you achieve your strategic and financial goals.",
    quickLinks: "Quick Links",
    services: "Key Services",
    getInTouch: "Get In Touch",
    copyright: "© Copyright 2026. HG Financial Consulting. All Rights Reserved.",
    design: "Design:",
    links: [
      { label: "About Us", id: "about" },
      { label: "Services", id: "services" },
      { label: "Packages", id: "packages" },
      { label: "Contact", id: "contact" },
    ],
    serviceLinks: [
      "Financial Statement Auditing",
      "Bookkeeping",
      "Tax Services",
      "Feasibility Studies",
      "Company Formation",
      "Technology Services",
    ],
  },
};

interface LangContextType {
  lang: Lang;
  t: Translations;
  toggle: () => void;
}

const LangContext = createContext<LangContextType>({
  lang: "ar",
  t: ar,
  toggle: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("ar");
  const t = lang === "ar" ? ar : en;
  const toggle = () => setLang((l) => (l === "ar" ? "en" : "ar"));
  return (
    <LangContext.Provider value={{ lang, t, toggle }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
