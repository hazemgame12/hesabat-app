import React, { useState } from "react";
import { 
  useListAccounts, 
  useCreateAccount, 
  useUpdateAccount, 
  useDeleteAccount,
  getListAccountsQueryKey,
  getGetDashboardSummaryQueryKey,
  type Account,
  type AccountInput
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Search, SlidersHorizontal, Plus, ChevronDown, ChevronLeft, Check, X, Download, ToggleRight, Trash2, Edit2 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const typeLabels: Record<string, string> = {
  asset: "الأصول",
  liability: "الخصوم",
  equity: "حقوق الملكية",
  revenue: "الإيرادات",
  expense: "المصروفات",
};

const accountSchema = z.object({
  code: z.string().min(1, "كود الحساب مطلوب"),
  name: z.string().min(1, "اسم الحساب مطلوب"),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  parentId: z.string().nullable().optional(),
  isGroup: z.boolean().default(false),
});

type TreeNode = Account & {
  children?: TreeNode[];
};

function buildTree(accounts: Account[]): Record<string, TreeNode[]> {
  const tree: Record<string, TreeNode[]> = {
    "الأصول": [],
    "الخصوم": [],
    "حقوق الملكية": [],
    "الإيرادات": [],
    "المصروفات": [],
  };

  const accountMap = new Map<string, TreeNode>();
  accounts.forEach(acc => {
    accountMap.set(acc.id, { ...acc, children: [] });
  });

  accounts.forEach(acc => {
    const node = accountMap.get(acc.id)!;
    if (acc.parentId) {
      const parent = accountMap.get(acc.parentId);
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(node);
      }
    } else {
      const groupName = typeLabels[acc.type];
      if (groupName && tree[groupName]) {
        tree[groupName].push(node);
      }
    }
  });

  // Sort nodes by code
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.code.localeCompare(b.code));
    nodes.forEach(n => {
      if (n.children) sortNodes(n.children);
    });
  };
  Object.values(tree).forEach(sortNodes);

  return tree;
}

export function Accounts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: accounts = [], isLoading } = useListAccounts();
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();

  const [activeTab, setActiveTab] = useState("الكل");
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [accountToEdit, setAccountToEdit] = useState<Account | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);

  const tree = buildTree(accounts);
  const groups = Object.keys(tree).filter((g) => activeTab === "الكل" || g === activeTab);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<z.infer<typeof accountSchema>>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      type: "asset",
      isGroup: false,
      parentId: null
    }
  });

  const isGroup = watch("isGroup");

  const openCreateModal = () => {
    reset({
      code: "",
      name: "",
      type: "asset",
      parentId: null,
      isGroup: false
    });
    setModalMode("create");
  };

  const openEditModal = (account: Account) => {
    reset({
      code: account.code,
      name: account.name,
      type: account.type as any,
      parentId: account.parentId,
      isGroup: account.isGroup
    });
    setAccountToEdit(account);
    setModalMode("edit");
  };

  const closeModals = () => {
    setModalMode(null);
    setAccountToEdit(null);
  };

  const onSubmit = (data: z.infer<typeof accountSchema>) => {
    if (modalMode === "create") {
      createAccount.mutate({ data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          toast({ title: "تم إضافة الحساب بنجاح" });
          closeModals();
        },
        onError: (err: any) => {
          toast({ variant: "destructive", title: "خطأ", description: err?.data?.error || "تعذر إضافة الحساب" });
        }
      });
    } else if (modalMode === "edit" && accountToEdit) {
      updateAccount.mutate({ id: accountToEdit.id, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          toast({ title: "تم تعديل الحساب بنجاح" });
          closeModals();
        },
        onError: (err: any) => {
          toast({ variant: "destructive", title: "خطأ", description: err?.data?.error || "تعذر تعديل الحساب" });
        }
      });
    }
  };

  const handleDelete = () => {
    if (!accountToDelete) return;
    deleteAccount.mutate({ id: accountToDelete.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        toast({ title: "تم حذف الحساب بنجاح" });
        setAccountToDelete(null);
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "خطأ", description: err?.data?.error || "تعذر حذف الحساب" });
        setAccountToDelete(null);
      }
    });
  };

  const TreeRow = ({ node, depth }: { node: TreeNode; depth: number }) => {
    const hasChildren = !!node.children?.length;
    const [open, setOpen] = useState(depth < 2);
    
    return (
      <>
        <div
          className="group flex items-center gap-3 py-2.5 pl-4 rounded-lg hover:bg-muted/60 transition-colors cursor-pointer"
          style={{ paddingRight: 12 + depth * 26 }}
        >
          <button 
            className="w-5 flex-shrink-0 text-muted-foreground flex items-center justify-center"
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          >
            {hasChildren ? (
              open ? <ChevronDown className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />
            ) : null}
          </button>
          
          <div className="flex-1 flex items-center gap-3" onClick={() => hasChildren && setOpen((o) => !o)}>
            <span className="font-sans text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-md flex-shrink-0 min-w-12 text-center" dir="ltr">
              {node.code}
            </span>
            <span className={`text-sm ${node.isGroup ? "font-bold text-foreground" : "font-medium text-foreground/90"}`}>
              {node.name}
            </span>
            {node.isGroup && (
              <span className="text-[11px] font-bold text-secondary-foreground bg-secondary px-2 py-0.5 rounded-full flex-shrink-0">
                حساب رئيسي
              </span>
            )}
          </div>

          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 flex-shrink-0 px-2">
            <button 
              onClick={(e) => { e.stopPropagation(); openEditModal(node); }}
              className="p-1.5 rounded-md hover:bg-primary/10 text-primary transition-colors"
              title="تعديل"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); setAccountToDelete(node); }}
              className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive transition-colors"
              title="حذف"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        {hasChildren && open && (
          <div>
            {node.children!.map((c) => (
              <TreeRow key={c.id} node={c} depth={depth + 1} />
            ))}
          </div>
        )}
      </>
    );
  };

  const groupMeta: Record<string, { color: string; count: number }> = {
    الأصول: { color: "bg-primary", count: tree["الأصول"]?.length || 0 },
    الخصوم: { color: "bg-destructive", count: tree["الخصوم"]?.length || 0 },
    "حقوق الملكية": { color: "bg-secondary-foreground", count: tree["حقوق الملكية"]?.length || 0 },
    الإيرادات: { color: "bg-success", count: tree["الإيرادات"]?.length || 0 },
    المصروفات: { color: "bg-amber-500", count: tree["المصروفات"]?.length || 0 },
  };

  return (
    <div className="flex flex-col min-h-screen">
      <header className="h-20 bg-background/80 backdrop-blur-md border-b sticky top-0 z-10 flex items-center justify-between px-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-card border shadow-sm flex items-center justify-center text-primary">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">شجرة الحسابات</h1>
            <p className="text-sm text-muted-foreground font-medium">إدارة الدليل المحاسبي للشركة</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            إضافة حساب
          </button>
        </div>
      </header>

      <div className="p-8 flex flex-col gap-6 max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Object.entries(groupMeta).map(([name, meta]) => (
            <div key={name} className="bg-card border rounded-xl p-4 flex flex-col gap-2 relative overflow-hidden shadow-sm">
              <div className={`absolute right-0 top-0 bottom-0 w-1 ${meta.color}`} />
              <span className="text-xs font-semibold text-muted-foreground">{name}</span>
              <span className="font-sans text-lg font-bold tabular-nums">
                {accounts.filter(a => typeLabels[a.type] === name).length}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-b pb-px overflow-x-auto">
          {["الكل", ...Object.keys(tree)].map((t) => (
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
        </div>

        <div className="bg-card border rounded-2xl shadow-sm overflow-hidden min-h-[400px]">
          <div className="flex items-center gap-3 px-6 py-3 border-b bg-muted/40 text-xs font-bold text-muted-foreground">
            <span className="w-5" />
            <span className="w-12 text-center">الكود</span>
            <span className="flex-1">اسم الحساب</span>
            <span className="w-20" />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Spinner className="w-8 h-8 text-primary" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
              <p>لا توجد حسابات بعد.</p>
              <button onClick={openCreateModal} className="mt-4 text-primary font-bold hover:underline">
                أضف حسابك الأول
              </button>
            </div>
          ) : (
            <div className="p-3 flex flex-col gap-4">
              {groups.map((g) => {
                if (tree[g].length === 0) return null;
                return (
                  <div key={g}>
                    <div className="flex items-center gap-3 px-4 py-2 mb-1">
                      <span className={`w-2.5 h-2.5 rounded-sm ${groupMeta[g].color}`} />
                      <h3 className="text-sm font-extrabold text-foreground">{g}</h3>
                    </div>
                    <div className="flex flex-col">
                      {tree[g].map((node) => (
                        <TreeRow key={node.id} node={node} depth={1} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={closeModals} />
          <form onSubmit={handleSubmit(onSubmit)} className="relative bg-card rounded-2xl shadow-2xl w-full max-w-lg border flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" />
                <h2 className="text-base font-bold text-foreground">
                  {modalMode === "create" ? "إضافة حساب جديد" : "تعديل الحساب"}
                </h2>
              </div>
              <button type="button" onClick={closeModals} className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-5 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-foreground">كود الحساب</label>
                  <input
                    dir="ltr"
                    className="bg-background border rounded-xl h-11 px-4 text-sm font-sans font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    {...register("code")}
                  />
                  {errors.code && <span className="text-xs text-destructive">{errors.code.message}</span>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-foreground">نوع الحساب</label>
                  <div className="relative">
                    <select 
                      className="w-full appearance-none bg-background border rounded-xl h-11 pr-4 pl-10 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      {...register("type")}
                    >
                      {Object.entries(typeLabels).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
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
                  {...register("name")}
                />
                {errors.name && <span className="text-xs text-destructive">{errors.name.message}</span>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold text-foreground">الحساب الأب (اختياري)</label>
                <div className="relative">
                  <select 
                    className="w-full appearance-none bg-background border rounded-xl h-11 pr-4 pl-10 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    {...register("parentId")}
                  >
                    <option value="">-- بدون حساب أب --</option>
                    {accounts.filter(a => a.isGroup && a.id !== accountToEdit?.id).map(a => (
                      <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              <div className="flex items-center justify-between bg-secondary/40 border border-secondary rounded-xl px-4 py-3 cursor-pointer" onClick={() => setValue("isGroup", !isGroup)}>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-foreground">حساب رئيسي (تجميعي)</span>
                  <span className="text-xs text-muted-foreground">لا يمكن القيد عليه مباشرة، يجمع الحسابات الفرعية</span>
                </div>
                <div className={`w-10 h-6 rounded-full flex items-center transition-colors px-0.5 ${isGroup ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${isGroup ? '-translate-x-4' : 'translate-x-0'}`} />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/30">
              <button
                type="button"
                onClick={closeModals}
                className="px-5 py-2.5 rounded-full text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
              >
                إلغاء
              </button>
              <button 
                type="submit" 
                disabled={createAccount.isPending || updateAccount.isPending}
                className="flex items-center gap-2 bg-primary text-primary-foreground shadow-md shadow-primary/20 px-5 py-2.5 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
              >
                <Check className="w-4 h-4" />
                {createAccount.isPending || updateAccount.isPending ? "جاري الحفظ..." : "حفظ الحساب"}
              </button>
            </div>
          </form>
        </div>
      )}

      <AlertDialog open={!!accountToDelete} onOpenChange={(open) => !open && setAccountToDelete(null)}>
        <AlertDialogContent dir="rtl" className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">حذف الحساب</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              هل أنت متأكد من حذف الحساب "{accountToDelete?.name}"؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              {deleteAccount.isPending ? "جاري الحذف..." : "تأكيد الحذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}