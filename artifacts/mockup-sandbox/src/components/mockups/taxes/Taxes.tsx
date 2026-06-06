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
  Percent,
  Plus,
  X,
  Check,
  ChevronDown,
  ListTree as TreeIcon,
  Link2,
  Download,
  Scale,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react";

const navItems = [
  { label: "لوحة التحكم", icon: LayoutDashboard },
  { label: "شجرة الحسابات", icon: ListTree },
  { label: "البنوك والنقدية", icon: Landmark },
  { label: "العهد والسلف", icon: HandCoins },
  { label: "العملاء والموردين", icon: Users },
  { label: "المشتريات والموردين", icon: Receipt },
  { label: "الضرائب", icon: Percent, active: true },
  { label: "مراكز التكلفة والمشاريع", icon: Boxes },
  { label: "التقارير المالية", icon: FileText },
];

const fmt = (n: number) => n.toLocaleString("en-US");

type Vat = { name: string; rate: string; service: string; account: string };
const vatTypes: Vat[] = [
  { name: "ق.م - خدمات استشارية", rate: "14%", service: "خدمات استشارية ومهنية", account: "21201 - ق.م مستحقة - استشارات" },
  { name: "ق.م - مقاولات", rate: "5%", service: "أعمال مقاولات وإنشاءات", account: "21202 - ق.م مستحقة - مقاولات" },
  { name: "ق.م - سلع", rate: "14%", service: "بيع سلع وبضائع", account: "21203 - ق.م مستحقة - سلع" },
  { name: "جدول - نقل", rate: "10%", service: "خدمات نقل وشحن", account: "21204 - ق.م مستحقة - نقل" },
];

type Wht = { name: string; rate: string; service: string; account: string };
const whtTypes: Wht[] = [
  { name: "خصم منبع - خدمات", rate: "3%", service: "خدمات ومقاولات", account: "21301 - خصم منبع مستحق - خدمات" },
  { name: "خصم منبع - توريدات", rate: "1%", service: "توريد سلع", account: "21302 - خصم منبع مستحق - توريدات" },
  { name: "خصم منبع - عمولات", rate: "5%", service: "عمولات ووساطة", account: "21303 - خصم منبع مستحق - عمولات" },
];

type Row = { supplier: string; date: string; invoice: string; taxId: string; rate: string; base: number; amount: number; service: string };
const report: Row[] = [
  { supplier: "النصر للبلاستيك", date: "2024/03/04", invoice: "PUR-1043", taxId: "245-118-902", rate: "1%", base: 120000, amount: 1200, service: "توريد سلع" },
  { supplier: "الدلتا للمقاولات", date: "2024/03/09", invoice: "PUR-1051", taxId: "318-552-410", rate: "3%", base: 350000, amount: 10500, service: "أعمال مقاولات" },
  { supplier: "مكتب الرؤية للاستشارات", date: "2024/03/14", invoice: "PUR-1066", taxId: "401-223-771", rate: "3%", base: 80000, amount: 2400, service: "خدمات استشارية" },
  { supplier: "شركة الأفق للنقل", date: "2024/03/21", invoice: "PUR-1078", taxId: "562-009-188", rate: "1%", base: 60000, amount: 600, service: "خدمات نقل" },
  { supplier: "الوسيط التجاري", date: "2024/03/27", invoice: "PUR-1090", taxId: "677-431-205", rate: "5%", base: 40000, amount: 2000, service: "عمولات ووساطة" },
];

const tabs = ["القيمة المضافة", "الخصم من المنبع", "تقرير خصم الموردين"] as const;
type Tab = (typeof tabs)[number];

export function Taxes() {
  const [tab, setTab] = useState<Tab>("القيمة المضافة");
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<"vat" | "wht">("vat");
  const totalWht = report.reduce((s, r) => s + r.amount, 0);

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
            <h1 className="text-lg font-bold text-foreground">الضرائب</h1>
            <p className="text-sm text-muted-foreground font-medium">تعريف أنواع الضرائب وأسعارها وربطها بشجرة الحسابات</p>
          </div>
          {tab === "تقرير خصم الموردين" ? (
            <button className="flex items-center gap-2 bg-card border shadow-sm px-4 py-2 rounded-full text-sm font-bold hover:border-primary/50 transition-colors">
              <Download className="w-4 h-4 text-muted-foreground" /> تصدير التقرير
            </button>
          ) : (
            <button
              onClick={() => { setAddKind(tab === "الخصم من المنبع" ? "wht" : "vat"); setAddOpen(true); }}
              className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" /> أضف ضريبة
            </button>
          )}
        </header>

        <div className="p-8 flex flex-col gap-6 max-w-6xl mx-auto w-full">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-full w-fit">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${
                  tab === t ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* VAT */}
          {tab === "القيمة المضافة" && (
            <>
              <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0"><TreeIcon className="w-5 h-5" /></div>
                <div className="text-sm">
                  <p className="font-bold text-foreground">حساب رئيسي: <span className="font-sans">212</span> - ضريبة القيمة المضافة المستحقة</p>
                  <p className="text-muted-foreground mt-0.5">كل سعر ضريبة جديد بيتفتح له حساب فرعي تلقائيًا تحت الحساب الرئيسي ويترّبط بيه — الأسعار متغيرة حسب طبيعة الخدمة في فواتير الإيرادات.</p>
                </div>
              </div>
              <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
                      <th className="text-right px-6 py-3">اسم الضريبة</th>
                      <th className="text-center px-3 py-3">السعر</th>
                      <th className="text-right px-3 py-3">طبيعة الخدمة</th>
                      <th className="text-right px-3 py-3">الحساب المرتبط بالشجرة</th>
                      <th className="text-center px-6 py-3">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vatTypes.map((v, i) => (
                      <tr key={i} className="border-t hover:bg-muted/40 transition-colors">
                        <td className="px-6 py-3.5 font-bold text-foreground">{v.name}</td>
                        <td className="px-3 py-3.5 text-center"><span className="font-sans font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full">{v.rate}</span></td>
                        <td className="px-3 py-3.5 text-foreground/80">{v.service}</td>
                        <td className="px-3 py-3.5">
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Link2 className="w-3.5 h-3.5 text-success" /><span className="font-sans" dir="ltr">{v.account}</span></span>
                        </td>
                        <td className="px-6 py-3.5 text-center"><span className="text-[11px] font-bold text-success bg-success/10 px-2.5 py-1 rounded-full">نشط</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* WHT */}
          {tab === "الخصم من المنبع" && (
            <>
              <div className="bg-amber-500/5 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center flex-shrink-0"><Scale className="w-5 h-5" /></div>
                <div className="text-sm">
                  <p className="font-bold text-foreground">ضريبة الخصم من المنبع تُحتسب عند سداد الموردين</p>
                  <p className="text-muted-foreground mt-0.5">بتتخصم من حساب المورد وقت الدفع وتترّحل لحساب «خصم منبع مستحق» بالشجرة — بنسب مختلفة حسب طبيعة الخدمة.</p>
                </div>
              </div>
              <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
                      <th className="text-right px-6 py-3">اسم الضريبة</th>
                      <th className="text-center px-3 py-3">النسبة</th>
                      <th className="text-right px-3 py-3">طبيعة الخدمة</th>
                      <th className="text-right px-3 py-3">الحساب المرتبط بالشجرة</th>
                      <th className="text-center px-6 py-3">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {whtTypes.map((w, i) => (
                      <tr key={i} className="border-t hover:bg-muted/40 transition-colors">
                        <td className="px-6 py-3.5 font-bold text-foreground">{w.name}</td>
                        <td className="px-3 py-3.5 text-center"><span className="font-sans font-bold text-amber-600 bg-amber-500/10 px-2.5 py-1 rounded-full">{w.rate}</span></td>
                        <td className="px-3 py-3.5 text-foreground/80">{w.service}</td>
                        <td className="px-3 py-3.5">
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Link2 className="w-3.5 h-3.5 text-success" /><span className="font-sans" dir="ltr">{w.account}</span></span>
                        </td>
                        <td className="px-6 py-3.5 text-center"><span className="text-[11px] font-bold text-success bg-success/10 px-2.5 py-1 rounded-full">نشط</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Report */}
          {tab === "تقرير خصم الموردين" && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-card border rounded-2xl shadow-sm p-5">
                  <p className="text-xs text-muted-foreground">إجمالي الخصم من الموردين</p>
                  <p className="font-sans text-2xl font-bold tabular-nums mt-1">{fmt(totalWht)} <span className="text-sm font-semibold text-muted-foreground">ج.م</span></p>
                </div>
                <div className="bg-card border rounded-2xl shadow-sm p-5">
                  <p className="text-xs text-muted-foreground">عدد الموردين</p>
                  <p className="font-sans text-2xl font-bold tabular-nums mt-1">{report.length}</p>
                </div>
                <div className="bg-card border rounded-2xl shadow-sm p-5 flex items-center gap-3">
                  <div className="relative flex-1">
                    <select className="w-full appearance-none bg-background border rounded-xl h-10 pr-3 pl-9 text-sm font-semibold focus:outline-none">
                      <option>الفترة: مارس 2024</option>
                      <option>الربع الأول 2024</option>
                    </select>
                    <ChevronDown className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              </div>
              <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b flex items-center gap-2">
                  <h3 className="text-base font-bold text-foreground">تقرير الخصم من الموردين</h3>
                  <span className="text-xs text-muted-foreground">— نموذج 41 للخصم والإضافة</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
                      <th className="text-right px-6 py-3">اسم المورد</th>
                      <th className="text-right px-3 py-3">التاريخ</th>
                      <th className="text-right px-3 py-3">رقم الفاتورة</th>
                      <th className="text-right px-3 py-3">رقم التسجيل</th>
                      <th className="text-right px-3 py-3">طبيعة الخدمة</th>
                      <th className="text-center px-3 py-3">سعر الخصم</th>
                      <th className="text-left px-3 py-3">قيمة الفاتورة</th>
                      <th className="text-left px-6 py-3">قيمة الخصم</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.map((r, i) => (
                      <tr key={i} className="border-t hover:bg-muted/40 transition-colors">
                        <td className="px-6 py-3.5 font-bold text-foreground">{r.supplier}</td>
                        <td className="px-3 py-3.5 font-sans text-muted-foreground" dir="ltr" style={{ textAlign: "right" }}>{r.date}</td>
                        <td className="px-3 py-3.5 font-sans text-muted-foreground" dir="ltr" style={{ textAlign: "right" }}>{r.invoice}</td>
                        <td className="px-3 py-3.5 font-sans text-muted-foreground" dir="ltr" style={{ textAlign: "right" }}>{r.taxId}</td>
                        <td className="px-3 py-3.5 text-foreground/80">{r.service}</td>
                        <td className="px-3 py-3.5 text-center"><span className="font-sans font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full">{r.rate}</span></td>
                        <td className="px-3 py-3.5 font-sans tabular-nums text-left text-muted-foreground">{fmt(r.base)}</td>
                        <td className="px-6 py-3.5 font-sans font-bold tabular-nums text-left text-foreground">{fmt(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/30 font-bold">
                      <td className="px-6 py-3.5 text-foreground" colSpan={7}>الإجمالي</td>
                      <td className="px-6 py-3.5 font-sans tabular-nums text-left text-primary">{fmt(totalWht)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Add tax modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setAddOpen(false)} />
          <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-lg border flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2"><Percent className="w-5 h-5 text-primary" /><h2 className="text-base font-bold">تعريف ضريبة جديدة</h2></div>
              <button onClick={() => setAddOpen(false)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold">نوع الضريبة</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setAddKind("vat")} className={`p-3 rounded-xl border text-sm font-bold transition-all ${addKind === "vat" ? "border-primary/50 bg-primary/5 text-primary ring-1 ring-primary/20" : "border-border text-muted-foreground hover:border-primary/30"}`}>القيمة المضافة</button>
                  <button onClick={() => setAddKind("wht")} className={`p-3 rounded-xl border text-sm font-bold transition-all ${addKind === "wht" ? "border-amber-500/50 bg-amber-500/5 text-amber-600 ring-1 ring-amber-500/20" : "border-border text-muted-foreground hover:border-amber-500/30"}`}>الخصم من المنبع</button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold">اسم الضريبة <span className="text-destructive">*</span></label>
                <input placeholder="مثال: ق.م - خدمات استشارية" className="bg-background border rounded-xl h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold">السعر (%) <span className="text-destructive">*</span></label>
                  <input dir="ltr" placeholder="14" className="bg-background border rounded-xl h-11 px-4 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" style={{ textAlign: "right" }} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold">طبيعة الخدمة</label>
                  <div className="relative">
                    <select className="w-full appearance-none bg-background border rounded-xl h-11 pr-4 pl-10 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                      <option>خدمات استشارية</option>
                      <option>مقاولات وإنشاءات</option>
                      <option>بيع سلع</option>
                      <option>نقل وشحن</option>
                      <option>عمولات ووساطة</option>
                    </select>
                    <ChevronDown className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              </div>
              {/* Auto-link preview */}
              <div className="bg-success/5 border border-success/30 rounded-xl p-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-success/10 text-success flex items-center justify-center flex-shrink-0"><Link2 className="w-4 h-4" /></div>
                <div className="text-xs">
                  <p className="font-bold text-foreground">هيتفتح حساب مرتبط في شجرة الحسابات تلقائيًا</p>
                  <p className="text-muted-foreground mt-1 font-sans" dir="ltr" style={{ textAlign: "right" }}>
                    {addKind === "vat" ? "212 ← 21205 ق.م مستحقة - (الاسم الجديد)" : "213 ← 21304 خصم منبع مستحق - (الاسم الجديد)"}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/30">
              <button onClick={() => setAddOpen(false)} className="px-5 py-2.5 rounded-full text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">إلغاء</button>
              <button className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-5 py-2.5 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"><Check className="w-4 h-4" /> حفظ وربط بالحساب</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
