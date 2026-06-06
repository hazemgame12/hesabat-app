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
  Wallet,
  ClipboardCheck,
  Clock,
  Paperclip,
  ArrowDownLeft,
} from "lucide-react";

const navItems = [
  { label: "لوحة التحكم", icon: LayoutDashboard },
  { label: "شجرة الحسابات", icon: ListTree },
  { label: "البنوك والنقدية", icon: Landmark },
  { label: "العهد والسلف", icon: HandCoins, active: true },
  { label: "العملاء والموردين", icon: Users },
  { label: "المشتريات والموردين", icon: Receipt },
  { label: "الضرائب", icon: Percent },
  { label: "مراكز التكلفة والمشاريع", icon: Boxes },
  { label: "التقارير المالية", icon: FileText },
];

const fmt = (n: number) => n.toLocaleString("en-US");

type Custody = {
  id: string;
  emp: string;
  type: "مستديمة" | "مؤقتة";
  date: string;
  amount: number;
  spent: number;
  status: "مفتوحة" | "تحت التسوية" | "مقفلة";
};

const custodies: Custody[] = [
  { id: "c1", emp: "محمد علي", type: "مستديمة", date: "2024/03/01", amount: 15000, spent: 9200, status: "تحت التسوية" },
  { id: "c2", emp: "أحمد سمير", type: "مؤقتة", date: "2024/03/05", amount: 8000, spent: 8000, status: "مقفلة" },
  { id: "c3", emp: "منى حسن", type: "مؤقتة", date: "2024/03/12", amount: 5000, spent: 1800, status: "مفتوحة" },
  { id: "c4", emp: "خالد فؤاد", type: "مستديمة", date: "2024/03/18", amount: 12000, spent: 6400, status: "مفتوحة" },
];

type Expense = { date: string; desc: string; ref: string; amount: number; doc: boolean };
const expenses: Record<string, Expense[]> = {
  c1: [
    { date: "2024/03/06", desc: "أدوات مكتبية", ref: "EXP-201", amount: 1800, doc: true },
    { date: "2024/03/11", desc: "بنزين وانتقالات", ref: "EXP-208", amount: 2400, doc: true },
    { date: "2024/03/16", desc: "ضيافة اجتماع", ref: "EXP-214", amount: 1200, doc: false },
    { date: "2024/03/20", desc: "صيانة طابعة", ref: "EXP-219", amount: 3800, doc: true },
  ],
};

const statusStyle: Record<Custody["status"], string> = {
  مفتوحة: "text-primary bg-primary/10",
  "تحت التسوية": "text-amber-600 bg-amber-500/10",
  مقفلة: "text-success bg-success/10",
};

export function Advances() {
  const [selectedId, setSelectedId] = useState("c1");
  const [addOpen, setAddOpen] = useState(false);
  const selected = custodies.find((c) => c.id === selectedId) ?? custodies[0];
  const lines = expenses[selected.id] ?? [];
  const remaining = selected.amount - selected.spent;
  const totalOpen = custodies.filter((c) => c.status !== "مقفلة").reduce((s, c) => s + (c.amount - c.spent), 0);

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
            <h1 className="text-lg font-bold text-foreground">العهد والسلف</h1>
            <p className="text-sm text-muted-foreground font-medium">صرف عهد الموظفين وتسوية المصروفات</p>
          </div>
          <button onClick={() => setAddOpen(true)} className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity">
            <Plus className="w-4 h-4" /> صرف عهدة
          </button>
        </header>

        <div className="p-8 flex flex-col gap-6 max-w-7xl mx-auto w-full">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card border rounded-2xl shadow-sm p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Wallet className="w-6 h-6" /></div>
              <div><p className="text-xs text-muted-foreground">رصيد العهد المفتوحة</p><p className="font-sans text-xl font-bold tabular-nums">{fmt(totalOpen)} ج.م</p></div>
            </div>
            <div className="bg-card border rounded-2xl shadow-sm p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-secondary/40 text-secondary-foreground flex items-center justify-center"><Users className="w-6 h-6" /></div>
              <div><p className="text-xs text-muted-foreground">عدد العهد النشطة</p><p className="font-sans text-xl font-bold tabular-nums">3</p></div>
            </div>
            <div className="bg-card border rounded-2xl shadow-sm p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center"><Clock className="w-6 h-6" /></div>
              <div><p className="text-xs text-muted-foreground">تحت التسوية</p><p className="font-sans text-xl font-bold tabular-nums">عهدة واحدة</p></div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 items-start">
            {/* Custody table */}
            <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b"><h3 className="text-base font-bold text-foreground">العهد المسجلة</h3></div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
                    <th className="text-right px-6 py-3">الموظف</th>
                    <th className="text-right px-3 py-3">النوع</th>
                    <th className="text-left px-3 py-3">المصروف</th>
                    <th className="text-left px-3 py-3">المتبقي</th>
                    <th className="text-center px-6 py-3">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {custodies.map((c) => (
                    <tr key={c.id} onClick={() => setSelectedId(c.id)} className={`border-t cursor-pointer transition-colors ${selectedId === c.id ? "bg-primary/5" : "hover:bg-muted/40"}`}>
                      <td className="px-6 py-3.5">
                        <p className="font-bold text-foreground">{c.emp}</p>
                        <p className="font-sans text-xs text-muted-foreground" dir="ltr" style={{ textAlign: "right" }}>{c.date}</p>
                      </td>
                      <td className="px-3 py-3.5"><span className="text-[11px] font-semibold bg-muted px-2 py-0.5 rounded-full">{c.type}</span></td>
                      <td className="px-3 py-3.5 font-sans tabular-nums text-left text-foreground/80">{fmt(c.spent)}</td>
                      <td className="px-3 py-3.5 font-sans font-bold tabular-nums text-left">{fmt(c.amount - c.spent)}</td>
                      <td className="px-6 py-3.5 text-center"><span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${statusStyle[c.status]}`}>{c.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Settlement panel */}
            <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-foreground">تسوية عهدة — {selected.emp}</h3>
                  <p className="text-xs text-muted-foreground">عهدة {selected.type}</p>
                </div>
                <ClipboardCheck className="w-5 h-5 text-primary" />
              </div>
              <div className="grid grid-cols-3 gap-px bg-border">
                <div className="bg-card p-4 text-center"><p className="text-[11px] text-muted-foreground">المصروف</p><p className="font-sans text-sm font-bold tabular-nums">{fmt(selected.amount)}</p></div>
                <div className="bg-card p-4 text-center"><p className="text-[11px] text-muted-foreground">المنصرف</p><p className="font-sans text-sm font-bold tabular-nums text-amber-600">{fmt(selected.spent)}</p></div>
                <div className="bg-card p-4 text-center"><p className="text-[11px] text-muted-foreground">المتبقي</p><p className="font-sans text-sm font-bold tabular-nums text-success">{fmt(remaining)}</p></div>
              </div>
              <div className="p-4 flex flex-col gap-2 max-h-72 overflow-y-auto">
                {lines.length > 0 ? lines.map((e, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl border hover:border-primary/30 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0"><ArrowDownLeft className="w-4 h-4 text-muted-foreground" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{e.desc}</p>
                      <p className="font-sans text-[11px] text-muted-foreground" dir="ltr" style={{ textAlign: "right" }}>{e.date} · {e.ref}</p>
                    </div>
                    {e.doc && <Paperclip className="w-3.5 h-3.5 text-success flex-shrink-0" />}
                    <span className="font-sans text-sm font-bold tabular-nums flex-shrink-0">{fmt(e.amount)}</span>
                  </div>
                )) : (
                  <p className="text-sm text-muted-foreground text-center py-8">لا توجد مصروفات مسجلة بعد</p>
                )}
              </div>
              <div className="p-4 border-t flex items-center gap-2">
                <button className="flex-1 flex items-center justify-center gap-2 bg-card border shadow-sm py-2.5 rounded-full text-sm font-semibold hover:border-primary/50 transition-colors"><Plus className="w-4 h-4 text-muted-foreground" /> إضافة مصروف</button>
                <button className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"><Check className="w-4 h-4" /> تسوية العهدة</button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setAddOpen(false)} />
          <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-md border flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2"><HandCoins className="w-5 h-5 text-primary" /><h2 className="text-base font-bold">صرف عهدة جديدة</h2></div>
              <button onClick={() => setAddOpen(false)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold">الموظف <span className="text-destructive">*</span></label>
                <div className="relative">
                  <select className="w-full appearance-none bg-background border rounded-xl h-11 pr-4 pl-10 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"><option>محمد علي</option><option>أحمد سمير</option><option>منى حسن</option></select>
                  <ChevronDown className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold">نوع العهدة</label>
                  <div className="relative">
                    <select className="w-full appearance-none bg-background border rounded-xl h-11 pr-4 pl-10 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"><option>مؤقتة</option><option>مستديمة</option></select>
                    <ChevronDown className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold">المبلغ <span className="text-destructive">*</span></label>
                  <input dir="ltr" placeholder="10000" className="bg-background border rounded-xl h-11 px-4 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" style={{ textAlign: "right" }} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold">الغرض / البيان</label>
                <input placeholder="مثال: مصروفات نثرية للمكتب" className="bg-background border rounded-xl h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold">يُصرف من</label>
                <div className="relative">
                  <select className="w-full appearance-none bg-background border rounded-xl h-11 pr-4 pl-10 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"><option>الخزينة الرئيسية</option><option>البنك الأهلي - جاري</option></select>
                  <ChevronDown className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/30">
              <button onClick={() => setAddOpen(false)} className="px-5 py-2.5 rounded-full text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">إلغاء</button>
              <button className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-5 py-2.5 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"><Check className="w-4 h-4" /> صرف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
