import React, { useState } from "react";
import {
  TreePine,
  ChevronDown,
  ChevronRight,
  Plus,
  GripVertical,
  Lock,
  Unlock,
  AlertCircle,
  CheckCircle,
  MoreHorizontal,
  Pencil,
  Trash2,
  FolderTree,
  Copy,
  ArrowRightLeft,
  Settings,
  Save,
  History
} from "lucide-react";
import { cn } from "@/lib/utils";

const COLORS = {
  asset: "bg-sky-50 border-sky-200 text-sky-800",
  liability: "bg-rose-50 border-rose-200 text-rose-800",
  equity: "bg-violet-50 border-violet-200 text-violet-800",
  revenue: "bg-emerald-50 border-emerald-200 text-emerald-800",
  expense: "bg-amber-50 border-amber-200 text-amber-800",
};

const BADGES = {
  asset: "bg-sky-100 text-sky-700",
  liability: "bg-rose-100 text-rose-700",
  equity: "bg-violet-100 text-violet-700",
  revenue: "bg-emerald-100 text-emerald-700",
  expense: "bg-amber-100 text-amber-700",
};

const TYPE_LABELS: Record<string, string> = {
  asset: "أصول",
  liability: "خصوم",
  equity: "حقوق ملكية",
  revenue: "إيرادات",
  expense: "مصروفات",
};

const mockAccounts = [
  {
    id: "1",
    code: "11",
    name: "الأصول المتداولة",
    type: "asset",
    isGroup: true,
    hasEntries: true,
    children: [
      { id: "11", code: "111", name: "النقدية وما في حكمها", type: "asset", isGroup: true, hasEntries: false, children: [
        { id: "111", code: "1111", name: "الخزينة الرئيسية", type: "asset", isGroup: false, hasEntries: true, children: [], balance: "245,000 EGP" },
        { id: "112", code: "1112", name: "البنك الأهلي المصري", type: "asset", isGroup: false, hasEntries: true, children: [], balance: "1,200,000 EGP" },
      ]},
      { id: "13", code: "113", name: "العهد والسلف", type: "asset", isGroup: true, hasEntries: false, children: [
        { id: "131", code: "1131", name: "عهد الموظفين", type: "asset", isGroup: false, hasEntries: true, children: [], balance: "15,000 EGP" },
      ]},
    ]
  },
  {
    id: "2",
    code: "21",
    name: "الخصوم المتداولة",
    type: "liability",
    isGroup: true,
    hasEntries: true,
    children: [
      { id: "21", code: "211", name: "الموردين", type: "liability", isGroup: true, hasEntries: true, children: [
        { id: "211", code: "2111", name: "موردين محليين", type: "liability", isGroup: false, hasEntries: true, children: [], balance: "380,000 EGP" },
        { id: "212", code: "2112", name: "موردين دوليين", type: "liability", isGroup: false, hasEntries: true, children: [], balance: "92,500 EGP" },
      ]},
      { id: "22", code: "22", name: "الخصوم طويلة الأجل", type: "liability", isGroup: true, hasEntries: false, children: [
        { id: "221", code: "221", name: "القروض طويلة الأجل", type: "liability", isGroup: false, hasEntries: false, children: [], balance: "0 EGP" },
      ]},
    ]
  },
  {
    id: "3",
    code: "41",
    name: "الإيرادات",
    type: "revenue",
    isGroup: true,
    hasEntries: true,
    children: [
      { id: "41", code: "411", name: "إيرادات المبيعات", type: "revenue", isGroup: false, hasEntries: true, children: [], balance: "2,450,000 EGP" },
      { id: "42", code: "412", name: "إيرادات أخرى", type: "revenue", isGroup: false, hasEntries: true, children: [
        { id: "421", code: "4121", name: "دخل متنوع", type: "revenue", isGroup: false, hasEntries: false, children: [], balance: "0 EGP" },
        { id: "422", code: "4122", name: "إيرادات غير تشغيلية", type: "revenue", isGroup: false, hasEntries: false, children: [], balance: "0 EGP" },
      ]},
    ]
  },
  {
    id: "5",
    code: "53",
    name: "المصروفات العمومية والإدارية",
    type: "expense",
    isGroup: true,
    hasEntries: true,
    children: [
      { id: "531", code: "531", name: "رواتب", type: "expense", isGroup: false, hasEntries: true, children: [], balance: "890,000 EGP" },
      { id: "532", code: "532", name: "إيجارات", type: "expense", isGroup: false, hasEntries: true, children: [], balance: "240,000 EGP" },
      { id: "533", code: "533", name: "مرافق", type: "expense", isGroup: false, hasEntries: true, children: [], balance: "45,000 EGP" },
      { id: "534", code: "534", name: "مصروفات مكتبية", type: "expense", isGroup: false, hasEntries: false, children: [], balance: "0 EGP" },
      { id: "535", code: "535", name: "أتعاب مهنية", type: "expense", isGroup: false, hasEntries: true, children: [], balance: "60,000 EGP" },
      { id: "536", code: "536", name: "إهلاك", type: "expense", isGroup: false, hasEntries: true, children: [], balance: "180,000 EGP" },
      { id: "537", code: "537", name: "مصروفات بنكية", type: "expense", isGroup: false, hasEntries: true, children: [], balance: "12,000 EGP" },
    ]
  },
];

type AccountNode = {
  id: string;
  code: string;
  name: string;
  type: string;
  isGroup: boolean;
  hasEntries: boolean;
  balance?: string;
  children?: AccountNode[];
};

function TreeRow({
  node,
  depth = 0,
  isExpanded,
  onToggle,
  isLast,
  isDragging,
}: {
  node: AccountNode;
  depth?: number;
  isExpanded: boolean;
  onToggle: () => void;
  isLast?: boolean;
  isDragging?: boolean;
}) {
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isLocked = node.hasEntries;
  const isUnused = !node.hasEntries && !node.isGroup;
  const isGroup = node.isGroup;

  const indent = depth * 28;

  return (
    <div className="group">
      <div
        className={cn(
          "relative flex items-center gap-2 border-b border-slate-100 py-2.5 px-3 transition-colors hover:bg-slate-50",
          isDragging && "opacity-50 bg-blue-50"
        )}
        style={{ paddingInlineStart: indent + 12 }}
      >
        {/* Drag Handle */}
        <GripVertical className="w-4 h-4 text-slate-300 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* Expand/Collapse */}
        {hasChildren ? (
          <button onClick={onToggle} className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-700">
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        ) : (
          <span className="w-5" />
        )}

        {/* Icon */}
        {isGroup ? (
          <FolderTree className="w-4 h-4 text-slate-400" />
        ) : (
          <ArrowRightLeft className="w-4 h-4 text-slate-300" />
        )}

        {/* Code */}
        <span className="font-mono text-sm font-semibold text-slate-600 w-12 text-start tabular-nums">
          {node.code}
        </span>

        {/* Name */}
        <span className={cn(
          "text-sm font-medium flex-1",
          isGroup ? "text-slate-800" : "text-slate-600"
        )}>
          {node.name}
        </span>

        {/* Type Badge */}
        <span className={cn(
          "text-xs px-2 py-0.5 rounded-full font-medium",
          BADGES[node.type] ?? "bg-slate-100 text-slate-600"
        )}>
          {TYPE_LABELS[node.type] ?? node.type}
        </span>

        {/* Lock / Usage Indicator */}
        {isLocked ? (
          <span className="flex items-center gap-1 text-xs text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full">
            <Lock className="w-3 h-3" />
            <span>مربوط</span>
          </span>
        ) : isUnused ? (
          <span className="flex items-center gap-1 text-xs text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full">
            <CheckCircle className="w-3 h-3" />
            <span>فارغ</span>
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">
            <Unlock className="w-3 h-3" />
            <span>فارغ</span>
          </span>
        )}

        {/* Balance */}
        {node.balance && (
          <span className="text-xs text-slate-400 font-mono tabular-nums w-28 text-end">
            {node.balance}
          </span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="p-1 text-slate-400 hover:text-sky-600 rounded" title="تعديل">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button className="p-1 text-slate-400 hover:text-emerald-600 rounded" title="إضافة بنت">
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button className={cn(
            "p-1 rounded",
            isLocked ? "text-slate-300 cursor-not-allowed" : "text-slate-400 hover:text-rose-600"
          )} title={isLocked ? "مربوط — لا يمكن الحذف" : "حذف"}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button className="p-1 text-slate-400 hover:text-slate-600 rounded">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Drop Zone Indicator */}
      {isDragging && (
        <div className="mx-3 h-8 border-2 border-dashed border-blue-300 rounded-lg bg-blue-50 flex items-center justify-center text-xs text-blue-500">
          <span>أفلت الحساب هنا</span>
        </div>
      )}
    </div>
  );
}

function TreeView({
  nodes,
  depth = 0,
  expandedIds,
  onToggle,
  draggingId,
}: {
  nodes: AccountNode[];
  depth?: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  draggingId: string | null;
}) {
  return (
    <>
      {nodes.map((node, i) => {
        const isExpanded = expandedIds.has(node.id);
        return (
          <div key={node.id}>
            <TreeRow
              node={node}
              depth={depth}
              isExpanded={isExpanded}
              onToggle={() => onToggle(node.id)}
              isLast={i === nodes.length - 1}
              isDragging={draggingId === node.id}
            />
            {isExpanded && node.children && node.children.length > 0 && (
              <TreeView
                nodes={node.children}
                depth={depth + 1}
                expandedIds={expandedIds}
                onToggle={onToggle}
                draggingId={draggingId}
              />
            )}
          </div>
        );
      })}
    </>
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
      title: "التاريخ والمراجعات",
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
      <TreePine className="w-12 h-12 mb-4 text-slate-300" />
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

export function DynamicChart() {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(["1", "2", "3", "5", "11", "21", "41", "13", "22", "42"])
  );
  const [activeFeature, setActiveFeature] = useState<string>("drag");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [showBulk, setShowBulk] = useState(false);

  const toggle = (id: string) => {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedIds(next);
  };

  const features = [
    { id: "drag", label: "سحب & إفلات", icon: ArrowRightLeft },
    { id: "auto", label: "الكود التلقائي", icon: FolderTree },
    { id: "rules", label: "قواعد الأمان", icon: Lock },
    { id: "bulk", label: "الإضافة الجماعية", icon: Copy },
    { id: "template", label: "القوابل المخصصة", icon: Save },
    { id: "history", label: "المراجعات", icon: History },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans" dir="rtl">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center">
              <TreePine className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">شجرة الحسابات الديناميكية</h1>
              <p className="text-xs text-slate-500">تصور وفهم ميزات الشجرة القابلة للتعديل والادارة</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg">
              هذا موكب تصوري — للمشاهدة فقط
            </span>
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
                    ? "bg-slate-800 text-white"
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Tree Panel */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
              <button className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700">
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
                <Copy className="w-4 h-4" />
                <span>إضافة جماعية</span>
              </button>
              <div className="flex-1" />
              <button className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50">
                <Settings className="w-4 h-4" />
              </button>
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

            {/* Tree Header */}
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 text-xs font-medium text-slate-500 border-b border-slate-100">
              <span className="w-4" />
              <span className="w-4" />
              <span className="w-12 text-start">الكود</span>
              <span className="flex-1">الاسم</span>
              <span className="w-16 text-center">النوع</span>
              <span className="w-20 text-center">الحالة</span>
              <span className="w-28 text-end">الرصيد</span>
              <span className="w-24" />
            </div>

            {/* Tree Content */}
            <div className="overflow-auto">
              <TreeView
                nodes={mockAccounts}
                expandedIds={expandedIds}
                onToggle={toggle}
                draggingId={draggingId}
              />
            </div>
          </div>

          {/* Info Panel */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <InfoPanel active={activeFeature} />
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Lock className="w-3 h-3 text-rose-500" /> <span className="text-rose-600">مربوط</span> — فيه قيود
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-emerald-500" /> <span className="text-emerald-600">فارغ</span> — لا قيود
          </span>
          <span className="flex items-center gap-1">
            <GripVertical className="w-3 h-3 text-slate-400" /> مسك للسحب
          </span>
          <span className="flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-amber-500" /> كليك للإفلات
          </span>
        </div>
      </div>
    </div>
  );
}
