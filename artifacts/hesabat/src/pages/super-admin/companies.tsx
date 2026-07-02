import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Users, ChevronDown, ChevronUp, Search, Trash2, CreditCard, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

async function fetchCompanies(q?: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  const res = await fetch(`/api/super-admin/companies?${params}`, { credentials: "include" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${body || res.statusText}`);
  }
  return res.json();
}

async function fetchPlans() {
  const res = await fetch(`/api/super-admin/plans`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch plans");
  return res.json();
}

async function deleteCompany(id: string) {
  const res = await fetch(`/api/super-admin/companies/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to delete company");
  return res.json();
}

async function assignPlan(id: string, planId: string | null) {
  const res = await fetch(`/api/super-admin/companies/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ planId }),
  });
  if (!res.ok) throw new Error("Failed to assign plan");
  return res.json();
}

async function updateCompanyStatus(id: string, status: string) {
  const res = await fetch(`/api/super-admin/companies/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ subscriptionStatus: status }),
  });
  if (!res.ok) throw new Error("Failed to update status");
  return res.json();
}

const statusColors: Record<string, string> = {
  trial: "bg-yellow-100 text-yellow-800",
  active: "bg-green-100 text-green-800",
  expired: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
  suspended: "bg-orange-100 text-orange-800",
};

const statusLabels: Record<string, string> = {
  trial: "تجريبي",
  active: "نشط",
  expired: "منتهي",
  cancelled: "ملغي",
  suspended: "معلق",
};

const paymentRequestStatusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export function SuperAdminCompanies() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [companyDetail, setCompanyDetail] = useState<any>(null);
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [editingStatus, setEditingStatus] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [editingPhone, setEditingPhone] = useState<string | null>(null);
  const [phoneValue, setPhoneValue] = useState<string>("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["super-admin-companies", search],
    queryFn: () => fetchCompanies(search),
    retry: false,
  });

  const { data: plans } = useQuery({
    queryKey: ["super-admin-plans"],
    queryFn: fetchPlans,
  });

  const remove = useMutation({
    mutationFn: deleteCompany,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-companies"] });
      toast({ title: t("common.success") });
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    },
  });

  const assign = useMutation({
    mutationFn: ({ id, planId }: { id: string; planId: string | null }) => assignPlan(id, planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-companies"] });
      setEditingPlan(null);
      toast({ title: t("common.success") });
    },
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateCompanyStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-companies"] });
      setEditingStatus(null);
      toast({ title: t("common.success") });
    },
  });

  const updatePhone = useMutation({
    mutationFn: ({ id, phone }: { id: string; phone: string | null }) =>
      fetch(`/api/super-admin/companies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: phone || null }),
      }).then((r) => { if (!r.ok) throw new Error("Failed"); return r.json(); }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-companies"] });
      setEditingPhone(null);
      toast({ title: t("common.success") });
    },
    onError: () => toast({ title: t("common.error"), variant: "destructive" }),
  });

  const reviewPaymentRequest = useMutation({
    mutationFn: async ({
      companyId,
      requestId,
      action,
    }: {
      companyId: string;
      requestId: string;
      action: "approve" | "reject";
    }) => {
      const res = await fetch(
        `/api/super-admin/companies/${companyId}/payment-requests/${requestId}/${action}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(body || `Failed to ${action} payment request`);
      }
      return res.json();
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-companies"] });
      if (expandedId) {
        const res = await fetch(`/api/super-admin/companies/${expandedId}`, { credentials: "include" });
        if (res.ok) setCompanyDetail(await res.json());
      }
      toast({ title: t("common.success") });
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    },
  });

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setCompanyDetail(null);
      return;
    }
    setExpandedId(id);
    const res = await fetch(`/api/super-admin/companies/${id}`, { credentials: "include" });
    if (res.ok) setCompanyDetail(await res.json());
  };

  const formatDate = (date: string) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("ar-EG");
  };

  const getPlanName = (planId: string | null) => {
    if (!planId || !plans) return "-";
    const plan = plans.find((p: any) => p.id === planId);
    return plan ? `${plan.nameAr} (${plan.price} ${plan.currency})` : "-";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("superAdmin.companiesTitle")}</h1>
          <p className="text-muted-foreground">{t("superAdmin.companiesSubtitle")}</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="ps-9" placeholder={t("superAdmin.searchCompanies")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">{t("common.loading")}</div>
        ) : isError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            <span className="font-semibold">خطأ في تحميل الشركات: </span>
            {(error as Error)?.message}
          </div>
        ) : (
          data?.companies?.map((company: any) => (
            <Card key={company.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-semibold">{company.name}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <span>{company.country}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" /> {company.userCount}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {editingPlan === company.id ? (
                      <div className="flex items-center gap-2">
                        <select
                          className="text-sm border rounded-md px-2 py-1"
                          value={selectedPlan}
                          onChange={(e) => setSelectedPlan(e.target.value)}
                        >
                          <option value="">{t("superAdmin.selectPlan")}</option>
                          {plans?.map((plan: any) => (
                            <option key={plan.id} value={plan.id}>
                              {plan.nameAr} ({plan.price} {plan.currency})
                            </option>
                          ))}
                        </select>
                        <Button size="sm" variant="ghost" onClick={() => assign.mutate({ id: company.id, planId: selectedPlan || null })}>
                          <Check className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingPlan(null)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => { setEditingPlan(company.id); setSelectedPlan(company.planId || ""); }}>
                        <CreditCard className="w-4 h-4" />
                      </Button>
                    )}

                    {editingStatus === company.id ? (
                      <div className="flex items-center gap-2">
                        <select
                          className="text-sm border rounded-md px-2 py-1"
                          value={selectedStatus}
                          onChange={(e) => setSelectedStatus(e.target.value)}
                        >
                          {Object.entries(statusLabels).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                        <Button size="sm" variant="ghost" onClick={() => updateStatus.mutate({ id: company.id, status: selectedStatus })}>
                          <Check className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingStatus(null)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <Badge
                        className={statusColors[company.subscriptionStatus] || "bg-gray-100"}
                        onClick={() => { setEditingStatus(company.id); setSelectedStatus(company.subscriptionStatus); }}
                        style={{ cursor: "pointer" }}
                      >
                        {statusLabels[company.subscriptionStatus] || company.subscriptionStatus}
                      </Badge>
                    )}

                    <Button size="sm" variant="ghost" onClick={() => handleExpand(company.id)}>
                      {expandedId === company.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate(company.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 md:grid-cols-6 gap-2 text-sm text-muted-foreground">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground/70">الدولة</div>
                    <div>{company.country}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground/70">الباقة</div>
                    <div>{getPlanName(company.planId)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground/70">بداية الاشتراك</div>
                    <div>{formatDate(company.createdAt)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground/70">نهاية التجريب</div>
                    <div>{formatDate(company.trialEndsAt)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground/70">المستخدمين</div>
                    <div>{company.userCount}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground/70">التليفون</div>
                    {editingPhone === company.id ? (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Input
                          value={phoneValue}
                          onChange={(e) => setPhoneValue(e.target.value)}
                          dir="ltr"
                          className="h-6 text-xs font-mono px-1.5 w-32"
                          placeholder="+201234567890"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") updatePhone.mutate({ id: company.id, phone: phoneValue });
                            if (e.key === "Escape") setEditingPhone(null);
                          }}
                          autoFocus
                        />
                        <button onClick={() => updatePhone.mutate({ id: company.id, phone: phoneValue })} className="text-green-600 hover:text-green-700"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditingPhone(null)} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <div
                        className="flex items-center gap-1 group cursor-pointer"
                        onClick={() => { setEditingPhone(company.id); setPhoneValue(company.phone || ""); }}
                      >
                        <span dir="ltr" className="font-mono text-xs">{company.phone || "—"}</span>
                        <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    )}
                  </div>
                </div>

                {expandedId === company.id && companyDetail && (
                  <div className="mt-4 pt-4 border-t border-border space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <div className="text-sm font-medium text-muted-foreground mb-1">{t("superAdmin.companyInfo")}</div>
                        <div className="text-sm space-y-1">
                          <div>ID: {companyDetail.company.id}</div>
                          <div>الدولة: {companyDetail.company.country}</div>
                          <div>العملة: {companyDetail.company.baseCurrency}</div>
                          <div>نشط: {companyDetail.company.isActive ? "نعم" : "لا"}</div>
                          <div>الباقة: {getPlanName(companyDetail.company.planId)}</div>
                          <div>الحالة: {statusLabels[companyDetail.company.subscriptionStatus] || companyDetail.company.subscriptionStatus}</div>
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-muted-foreground mb-1">{t("superAdmin.users")}</div>
                        <div className="text-sm space-y-1">
                          {companyDetail.users.map((u: any) => (
                            <div key={u.id}>{u.name} ({u.email}) — {u.role}</div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-muted-foreground mb-1">{t("superAdmin.tickets")}</div>
                        <div className="text-sm space-y-1">
                          {companyDetail.tickets.length === 0 ? (
                            <div className="text-muted-foreground">No tickets</div>
                          ) : (
                            companyDetail.tickets.map((t: any) => (
                              <div key={t.id}>{t.subject} — {t.status}</div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-2">طلبات الدفع اليدوي</div>
                      {companyDetail.paymentRequests?.length === 0 ? (
                        <div className="text-sm text-muted-foreground">لا توجد طلبات دفع</div>
                      ) : (
                        <div className="space-y-2">
                          {companyDetail.paymentRequests?.map((request: any) => (
                            <div key={request.id} className="flex items-center justify-between gap-3 rounded-md border p-2">
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">
                                  {getPlanName(request.planId)} · {request.amount} {request.currency}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {request.billingCycle} · {formatDate(request.createdAt)}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge className={paymentRequestStatusColors[request.status] || "bg-gray-100 text-gray-800"}>
                                  {request.status}
                                </Badge>
                                {request.status === "pending" && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={reviewPaymentRequest.isPending}
                                      onClick={() =>
                                        reviewPaymentRequest.mutate({
                                          companyId: company.id,
                                          requestId: request.id,
                                          action: "approve",
                                        })
                                      }
                                    >
                                      اعتماد
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      disabled={reviewPaymentRequest.isPending}
                                      onClick={() =>
                                        reviewPaymentRequest.mutate({
                                          companyId: company.id,
                                          requestId: request.id,
                                          action: "reject",
                                        })
                                      }
                                    >
                                      رفض
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
