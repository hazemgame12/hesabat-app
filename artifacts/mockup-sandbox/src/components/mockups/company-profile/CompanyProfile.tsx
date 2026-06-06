import React, { useState } from "react";
import "./_group.css";
import {
  LayoutDashboard,
  ListTree,
  Landmark,
  HandCoins,
  Users,
  Receipt,
  Boxes,
  FileText,
  Settings,
  Building2,
  Hash,
  Briefcase,
  Coins,
  Check,
  ChevronDown,
  Upload,
  Phone,
  Mail,
  MapPin,
  Plus,
} from "lucide-react";

const navItems = [
  { label: "لوحة التحكم", icon: LayoutDashboard },
  { label: "شجرة الحسابات", icon: ListTree },
  { label: "البنوك والنقدية", icon: Landmark },
  { label: "العهد والسلف", icon: HandCoins },
  { label: "العملاء والموردين", icon: Users },
  { label: "المشتريات والموردين", icon: Receipt },
  { label: "مراكز التكلفة والمشاريع", icon: Boxes },
  { label: "التقارير المالية", icon: FileText },
  { label: "بيانات الشركة", icon: Settings, active: true },
];

function Field({ label, value, ltr, placeholder }: { label: string; value?: string; ltr?: boolean; placeholder?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-bold text-foreground">{label}</label>
      <input
        defaultValue={value}
        placeholder={placeholder}
        dir={ltr ? "ltr" : "rtl"}
        className={`bg-background border rounded-xl h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${ltr ? "font-sans" : ""}`}
      />
    </div>
  );
}

function Select({ label, options }: { label: string; options: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-bold text-foreground">{label}</label>
      <div className="relative">
        <select className="w-full appearance-none bg-background border rounded-xl h-11 pr-4 pl-10 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
          {options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <ChevronDown className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  );
}

function SectionCard({ icon: Icon, title, desc, children }: { icon: any; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b bg-muted/30">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-extrabold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

const currencies = [
  { code: "ج.م", name: "جنيه مصري", base: true, on: true },
  { code: "USD", name: "دولار أمريكي", on: true },
  { code: "EUR", name: "يورو", on: true },
  { code: "SAR", name: "ريال سعودي", on: false },
  { code: "AED", name: "درهم إماراتي", on: false },
  { code: "GBP", name: "جنيه إسترليني", on: false },
];

export function CompanyProfile() {
  const [curState, setCurState] = useState(currencies);
  const toggle = (i: number) =>
    setCurState((s) => s.map((c, idx) => (idx === i && !c.base ? { ...c, on: !c.on } : c)));

  return (
    <div dir="rtl" className="theme-hesabat min-h-screen flex w-full">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-l flex flex-col fixed h-full z-20">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl leading-none">ح</div>
          <span className="font-bold text-xl text-primary tracking-tight">حسابات</span>
        </div>
        <nav className="flex-1 px-4 py-2 flex flex-col gap-1 overflow-y-auto">
          {navItems.map((item, i) => (
            <button
              key={i}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all text-right ${
                item.active ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1 text-right">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-4 border-t mt-auto">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted cursor-pointer transition-colors">
            <div className="w-10 h-10 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold">م</div>
            <div className="flex flex-col">
              <span className="text-sm font-bold">محمد علي</span>
              <span className="text-xs text-muted-foreground">مدير مالي</span>
            </div>
            <Settings className="w-4 h-4 text-muted-foreground mr-auto" />
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 mr-64 flex flex-col min-h-screen">
        <header className="h-20 bg-background/80 backdrop-blur-md border-b sticky top-0 z-10 flex items-center justify-between px-8">
          <div>
            <h1 className="text-lg font-bold text-foreground">بيانات الشركة</h1>
            <p className="text-sm text-muted-foreground font-medium">تفاصيل النشاط التجاري والإعدادات الضريبية والعملات</p>
          </div>
          <button className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity">
            <Check className="w-4 h-4" /> حفظ التغييرات
          </button>
        </header>

        <div className="p-8 flex flex-col gap-6 max-w-5xl mx-auto w-full">
          {/* Identity */}
          <SectionCard icon={Building2} title="الهوية التجارية" desc="الاسم والشكل القانوني للمنشأة">
            <div className="flex gap-6">
              <div className="flex flex-col items-center gap-2 flex-shrink-0">
                <div className="w-24 h-24 rounded-2xl border-2 border-dashed flex items-center justify-center text-muted-foreground bg-muted/30">
                  <Building2 className="w-9 h-9" />
                </div>
                <button className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"><Upload className="w-3.5 h-3.5" /> شعار الشركة</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                <Field label="الاسم التجاري" value="شركة النيل للتجارة والتوريدات" />
                <Field label="الاسم القانوني" value="النيل للتجارة والتوريدات ش.م.م" />
                <Select label="الشكل القانوني" options={["شركة مساهمة (ش.م.م)", "شركة تضامن", "مؤسسة فردية", "شركة توصية بسيطة"]} />
                <Field label="رقم السجل التجاري" value="45821" ltr />
              </div>
            </div>
          </SectionCard>

          {/* Business activity */}
          <SectionCard icon={Briefcase} title="النشاط التجاري" desc="وصف نشاط المنشأة وقطاعها">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select label="القطاع" options={["تجارة جملة", "تجارة تجزئة", "صناعة وتصنيع", "خدمات", "مقاولات وإنشاءات"]} />
              <Field label="رمز النشاط (ETA)" value="6201" ltr />
              <div className="md:col-span-2 flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">وصف النشاط التجاري</label>
                <textarea
                  rows={3}
                  defaultValue="تجارة وتوريد المواد الغذائية والمستلزمات للقطاعين الحكومي والخاص، مع خدمات التخزين والنقل والتوزيع داخل جمهورية مصر العربية."
                  className="bg-background border rounded-xl p-4 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                />
              </div>
            </div>
          </SectionCard>

          {/* Tax */}
          <SectionCard icon={Hash} title="التسجيل الضريبي" desc="بيانات الضرائب والفاتورة الإلكترونية">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="رقم التسجيل الضريبي" value="312-456-789" ltr />
              <Field label="المأمورية" value="مأمورية ضرائب القاهرة - أول" />
              <Select label="نوع التسجيل" options={["ممول مسجل (ضريبة القيمة المضافة)", "غير مسجل", "ضريبة جدول"]} />
              <Field label="نسبة ضريبة القيمة المضافة" value="14%" ltr />
              <Select label="بداية السنة المالية" options={["يناير", "يوليو", "أبريل", "أكتوبر"]} />
              <Field label="معرّف منظومة الفاتورة الإلكترونية" value="ETA-2024-7716" ltr />
            </div>
          </SectionCard>

          {/* Currencies */}
          <SectionCard icon={Coins} title="العملات المستخدمة" desc="العملة الأساسية والعملات الإضافية للتعاملات">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select label="العملة الأساسية" options={["ج.م - جنيه مصري", "USD - دولار أمريكي"]} />
                <Select label="مصدر سعر الصرف" options={["يدوي", "البنك المركزي المصري (تلقائي)", "سعر يومي"]} />
              </div>
              <div>
                <label className="text-sm font-bold text-foreground mb-2 block">فعّل العملات اللي بتتعامل بيها</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {curState.map((c, i) => (
                    <button
                      key={c.code}
                      onClick={() => toggle(i)}
                      disabled={c.base}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-right transition-all ${
                        c.on ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20" : "border-border bg-card hover:border-primary/30"
                      } ${c.base ? "opacity-100 cursor-default" : ""}`}
                    >
                      <span className={`font-sans text-sm font-bold w-12 ${c.on ? "text-primary" : "text-muted-foreground"}`} dir="ltr" style={{ textAlign: "right" }}>
                        {c.code}
                      </span>
                      <span className="flex-1 text-sm font-semibold text-foreground">{c.name}</span>
                      {c.base ? (
                        <span className="text-[10px] font-bold bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">أساسية</span>
                      ) : (
                        <span className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${c.on ? "bg-primary text-primary-foreground" : "border"}`}>
                          {c.on && <Check className="w-3.5 h-3.5" />}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Contact */}
          <SectionCard icon={MapPin} title="بيانات التواصل" desc="عنوان وبيانات الاتصال بالشركة">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2"><Field label="العنوان" value="٢٢ شارع التحرير، الدقي، الجيزة، مصر" /></div>
              <Field label="الهاتف" value="+20 2 3333 4444" ltr />
              <Field label="البريد الإلكتروني" value="info@nile-trading.com" ltr />
            </div>
          </SectionCard>
        </div>
      </main>
    </div>
  );
}
