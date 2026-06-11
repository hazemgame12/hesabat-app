import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

async function fetchPlans() {
  const res = await fetch(`/api/super-admin/plans`, {
    credentials: "include",
  });
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
    features: "",
  });

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
    setForm({
      nameAr: "",
      nameEn: "",
      country: "EG",
      maxUsers: 1,
      maxTransactions: 1000,
      price: "",
      currency: "EGP",
      billingCycle: "monthly",
      features: "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      features: form.features.split(",").map((f) => f.trim()).filter(Boolean),
    };
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
      features: (plan.features || []).join(", "),
    });
    setShowForm(true);
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
                <Input value={form.billingCycle} onChange={(e) => setForm({ ...form, billingCycle: e.target.value })} required />
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
                <Input value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} placeholder="Feature 1, Feature 2, ..." />
              </div>
              <div className="md:col-span-2 flex gap-2">
                <Button type="submit" disabled={create.isPending || update.isPending}>
                  <Check className="w-4 h-4 me-2" />
                  {editingId ? t("common.update") : t("common.save")}
                </Button>
                <Button variant="outline" onClick={() => setShowForm(false)}>
                  <X className="w-4 h-4 me-2" />
                  {t("common.cancel")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">{t("common.loading")}</div>
        ) : (
          data?.map((plan: any) => (
            <Card key={plan.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold">
                      {plan.nameAr} / {plan.nameEn}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {plan.country} · {plan.price} {plan.currency} / {plan.billingCycle}
                      · {plan.maxUsers} users · {plan.maxTransactions} tx
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(plan)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove.mutate(plan.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
