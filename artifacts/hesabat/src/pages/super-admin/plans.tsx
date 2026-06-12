import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Plus, Trash2, Pencil, Check, X, Globe, Eye, EyeOff, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const PREDEFINED_FEATURES = [
  "جميع ميزات البرنامج",
  "مستخدم واحد (1)",
  "حتى 3 مستخدمين",
  "حتى 10 مستخدمين",
  "حتى 50 مستخدمين",
  "مستخدمين غير محدودين",
  "قيود يومية",
  "فواتير مبيعات ومشتريات",
  "تقارير مالية متكاملة",
  "ضرائب حسب الدولة",
  "إدارة عملاء وموردين",
  "مخزون وجرد",
  "أصول ثابتة وإهلاك",
  "بنوك وتسويات",
  "مرتبات وعهد وسلف",
  "نقل بيانات مجاني",
  "دعم 24/7",
  "دعم بالبريد",
  "دعم أولوي",
  "تكامل مخصص",
];

const COUNTRY_NAMES: Record<string, string> = {
  EG: "🇪🇬 مصر",
  SA: "🇸🇦 السعودية",
  AE: "🇦🇪 الإمارات",
  KW: "🇰🇼 الكويت",
  QA: "🇶🇦 قطر",
  BH: "🇧🇭 البحرين",
  OM: "🇴🇲 عمان",
  JO: "🇯🇴 الأردن",
  IQ: "🇮🇶 العراق",
  LB: "🇱🇧 لبنان",
};

const CURRENCIES: Record<string, string> = {
  EG: "EGP", SA: "SAR", AE: "AED", KW: "KWD",
  QA: "QAR", BH: "BHD", OM: "OMR", JO: "JOD", IQ: "IQD", LB: "LBP",
};

const EMPTY_PLAN = {
  nameAr: "",
  nameEn: "",
  country: "EG",
  maxUsers: 5,
  maxTransactions: 10000,
  price: "",
  currency: "EGP",
  billingCycle: "monthly",
  features: [] as string[],
  showOnLanding: true,
  order: 0,
};

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/* ─── Inline-editable plan row ─── */
function PlanRow({ plan, onDelete }: { plan: any; onDelete: (id: string) => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    nameAr: plan.nameAr ?? "",
    nameEn: plan.nameEn ?? "",
    price: String(plan.price ?? ""),
    currency: plan.currency ?? "EGP",
    billingCycle: plan.billingCycle ?? "monthly",
    maxUsers: plan.maxUsers ?? 5,
    maxTransactions: plan.maxTransactions ?? 10000,
    features: (plan.features ?? []) as string[],
    showOnLanding: plan.showOnLanding ?? true,
    order: plan.order ?? 0,
  });
  const [featureInput, setFeatureInput] = useState("");

  const update = useMutation({
    mutationFn: (data: any) =>
      apiFetch(`/api/super-admin/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-plans"] });
      setEditing(false);
      toast({ title: t("common.success") });
    },
    onError: (err: Error) =>
      toast({ title: t("common.error"), description: err.message, variant: "destructive" }),
  });

  const toggleLanding = useMutation({
    mutationFn: () =>
      apiFetch(`/api/super-admin/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showOnLanding: !plan.showOnLanding }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["super-admin-plans"] }),
    onError: (err: Error) =>
      toast({ title: t("common.error"), description: err.message, variant: "destructive" }),
  });

  const addFeature = (val: string) => {
    const text = val.trim();
    if (!text || form.features.includes(text)) return;
    setForm((p) => ({ ...p, features: [...p.features, text] }));
    setFeatureInput("");
  };

  const removeFeature = (i: number) =>
    setForm((p) => ({ ...p, features: p.features.filter((_, idx) => idx !== i) }));

  const cancelEdit = () => {
    setForm({
      nameAr: plan.nameAr ?? "",
      nameEn: plan.nameEn ?? "",
      price: String(plan.price ?? ""),
      currency: plan.currency ?? "EGP",
      billingCycle: plan.billingCycle ?? "monthly",
      maxUsers: plan.maxUsers ?? 5,
      maxTransactions: plan.maxTransactions ?? 10000,
      features: (plan.features ?? []) as string[],
      showOnLanding: plan.showOnLanding ?? true,
      order: plan.order ?? 0,
    });
    setEditing(false);
  };

  if (!editing) {
    return (
      <Card className="hover:shadow-sm transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                plan.showOnLanding ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              }`}>
                <CreditCard className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-foreground">
                  {plan.nameAr}
                  {plan.nameEn && <span className="text-muted-foreground font-normal ms-2 text-sm">/ {plan.nameEn}</span>}
                </div>
                <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                  <span className="font-medium text-[#1e3a5f]">
                    {Number(plan.price).toLocaleString()} {plan.currency}
                    <span className="text-muted-foreground font-normal">
                      {" / "}{plan.billingCycle === "monthly" ? "شهري" : plan.billingCycle === "yearly" ? "سنوي" : "ربع سنوي"}
                    </span>
                  </span>
                  <span>{plan.maxUsers} مستخدم · {Number(plan.maxTransactions).toLocaleString()} حركة</span>
                </div>
                {plan.features?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {plan.features.map((f: string, i: number) => (
                      <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{f}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleLanding.mutate()}
                title={plan.showOnLanding ? "مظهر في الرئيسية" : "مخفي من الرئيسية"}
                className={plan.showOnLanding ? "text-emerald-600" : "text-muted-foreground"}
              >
                {plan.showOnLanding ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => onDelete(plan.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30 shadow-md">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-primary">تعديل الباقة</span>
          <Button variant="ghost" size="sm" onClick={cancelEdit}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">الاسم بالعربي</Label>
            <Input
              value={form.nameAr}
              onChange={(e) => setForm((p) => ({ ...p, nameAr: e.target.value }))}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">الاسم بالإنجليزي</Label>
            <Input
              value={form.nameEn}
              onChange={(e) => setForm((p) => ({ ...p, nameEn: e.target.value }))}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">الترتيب</Label>
            <Input
              type="number"
              value={form.order}
              onChange={(e) => setForm((p) => ({ ...p, order: parseInt(e.target.value) || 0 }))}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">السعر</Label>
            <Input
              value={form.price}
              onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
              className="h-8 text-sm"
              placeholder="0"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">العملة</Label>
            <Input
              value={form.currency}
              onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">دورة الفوترة</Label>
            <select
              className="w-full h-8 border rounded-md px-2 text-sm bg-background"
              value={form.billingCycle}
              onChange={(e) => setForm((p) => ({ ...p, billingCycle: e.target.value }))}
            >
              <option value="monthly">شهري</option>
              <option value="quarterly">ربع سنوي</option>
              <option value="yearly">سنوي</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">عدد المستخدمين</Label>
            <Input
              type="number"
              value={form.maxUsers}
              onChange={(e) => setForm((p) => ({ ...p, maxUsers: parseInt(e.target.value) || 1 }))}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">عدد الحركات</Label>
            <Input
              type="number"
              value={form.maxTransactions}
              onChange={(e) => setForm((p) => ({ ...p, maxTransactions: parseInt(e.target.value) || 1000 }))}
              className="h-8 text-sm"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">الميزات</Label>
          <div className="flex gap-2">
            <select
              className="flex-1 h-8 border rounded-md px-2 text-sm bg-background"
              value=""
              onChange={(e) => {
                if (e.target.value) addFeature(e.target.value);
                e.target.value = "";
              }}
            >
              <option value="">+ اختر ميزة جاهزة</option>
              {PREDEFINED_FEATURES.filter((f) => !form.features.includes(f)).map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <div className="flex gap-1 flex-1">
              <Input
                value={featureInput}
                onChange={(e) => setFeatureInput(e.target.value)}
                placeholder="ميزة مخصصة"
                className="h-8 text-sm"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFeature(featureInput); } }}
              />
              <Button type="button" variant="outline" size="sm" className="h-8 px-2" onClick={() => addFeature(featureInput)}>
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 min-h-[28px]">
            {form.features.map((f, i) => (
              <Badge key={i} variant="secondary" className="flex items-center gap-1 text-xs py-0.5">
                {f}
                <button type="button" onClick={() => removeFeature(i)} className="hover:text-destructive ms-0.5">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id={`landing-${plan.id}`}
            checked={form.showOnLanding}
            onChange={(e) => setForm((p) => ({ ...p, showOnLanding: e.target.checked }))}
            className="w-4 h-4"
          />
          <Label htmlFor={`landing-${plan.id}`} className="text-xs cursor-pointer">
            ظهور في صفحة الرئيسية
          </Label>
        </div>

        <div className="flex gap-2 pt-1 border-t">
          <Button
            size="sm"
            disabled={update.isPending}
            onClick={() => update.mutate(form)}
            className="h-8"
          >
            <Save className="w-3.5 h-3.5 me-1" />
            {update.isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={cancelEdit}>
            إلغاء
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Add-new-plan mini form ─── */
function AddPlanForm({ country, onDone }: { country: string; onDone: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    ...EMPTY_PLAN,
    country,
    currency: CURRENCIES[country] ?? "USD",
  });
  const [featureInput, setFeatureInput] = useState("");

  const create = useMutation({
    mutationFn: (data: any) =>
      apiFetch(`/api/super-admin/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-plans"] });
      toast({ title: t("common.success") });
      onDone();
    },
    onError: (err: Error) =>
      toast({ title: t("common.error"), description: err.message, variant: "destructive" }),
  });

  const addFeature = (val: string) => {
    const text = val.trim();
    if (!text || form.features.includes(text)) return;
    setForm((p) => ({ ...p, features: [...p.features, text] }));
    setFeatureInput("");
  };

  return (
    <Card className="border-dashed border-primary/40 bg-primary/5">
      <CardContent className="p-4 space-y-3">
        <div className="text-sm font-semibold text-primary mb-1">باقة جديدة — {COUNTRY_NAMES[country] ?? country}</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">الاسم بالعربي</Label>
            <Input value={form.nameAr} onChange={(e) => setForm((p) => ({ ...p, nameAr: e.target.value }))} className="h-8 text-sm" required />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">الاسم بالإنجليزي</Label>
            <Input value={form.nameEn} onChange={(e) => setForm((p) => ({ ...p, nameEn: e.target.value }))} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">السعر</Label>
            <Input value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} className="h-8 text-sm" placeholder="0" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">العملة</Label>
            <Input value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">دورة الفوترة</Label>
            <select className="w-full h-8 border rounded-md px-2 text-sm bg-background" value={form.billingCycle} onChange={(e) => setForm((p) => ({ ...p, billingCycle: e.target.value }))}>
              <option value="monthly">شهري</option>
              <option value="quarterly">ربع سنوي</option>
              <option value="yearly">سنوي</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">عدد المستخدمين</Label>
            <Input type="number" value={form.maxUsers} onChange={(e) => setForm((p) => ({ ...p, maxUsers: parseInt(e.target.value) || 1 }))} className="h-8 text-sm" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">عدد الحركات</Label>
            <Input type="number" value={form.maxTransactions} onChange={(e) => setForm((p) => ({ ...p, maxTransactions: parseInt(e.target.value) || 1000 }))} className="h-8 text-sm" />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">الميزات</Label>
          <div className="flex gap-2">
            <select className="flex-1 h-8 border rounded-md px-2 text-sm bg-background" value="" onChange={(e) => { if (e.target.value) addFeature(e.target.value); e.target.value = ""; }}>
              <option value="">+ اختر ميزة جاهزة</option>
              {PREDEFINED_FEATURES.filter((f) => !form.features.includes(f)).map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <div className="flex gap-1">
              <Input value={featureInput} onChange={(e) => setFeatureInput(e.target.value)} placeholder="ميزة مخصصة" className="h-8 text-sm w-36" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFeature(featureInput); } }} />
              <Button type="button" variant="outline" size="sm" className="h-8 px-2" onClick={() => addFeature(featureInput)}><Plus className="w-3.5 h-3.5" /></Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 min-h-[24px]">
            {form.features.map((f, i) => (
              <Badge key={i} variant="secondary" className="flex items-center gap-1 text-xs py-0.5">
                {f}<button type="button" onClick={() => setForm((p) => ({ ...p, features: p.features.filter((_, idx) => idx !== i) }))} className="hover:text-destructive ms-0.5"><X className="w-3 h-3" /></button>
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="showLandingNew" checked={form.showOnLanding} onChange={(e) => setForm((p) => ({ ...p, showOnLanding: e.target.checked }))} className="w-4 h-4" />
          <Label htmlFor="showLandingNew" className="text-xs cursor-pointer">ظهور في الرئيسية</Label>
        </div>
        <div className="flex gap-2 pt-1 border-t">
          <Button size="sm" disabled={create.isPending || !form.nameAr} onClick={() => create.mutate(form)} className="h-8">
            <Save className="w-3.5 h-3.5 me-1" />{create.isPending ? "جاري الإضافة..." : "إضافة الباقة"}
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={onDone}>إلغاء</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Country group ─── */
function CountryGroup({
  country, plans, onDelete, isHidden, onToggleVisibility, togglingVisibility,
}: {
  country: string; plans: any[]; onDelete: (id: string) => void;
  isHidden: boolean; onToggleVisibility: () => void; togglingVisibility: boolean;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <div className={`space-y-3 rounded-xl p-4 border-2 transition-colors ${isHidden ? "border-dashed border-muted bg-muted/30" : "border-transparent"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Globe className={`w-5 h-5 ${isHidden ? "text-muted-foreground" : "text-primary"}`} />
          <h2 className={`text-base font-bold ${isHidden ? "text-muted-foreground" : "text-foreground"}`}>
            {COUNTRY_NAMES[country] ?? country}
          </h2>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{plans.length} باقة</span>
          {isHidden && (
            <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              مخفية — تظهر «قريباً» في الرئيسية
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className={`h-7 text-xs gap-1 ${isHidden ? "text-amber-600 border-amber-300 hover:bg-amber-50" : "text-emerald-600 border-emerald-300 hover:bg-emerald-50"}`}
            onClick={onToggleVisibility}
            disabled={togglingVisibility}
            title={isHidden ? "اضغط لإظهار الدولة في الرئيسية" : "اضغط لإخفاء الدولة من الرئيسية (قريباً)"}
          >
            {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {isHidden ? "مخفية" : "مرئية"}
          </Button>
          {!adding && (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setAdding(true)}>
              <Plus className="w-3.5 h-3.5" /> إضافة باقة
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {plans.map((plan) => (
          <PlanRow key={plan.id} plan={plan} onDelete={onDelete} />
        ))}
        {adding && <AddPlanForm country={country} onDone={() => setAdding(false)} />}
      </div>
    </div>
  );
}

/* ─── Main page ─── */
export function SuperAdminPlans() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addingCountry, setAddingCountry] = useState(false);
  const [newCountry, setNewCountry] = useState("EG");

  const { data, isLoading } = useQuery({
    queryKey: ["super-admin-plans"],
    queryFn: () => apiFetch("/api/super-admin/plans"),
  });

  /* fetch showCountries from landing-page settings */
  const { data: landingSettings } = useQuery({
    queryKey: ["super-admin-landing-page"],
    queryFn: () => apiFetch("/api/super-admin/landing-page"),
    retry: false,
  });

  const showCountries: string[] = (
    (landingSettings?.showCountries as string | undefined) ?? "EG,SA,AE,KW,QA,BH,OM"
  ).split(",").map((c: string) => c.trim()).filter(Boolean);

  /* toggle a single country's visibility and persist */
  const toggleCountry = useMutation({
    mutationFn: async (country: string) => {
      const next = showCountries.includes(country)
        ? showCountries.filter((c) => c !== country)
        : [...showCountries, country];
      return apiFetch("/api/super-admin/landing-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(landingSettings ?? {}), showCountries: next.join(",") }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-landing-page"] });
      toast({ title: "تم تحديث ظهور الدولة" });
    },
    onError: (err: Error) =>
      toast({ title: t("common.error"), description: err.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/super-admin/plans/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-plans"] });
      toast({ title: t("common.success") });
    },
    onError: (err: Error) =>
      toast({ title: t("common.error"), description: err.message, variant: "destructive" }),
  });

  const plansByCountry: Record<string, any[]> = {};
  (data ?? []).forEach((plan: any) => {
    if (!plansByCountry[plan.country]) plansByCountry[plan.country] = [];
    plansByCountry[plan.country].push(plan);
  });

  const countryOrder = ["EG", "SA", "AE", "KW", "QA", "BH", "OM"];
  const sortedCountries = [
    ...countryOrder.filter((c) => plansByCountry[c]),
    ...Object.keys(plansByCountry).filter((c) => !countryOrder.includes(c)),
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("superAdmin.plansTitle")}</h1>
          <p className="text-muted-foreground text-sm">{t("superAdmin.plansSubtitle")}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => setAddingCountry(!addingCountry)}
          className="gap-2"
        >
          <Globe className="w-4 h-4" />
          دولة جديدة
        </Button>
      </div>

      {/* legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground bg-muted/40 rounded-lg px-4 py-2.5 border">
        <div className="flex items-center gap-1.5"><Eye className="w-3.5 h-3.5 text-emerald-600" /><span>مرئية — تظهر كاملةً في الرئيسية</span></div>
        <div className="flex items-center gap-1.5"><EyeOff className="w-3.5 h-3.5 text-amber-600" /><span>مخفية — تظهر كـ«قريباً» في الرئيسية</span></div>
      </div>

      {addingCountry && (
        <Card className="border-dashed">
          <CardContent className="p-4 flex items-end gap-3">
            <div className="space-y-1 flex-1">
              <Label className="text-sm">كود الدولة</Label>
              <Input
                value={newCountry}
                onChange={(e) => setNewCountry(e.target.value.toUpperCase())}
                placeholder="مثال: JO"
                className="h-9 w-40 font-mono"
                maxLength={2}
              />
            </div>
            <p className="text-sm text-muted-foreground pb-1">
              {COUNTRY_NAMES[newCountry] ?? newCountry} — أضف الباقة من خلال زر «إضافة باقة» في مجموعة الدولة
            </p>
            <Button variant="outline" size="sm" onClick={() => setAddingCountry(false)}>
              <X className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">{t("common.loading")}</div>
      ) : (
        <div className="space-y-4">
          {sortedCountries.map((country) => (
            <CountryGroup
              key={country}
              country={country}
              plans={plansByCountry[country]}
              onDelete={(id) => remove.mutate(id)}
              isHidden={!showCountries.includes(country)}
              onToggleVisibility={() => toggleCountry.mutate(country)}
              togglingVisibility={toggleCountry.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
