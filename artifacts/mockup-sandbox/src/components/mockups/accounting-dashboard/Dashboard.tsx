import React, { useState } from "react";
import "./_group.css";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  LayoutDashboard,
  Wallet,
  TrendingUp,
  Receipt,
  FileText,
  Settings,
  Bell,
  Search,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  SlidersHorizontal,
  Building2,
  CheckCircle2,
  Clock,
  AlertCircle,
  MoreVertical,
  GripVertical,
  X,
  Plus,
  Save,
  RotateCcw,
  Eye,
  BarChart3,
  PieChart as PieChartIcon,
  List,
  Hash,
  TrendingDown,
  ArrowUpCircle,
  ArrowDownCircle,
} from "lucide-react";

// --- Widget Registry (user-customizable) ---
const WIDGETS = [
  { id: "kpi", title: "مؤشرات رئيسية", type: "kpi" },
  { id: "revenue-chart", title: "الإيرادات مقابل المصروفات", type: "chart" },
  { id: "balances", title: "أرصدة العملاء والموردين", type: "balances" },
  { id: "e-invoice", title: "الفاتورة الإلكترونية", type: "e-invoice" },
  { id: "recent-transactions", title: "أحدث القيود المحاسبية", type: "transactions" },
  { id: "accounts-donut", title: "توزيع الحسابات", type: "donut" },
  { id: "profit-chart", title: "صافي الربح", type: "profit-chart" },
];

// --- Sample Data ---
const revenueData = [
  { name: "يناير", revenue: 400000, expenses: 240000 },
  { name: "فبراير", revenue: 450000, expenses: 280000 },
  { name: "مارس", revenue: 420000, expenses: 260000 },
  { name: "أبريل", revenue: 580000, expenses: 310000 },
  { name: "مايو", revenue: 620000, expenses: 340000 },
  { name: "يونيو", revenue: 750000, expenses: 380000 },
];

const profitData = [
  { name: "Q1", profit: 320000 },
  { name: "Q2", profit: 480000 },
  { name: "Q3", profit: 520000 },
  { name: "Q4", profit: 650000 },
];

const donutData = [
  { name: "أصول", value: 15, color: "#0ea5e9" },
  { name: "خصوم", value: 12, color: "#f43f5e" },
  { name: "حقوق ملكية", value: 4, color: "#8b5cf6" },
  { name: "إيرادات", value: 9, color: "#10b981" },
  { name: "مصروفات", value: 24, color: "#f59e0b" },
];

const recentTransactions = [
  { id: "JRN-2024-089", date: "2024/06/15", description: "تحصيل دفعة من شركة الأمل", account: "البنك الأهلي المصري", amount: 125000, type: "credit", status: "مكتمل" },
  { id: "JRN-2024-088", date: "2024/06/14", description: "سداد فاتورة مورد (الشركة الهندسية)", account: "بنك مصر", amount: 45000, type: "debit", status: "مكتمل" },
  { id: "JRN-2024-087", date: "2024/06/14", description: "رواتب شهر مايو", account: "البنك التجاري الدولي", amount: 180000, type: "debit", status: "مكتمل" },
  { id: "JRN-2024-086", date: "2024/06/12", description: "مبيعات نقدية", account: "الخزينة الرئيسية", amount: 32000, type: "credit", status: "مكتمل" },
];

// --- Components ---
const Card = ({ className = "", children, editMode, onRemove, onMoveUp, onMoveDown, isFirst, isLast, title }: any) => (
  <div className={`bg-card rounded-2xl border shadow-sm relative group/card transition-all ${className}`}>
    {editMode && (
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
        <div className="flex items-center gap-1 bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-bold shadow-lg">
          <GripVertical className="w-3 h-3" />
          {title}
        </div>
      </div>
    )}
    {editMode && (
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
        {!isFirst && (
          <button onClick={onMoveUp} className="p-1 rounded bg-muted hover:bg-primary hover:text-primary-foreground transition-colors" title="لأعلى">
            <ArrowUpCircle className="w-4 h-4" />
          </button>
        )}
        {!isLast && (
          <button onClick={onMoveDown} className="p-1 rounded bg-muted hover:bg-primary hover:text-primary-foreground transition-colors" title="لأسفل">
            <ArrowDownCircle className="w-4 h-4" />
          </button>
        )}
        <button onClick={onRemove} className="p-1 rounded bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors" title="إزالة">
          <X className="w-4 h-4" />
        </button>
      </div>
    )}
    {children}
  </div>
);

const IconButton = ({ icon: Icon, className = "" }: { icon: any; className?: string }) => (
  <button className={`p-2 rounded-full hover:bg-muted transition-colors ${className}`}>
    <Icon className="w-5 h-5 text-muted-foreground" />
  </button>
);

const StatCard = ({ title, value, change, isPositive, icon: Icon, subtitle }: any) => (
  <div className="p-5 flex flex-col gap-4 relative overflow-hidden">
    <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full blur-2xl opacity-10 ${isPositive ? 'bg-success' : 'bg-destructive'}`} />
    <div className="flex justify-between items-start relative z-10">
      <div className="bg-primary/5 p-3 rounded-xl">
        <Icon className="w-6 h-6 text-primary" />
      </div>
      <div className={`flex items-center gap-1 text-sm font-medium px-2.5 py-1 rounded-full ${isPositive ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
        <span dir="ltr">{change}%</span>
        {isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
      </div>
    </div>
    <div className="relative z-10">
      <h3 className="text-sm font-semibold text-muted-foreground mb-1">{title}</h3>
      <div className="text-2xl font-bold text-foreground font-sans">
        <span className="text-lg text-muted-foreground font-normal ml-1">ج.م</span>
        {value.toLocaleString()}
      </div>
      {subtitle && <p className="text-xs text-muted-foreground mt-2">{subtitle}</p>}
    </div>
  </div>
);

// --- Widget Renderers ---
const KPIWidget = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
    <StatCard title="النقدية وما في حكمها" value={520000} change={12.5} isPositive icon={Wallet} subtitle="موزعة على 3 بنوك وخزينة" />
    <StatCard title="إجمالي الإيرادات" value={3220000} change={8.2} isPositive icon={TrendingUp} subtitle="حتى تاريخه في 2024" />
    <StatCard title="إجمالي المصروفات" value={1810000} change={4.1} isPositive={false} icon={Receipt} subtitle="حتى تاريخه في 2024" />
    <StatCard title="صافي الربح التقديري" value={1410000} change={15.3} isPositive icon={LayoutDashboard} subtitle="قبل الضرائب والإهلاك" />
  </div>
);

const RevenueChartWidget = () => (
  <div className="p-6 flex flex-col">
    <div className="flex justify-between items-center mb-6">
      <div>
        <h2 className="text-lg font-bold">الإيرادات مقابل المصروفات</h2>
        <p className="text-sm text-muted-foreground">تحليل النصف الأول من 2024</p>
      </div>
      <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <span>الأشهر الستة الماضية</span>
        <ChevronDown className="w-4 h-4" />
      </button>
    </div>
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={revenueData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} dy={10} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickFormatter={(value) => `${value / 1000}k`} />
          <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid hsl(var(--border))', fontFamily: 'Cairo, sans-serif' }} itemStyle={{ fontFamily: 'Cairo, sans-serif' }} formatter={(value: number) => [`${value.toLocaleString()} ج.م`]} />
          <Area type="monotone" dataKey="revenue" name="الإيرادات" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
          <Area type="monotone" dataKey="expenses" name="المصروفات" stroke="hsl(var(--secondary-foreground))" strokeWidth={3} fillOpacity={1} fill="url(#colorExp)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </div>
);

const BalancesWidget = () => (
  <div className="flex flex-col gap-6">
    <div className="p-5 flex-1 flex flex-col justify-center relative overflow-hidden">
      <div className="absolute right-0 top-0 bottom-0 w-1 bg-primary"></div>
      <h3 className="text-sm font-bold text-muted-foreground mb-1">العملاء (أرصدة مدينة)</h3>
      <div className="text-2xl font-bold font-sans">320,000 <span className="text-base text-muted-foreground font-normal">ج.م</span></div>
      <div className="mt-4 w-full bg-border h-2 rounded-full overflow-hidden"><div className="bg-primary h-full w-[70%] rounded-full"></div></div>
      <p className="text-xs text-muted-foreground mt-2">70% مستحق خلال 30 يوماً</p>
    </div>
    <div className="p-5 flex-1 flex flex-col justify-center relative overflow-hidden">
      <div className="absolute right-0 top-0 bottom-0 w-1 bg-destructive"></div>
      <h3 className="text-sm font-bold text-muted-foreground mb-1">الموردين (أرصدة دائنة)</h3>
      <div className="text-2xl font-bold font-sans">150,000 <span className="text-base text-muted-foreground font-normal">ج.م</span></div>
      <div className="mt-4 w-full bg-border h-2 rounded-full overflow-hidden"><div className="bg-destructive h-full w-[40%] rounded-full"></div></div>
      <p className="text-xs text-muted-foreground mt-2">40% مستحق خلال 15 يوماً</p>
    </div>
  </div>
);

const EInvoiceWidget = () => (
  <div className="p-6">
    <div className="flex items-center gap-3 mb-6">
      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center"><Building2 className="w-5 h-5 text-slate-500" /></div>
      <div>
        <h2 className="text-base font-bold">الفاتورة الإلكترونية</h2>
        <p className="text-xs text-muted-foreground">الربط مع مصلحة الضرائب المصرية</p>
      </div>
    </div>
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between p-3 rounded-xl border bg-card">
        <div className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-success" /><span className="text-sm font-semibold">فواتير صحيحة</span></div>
        <span className="font-bold font-sans">142</span>
      </div>
      <div className="flex items-center justify-between p-3 rounded-xl border bg-card">
        <div className="flex items-center gap-3"><Clock className="w-5 h-5 text-amber-500" /><span className="text-sm font-semibold">قيد المراجعة</span></div>
        <span className="font-bold font-sans">3</span>
      </div>
      <div className="flex items-center justify-between p-3 rounded-xl border bg-card">
        <div className="flex items-center gap-3"><AlertCircle className="w-5 h-5 text-destructive" /><span className="text-sm font-semibold">مرفوضة / خطأ</span></div>
        <span className="font-bold font-sans">0</span>
      </div>
    </div>
    <button className="w-full mt-6 py-2.5 rounded-xl border-2 border-primary text-primary font-bold text-sm hover:bg-primary/5 transition-colors">إرسال دفعة الفواتير (3)</button>
  </div>
);

const TransactionsWidget = () => (
  <div className="p-0 flex flex-col overflow-hidden">
    <div className="p-6 border-b flex justify-between items-center bg-card">
      <div>
        <h2 className="text-lg font-bold">أحدث القيود المحاسبية</h2>
        <p className="text-sm text-muted-foreground">نشاط دفتر اليومية الأخير</p>
      </div>
      <button className="text-sm font-bold text-primary hover:underline">عرض كل القيود</button>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-right">
        <thead className="bg-muted/50 text-muted-foreground font-semibold">
          <tr>
            <th className="px-6 py-4">رقم القيد</th>
            <th className="px-6 py-4">التاريخ</th>
            <th className="px-6 py-4">البيان</th>
            <th className="px-6 py-4">الحساب</th>
            <th className="px-6 py-4">القيمة (ج.م)</th>
            <th className="px-6 py-4"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {recentTransactions.map((trx, idx) => (
            <tr key={idx} className="hover:bg-muted/30 transition-colors">
              <td className="px-6 py-4 font-sans font-medium text-muted-foreground" dir="ltr">{trx.id}</td>
              <td className="px-6 py-4 font-sans">{trx.date}</td>
              <td className="px-6 py-4 font-semibold">{trx.description}</td>
              <td className="px-6 py-4">
                <span className="inline-flex items-center px-2 py-1 rounded-md bg-secondary/50 text-xs font-bold text-secondary-foreground">{trx.account}</span>
              </td>
              <td className="px-6 py-4 font-sans font-bold text-base">{trx.amount.toLocaleString()}</td>
              <td className="px-6 py-4"><IconButton icon={MoreVertical} className="w-8 h-8 flex items-center justify-center p-0" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const DonutWidget = () => (
  <div className="p-6 flex flex-col">
    <div className="flex justify-between items-center mb-4">
      <div>
        <h2 className="text-lg font-bold">توزيع الحسابات</h2>
        <p className="text-sm text-muted-foreground">حسب نوع الحساب</p>
      </div>
    </div>
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={donutData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value">
            {donutData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip formatter={(value: number, name: string) => [`${value} حساب`, name]} />
        </PieChart>
      </ResponsiveContainer>
    </div>
    <div className="flex flex-wrap gap-3 mt-2 justify-center">
      {donutData.map((d) => (
        <div key={d.name} className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
          <span className="text-xs font-semibold">{d.name}</span>
        </div>
      ))}
    </div>
  </div>
);

const ProfitChartWidget = () => (
  <div className="p-6 flex flex-col">
    <div className="flex justify-between items-center mb-4">
      <div>
        <h2 className="text-lg font-bold">صافي الربح</h2>
        <p className="text-sm text-muted-foreground">ربع سنوي</p>
      </div>
    </div>
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={profitData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickFormatter={(value) => `${value / 1000}k`} />
          <Tooltip formatter={(value: number) => [`${value.toLocaleString()} ج.م`, "صافي الربح"]} />
          <Bar dataKey="profit" fill="hsl(var(--success))" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
);

const WIDGET_RENDERERS: Record<string, React.FC> = {
  "kpi": KPIWidget,
  "chart": RevenueChartWidget,
  "balances": BalancesWidget,
  "e-invoice": EInvoiceWidget,
  "transactions": TransactionsWidget,
  "donut": DonutWidget,
  "profit-chart": ProfitChartWidget,
};

// --- Main Dashboard ---
export function Dashboard() {
  const [editMode, setEditMode] = useState(false);
  const [activeWidgets, setActiveWidgets] = useState<string[]>(["kpi", "revenue-chart", "balances", "e-invoice", "recent-transactions"]);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const moveWidget = (index: number, direction: -1 | 1) => {
    const newOrder = [...activeWidgets];
    const target = index + direction;
    if (target >= 0 && target < newOrder.length) {
      [newOrder[index], newOrder[target]] = [newOrder[target], newOrder[index]];
      setActiveWidgets(newOrder);
    }
  };

  const removeWidget = (id: string) => {
    setActiveWidgets((prev) => prev.filter((w) => w !== id));
  };

  const addWidget = (id: string) => {
    if (!activeWidgets.includes(id)) {
      setActiveWidgets((prev) => [...prev, id]);
    }
    setShowAddMenu(false);
  };

  const resetLayout = () => {
    setActiveWidgets(["kpi", "revenue-chart", "balances", "e-invoice", "recent-transactions"]);
  };

  const availableWidgets = WIDGETS.filter((w) => !activeWidgets.includes(w.id));

  // Determine grid layout per widget
  const getWidgetSpan = (type: string) => {
    switch (type) {
      case "kpi": return "lg:col-span-full";
      case "chart": return "lg:col-span-2";
      case "transactions": return "lg:col-span-2";
      case "balances": return "";
      case "e-invoice": return "";
      case "donut": return "";
      case "profit-chart": return "";
      default: return "";
    }
  };

  return (
    <div dir="rtl" className="theme-hesabat min-h-screen flex w-full">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-l flex flex-col fixed h-full z-20">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl leading-none">ح</div>
          <span className="font-bold text-xl text-primary tracking-tight">حسابات</span>
        </div>
        <nav className="flex-1 px-4 py-4 flex flex-col gap-1.5 overflow-y-auto">
          {[
            { label: "لوحة التحكم", icon: LayoutDashboard, active: true },
            { label: "القيود اليومية", icon: BookOpen },
            { label: "المبيعات والعملاء", icon: Wallet },
            { label: "المشتريات والموردين", icon: Receipt },
            { label: "التقارير المالية", icon: FileText },
            { label: "الفاتورة الإلكترونية", icon: FileText },
          ].map((item, i) => (
            <button key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${item.active ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              <item.icon className="w-5 h-5" /> {item.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t mt-auto">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted cursor-pointer transition-colors">
            <div className="w-10 h-10 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold">م</div>
            <div className="flex flex-col">
              <span className="text-sm font-bold">محمد علي</span>
              <span className="text-xs text-muted-foreground">مدير مالي</span>
            </div>
            <Settings className="w-4 h-4 text-muted-foreground mr-auto" />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 mr-64 flex flex-col min-h-screen">
        {/* Header */}
        <header className="h-20 bg-background/80 backdrop-blur-md border-b sticky top-0 z-10 flex items-center justify-between px-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-card border shadow-sm flex items-center justify-center text-primary">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">شركة النيل للتجارة والتوريدات</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
                <span>السنة المالية: 2024</span>
                <span className="w-1 h-1 rounded-full bg-border"></span>
                <span className="text-success flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-success"></span> متصل ومزامن
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative hidden md:block">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" placeholder="بحث في الحسابات والقيود..." className="bg-card border rounded-full h-10 pr-10 pl-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary w-64 transition-all" />
            </div>
            <IconButton icon={Bell} />

            {/* Customize Toggle */}
            {editMode ? (
              <div className="flex items-center gap-2">
                <button onClick={() => setShowAddMenu(!showAddMenu)} className="flex items-center gap-2 bg-primary text-primary-foreground shadow-sm px-4 py-2 rounded-full text-sm font-semibold hover:opacity-90 transition-opacity">
                  <Plus className="w-4 h-4" /> إضافة widget
                </button>
                <button onClick={resetLayout} className="flex items-center gap-2 bg-card border shadow-sm px-4 py-2 rounded-full text-sm font-semibold hover:border-primary/50 transition-colors">
                  <RotateCcw className="w-4 h-4" /> إعادة ضبط
                </button>
                <button onClick={() => setEditMode(false)} className="flex items-center gap-2 bg-success text-success-foreground shadow-sm px-4 py-2 rounded-full text-sm font-semibold hover:opacity-90 transition-opacity">
                  <Save className="w-4 h-4" /> حفظ
                </button>
              </div>
            ) : (
              <button onClick={() => setEditMode(true)} className="flex items-center gap-2 bg-card border shadow-sm px-4 py-2 rounded-full text-sm font-semibold hover:border-primary/50 transition-colors">
                <SlidersHorizontal className="w-4 h-4 text-muted-foreground" /> تخصيص لوحة التحكم
              </button>
            )}
          </div>
        </header>

        {/* Add Widget Menu */}
        {editMode && showAddMenu && (
          <div className="mx-8 mt-4 p-4 bg-card border rounded-2xl shadow-lg z-30">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm">إضافة widget للوحة التحكم</h3>
              <button onClick={() => setShowAddMenu(false)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            {availableWidgets.length === 0 ? (
              <p className="text-sm text-muted-foreground">جميع الـ widgets مضافة بالفعل</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {availableWidgets.map((w) => (
                  <button key={w.id} onClick={() => addWidget(w.id)} className="flex items-center gap-3 p-3 rounded-xl border hover:border-primary hover:bg-primary/5 transition-all text-start">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      {w.type === "kpi" && <Hash className="w-5 h-5" />}
                      {w.type === "chart" && <BarChart3 className="w-5 h-5" />}
                      {w.type === "donut" && <PieChartIcon className="w-5 h-5" />}
                      {w.type === "balances" && <Wallet className="w-5 h-5" />}
                      {w.type === "e-invoice" && <FileText className="w-5 h-5" />}
                      {w.type === "transactions" && <List className="w-5 h-5" />}
                      {w.type === "profit-chart" && <TrendingUp className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{w.title}</div>
                      <div className="text-xs text-muted-foreground">{w.type}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dashboard Content */}
        <div className={`p-8 flex flex-col gap-6 max-w-7xl mx-auto w-full transition-all ${editMode ? "pt-4" : ""}`}>

          {/* Edit Mode Banner */}
          {editMode && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20 text-primary">
              <SlidersHorizontal className="w-5 h-5" />
              <span className="font-semibold text-sm">وضع التخصيص: يمكنك إعادة ترتيب الـ widgets أو إزالتها أو إضافة جديدة</span>
            </div>
          )}

          {/* Widgets Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {activeWidgets.map((widgetId, index) => {
              const widgetDef = WIDGETS.find((w) => w.id === widgetId);
              if (!widgetDef) return null;
              const Renderer = WIDGET_RENDERERS[widgetDef.type];
              if (!Renderer) return null;

              return (
                <Card
                  key={widgetId}
                  className={getWidgetSpan(widgetDef.type)}
                  editMode={editMode}
                  title={widgetDef.title}
                  onRemove={() => removeWidget(widgetId)}
                  onMoveUp={() => moveWidget(index, -1)}
                  onMoveDown={() => moveWidget(index, 1)}
                  isFirst={index === 0}
                  isLast={index === activeWidgets.length - 1}
                >
                  <Renderer />
                </Card>
              );
            })}
          </div>

          {/* Empty State (if all removed) */}
          {activeWidgets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Eye className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-bold text-muted-foreground">لا يوجد widgets</h3>
              <p className="text-sm text-muted-foreground">أضف widgets من قائمة "إضافة widget"</p>
              <button onClick={() => setShowAddMenu(true)} className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-full text-sm font-semibold hover:opacity-90 transition-opacity">
                <Plus className="w-4 h-4" /> إضافة widget
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// Custom book open icon
function BookOpen(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}