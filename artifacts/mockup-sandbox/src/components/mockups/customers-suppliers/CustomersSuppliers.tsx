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
  Search,
  Plus,
  Building2,
  Phone,
  Mail,
  MapPin,
  Hash,
  Banknote,
  CreditCard,
  Paperclip,
  Pencil,
  Upload,
  FileCheck2,
} from "lucide-react";

const navItems = [
  { label: "لوحة التحكم", icon: LayoutDashboard },
  { label: "شجرة الحسابات", icon: ListTree },
  { label: "البنوك والنقدية", icon: Landmark },
  { label: "العهد والسلف", icon: HandCoins },
  { label: "العملاء والموردين", icon: Users, active: true },
  { label: "المشتريات والموردين", icon: Receipt },
  { label: "مراكز التكلفة والمشاريع", icon: Boxes },
  { label: "التقارير المالية", icon: FileText },
];

type Party = {
  id: string;
  name: string;
  trade: string;
  type: "عميل" | "مورد";
  balance: number;
  tax: string;
};

const customers: Party[] = [
  { id: "c1", name: "شركة دلتا للتجارة", trade: "دلتا ستور", type: "عميل", balance: 320000, tax: "312-456-789" },
  { id: "c2", name: "مؤسسة الشروق", trade: "الشروق ماركت", type: "عميل", balance: 84500, tax: "208-117-540" },
  { id: "c3", name: "محلات الأمل", trade: "الأمل", type: "عميل", balance: 12000, tax: "455-902-331" },
];

const suppliers: Party[] = [
  { id: "s1", name: "الشركة المصرية للتوريدات", trade: "إيجيبت سبلاي", type: "مورد", balance: 150000, tax: "330-771-118" },
  { id: "s2", name: "مصنع النصر للبلاستيك", trade: "النصر", type: "مورد", balance: 61200, tax: "119-660-204" },
];

const fmt = (n: number) => n.toLocaleString("en-US");

type Invoice = {
  no: string;
  date: string;
  desc: string;
  amount: number;
  status: "مدفوعة" | "جزئي" | "غير مدفوعة";
  doc: string;
};

const invoices: Invoice[] = [
  { no: "INV-2024-018", date: "2024/03/12", desc: "توريد بضاعة - دفعة أولى", amount: 85000, status: "مدفوعة", doc: "فاتورة.pdf" },
  { no: "INV-2024-021", date: "2024/03/20", desc: "توريد بضاعة - دفعة ثانية", amount: 142500, status: "جزئي", doc: "إذن استلام.pdf" },
  { no: "INV-2024-027", date: "2024/04/02", desc: "خدمات نقل وتأمين", amount: 18000, status: "غير مدفوعة", doc: "عقد.pdf" },
  { no: "INV-2024-031", date: "2024/04/15", desc: "توريد بضاعة - دفعة ثالثة", amount: 74500, status: "غير مدفوعة", doc: "—" },
];

const statusStyle: Record<Invoice["status"], string> = {
  مدفوعة: "bg-success/10 text-success",
  جزئي: "bg-amber-500/10 text-amber-600",
  "غير مدفوعة": "bg-destructive/10 text-destructive",
};

function InfoRow({ icon: Icon, label, value, ltr }: { icon: any; label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={`text-sm font-semibold text-foreground break-words ${ltr ? "font-sans" : ""}`} dir={ltr ? "ltr" : "rtl"}>
          {value}
        </span>
      </div>
    </div>
  );
}

export function CustomersSuppliers() {
  const [tab, setTab] = useState<"عملاء" | "موردين">("عملاء");
  const [selectedId, setSelectedId] = useState("c1");

  const list = tab === "عملاء" ? customers : suppliers;
  const all = [...customers, ...suppliers];
  const selected = all.find((p) => p.id === selectedId) ?? customers[0];

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
        <header className="h-20 bg-background/80 backdrop-blur-md border-b sticky top-0 z-10 flex items-center justify-between px-8">
          <div>
            <h1 className="text-lg font-bold text-foreground">العملاء والموردين</h1>
            <p className="text-sm text-muted-foreground font-medium">دليل الأطراف · بياناتهم الكاملة وفواتيرهم</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative hidden md:block">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="بحث بالاسم أو الرقم الضريبي..."
                className="bg-card border rounded-full h-10 pr-10 pl-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary w-60 transition-all"
              />
            </div>
            <button className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity">
              <Plus className="w-4 h-4" />
              {tab === "عملاء" ? "إضافة عميل" : "إضافة مورد"}
            </button>
          </div>
        </header>

        <div className="p-8 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 max-w-7xl mx-auto w-full items-start">
          {/* List column */}
          <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
            <div className="flex p-1.5 gap-1 border-b bg-muted/40">
              {(["عملاء", "موردين"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTab(t);
                    setSelectedId(t === "عملاء" ? "c1" : "s1");
                  }}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
                    tab === t ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "عملاء" ? `العملاء (${customers.length})` : `الموردين (${suppliers.length})`}
                </button>
              ))}
            </div>
            <div className="p-2 flex flex-col gap-1">
              {list.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full text-right p-3 rounded-xl flex items-center gap-3 transition-colors ${
                    selectedId === p.id ? "bg-primary/10 ring-1 ring-primary/20" : "hover:bg-muted"
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-secondary text-secondary-foreground flex items-center justify-center font-bold flex-shrink-0">
                    {p.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.trade}</p>
                  </div>
                  <span className="font-sans text-xs font-bold tabular-nums text-foreground flex-shrink-0">{fmt(p.balance)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Detail column */}
          <div className="flex flex-col gap-6">
            {/* Header card */}
            <div className="bg-card border rounded-2xl shadow-sm p-6 flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                <Building2 className="w-8 h-8" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-foreground">{selected.name}</h2>
                  <span className="text-[11px] font-bold bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
                    {selected.type}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  الاسم التجاري: <span className="font-semibold text-foreground">{selected.trade}</span> · ر.ض{" "}
                  <span className="font-sans font-semibold text-foreground" dir="ltr">
                    {selected.tax}
                  </span>
                </p>
              </div>
              <div className="text-left flex-shrink-0">
                <p className="text-xs text-muted-foreground">الرصيد الحالي</p>
                <p className="font-sans text-2xl font-bold tabular-nums text-foreground">
                  {fmt(selected.balance)} <span className="text-sm font-normal text-muted-foreground">ج.م</span>
                </p>
              </div>
              <button className="flex items-center gap-2 bg-card border shadow-sm px-3 py-2 rounded-full text-sm font-semibold hover:border-primary/50 transition-colors flex-shrink-0">
                <Pencil className="w-4 h-4 text-muted-foreground" />
                تعديل
              </button>
            </div>

            {/* Data cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-card border rounded-2xl shadow-sm p-5 flex flex-col gap-4">
                <h3 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" /> البيانات الأساسية
                </h3>
                <InfoRow icon={Hash} label="الاسم التجاري" value={selected.trade} />
                <InfoRow icon={MapPin} label="العنوان" value="٢٢ شارع التحرير، الدقي، الجيزة" />
                <InfoRow icon={Phone} label="الهاتف" value="0100 123 4567" ltr />
                <InfoRow icon={Mail} label="البريد الإلكتروني" value="info@delta-store.com" ltr />
              </div>

              <div className="bg-card border rounded-2xl shadow-sm p-5 flex flex-col gap-4">
                <h3 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-primary" /> التسجيل الضريبي
                </h3>
                <InfoRow icon={Hash} label="رقم التسجيل الضريبي" value={selected.tax} ltr />
                <InfoRow icon={FileText} label="نوع التسجيل" value="ممول مسجل (ضريبة القيمة المضافة)" />
                <InfoRow icon={Building2} label="المأمورية" value="مأمورية ضرائب الجيزة - أول" />
                <InfoRow icon={FileCheck2} label="رمز النشاط (ETA)" value="6201 - أنشطة تجارية" />
              </div>

              <div className="bg-card border rounded-2xl shadow-sm p-5 flex flex-col gap-4">
                <h3 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-primary" /> بيانات التحويل البنكي
                </h3>
                <InfoRow icon={Landmark} label="البنك" value="البنك الأهلي المصري - فرع الدقي" />
                <InfoRow icon={CreditCard} label="رقم الحساب" value="1234 5678 9012 3" ltr />
                <InfoRow icon={Hash} label="IBAN" value="EG38 0019 0005 0000 1234 5678" ltr />
                <InfoRow icon={Users} label="اسم المستفيد" value={selected.name} />
              </div>
            </div>

            {/* Invoices */}
            <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <h3 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-primary" /> الفواتير والمستندات
                </h3>
                <div className="flex items-center gap-2">
                  <button className="flex items-center gap-2 bg-card border shadow-sm px-3 py-1.5 rounded-full text-xs font-semibold hover:border-primary/50 transition-colors">
                    <Upload className="w-3.5 h-3.5 text-muted-foreground" />
                    إرفاق مستند
                  </button>
                  <button className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-full text-xs font-bold hover:opacity-90 transition-opacity">
                    <Plus className="w-3.5 h-3.5" />
                    إضافة فاتورة
                  </button>
                </div>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-bold text-muted-foreground bg-muted/40">
                    <th className="text-right font-bold px-6 py-2.5">رقم الفاتورة</th>
                    <th className="text-right font-bold px-3 py-2.5">التاريخ</th>
                    <th className="text-right font-bold px-3 py-2.5">البيان</th>
                    <th className="text-left font-bold px-3 py-2.5">المبلغ</th>
                    <th className="text-center font-bold px-3 py-2.5">الحالة</th>
                    <th className="text-right font-bold px-6 py-2.5">المستند</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.no} className="border-t hover:bg-muted/40 transition-colors">
                      <td className="px-6 py-3 font-sans font-bold text-foreground" dir="ltr" style={{ textAlign: "right" }}>
                        {inv.no}
                      </td>
                      <td className="px-3 py-3 font-sans text-muted-foreground" dir="ltr" style={{ textAlign: "right" }}>
                        {inv.date}
                      </td>
                      <td className="px-3 py-3 text-foreground/90">{inv.desc}</td>
                      <td className="px-3 py-3 font-sans font-bold tabular-nums text-left">{fmt(inv.amount)}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${statusStyle[inv.status]}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        {inv.doc === "—" ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded-lg">
                            <Paperclip className="w-3.5 h-3.5" />
                            {inv.doc}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Dropzone hint */}
              <div className="m-4 border-2 border-dashed rounded-xl py-5 flex flex-col items-center justify-center gap-1 text-muted-foreground bg-muted/20">
                <Upload className="w-5 h-5" />
                <p className="text-xs font-semibold">اسحب وأفلت ملفات الفواتير والمستندات هنا (PDF, JPG, Excel)</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
