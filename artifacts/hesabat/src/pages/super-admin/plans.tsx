import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Plus, Trash2, Pencil, Check, X, Globe, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const PREDEFINED_FEATURES = [
  "مستخدم واحد",
  "مستخدمين حتى 3",
  "مستخدمين حتى 10",
  "مستخدمين حتى 50",
  "فاتورة",
  "الدخل المبيعات",
  "التقارير",
  "التباشير",
  "المخزون",
  "تقارير أساسية",
  "جميع الميزات",
  "دعم أولوي",
  "دعم بالبريد",
  "تكامل مخصص",
  "نقل بيانات مجاني",
];

async function fetchPlans() {
  const res = await fetch(`/api/super-admin/plans`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch plans");
  return res.json();
}

async function createPlan(data: any) {
  const res = await fetch(`/api/super-admin/plans`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create plan");
  return res.json();
}

async function updatePlan(id: string, data: any) {
  const res = await fetch(`/api/super-admin/plans/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update plan");
  return res.json();
}

async function deletePlan(id: string) {
  const res = await fetch(`/api/super-admin/plans/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to delete plan");
  return res.json();
}

export function SuperAdminPlans() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    nameAr: "",
    nameEn: "",
    country: "EG",
    maxUsers: 1,
    maxTransactions: 1000,
    price: "",
    currency: "EGP",
    billingCycle: "monthly",
    features: [] as string[],
    showOnLanding: true,
  });
  const [featureInput, setFeatureInput] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["super-admin-plans"],
    queryFn: fetchPlans,
  });

  const create = useMutation({
    mutationFn: createPlan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-plans"] });
      setShowForm(false);
      resetForm();
      toast({ title: t("common.success") });
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    },
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updatePlan(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-plans"] });
      setEditingId(null);
      toast({ title: t("common.success") });
    },
  });

  const remove = useMutation({
    mutationFn: deletePlan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-plans"] });
      toast({ title: t("common.success") });
    },
  });

  const resetForm = () => {
    setForm({ nameAr: "", nameEn: "", country: "EG", maxUsers: 1, maxTransactions: 1000, price: "", currency: "EGP", billingCycle: "monthly", features: [], showOnLanding: true });
    setFeatureInput("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...form };
    if (editingId) {
      update.mutate({ id: editingId, data: payload });
    } else {
      create.mutate(payload);
    }
  };

  const startEdit = (plan: any) => {
    setEditingId(plan.id);
    setForm({
      nameAr: plan.nameAr,
      nameEn: plan.nameEn,
      country: plan.country,
      maxUsers: plan.maxUsers,
      maxTransactions: plan.maxTransactions,
      price: plan.price,
      currency: plan.currency,
      billingCycle: plan.billingCycle,
      features: (plan.features || []) as string[],
      showOnLanding: plan.showOnLanding ?? true,
    });
    setFeatureInput("");
    setShowForm(true);
  };

  const addFeature = () => {
    const text = featureInput.trim();
    if (!text || form.features.includes(text)) return;
    setForm((p) => ({ ...p, features: [...p.features, text] }));
    setFeatureInput("");
  };

  const removeFeature = (idx: number) => {
    setForm((p) => ({ ...p, features: p.features.filter((_, i) => i !== idx) }));
  };

  async function toggleShowOnLanding(plan: any) {
    const res = await fetch(`/api/super-admin/plans/${plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ showOnLanding: !plan.showOnLanding }),
    });
    if (!res.ok) throw new Error("Failed to update");
    queryClient.invalidateQueries({ queryKey: ["super-admin-plans"] });
  }

  const plansByCountry: Record<string, any[]> = {};
  data?.forEach((plan: any) => {
    if (!plansByCountry[plan.country]) plansByCountry[plan.country] = [];
    plansByCountry[plan.country].push(plan);
  });

  const countryNames: Record<string, string> = {
    EG: "مصر",
    SA: "السعودية",
    AE: "الإمارات",
    KW: "الكويت",
    QA: "قطر",
    BH: "البحرين",
    OM: "عمان",
    JO: "الأردن",
    IQ: "العراق",
    LB: "لبنان",
    YE: "اليمن",
    SD: "السودان",
    DZ: "الجزائر",
    MA: "المغرب",
    TN: "تونس",
    LY: "ليبيا",
    PS: "فلسطين",
    SY: "سوريا",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("superAdmin.plansTitle")}</h1>
          <p className="text-muted-foreground">{t("superAdmin.plansSubtitle")}</p>
        </div>
        <Button onClick={() => { setShowForm(!showForm); setEditingId(null); resetForm(); }}>
          <Plus className="w-4 h-4 me-2" />
          {showForm ? t("common.cancel") : t("superAdmin.addPlan")}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4">
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("superAdmin.planNameAr")}</Label>
                <Input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>{t("superAdmin.planNameEn")}</Label>
                <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>{t("superAdmin.country")}</Label>
                <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>{t("superAdmin.price")}</Label>
                <Input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>{t("superAdmin.currency")}</Label>
                <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>{t("superAdmin.billingCycle")}</Label>
                <select className="w-full border rounded-md px-3 py-2 text-sm" value={form.billingCycle} onChange={(e) => setForm({ ...form, billingCycle: e.target.value })}>
                  <option value="monthly">شهري</option>
                  <option value="quarterly">ربع سنوي</option>
                  <option value="yearly">سنوي</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t("superAdmin.maxUsers")}</Label>
                <Input type="number" value={form.maxUsers} onChange={(e) => setForm({ ...form, maxUsers: parseInt(e.target.value) || 1 })} required />
              </div>
              <div className="space-y-2">
                <Label>{t("superAdmin.maxTransactions")}</Label>
                <Input type="number" value={form.maxTransactions} onChange={(e) => setForm({ ...form, maxTransactions: parseInt(e.target.value) || 1000 })} required />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t("superAdmin.features")}</Label>
                <div className="flex gap-2">
                  <select
                    className="flex-1 border rounded-md px-3 py-2 text-sm"
                    value=""
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val && !form.features.includes(val)) {
                        setForm((p) => ({ ...p, features: [...p.features, val] }));
                      }
                      e.target.value = "";
                    }}
                  >
                    <option value="">-- اختر ميزة جهزة --</option>
                    {PREDEFINED_FEATURES.filter((f) => !form.features.includes(f)).map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                  <div className="flex-1 flex gap-2">
                    <Input value={featureInput} onChange={(e) => setFeatureInput(e.target.value)} placeholder="أو أضف ميزة مخصصة" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFeature(); } }} />
                    <Button type="button" variant="outline" onClick={addFeature}><Plus className="w-4 h-4" /></Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {form.features.map((f, i) => (
                    <Badge key={i} variant="secondary" className="flex items-center gap-1">
                      {f}
                      <button type="button" onClick={() => removeFeature(i)} className="ml-1 text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-2 flex items-center gap-2 md:col-span-2">
                <input type="checkbox" id="showOnLanding" checked={form.showOnLanding} onChange={(e) => setForm({ ...form, showOnLanding: e.target.checked })} className="w-4 h-4" />
                <Label htmlFor="showOnLanding">{t("superAdmin.showOnLanding")}</Label>
              </div>
              <div className="md:col-span-2 flex gap-2">
                <Button type="submit" disabled={create.isPending || update.isPending}>
                  <Check className="w-4 h-4 me-2" />
                  {editingId ? t("common.update") : t("common.save")}
                </Button>
                <Button variant="outline" onClick={() => setShowForm(false)}>
                  <X className="w-4 h-4 me-2" /> {t("common.cancel")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">{t("common.loading")}</div>
        ) : (
          Object.entries(plansByCountry).map(([country, plans]) => (
            <div key={country} className="space-y-2">
              <div className="flex items-center gap-2 text-lg font-bold text-foreground">
                <Globe className="w-5 h-5 text-primary" />
                <span>{countryNames[country] || country} ({country})</span>
                <span className="text-sm font-normal text-muted-foreground">{plans.length} باقات</span>
              </div>
              <div className="space-y-2">
                {plans.map((plan: any) => (
                  <Card key={plan.id}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                          <CreditCard className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-semibold">{plan.nameAr} / {plan.nameEn}</div>
                          <div className="text-sm text-muted-foreground">
                            {plan.price} {plan.currency} / {plan.billingCycle === "monthly" ? "شهري" : plan.billingCycle === "quarterly" ? "ربع سنوي" : "سنوي"}
                            · {plan.maxUsers} {t("landing.planUsers")} · {plan.maxTransactions} {t("landing.planTransactions")}
                            <div className="text-xs mt-1">
                              {(plan.features || []).map((f: string, i: number) => (
                                <span key={i} className="inline-block bg-muted px-2 py-0.5 rounded-full me-1">{f}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => toggleShowOnLanding(plan)} title={plan.showOnLanding ? "\u0645\u0638\u0647\u0631 \u0641\u064a \u0627\u0644\u0631\u0626\u064a\u0633\u064a\u0629" : "\u0645\u062e\u0641\u064a \u0645\u0646 \u0627\u0644\u0631\u0626\u064a\u0633\u064a\u0629"}>
                          {plan.showOnLanding ? <Eye className="w-4 h-4 text-emerald-600" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => startEdit(plan)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => remove.mutate(plan.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
