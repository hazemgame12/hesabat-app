import React from "react";
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
  TrendingUp,
  TrendingDown,
  Target,
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
  { label: "مراكز التكلفة والمشاريع", icon: Boxes, active: true },
  { label: "التقارير المالية", icon: FileText },
];

const fmt = (n: number) => n.toLocaleString("en-US");

type Center = {
  name: string;
  type: "مشروع" | "مركز تكلفة" | "فرع";
  revenue: number;
  expense: number;
  budget: number;
  progress: number;
};

const centers: Center[] = [
  { name: "مشروع برج النيل", type: "مشروع", revenue: 1850000, expense: 1320000, budget: 1500000, progress: 78 },
  { name: "فرع المعادي", type: "فرع", revenue: 920000, expense: 610000, budget: 700000, progress: 64 },
  { name: "مشروع توريدات الحكومة", type: "مشروع", revenue: 1240000, expense: 980000, budget: 1100000, progress: 88 },
  { name: "إدارة عامة", type: "مركز تكلفة", revenue: 0, expense: 430000, budget: 480000, progress: 52 },
];

const typeStyle: Record<Center["type"], string> = {
  مشروع: "text-primary bg-primary/10",
  فرع: "text-secondary-foreground bg-secondary/40",
  "مركز تكلفة": "text-amber-600 bg-amber-500/10",
};

export function CostCenters() {
  const totalRev = centers.reduce((s, c) => s + c.revenue, 0);
  const totalExp = centers.reduce((s, c) => s + c.expense, 0);
  const net = totalRev - totalExp;

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
            <h1 className="text-lg font-bold text-foreground">مراكز التكلفة والمشاريع</h1>
            <p className="text-sm text-muted-foreground font-medium">تحليل ربحية كل مشروع ومركز تكلفة ومقارنته بالموازنة</p>
          </div>
          <button className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity">
            <Plus className="w-4 h-4" /> إضافة مركز / مشروع
          </button>
        </header>

        <div className="p-8 flex flex-col gap-6 max-w-7xl mx-auto w-full">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card border rounded-2xl shadow-sm p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-success/10 text-success flex items-center justify-center"><TrendingUp className="w-6 h-6" /></div>
              <div><p className="text-xs text-muted-foreground">إجمالي الإيرادات</p><p className="font-sans text-xl font-bold tabular-nums">{fmt(totalRev)} ج.م</p></div>
            </div>
            <div className="bg-card border rounded-2xl shadow-sm p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center"><TrendingDown className="w-6 h-6" /></div>
              <div><p className="text-xs text-muted-foreground">إجمالي المصروفات</p><p className="font-sans text-xl font-bold tabular-nums">{fmt(totalExp)} ج.م</p></div>
            </div>
            <div className="bg-card border rounded-2xl shadow-sm p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Target className="w-6 h-6" /></div>
              <div><p className="text-xs text-muted-foreground">صافي الربح</p><p className="font-sans text-xl font-bold tabular-nums text-success">{fmt(net)} ج.م</p></div>
            </div>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {centers.map((c, i) => {
              const profit = c.revenue - c.expense;
              const used = Math.round((c.expense / c.budget) * 100);
              return (
                <div key={i} className="bg-card border rounded-2xl shadow-sm p-5 flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0"><Building2 className="w-5 h-5" /></div>
                    <div className="flex-1">
                      <p className="font-bold text-foreground">{c.name}</p>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${typeStyle[c.type]}`}>{c.type}</span>
                    </div>
                    <div className="text-left">
                      <p className="text-[11px] text-muted-foreground">صافي الربح</p>
                      <p className={`font-sans text-lg font-bold tabular-nums ${profit >= 0 ? "text-success" : "text-destructive"}`}>{fmt(profit)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-muted/40 rounded-xl p-3"><p className="text-[11px] text-muted-foreground">الإيرادات</p><p className="font-sans text-sm font-bold tabular-nums">{fmt(c.revenue)}</p></div>
                    <div className="bg-muted/40 rounded-xl p-3"><p className="text-[11px] text-muted-foreground">المصروفات</p><p className="font-sans text-sm font-bold tabular-nums">{fmt(c.expense)}</p></div>
                  </div>
                  {/* Budget vs actual */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">المنفذ من الموازنة <span className="font-sans">({fmt(c.budget)})</span></span>
                      <span className={`font-sans font-bold ${used > 90 ? "text-amber-600" : "text-foreground"}`}>{used}%</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${used > 90 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${Math.min(used, 100)}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Budget table */}
          <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b"><h3 className="text-base font-bold text-foreground">الموازنة مقابل الفعلي</h3></div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
                  <th className="text-right px-6 py-3">المركز / المشروع</th>
                  <th className="text-left px-3 py-3">الموازنة</th>
                  <th className="text-left px-3 py-3">الفعلي</th>
                  <th className="text-left px-3 py-3">الانحراف</th>
                  <th className="text-center px-6 py-3">نسبة التنفيذ</th>
                </tr>
              </thead>
              <tbody>
                {centers.map((c, i) => {
                  const variance = c.budget - c.expense;
                  const used = Math.round((c.expense / c.budget) * 100);
                  return (
                    <tr key={i} className="border-t hover:bg-muted/40 transition-colors">
                      <td className="px-6 py-3.5 font-bold text-foreground">{c.name}</td>
                      <td className="px-3 py-3.5 font-sans tabular-nums text-left text-muted-foreground">{fmt(c.budget)}</td>
                      <td className="px-3 py-3.5 font-sans font-bold tabular-nums text-left">{fmt(c.expense)}</td>
                      <td className={`px-3 py-3.5 font-sans font-bold tabular-nums text-left ${variance >= 0 ? "text-success" : "text-destructive"}`}>{fmt(variance)}</td>
                      <td className="px-6 py-3.5 text-center"><span className={`font-sans font-bold ${used > 90 ? "text-amber-600" : "text-foreground"}`}>{used}%</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
