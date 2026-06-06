import React from "react";
import "./_group.css";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import {
  LayoutDashboard,
  Wallet,
  TrendingUp,
  Receipt,
  FileText,
  Users,
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
  Download,
} from "lucide-react";

// --- Sample Data ---
const revenueData = [
  { name: "يناير", revenue: 400000, expenses: 240000 },
  { name: "فبراير", revenue: 450000, expenses: 280000 },
  { name: "مارس", revenue: 420000, expenses: 260000 },
  { name: "أبريل", revenue: 580000, expenses: 310000 },
  { name: "مايو", revenue: 620000, expenses: 340000 },
  { name: "يونيو", revenue: 750000, expenses: 380000 },
];

const recentTransactions = [
  {
    id: "JRN-2024-089",
    date: "2024/06/15",
    description: "تحصيل دفعة من شركة الأمل",
    account: "البنك الأهلي المصري",
    amount: 125000,
    type: "credit",
    status: "مكتمل",
  },
  {
    id: "JRN-2024-088",
    date: "2024/06/14",
    description: "سداد فاتورة مورد (الشركة الهندسية)",
    account: "بنك مصر",
    amount: 45000,
    type: "debit",
    status: "مكتمل",
  },
  {
    id: "JRN-2024-087",
    date: "2024/06/14",
    description: "رواتب شهر مايو",
    account: "البنك التجاري الدولي",
    amount: 180000,
    type: "debit",
    status: "مكتمل",
  },
  {
    id: "JRN-2024-086",
    date: "2024/06/12",
    description: "مبيعات نقدية",
    account: "الخزينة الرئيسية",
    amount: 32000,
    type: "credit",
    status: "مكتمل",
  },
];

// --- Components ---

const Card = ({ className = "", children }: { className?: string; children: React.ReactNode }) => (
  <div className={`bg-card rounded-2xl border shadow-sm ${className}`}>
    {children}
  </div>
);

const IconButton = ({ icon: Icon, className = "" }: { icon: any; className?: string }) => (
  <button className={`p-2 rounded-full hover:bg-muted transition-colors ${className}`}>
    <Icon className="w-5 h-5 text-muted-foreground" />
  </button>
);

const StatCard = ({ title, value, change, isPositive, icon: Icon, subtitle }: any) => (
  <Card className="p-5 flex flex-col gap-4 group hover:border-primary/30 transition-colors relative overflow-hidden">
    {/* Decorative background glow */}
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
  </Card>
);

export function Dashboard() {
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

        <nav className="flex-1 px-4 py-4 flex flex-col gap-1.5 overflow-y-auto">
          {[
            { label: "لوحة التحكم", icon: LayoutDashboard, active: true },
            { label: "القيود اليومية", icon: BookOpen },
            { label: "المبيعات والعملاء", icon: Wallet },
            { label: "المشتريات والموردين", icon: Receipt },
            { label: "التقارير المالية", icon: FileText },
            { label: "الفاتورة الإلكترونية", icon: FileText }, // ETA icon
          ].map((item, i) => (
            <button
              key={i}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                item.active
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t mt-auto">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted cursor-pointer transition-colors">
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
                  <span className="w-2 h-2 rounded-full bg-success"></span>
                  متصل ومزامن
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative relative-group hidden md:block">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="بحث في الحسابات والقيود..."
                className="bg-card border rounded-full h-10 pr-10 pl-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary w-64 transition-all"
              />
            </div>
            <IconButton icon={Bell} />
            <button className="flex items-center gap-2 bg-card border shadow-sm px-4 py-2 rounded-full text-sm font-semibold hover:border-primary/50 transition-colors">
              <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
              تخصيص لوحة التحكم
            </button>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="p-8 flex flex-col gap-6 max-w-7xl mx-auto w-full">
          
          {/* Top KPIs Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard
              title="النقدية وما في حكمها"
              value={520000}
              change={12.5}
              isPositive={true}
              icon={Wallet}
              subtitle="موزعة على 3 بنوك وخزينة"
            />
            <StatCard
              title="إجمالي الإيرادات"
              value={3220000}
              change={8.2}
              isPositive={true}
              icon={TrendingUp}
              subtitle="حتى تاريخه في 2024"
            />
            <StatCard
              title="إجمالي المصروفات"
              value={1810000}
              change={4.1}
              isPositive={false}
              icon={Receipt}
              subtitle="حتى تاريخه في 2024"
            />
            <StatCard
              title="صافي الربح التقديري"
              value={1410000}
              change={15.3}
              isPositive={true}
              icon={LayoutDashboard} // Just a placeholder icon
              subtitle="قبل الضرائب والإهلاك"
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="p-6 lg:col-span-2 flex flex-col">
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
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      tickFormatter={(value) => `${value / 1000}k`}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: '1px solid hsl(var(--border))', fontFamily: 'Cairo, sans-serif' }}
                      itemStyle={{ fontFamily: 'Cairo, sans-serif' }}
                      formatter={(value: number) => [`${value.toLocaleString()} ج.م`]}
                    />
                    <Area type="monotone" dataKey="revenue" name="الإيرادات" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                    <Area type="monotone" dataKey="expenses" name="المصروفات" stroke="hsl(var(--secondary-foreground))" strokeWidth={3} fillOpacity={1} fill="url(#colorExp)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="flex flex-col gap-6">
              {/* Receivables vs Payables Mini Cards */}
              <Card className="p-5 flex-1 flex flex-col justify-center relative overflow-hidden">
                <div className="absolute right-0 top-0 bottom-0 w-1 bg-primary"></div>
                <h3 className="text-sm font-bold text-muted-foreground mb-1">العملاء (أرصدة مدينة)</h3>
                <div className="text-2xl font-bold font-sans">
                  320,000 <span className="text-base text-muted-foreground font-normal">ج.م</span>
                </div>
                <div className="mt-4 w-full bg-border h-2 rounded-full overflow-hidden">
                  <div className="bg-primary h-full w-[70%] rounded-full"></div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">70% مستحق خلال 30 يوماً</p>
              </Card>
              
              <Card className="p-5 flex-1 flex flex-col justify-center relative overflow-hidden">
                <div className="absolute right-0 top-0 bottom-0 w-1 bg-destructive"></div>
                <h3 className="text-sm font-bold text-muted-foreground mb-1">الموردين (أرصدة دائنة)</h3>
                <div className="text-2xl font-bold font-sans">
                  150,000 <span className="text-base text-muted-foreground font-normal">ج.م</span>
                </div>
                <div className="mt-4 w-full bg-border h-2 rounded-full overflow-hidden">
                  <div className="bg-destructive h-full w-[40%] rounded-full"></div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">40% مستحق خلال 15 يوماً</p>
              </Card>
            </div>
          </div>

          {/* Bottom Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* E-Invoicing Status */}
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-slate-500" />
                </div>
                <div>
                  <h2 className="text-base font-bold">الفاتورة الإلكترونية</h2>
                  <p className="text-xs text-muted-foreground">الربط مع مصلحة الضرائب المصرية</p>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between p-3 rounded-xl border bg-card">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-success" />
                    <span className="text-sm font-semibold">فواتير صحيحة</span>
                  </div>
                  <span className="font-bold font-sans">142</span>
                </div>
                
                <div className="flex items-center justify-between p-3 rounded-xl border bg-card">
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-amber-500" />
                    <span className="text-sm font-semibold">قيد المراجعة</span>
                  </div>
                  <span className="font-bold font-sans">3</span>
                </div>
                
                <div className="flex items-center justify-between p-3 rounded-xl border bg-card">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-destructive" />
                    <span className="text-sm font-semibold">مرفوضة / خطأ</span>
                  </div>
                  <span className="font-bold font-sans">0</span>
                </div>
              </div>

              <button className="w-full mt-6 py-2.5 rounded-xl border-2 border-primary text-primary font-bold text-sm hover:bg-primary/5 transition-colors">
                إرسال دفعة الفواتير (3)
              </button>
            </Card>

            {/* Recent Transactions */}
            <Card className="p-0 lg:col-span-2 flex flex-col overflow-hidden">
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
                          <span className="inline-flex items-center px-2 py-1 rounded-md bg-secondary/50 text-xs font-bold text-secondary-foreground">
                            {trx.account}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-sans font-bold text-base">
                          {trx.amount.toLocaleString()}
                        </td>
                        <td className="px-6 py-4">
                          <IconButton icon={MoreVertical} className="w-8 h-8 flex items-center justify-center p-0" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

          </div>

        </div>
      </main>
    </div>
  );
}

// Custom book open icon
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