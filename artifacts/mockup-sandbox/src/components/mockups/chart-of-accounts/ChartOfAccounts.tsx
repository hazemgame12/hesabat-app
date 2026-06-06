import React, { useState } from "react";
import "./_group.css";
import {
  LayoutDashboard,
  Wallet,
  Receipt,
  FileText,
  Settings,
  Search,
  Plus,
  SlidersHorizontal,
  ChevronDown,
  ChevronLeft,
  Landmark,
  Building2,
  ListTree,
  HandCoins,
  Users,
  Boxes,
  Download,
  X,
  Check,
  ToggleRight,
} from "lucide-react";

// --- Sidebar nav (consistent with dashboard) ---
const navItems = [
  { label: "لوحة التحكم", icon: LayoutDashboard },
  { label: "شجرة الحسابات", icon: ListTree, active: true },
  { label: "القيود اليومية", icon: BookOpen },
  { label: "البنوك والنقدية", icon: Landmark },
  { label: "العهد والسلف", icon: HandCoins },
  { label: "المبيعات والعملاء", icon: Users },
  { label: "المشتريات والموردين", icon: Receipt },
  { label: "مراكز التكلفة والمشاريع", icon: Boxes },
  { label: "التقارير المالية", icon: FileText },
];

// --- Chart of accounts data (Egyptian-style coded tree) ---
type Node = {
  code: string;
  name: string;
  balance?: number;
  control?: boolean;
  children?: Node[];
};

const tree: Record<string, Node[]> = {
  الأصول: [
    {
      code: "11",
      name: "الأصول المتداولة",
      children: [
        {
          code: "111",
          name: "النقدية وما في حكمها",
          control: true,
          children: [
            { code: "1111", name: "الخزينة الرئيسية", balance: 120000 },
            { code: "1112", name: "البنك الأهلي المصري", balance: 540000 },
            { code: "1113", name: "بنك مصر", balance: 285000 },
          ],
        },
        { code: "112", name: "العملاء", balance: 320000, control: true },
        {
          code: "113",
          name: "العهد والسلف",
          children: [
            { code: "1131", name: "عهدة محمد علي", balance: 15000 },
            { code: "1132", name: "سلفة مستديمة - المخزن", balance: 8000 },
          ],
        },
        { code: "114", name: "المخزون", balance: 410000 },
      ],
    },
    {
      code: "12",
      name: "الأصول الثابتة",
      children: [
        { code: "121", name: "أجهزة ومعدات", balance: 230000 },
        { code: "122", name: "سيارات", balance: 180000 },
      ],
    },
  ],
  الخصوم: [
    { code: "211", name: "الموردين", balance: 150000, control: true },
    { code: "212", name: "ضرائب مستحقة (ق.م)", balance: 62300 },
    { code: "213", name: "قروض قصيرة الأجل", balance: 100000 },
  ],
  "حقوق الملكية": [
    { code: "311", name: "رأس المال", balance: 500000 },
    { code: "312", name: "الأرباح المحتجزة", balance: 171210 },
  ],
  الإيرادات: [
    { code: "411", name: "إيرادات المبيعات", balance: 3220000 },
    { code: "412", name: "إيرادات أخرى", balance: 45000 },
  ],
  المصروفات: [
    { code: "511", name: "رواتب وأجور", balance: 720000 },
    { code: "512", name: "إيجارات", balance: 240000 },
    { code: "513", name: "مصروفات تشغيل", balance: 310000 },
  ],
};

const tabs = ["الكل", "الأصول", "الخصوم", "حقوق الملكية", "الإيرادات", "المصروفات"];

const fmt = (n: number) => n.toLocaleString("en-US");

function TreeRow({ node, depth }: { node: Node; depth: number }) {
  const hasChildren = !!node.children?.length;
  const [open, setOpen] = useState(depth < 3);
  return (
    <>
      <div
        className="group flex items-center gap-3 py-2.5 pl-4 rounded-lg hover:bg-muted/60 transition-colors cursor-pointer"
        style={{ paddingRight: 12 + depth * 26 }}
        onClick={() => hasChildren && setOpen((o) => !o)}
      >
        <span className="w-5 flex-shrink-0 text-muted-foreground">
          {hasChildren ? (
            open ? <ChevronDown className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />
          ) : null}
        </span>
        <span
          className="font-sans text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-md flex-shrink-0"
          dir="ltr"
        >
          {node.code}
        </span>
        <span className={`flex-1 text-sm ${hasChildren ? "font-bold text-foreground" : "font-medium text-foreground/90"}`}>
          {node.name}
        </span>
        {node.control && (
          <span className="text-[11px] font-bold text-secondary-foreground bg-secondary px-2 py-0.5 rounded-full flex-shrink-0">
            حساب تحكم
          </span>
        )}
        {typeof node.balance === "number" && (
          <span className="font-sans text-sm font-bold tabular-nums text-foreground flex-shrink-0 w-32 text-left">
            {fmt(node.balance)} <span className="text-xs text-muted-foreground font-normal">ج.م</span>
          </span>
        )}
        <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-primary/10 text-primary flex-shrink-0">
          <Plus className="w-4 h-4" />
        </button>
      </div>
      {hasChildren && open && (
        <div>
          {node.children!.map((c) => (
            <TreeRow key={c.code} node={c} depth={depth + 1} />
          ))}
        </div>
      )}
    </>
  );
}

const groupMeta: Record<string, { color: string; total: number }> = {
  الأصول: { color: "bg-primary", total: 2768000 },
  الخصوم: { color: "bg-destructive", total: 312300 },
  "حقوق الملكية": { color: "bg-secondary-foreground", total: 671210 },
  الإيرادات: { color: "bg-success", total: 3265000 },
  المصروفات: { color: "bg-amber-500", total: 1270000 },
};

export function ChartOfAccounts() {
  const [activeTab, setActiveTab] = useState("الكل");
  const [addOpen, setAddOpen] = useState(true);
  const groups = Object.keys(tree).filter((g) => activeTab === "الكل" || g === activeTab);

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
            <div className="w-10 h-10 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold">
              م
            </div>
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
        {/* Header */}
        <header className="h-20 bg-background/80 backdrop-blur-md border-b sticky top-0 z-10 flex items-center justify-between px-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-card border shadow-sm flex items-center justify-center text-primary">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">شركة النيل للتجارة والتوريدات</h1>
              <p className="text-sm text-muted-foreground font-medium">شجرة الحسابات · السنة المالية 2024</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative hidden md:block">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="بحث باسم الحساب أو الكود..."
                className="bg-card border rounded-full h-10 pr-10 pl-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary w-60 transition-all"
              />
            </div>
            <button className="flex items-center gap-2 bg-card border shadow-sm px-4 py-2 rounded-full text-sm font-semibold hover:border-primary/50 transition-colors">
              <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
              تخصيص الشجرة
            </button>
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              إضافة حساب
            </button>
          </div>
        </header>

        <div className="p-8 flex flex-col gap-6 max-w-6xl mx-auto w-full">
          {/* Summary chips */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Object.entries(groupMeta).map(([name, meta]) => (
              <div key={name} className="bg-card border rounded-xl p-4 flex flex-col gap-2 relative overflow-hidden">
                <div className={`absolute right-0 top-0 bottom-0 w-1 ${meta.color}`} />
                <span className="text-xs font-semibold text-muted-foreground">{name}</span>
                <span className="font-sans text-lg font-bold tabular-nums">{fmt(meta.total)}</span>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2 border-b pb-px overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-4 py-2.5 text-sm font-bold rounded-t-lg border-b-2 -mb-px transition-colors whitespace-nowrap ${
                  activeTab === t
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
            <button className="mr-auto flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground px-3 py-2 whitespace-nowrap">
              <Download className="w-4 h-4" />
              تصدير
            </button>
          </div>

          {/* Tree */}
          <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-3 border-b bg-muted/40 text-xs font-bold text-muted-foreground">
              <span className="w-5" />
              <span className="w-12">الكود</span>
              <span className="flex-1">اسم الحساب</span>
              <span className="w-32 text-left">الرصيد</span>
              <span className="w-6" />
            </div>

            <div className="p-3 flex flex-col gap-4">
              {groups.map((g) => (
                <div key={g}>
                  <div className="flex items-center gap-3 px-4 py-2 mb-1">
                    <span className={`w-2.5 h-2.5 rounded-sm ${groupMeta[g].color}`} />
                    <h3 className="text-sm font-extrabold text-foreground">{g}</h3>
                    <span className="font-sans text-sm font-bold tabular-nums text-muted-foreground mr-auto">
                      {fmt(groupMeta[g].total)} <span className="text-xs font-normal">ج.م</span>
                    </span>
                  </div>
                  <div className="flex flex-col">
                    {tree[g].map((node) => (
                      <TreeRow key={node.code} node={node} depth={1} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            كل عميل يقدر يفصّل شجرته: يضيف مجموعات وحسابات فرعية، يغيّر الأكواد، ويفعّل/يعطّل أي قسم — والأرصدة بتتحدث تلقائي من القيود.
          </p>
        </div>
      </main>

      {/* Add account modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setAddOpen(false)} />
          <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-lg border flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" />
                <h2 className="text-base font-bold text-foreground">إضافة حساب جديد</h2>
              </div>
              <button onClick={() => setAddOpen(false)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-5 overflow-y-auto">
              {/* Parent heading */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">البند الرئيسي (الحساب الأب)</label>
                <div className="relative">
                  <select className="w-full appearance-none bg-background border rounded-xl h-11 pr-4 pl-10 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                    <option>الأصول ← الأصول المتداولة (11)</option>
                    <option>الأصول ← الأصول المتداولة ← النقدية وما في حكمها (111)</option>
                    <option>الأصول ← الأصول الثابتة (12)</option>
                    <option>الخصوم (2)</option>
                    <option>حقوق الملكية (3)</option>
                    <option>الإيرادات (4)</option>
                    <option>المصروفات (5)</option>
                  </select>
                  <ChevronDown className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
                <p className="text-xs text-muted-foreground">الحساب الجديد هيتسجّل تحت البند ده وياخد كوده تلقائي من تسلسله.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-foreground">كود الحساب</label>
                  <input
                    dir="ltr"
                    defaultValue="115"
                    className="bg-background border rounded-xl h-11 px-4 text-sm font-sans font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                  <p className="text-[11px] text-muted-foreground">مقترح تلقائي · يمكن تعديله</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-foreground">طبيعة الحساب</label>
                  <div className="relative">
                    <select className="w-full appearance-none bg-background border rounded-xl h-11 pr-4 pl-10 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                      <option>مدين</option>
                      <option>دائن</option>
                    </select>
                    <ChevronDown className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">اسم الحساب</label>
                <input
                  placeholder="مثال: أوراق قبض"
                  className="bg-background border rounded-xl h-11 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              {/* Control account toggle */}
              <div className="flex items-center justify-between bg-secondary/40 border border-secondary rounded-xl px-4 py-3">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-foreground">حساب تحكم</span>
                  <span className="text-xs text-muted-foreground">يجمّع حسابات فرعية (عملاء / موردين / بنوك)</span>
                </div>
                <ToggleRight className="w-9 h-9 text-primary" />
              </div>

              <div className="flex items-center justify-between bg-muted/40 rounded-xl px-4 py-3">
                <span className="text-sm font-semibold text-foreground">حساب نشط</span>
                <ToggleRight className="w-9 h-9 text-success" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/30">
              <button
                onClick={() => setAddOpen(false)}
                className="px-5 py-2.5 rounded-full text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
              >
                إلغاء
              </button>
              <button className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-5 py-2.5 rounded-full text-sm font-bold hover:opacity-90 transition-opacity">
                <Check className="w-4 h-4" />
                حفظ الحساب
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BookOpen(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}
