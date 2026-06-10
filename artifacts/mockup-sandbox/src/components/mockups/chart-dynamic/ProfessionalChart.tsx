import React, { useState } from "react";
import {
  ChevronDown, ChevronRight, Plus, GripVertical, Lock, CheckCircle,
  MoreHorizontal, Pencil, Trash2, FolderTree, ArrowRightLeft, Search,
  Filter, ArrowLeftRight, FileCheck, Eye, X, ArrowUpDown, Settings,
  LayoutDashboard, ShoppingCart, Users, BarChart3, FileText, Wallet,
  Briefcase, Boxes, Calculator, HelpCircle, ChevronLeft, ChevronRightIcon,
  CircleDollarSign
} from "lucide-react";
import { cn } from "@/lib/utils";

const COLORS: Record<string, { bg: string; border: string; text: string; badge: string; icon: string; dot: string }> = {
  asset: { bg: "bg-[#e3f2fd]", border: "border-[#bbdefb]", text: "text-[#1565c0]", badge: "bg-[#bbdefb] text-[#1565c0]", icon: "text-[#42a5f5]", dot: "bg-[#42a5f5]" },
  liability: { bg: "bg-[#fce4ec]", border: "border-[#f8bbd9]", text: "text-[#c62828]", badge: "bg-[#f8bbd9] text-[#c62828]", icon: "text-[#ef5350]", dot: "bg-[#ef5350]" },
  equity: { bg: "bg-[#f3e5f5]", border: "border-[#e1bee7]", text: "text-[#7b1fa2]", badge: "bg-[#e1bee7] text-[#7b1fa2]", icon: "text-[#ab47bc]", dot: "bg-[#ab47bc]" },
  revenue: { bg: "bg-[#fff8e1]", border: "border-[#ffecb3]", text: "text-[#f57f17]", badge: "bg-[#ffecb3] text-[#f57f17]", icon: "text-[#ffca28]", dot: "bg-[#ffca28]" },
  expense: { bg: "bg-[#e8f5e9]", border: "border-[#c8e6c9]", text: "text-[#2e7d32]", badge: "bg-[#c8e6c9] text-[#2e7d32]", icon: "text-[#66bb6a]", dot: "bg-[#66bb6a]" },
};

const TYPE_LABELS: Record<string, string> = {
  asset: "أصول",
  liability: "خصوم",
  equity: "حقوق ملكية",
  revenue: "إيرادات",
  expense: "مصروفات",
};

const FLOW_LABELS: Record<string, string> = {
  operating: "تشغيلي",
  investing: "استثماري",
  financing: "تمويلي",
  none: "—",
};

const mockAccounts = [
  { id: "11", code: "11", name: "الأصول المتداولة", type: "asset", isGroup: true, hasEntries: true, flow: "operating", children: [
    { id: "111", code: "111", name: "النقدية وما في حكمها", type: "asset", isGroup: true, hasEntries: false, flow: "operating", children: [
      { id: "1111", code: "1111", name: "الخزينة الرئيسية", type: "asset", isGroup: false, hasEntries: true, flow: "operating", balance: "245,000", payOps: true, show: true, tax: false },
      { id: "1112", code: "1112", name: "البنك الأهلي المصري", type: "asset", isGroup: false, hasEntries: true, flow: "operating", balance: "1,200,000", payOps: true, show: true, tax: false },
    ]},
    { id: "112", code: "112", name: "العملاء", type: "asset", isGroup: true, hasEntries: true, flow: "operating", children: [
      { id: "1121", code: "1121", name: "عملاء محليين", type: "asset", isGroup: false, hasEntries: true, flow: "operating", balance: "380,000", payOps: true, show: true, tax: false },
      { id: "1122", code: "1122", name: "عملاء دوليين", type: "asset", isGroup: false, hasEntries: true, flow: "operating", balance: "92,500", payOps: true, show: true, tax: false },
    ]},
  ]},
  { id: "21", code: "21", name: "الخصوم المتداولة", type: "liability", isGroup: true, hasEntries: true, flow: "operating", children: [
    { id: "211", code: "211", name: "الموردين", type: "liability", isGroup: true, hasEntries: true, flow: "operating", children: [
      { id: "2111", code: "2111", name: "موردين محليين", type: "liability", isGroup: false, hasEntries: true, flow: "operating", balance: "380,000", payOps: true, show: true, tax: false },
      { id: "2112", code: "2112", name: "موردين دوليين", type: "liability", isGroup: false, hasEntries: true, flow: "operating", balance: "92,500", payOps: true, show: true, tax: false },
    ]},
  ]},
  { id: "41", code: "41", name: "الإيرادات", type: "revenue", isGroup: true, hasEntries: true, flow: "operating", children: [
    { id: "411", code: "411", name: "إيرادات المبيعات", type: "revenue", isGroup: false, hasEntries: true, flow: "operating", balance: "2,450,000", payOps: true, show: true, tax: false },
    { id: "412", code: "412", name: "إيرادات أخرى", type: "revenue", isGroup: false, hasEntries: true, flow: "operating", balance: "125,000", payOps: true, show: true, tax: false },
  ]},
  { id: "51", code: "51", name: "المصروفات", type: "expense", isGroup: true, hasEntries: true, flow: "operating", children: [
    { id: "511", code: "511", name: "رواتب وأجور", type: "expense", isGroup: false, hasEntries: true, flow: "operating", balance: "890,000", payOps: true, show: true, tax: false },
    { id: "512", code: "512", name: "إيجارات", type: "expense", isGroup: false, hasEntries: true, flow: "operating", balance: "240,000", payOps: true, show: true, tax: false },
  ]},
  { id: "53", code: "53", name: "المصروفات العمومية والإدارية", type: "expense", isGroup: true, hasEntries: true, flow: "operating", children: [
    { id: "531", code: "531", name: "رواتب", type: "expense", isGroup: false, hasEntries: true, flow: "operating", balance: "890,000", payOps: true, show: true, tax: false },
    { id: "532", code: "532", name: "إيجارات", type: "expense", isGroup: false, hasEntries: true, flow: "operating", balance: "240,000", payOps: true, show: true, tax: false },
    { id: "533", code: "533", name: "مرافق", type: "expense", isGroup: false, hasEntries: true, flow: "operating", balance: "45,000", payOps: true, show: true, tax: false },
    { id: "534", code: "534", name: "مصروفات مكتبية", type: "expense", isGroup: false, hasEntries: false, flow: "operating", balance: "0", payOps: false, show: false, tax: false },
    { id: "535", code: "535", name: "أتعاب مهنية", type: "expense", isGroup: false, hasEntries: true, flow: "operating", balance: "60,000", payOps: true, show: true, tax: false },
    { id: "536", code: "536", name: "إهلاك", type: "expense", isGroup: false, hasEntries: true, flow: "operating", balance: "180,000", payOps: true, show: true, tax: false },
    { id: "537", code: "537", name: "مصروفات بنكية", type: "expense", isGroup: false, hasEntries: true, flow: "operating", balance: "12,000", payOps: true, show: true, tax: false },
  ]},
];

function TableRow({
  node,
  depth = 0,
  isExpanded,
  onToggle,
  isDragging,
  showBalance,
  showFlow,
  showPayOps,
  showTax,
}: {
  node: any;
  depth?: number;
  isExpanded: boolean;
  onToggle: () => void;
  isDragging?: boolean;
  showBalance: boolean;
  showFlow: boolean;
  showPayOps: boolean;
  showTax: boolean;
}) {
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isLocked = node.hasEntries;
  const isGroup = node.isGroup;
  const c = COLORS[(node.type as string)] ?? COLORS.asset;
  const indent = depth * 28;

  return (
    <div className={cn("group border-b border-slate-100", c.bg, "hover:bg-white/60 transition-colors")}>
      <div
        className={cn(
          "flex items-center gap-2 py-2.5 px-3",
          isDragging && "opacity-50 bg-blue-50"
        )}
        style={{ paddingInlineStart: indent + 12 }}
      >
        {/* Drag Handle */}
        <GripVertical className="w-4 h-4 text-slate-300 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />

        {/* Expand/Collapse */}
        {hasChildren ? (
          <button onClick={onToggle} className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-700 shrink-0">
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}

        {/* Icon */}
        {isGroup ? (
          <FolderTree className={cn("w-4 h-4 shrink-0", c.icon)} />
        ) : (
          <ArrowRightLeft className="w-4 h-4 text-slate-300 shrink-0" />
        )}

        {/* Code */}
        <span className="font-mono text-sm font-bold text-slate-700 w-12 text-start tabular-nums shrink-0">
          {node.code}
        </span>

        {/* Name */}
        <span className={cn("text-sm font-semibold flex-1", isGroup ? "text-slate-900" : "text-slate-600")}>
          {node.name}
        </span>

        {/* Type Badge */}
        <span className={cn("text-xs px-2 py-0.5 rounded-full font-semibold w-20 text-center shrink-0", c.badge)}>
          {TYPE_LABELS[node.type] ?? node.type}
        </span>

        {/* Cash Flow Type */}
        {showFlow && (
          <span className="text-xs text-slate-500 w-20 text-center shrink-0">
            {FLOW_LABELS[node.flow] ?? "—"}
          </span>
        )}

        {/* Payment Ops Toggle */}
        {showPayOps && (
          <span className="w-24 text-center shrink-0">
            {node.payOps ? (
              <span className="inline-flex items-center gap-1 text-xs text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full font-medium">
                <FileCheck className="w-3 h-3" /> <span>مفعّل</span>
              </span>
            ) : (
              <span className="text-xs text-slate-400">—</span>
            )}
          </span>
        )}

        {/* Show in Tax */}
        {showTax && (
          <span className="w-28 text-center shrink-0">
            {node.show ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                <Eye className="w-3 h-3" /> <span>مفعّل</span>
              </span>
            ) : (
              <span className="text-xs text-slate-400">—</span>
            )}
          </span>
        )}

        {/* Balance */}
        {showBalance && (
          <span className="text-xs text-slate-500 font-mono tabular-nums w-24 text-end shrink-0">
            {node.balance ? `${node.balance} EGP` : "—"}
          </span>
        )}

        {/* Lock / Usage */}
        {isLocked ? (
          <span className="flex items-center gap-1 text-xs text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full w-16 justify-center shrink-0 font-medium" title="مربوط — فيه قيود">
            <Lock className="w-3 h-3" />
            <span>مربوط</span>
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full w-16 justify-center shrink-0 font-medium" title="فارغ — لا قيود">
            <CheckCircle className="w-3 h-3" />
            <span>فارغ</span>
          </span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity w-28 justify-end shrink-0">
          <button className="p-1.5 text-slate-400 hover:text-sky-600 rounded-lg hover:bg-white" title="تعديل">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg hover:bg-white" title="إضافة بنت">
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button className={cn(
            "p-1.5 rounded-lg",
            isLocked ? "text-slate-300 cursor-not-allowed" : "text-slate-400 hover:text-rose-600 hover:bg-white"
          )} title={isLocked ? "مربوط — لا يمكن الحذف" : "حذف"}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-white">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function TreeTable({
  nodes,
  depth = 0,
  expandedIds,
  onToggle,
  draggingId,
  showBalance,
  showFlow,
  showPayOps,
  showTax,
}: {
  nodes: any[];
  depth?: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  draggingId: string | null;
  showBalance: boolean;
  showFlow: boolean;
  showPayOps: boolean;
  showTax: boolean;
}) {
  return (
    <>
      {nodes.map((node, i) => {
        const isExpanded = expandedIds.has(node.id);
        return (
          <div key={node.id}>
            <TableRow
              node={node}
              depth={depth}
              isExpanded={isExpanded}
              onToggle={() => onToggle(node.id)}
              isDragging={draggingId === node.id}
              showBalance={showBalance}
              showFlow={showFlow}
              showPayOps={showPayOps}
              showTax={showTax}
            />
            {isExpanded && node.children && node.children.length > 0 && (
              <TreeTable
                nodes={node.children}
                depth={depth + 1}
                expandedIds={expandedIds}
                onToggle={onToggle}
                draggingId={draggingId}
                showBalance={showBalance}
                showFlow={showFlow}
                showPayOps={showPayOps}
                showTax={showTax}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

function SidebarItem({ icon: Icon, label, active, badge }: { icon: any; label: string; active?: boolean; badge?: string }) {
  return (
    <button className={cn(
      "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
      active ? "bg-white text-slate-800 font-semibold shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
    )}>
      <Icon className={cn("w-4 h-4", active ? "text-[#7c3aed]" : "text-slate-400")} />
      <span className="flex-1 text-start">{label}</span>
      {badge && (
        <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{badge}</span>
      )}
    </button>
  );
}

function InfoPanel({ active }: { active: string | null }) {
  const info: Record<string, { title: string; desc: string; items: string[] }> = {
    drag: {
      title: "السحب والإفلات",
      desc: "اسحب أي حساب باستخدام الأيقونة وأفله تحت أي جمعية. الكود يتغير تلقائياً.",
      items: [
        "الحسابات المربوطة (عليها قيود) لا تنتقل",
        "الكود يتبوت بكود الأب الجديد",
        "الاختلافات تتحدث فوراً للحسابات الجديدة",
      ]
    },
    auto: {
      title: "الترقيم التلقائي",
      desc: "مخطط ذكي يتبع هيكل الكود ويولد الكود المناسب تلقائياً.",
      items: [
        "أب مجموع = البادئة العامة (مثلاً 11, 12, 21)",
        "أب فرع = كود الأب + رقم (مثلاً 111, 112)",
        "بنت = كود الأب + الأب الفرع + رقم (مثلاً 1111)",
        "نبيه: الرقم يزداد من 1 لـ 9 للأبواب الرئيسية",
      ]
    },
    rules: {
      title: "قواعد الأمان",
      desc: "الحسابات المربوطة تبقى سالمة لحماية الميزانيات.",
      items: [
        "الحسابات المالية (ما عليها قيود مباشرة) — لا تنحذف ولا تتنقل",
        "الحسابات الفارغة (صفر وليس عليها قيود) — يمكن المسح والتحريك",
        "الحسابات المجموعات (ما ليسًا لها بنت) — تنتقل مع الأبواب كاملة",
        "لا يمكن نقل البنت لأب من نوع مختلف (مثلاً من أصول لخصوم)",
      ]
    },
    bulk: {
      title: "الإضافة الجماعية",
      desc: "أضف مجموعة حسابات مرتبات في مرة واحدة.",
      items: [
        "أعد البداية (مثلاً 534)",
        "اختر نوع الحسابات (مصروفات / إيرادات)",
        "اختر الأب (لو فيه)",
        "اكتب الأسماء (مثلاً: مصروفات 1, مصروفات 2, ...)",
        "اضغط إضافة — يتولد الكود والمسمى تلقائياً",
      ]
    },
    template: {
      title: "القوابل المخصصة",
      desc: "احفظ الشجرة الحالية كقالب للشركات الجديدة.",
      items: [
        "القالب الافتراضي = المالي المخصصة للمؤسسات التجارية",
        "مخصصات للخدمات وللمقاولات وللصناعة",
        "كل مؤسسة تبدأ بالقالب الافتراضي بالإضافة لكود الترقيم التلقائي",
        "يمكن المؤسسة ترجع إلى القالب المصري في أي وقت",
      ]
    },
    history: {
      title: "المراجعات والتاريخ",
      desc: "لوج كامل للتعديلات والمراجعات على الشجرة.",
      items: [
        "اربط الفاعل بالالتعديلات (مان: نجي - متاخرل)",
        "لوج التعديلات (التاريخ / المستخدم / الالتعديل / الالسبب)",
        "امكانية المراجعة لأي التعديلات قبل الربام المالي",
        "لا يمكن التراجع لاعب قواعد التالي (lock) لاحقة للفان",
      ]
    },
  };

  const data = active ? info[active] : null;
  if (!data) return (
    <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
      <ArrowUpDown className="w-12 h-12 mb-4 text-slate-300" />
      <p className="text-sm font-medium">اختر ميزة للمشاهدة</p>
      <p className="text-xs mt-2">اضغط على أي اختيار من الأعلى</p>
    </div>
  );

  return (
    <div className="h-full overflow-auto p-6">
      <h3 className="text-lg font-bold text-slate-800 mb-2">{data.title}</h3>
      <p className="text-sm text-slate-500 mb-6">{data.desc}</p>
      <ul className="space-y-3">
        {data.items.map((item, i) => (
          <li key={i} className="flex items-start gap-3 text-sm text-slate-700">
            <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
              {i + 1}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProfessionalChart() {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(["11", "21", "41", "51", "53", "111", "112", "211", "1111", "1112", "1121", "1122", "2111", "2112"])
  );
  const [activeFeature, setActiveFeature] = useState<string>("drag");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [showBulk, setShowBulk] = useState(false);
  const [showBalance, setShowBalance] = useState(true);
  const [showFlow, setShowFlow] = useState(true);
  const [showPayOps, setShowPayOps] = useState(true);
  const [showTax, setShowTax] = useState(true);
  const [search, setSearch] = useState("");

  const toggle = (id: string) => {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedIds(next);
  };

  const features = [
    { id: "drag", label: "سحب & إفلات", icon: ArrowUpDown },
    { id: "auto", label: "الكود التلقائي", icon: FolderTree },
    { id: "rules", label: "قواعد الأمان", icon: Lock },
    { id: "bulk", label: "إضافة جماعية", icon: ArrowUpDown },
    { id: "template", label: "القوابل المخصصة", icon: CircleDollarSign },
    { id: "history", label: "المراجعات", icon: Wallet },
  ];

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans flex" dir="rtl">
      {/* Sidebar */}
      <div className="w-64 bg-[#f1f5f9] border-l border-slate-200 flex flex-col">
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#7c3aed] flex items-center justify-center">
              <span className="text-white font-bold text-sm">و</span>
            </div>
            <span className="font-bold text-slate-800 text-sm">وافق</span>
          </div>
        </div>
        <div className="p-2 space-y-0.5 overflow-auto">
          <SidebarItem icon={LayoutDashboard} label="ملخص الرئيسي" />
          <SidebarItem icon={ShoppingCart} label="المبيعات" />
          <SidebarItem icon={ShoppingCart} label="المشتريات" />
          <SidebarItem icon={Users} label="الرواتب والموظفين" />
          <SidebarItem icon={Calculator} label="المحاسبة" active />
          <SidebarItem icon={BarChart3} label="التقارير" />
          <SidebarItem icon={FileText} label="المخزون" />
          <SidebarItem icon={Wallet} label="البنوك والنقدية" />
          <SidebarItem icon={Briefcase} label="المخزن" />
          <SidebarItem icon={Boxes} label="المخزون" />
        </div>
        <div className="mt-auto p-2 border-t border-slate-200">
          <SidebarItem icon={HelpCircle} label="المساعدة" />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6">
        <div className="max-w-[1400px] mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
                <span>المحاسبة</span>
                <ChevronLeft className="w-4 h-4" />
                <span className="text-slate-800 font-semibold">شجرة الحسابات</span>
              </div>
              <h1 className="text-xl font-bold text-slate-800">شجرة الحسابات الديناميكية</h1>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-3 py-2">
                <Search className="w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="البحث في الحسابات..."
                  className="bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none w-56"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="p-0.5 text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Feature Switcher */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 mb-4 overflow-x-auto">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <button
                  key={f.id}
                  onClick={() => setActiveFeature(f.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors shrink-0",
                    activeFeature === f.id
                      ? "bg-[#7c3aed] text-white"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{f.label}</span>
                </button>
              );
            })}
          </div>

          {/* Main Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Table Panel */}
            <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              {/* Toolbar */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 flex-wrap">
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#7c3aed] text-white text-sm font-medium rounded-lg hover:bg-[#6d28d9]">
                  <Plus className="w-4 h-4" />
                  <span>حساب جديد</span>
                </button>
                <button
                  onClick={() => setShowBulk(!showBulk)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border",
                    showBulk ? "bg-sky-50 text-sky-700 border-sky-200" : "text-slate-600 border-slate-200 hover:bg-slate-50"
                  )}
                >
                  <ArrowUpDown className="w-4 h-4" />
                  <span>إضافة جماعية</span>
                </button>
                <div className="flex-1" />
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowBalance(!showBalance)}
                    className={cn("p-1.5 rounded-lg text-xs", showBalance ? "bg-slate-100 text-slate-700" : "text-slate-400 hover:bg-slate-50")}
                    title="الرصيد"
                  >
                    <CircleDollarSign className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowFlow(!showFlow)}
                    className={cn("p-1.5 rounded-lg text-xs", showFlow ? "bg-slate-100 text-slate-700" : "text-slate-400 hover:bg-slate-50")}
                    title="التدفق النقدي"
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowPayOps(!showPayOps)}
                    className={cn("p-1.5 rounded-lg text-xs", showPayOps ? "bg-slate-100 text-slate-700" : "text-slate-400 hover:bg-slate-50")}
                    title="عمليات الدفع"
                  >
                    <FileCheck className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowTax(!showTax)}
                    className={cn("p-1.5 rounded-lg text-xs", showTax ? "bg-slate-100 text-slate-700" : "text-slate-400 hover:bg-slate-50")}
                    title="المطالبات"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50">
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Bulk Input */}
              {showBulk && (
                <div className="px-4 py-3 bg-sky-50 border-b border-sky-100">
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-sky-700 font-medium mb-1 block">الأسماء (كل سطر)</label>
                      <textarea
                        className="w-full text-sm border border-sky-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none"
                        rows={3}
                        placeholder="رواتب المباشرة\nإيجارات المكتب\nمصروفات التشغيل"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-sky-700 font-medium mb-1 block">الأب</label>
                      <select className="text-sm border border-sky-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300">
                        <option>53 — المصروفات العمومية</option>
                        <option>52 — تكلفة المبيعات</option>
                      </select>
                    </div>
                    <button className="px-4 py-2 bg-sky-600 text-white text-sm font-medium rounded-lg hover:bg-sky-700">
                      إضافة
                    </button>
                  </div>
                </div>
              )}

              {/* Table Header */}
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 text-xs font-medium text-slate-500 border-b border-slate-100">
                <span className="w-4 shrink-0" />
                <span className="w-4 shrink-0" />
                <span className="w-12 text-start shrink-0">رقم الحساب</span>
                <span className="flex-1">اسم الحساب</span>
                <span className="w-20 text-center shrink-0">نوع الحساب</span>
                {showFlow && <span className="w-20 text-center shrink-0">نوع التدفق النقدي</span>}
                {showPayOps && <span className="w-24 text-center shrink-0">تفعيل عمليات الدفع</span>}
                {showTax && <span className="w-28 text-center shrink-0">إظهار في مطالبات المصر</span>}
                {showBalance && <span className="w-24 text-end shrink-0">الرصيد</span>}
                <span className="w-16 text-center shrink-0">الحالة</span>
                <span className="w-28 shrink-0" />
              </div>

              {/* Table Content */}
              <div className="overflow-auto">
                <TreeTable
                  nodes={mockAccounts}
                  expandedIds={expandedIds}
                  onToggle={toggle}
                  draggingId={draggingId}
                  showBalance={showBalance}
                  showFlow={showFlow}
                  showPayOps={showPayOps}
                  showTax={showTax}
                />
              </div>
            </div>

            {/* Info Panel */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <InfoPanel active={activeFeature} />
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-6 mt-4 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Lock className="w-3 h-3 text-rose-500" /> <span className="text-rose-600 font-medium">مربوط</span> — فيه قيود
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-emerald-500" /> <span className="text-emerald-600 font-medium">فارغ</span> — لا قيود
            </span>
            <span className="flex items-center gap-1">
              <GripVertical className="w-3 h-3 text-slate-400" /> مسك للسحب
            </span>
            <span className="flex items-center gap-1">
              <ChevronDown className="w-3 h-3 text-slate-400" /> كليك للتوسيع/الطي
            </span>
            <span className="flex items-center gap-1">
              <ArrowLeftRight className="w-3 h-3 text-slate-400" /> يمكن إخفاء/إظهار الأعمدة من الأعلى
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
