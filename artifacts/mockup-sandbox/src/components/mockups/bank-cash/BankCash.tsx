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
  Plus,
  Building2,
  Wallet,
  Upload,
  RefreshCcw,
  MoreVertical,
  Check,
  X,
  ChevronDown,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
} from "lucide-react";

const navItems = [
  { label: "لوحة التحكم", icon: LayoutDashboard },
  { label: "شجرة الحسابات", icon: ListTree },
  { label: "البنوك والنقدية", icon: Landmark, active: true },
  { label: "العهد والسلف", icon: HandCoins },
  { label: "العملاء والموردين", icon: Users },
  { label: "المشتريات والموردين", icon: Receipt },
  { label: "مراكز التكلفة والمشاريع", icon: Boxes },
  { label: "التقارير المالية", icon: FileText },
];

type Account = {
  id: string;
  name: string;
  number: string;
  currency: string;
  book: number;
  statement: number;
  kind: "بنك" | "نقدية";
};

const accounts: Account[] = [
  { id: "a1", name: "البنك الأهلي المصري - جاري", number: "1234567890123", currency: "ج.م", book: 540000, statement: 540000, kind: "بنك" },
  { id: "a2", name: "بنك مصر - الإيرادات", number: "8661411260030012", currency: "ج.م", book: 285000, statement: 312300, kind: "بنك" },
  { id: "a3", name: "HSBC - حساب دولاري", number: "0019000500001234", currency: "USD", book: 18500, statement: 18500, kind: "بنك" },
  { id: "a4", name: "الخزينة الرئيسية", number: "نقدية", currency: "ج.م", book: 120000, statement: 120000, kind: "نقدية" },
];

const fmt = (n: number) => n.toLocaleString("en-US");
const cur = (c: string) => (c === "USD" ? "$" : "ج.م");

type Line = {
  date: string;
  desc: string;
  ref: string;
  inflow?: number;
  outflow?: number;
  matched: boolean;
};

const lines: Line[] = [
  { date: "2024/03/02", desc: "تحصيل من عميل - دلتا للتجارة", ref: "RCV-0181", inflow: 85000, matched: true },
  { date: "2024/03/08", desc: "سداد لمورد - النصر للبلاستيك", ref: "PAY-0143", outflow: 42500, matched: true },
  { date: "2024/03/15", desc: "رسوم وعمولات بنكية", ref: "—", outflow: 1200, matched: false },
  { date: "2024/03/19", desc: "تحصيل من عميل - الشروق", ref: "RCV-0188", inflow: 38000, matched: true },
  { date: "2024/03/24", desc: "فوائد دائنة", ref: "—", inflow: 2300, matched: false },
];

export function BankCash() {
  const [selectedId, setSelectedId] = useState("a2");
  const [addOpen, setAddOpen] = useState(false);
  const selected = accounts.find((a) => a.id === selectedId) ?? accounts[0];
  const diff = selected.statement - selected.book;
  const totalEgp = accounts.filter((a) => a.currency === "ج.م").reduce((s, a) => s + a.book, 0);

  return (
    <div dir="rtl" className="theme-hesabat min-h-screen flex w-full">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-l flex flex-col fixed h-full z-20">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl leading-none">
            ح
          </div>
          <span className="font-bold text-xl text-primary tracking-tight">حسابات</span>
        </div>
        <nav className="flex-1 px-4 py-2 flex flex-col gap-1 overflow-y-auto">
          {navItems.map((item, i) => (
            <button
              key={i}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all text-right ${
                item.active
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
            <h1 className="text-lg font-bold text-foreground">البنوك والنقدية</h1>
            <p className="text-sm text-muted-foreground font-medium">كشف حساب لكل بنك وتسوية الأرصدة</p>
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            أضف حساب بنكي
          </button>
        </header>

        <div className="p-8 flex flex-col gap-6 max-w-7xl mx-auto w-full">
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card border rounded-2xl shadow-sm p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Wallet className="w-6 h-6" /></div>
              <div>
                <p className="text-xs text-muted-foreground">إجمالي الأرصدة (ج.م)</p>
                <p className="font-sans text-xl font-bold tabular-nums">{fmt(totalEgp)}</p>
              </div>
            </div>
            <div className="bg-card border rounded-2xl shadow-sm p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-success/10 text-success flex items-center justify-center"><Check className="w-6 h-6" /></div>
              <div>
                <p className="text-xs text-muted-foreground">حسابات متوازنة</p>
                <p className="font-sans text-xl font-bold tabular-nums">3 من 4</p>
              </div>
            </div>
            <div className="bg-card border rounded-2xl shadow-sm p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center"><AlertTriangle className="w-6 h-6" /></div>
              <div>
                <p className="text-xs text-muted-foreground">تحتاج تسوية</p>
                <p className="font-sans text-xl font-bold tabular-nums">حساب واحد</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 items-start">
            {/* Accounts list */}
            <div className="flex flex-col gap-3">
              {accounts.map((a) => {
                const d = a.statement - a.book;
                const balanced = d === 0;
                return (
                  <button
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className={`w-full text-right bg-card border rounded-2xl shadow-sm p-4 transition-all ${
                      selectedId === a.id ? "ring-2 ring-primary/40 border-primary/40" : "hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${a.kind === "نقدية" ? "bg-secondary text-secondary-foreground" : "bg-primary/10 text-primary"}`}>
                        {a.kind === "نقدية" ? <Wallet className="w-5 h-5" /> : <Building2 className="w-5 h-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{a.name}</p>
                        <p className="font-sans text-xs text-muted-foreground" dir="ltr" style={{ textAlign: "right" }}>{a.number}</p>
                      </div>
                      <span className="text-[11px] font-bold bg-muted px-2 py-0.5 rounded-full flex-shrink-0">{a.currency}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-center">
                      <div>
                        <p className="text-[10px] text-muted-foreground">رصيد الدفتر</p>
                        <p className="font-sans text-xs font-bold tabular-nums">{fmt(a.book)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">كشف الحساب</p>
                        <p className="font-sans text-xs font-bold tabular-nums">{fmt(a.statement)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">الفرق</p>
                        {balanced ? (
                          <span className="text-[10px] font-bold text-success bg-success/10 px-1.5 py-0.5 rounded-full">متوازن</span>
                        ) : (
                          <p className="font-sans text-xs font-bold tabular-nums text-amber-600">{fmt(d)}</p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Statement + reconciliation */}
            <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <div>
                  <h3 className="text-base font-bold text-foreground">{selected.name}</h3>
                  <p className="text-xs text-muted-foreground">كشف الحساب · مارس 2024</p>
                </div>
                <div className="flex items-center gap-2">
                  <button className="flex items-center gap-2 bg-card border shadow-sm px-3 py-1.5 rounded-full text-xs font-semibold hover:border-primary/50 transition-colors">
                    <Upload className="w-3.5 h-3.5 text-muted-foreground" /> استيراد كشف حساب
                  </button>
                  <button className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-full text-xs font-bold hover:opacity-90 transition-opacity">
                    <RefreshCcw className="w-3.5 h-3.5" /> تسوية المعاملات
                  </button>
                  <button className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><MoreVertical className="w-4 h-4" /></button>
                </div>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
                    <th className="text-right px-6 py-2.5">التاريخ</th>
                    <th className="text-right px-3 py-2.5">البيان</th>
                    <th className="text-right px-3 py-2.5">المرجع</th>
                    <th className="text-left px-3 py-2.5">وارد</th>
                    <th className="text-left px-3 py-2.5">صادر</th>
                    <th className="text-center px-6 py-2.5">المطابقة</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-t hover:bg-muted/40 transition-colors">
                      <td className="px-6 py-3 font-sans text-muted-foreground" dir="ltr" style={{ textAlign: "right" }}>{l.date}</td>
                      <td className="px-3 py-3 text-foreground/90">{l.desc}</td>
                      <td className="px-3 py-3 font-sans text-xs text-muted-foreground" dir="ltr" style={{ textAlign: "right" }}>{l.ref}</td>
                      <td className="px-3 py-3 font-sans font-bold tabular-nums text-left text-success">
                        {l.inflow ? <span className="inline-flex items-center gap-1"><ArrowDownLeft className="w-3.5 h-3.5" />{fmt(l.inflow)}</span> : "—"}
                      </td>
                      <td className="px-3 py-3 font-sans font-bold tabular-nums text-left text-destructive">
                        {l.outflow ? <span className="inline-flex items-center gap-1"><ArrowUpRight className="w-3.5 h-3.5" />{fmt(l.outflow)}</span> : "—"}
                      </td>
                      <td className="px-6 py-3 text-center">
                        {l.matched ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-success bg-success/10 px-2 py-0.5 rounded-full"><Check className="w-3 h-3" /> مطابَق</span>
                        ) : (
                          <button className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full hover:bg-amber-500/20">طابِق الآن</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Reconciliation footer */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border-t">
                <div className="bg-card p-4">
                  <p className="text-xs text-muted-foreground">رصيد الدفتر</p>
                  <p className="font-sans text-sm font-bold tabular-nums">{fmt(selected.book)} {cur(selected.currency)}</p>
                </div>
                <div className="bg-card p-4">
                  <p className="text-xs text-muted-foreground">رصيد كشف الحساب</p>
                  <p className="font-sans text-sm font-bold tabular-nums">{fmt(selected.statement)} {cur(selected.currency)}</p>
                </div>
                <div className="bg-card p-4">
                  <p className="text-xs text-muted-foreground">الفرق</p>
                  <p className={`font-sans text-sm font-bold tabular-nums ${diff === 0 ? "text-success" : "text-amber-600"}`}>{fmt(diff)} {cur(selected.currency)}</p>
                </div>
                <div className="bg-card p-4 flex items-center">
                  {diff === 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-success"><Check className="w-4 h-4" /> الحساب متوازن</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-amber-600"><AlertTriangle className="w-4 h-4" /> يحتاج تسوية</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Add bank modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setAddOpen(false)} />
          <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-md border flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2"><Building2 className="w-5 h-5 text-primary" /><h2 className="text-base font-bold">إنشاء حساب بنكي</h2></div>
              <button onClick={() => setAddOpen(false)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold">اسم الحساب <span className="text-destructive">*</span></label>
                <input placeholder="مثال: البنك الأهلي - جاري" className="bg-background border rounded-xl h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold">النوع <span className="text-destructive">*</span></label>
                  <div className="relative">
                    <select className="w-full appearance-none bg-background border rounded-xl h-11 pr-4 pl-10 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                      <option>بنك</option>
                      <option>بطاقة ائتمان</option>
                      <option>خزينة نقدية</option>
                    </select>
                    <ChevronDown className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold">العملة <span className="text-destructive">*</span></label>
                  <div className="relative">
                    <select className="w-full appearance-none bg-background border rounded-xl h-11 pr-4 pl-10 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                      <option>ج.م - جنيه مصري</option>
                      <option>USD - دولار أمريكي</option>
                      <option>EUR - يورو</option>
                      <option>SAR - ريال سعودي</option>
                      <option>AED - درهم إماراتي</option>
                    </select>
                    <ChevronDown className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold">رقم الحساب / IBAN</label>
                <input dir="ltr" placeholder="EG38 0019 0005 0000 ..." className="bg-background border rounded-xl h-11 px-4 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/30">
              <button onClick={() => setAddOpen(false)} className="px-5 py-2.5 rounded-full text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">إلغاء</button>
              <button className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-5 py-2.5 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"><Check className="w-4 h-4" /> حفظ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
