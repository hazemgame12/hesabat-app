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
  Download,
  ChevronDown,
  Scale,
  TrendingUp,
  Building2,
} from "lucide-react";

const navItems = [
  { label: "لوحة التحكم", icon: LayoutDashboard },
  { label: "شجرة الحسابات", icon: ListTree },
  { label: "البنوك والنقدية", icon: Landmark },
  { label: "العهد والسلف", icon: HandCoins },
  { label: "العملاء والموردين", icon: Users },
  { label: "المشتريات والموردين", icon: Receipt },
  { label: "الضرائب", icon: Percent },
  { label: "مراكز التكلفة والمشاريع", icon: Boxes },
  { label: "التقارير المالية", icon: FileText, active: true },
];

const fmt = (n: number) => n.toLocaleString("en-US");

const trial = [
  { code: "111", name: "النقدية وما في حكمها", debit: 945000, credit: 0 },
  { code: "112", name: "العملاء", debit: 320000, credit: 0 },
  { code: "114", name: "المخزون", debit: 410000, credit: 0 },
  { code: "12", name: "الأصول الثابتة", debit: 410000, credit: 0 },
  { code: "211", name: "الموردين", debit: 0, credit: 150000 },
  { code: "212", name: "ضرائب مستحقة", debit: 0, credit: 62300 },
  { code: "213", name: "قروض قصيرة الأجل", debit: 0, credit: 100000 },
  { code: "311", name: "رأس المال", debit: 0, credit: 500000 },
  { code: "312", name: "الأرباح المحتجزة", debit: 0, credit: 757700 },
  { code: "411", name: "إيرادات المبيعات", debit: 0, credit: 3220000 },
  { code: "412", name: "إيرادات أخرى", debit: 0, credit: 45000 },
  { code: "501", name: "تكلفة المبيعات", debit: 1480000, credit: 0 },
  { code: "511", name: "رواتب وأجور", debit: 720000, credit: 0 },
  { code: "512", name: "إيجارات", debit: 240000, credit: 0 },
  { code: "513", name: "مصروفات تشغيل", debit: 310000, credit: 0 },
];

const tabs = ["ميزان المراجعة", "قائمة الدخل", "المركز المالي"] as const;
type Tab = (typeof tabs)[number];

function Line({ label, value, bold, accent, indent }: { label: string; value: number; bold?: boolean; accent?: "success" | "primary"; indent?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2.5 ${bold ? "border-t-2 border-foreground/20" : "border-t"} ${indent ? "pr-6" : ""}`}>
      <span className={`${bold ? "font-extrabold text-foreground" : "text-foreground/80"} text-sm`}>{label}</span>
      <span className={`font-sans tabular-nums text-sm ${bold ? "font-extrabold" : "font-semibold"} ${accent === "success" ? "text-success" : accent === "primary" ? "text-primary" : "text-foreground"}`}>{fmt(value)}</span>
    </div>
  );
}

export function FinancialReports() {
  const [tab, setTab] = useState<Tab>("ميزان المراجعة");
  const totalDebit = trial.reduce((s, r) => s + r.debit, 0);
  const totalCredit = trial.reduce((s, r) => s + r.credit, 0);

  return (
    <div dir="rtl" className="theme-hesabat min-h-screen flex w-full">
      <aside className="w-64 bg-card border-l flex flex-col fixed h-full z-20">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl leading-none">ح</div>
          <span className="font-bold text-xl text-primary tracking-tight">حسابات</span>
        </div>
        <nav className="flex-1 px-4 py-2 flex flex-col gap-1 overflow-y-auto">
          {navItems.map((item, i) => (
            <button key={i} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all text-right ${item.active ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1 text-right">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-4 border-t mt-auto">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted cursor-pointer transition-colors">
            <div className="w-10 h-10 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold">م</div>
            <div className="flex flex-col"><span className="text-sm font-bold">محمد علي</span><span className="text-xs text-muted-foreground">مدير مالي</span></div>
            <Settings className="w-4 h-4 text-muted-foreground mr-auto" />
          </div>
        </div>
      </aside>

      <main className="flex-1 mr-64 flex flex-col min-h-screen">
        <header className="h-20 bg-background/80 backdrop-blur-md border-b sticky top-0 z-10 flex items-center justify-between px-8">
          <div>
            <h1 className="text-lg font-bold text-foreground">التقارير المالية</h1>
            <p className="text-sm text-muted-foreground font-medium">القوائم المالية الأساسية للمنشأة</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <select className="appearance-none bg-card border shadow-sm rounded-full h-10 pr-4 pl-9 text-sm font-semibold focus:outline-none"><option>السنة المالية 2024</option><option>الربع الأول 2024</option><option>مارس 2024</option></select>
              <ChevronDown className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
            <button className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"><Download className="w-4 h-4" /> تصدير PDF</button>
          </div>
        </header>

        <div className="p-8 flex flex-col gap-6 max-w-5xl mx-auto w-full">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-full w-fit">
            {tabs.map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${tab === t ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{t}</button>
            ))}
          </div>

          {/* Trial balance */}
          {tab === "ميزان المراجعة" && (
            <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b flex items-center gap-2"><Scale className="w-5 h-5 text-primary" /><h3 className="text-base font-bold text-foreground">ميزان المراجعة — حتى 31 ديسمبر 2024</h3></div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
                    <th className="text-right px-6 py-3">الكود</th>
                    <th className="text-right px-3 py-3">اسم الحساب</th>
                    <th className="text-left px-3 py-3">مدين</th>
                    <th className="text-left px-6 py-3">دائن</th>
                  </tr>
                </thead>
                <tbody>
                  {trial.map((r, i) => (
                    <tr key={i} className="border-t hover:bg-muted/40 transition-colors">
                      <td className="px-6 py-3 font-sans text-muted-foreground" dir="ltr" style={{ textAlign: "right" }}>{r.code}</td>
                      <td className="px-3 py-3 text-foreground/90 font-semibold">{r.name}</td>
                      <td className="px-3 py-3 font-sans tabular-nums text-left">{r.debit ? fmt(r.debit) : "—"}</td>
                      <td className="px-6 py-3 font-sans tabular-nums text-left">{r.credit ? fmt(r.credit) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-foreground/20 bg-muted/30 font-extrabold">
                    <td className="px-6 py-3.5 text-foreground" colSpan={2}>الإجمالي</td>
                    <td className="px-3 py-3.5 font-sans tabular-nums text-left text-primary">{fmt(totalDebit)}</td>
                    <td className="px-6 py-3.5 font-sans tabular-nums text-left text-primary">{fmt(totalCredit)}</td>
                  </tr>
                </tfoot>
              </table>
              <div className="px-6 py-3 bg-success/5 border-t flex items-center justify-center gap-2 text-sm font-bold text-success"><Scale className="w-4 h-4" /> الميزان متوازن — المدين = الدائن</div>
            </div>
          )}

          {/* Income statement */}
          {tab === "قائمة الدخل" && (
            <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b flex items-center gap-2"><TrendingUp className="w-5 h-5 text-primary" /><h3 className="text-base font-bold text-foreground">قائمة الدخل — عن السنة المنتهية في 31 ديسمبر 2024</h3></div>
              <div className="p-6 flex flex-col">
                <Line label="إيرادات المبيعات" value={3220000} />
                <Line label="إيرادات أخرى" value={45000} />
                <Line label="إجمالي الإيرادات" value={3265000} bold accent="primary" />
                <div className="h-4" />
                <Line label="تكلفة المبيعات" value={1480000} />
                <Line label="مجمل الربح" value={1785000} bold accent="success" />
                <div className="h-4" />
                <Line label="رواتب وأجور" value={720000} indent />
                <Line label="إيجارات" value={240000} indent />
                <Line label="مصروفات تشغيل" value={310000} indent />
                <Line label="إجمالي المصروفات التشغيلية" value={1270000} bold />
                <div className="h-4" />
                <Line label="صافي الربح قبل الضرائب" value={515000} bold accent="success" />
              </div>
            </div>
          )}

          {/* Balance sheet */}
          {tab === "المركز المالي" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b flex items-center gap-2"><Building2 className="w-5 h-5 text-primary" /><h3 className="text-base font-bold text-foreground">الأصول</h3></div>
                <div className="p-6 flex flex-col">
                  <p className="text-xs font-bold text-muted-foreground mb-1">أصول متداولة</p>
                  <Line label="النقدية وما في حكمها" value={945000} indent />
                  <Line label="العملاء" value={320000} indent />
                  <Line label="المخزون" value={410000} indent />
                  <div className="h-3" />
                  <p className="text-xs font-bold text-muted-foreground mb-1">أصول ثابتة</p>
                  <Line label="أجهزة ومعدات وسيارات" value={410000} indent />
                  <Line label="إجمالي الأصول" value={2085000} bold accent="primary" />
                </div>
              </div>
              <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b flex items-center gap-2"><Scale className="w-5 h-5 text-primary" /><h3 className="text-base font-bold text-foreground">الخصوم وحقوق الملكية</h3></div>
                <div className="p-6 flex flex-col">
                  <p className="text-xs font-bold text-muted-foreground mb-1">الخصوم</p>
                  <Line label="الموردين" value={150000} indent />
                  <Line label="ضرائب مستحقة" value={62300} indent />
                  <Line label="قروض قصيرة الأجل" value={100000} indent />
                  <div className="h-3" />
                  <p className="text-xs font-bold text-muted-foreground mb-1">حقوق الملكية</p>
                  <Line label="رأس المال" value={500000} indent />
                  <Line label="الأرباح المحتجزة" value={1272700} indent />
                  <Line label="إجمالي الخصوم وحقوق الملكية" value={2085000} bold accent="primary" />
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
