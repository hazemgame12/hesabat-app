import React from "react";
import { useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type Plan = { id: string; nameAr: string; nameEn: string; price: string; currency: string; isActive: boolean };

async function fetchSubscriptionData(companyId: string) {
  const res = await fetch(`/api/super-admin/companies/${companyId}/subscription`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load subscription data");
  return res.json();
}

async function fetchPlans(): Promise<Plan[]> {
  const res = await fetch("/api/super-admin/plans", { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export function SuperAdminCompanySubscription() {
  const [, params] = useRoute("/super-admin/companies/:companyId/subscription");
  const companyId = params?.companyId ?? "";
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language !== "en";
  const { toast } = useToast();

  const [extendDate, setExtendDate] = React.useState("");
  const [renewDate, setRenewDate] = React.useState("");
  const [changePlanId, setChangePlanId] = React.useState("");
  const [changeBillingCycle, setChangeBillingCycle] = React.useState<"monthly" | "quarterly" | "yearly">("monthly");

  // Per-request notes state for approve/reject
  const [requestNotes, setRequestNotes] = React.useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["sa-company-subscription", companyId],
    queryFn: () => fetchSubscriptionData(companyId),
    enabled: !!companyId,
  });

  const { data: allPlans = [] } = useQuery<Plan[]>({
    queryKey: ["sa-all-plans"],
    queryFn: fetchPlans,
  });

  const subscriptionAction = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/super-admin/companies/${companyId}/subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Request failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sa-company-subscription", companyId] });
      toast({ title: t("common.success") });
    },
    onError: (err: Error) =>
      toast({ title: t("common.error"), description: err.message, variant: "destructive" }),
  });

  const reviewPaymentRequest = useMutation({
    mutationFn: async ({
      requestId,
      action,
      notes,
    }: {
      requestId: string;
      action: "approve" | "reject";
      notes?: string;
    }) => {
      const res = await fetch(
        `/api/super-admin/companies/${companyId}/payment-requests/${requestId}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ notes: notes?.trim() || undefined }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Request failed");
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["sa-company-subscription", companyId] });
      setRequestNotes((prev) => { const n = { ...prev }; delete n[vars.requestId]; return n; });
      toast({ title: t("common.success") });
    },
    onError: (err: Error) =>
      toast({ title: t("common.error"), description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="text-muted-foreground">{t("common.loading")}</div>;

  const company = data?.company;
  const plan = data?.plan;
  const requests: any[] = data?.requests ?? [];
  const status: string = company?.subscriptionStatus ?? "-";

  const activePlans = allPlans.filter((p) => p.isActive);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("superAdmin.companySubscriptionTitle")}</h1>

      {/* Current status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("superAdmin.subscriptionInfo")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <span className="font-medium">{t("superAdmin.plan")}: </span>
            {plan ? (isAr ? plan.nameAr : plan.nameEn) : "-"}
          </div>
          <div>
            <span className="font-medium">{t("superAdmin.subscriptionStatus")}: </span>
            <span className={status === "suspended" ? "text-destructive font-semibold" : ""}>{status}</span>
          </div>
          <div>
            <span className="font-medium">{t("superAdmin.trialEndsAt")}: </span>
            {company?.trialEndsAt ? new Date(company.trialEndsAt).toLocaleDateString() : "-"}
          </div>
        </CardContent>
      </Card>

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("superAdmin.subscriptionActions")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => subscriptionAction.mutate({ action: "activate" })}
              disabled={subscriptionAction.isPending}
            >
              {t("superAdmin.activate")}
            </Button>
            <Button
              variant="outline"
              onClick={() => subscriptionAction.mutate({ action: "reactivate" })}
              disabled={subscriptionAction.isPending}
            >
              {t("superAdmin.reactivate")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => subscriptionAction.mutate({ action: "suspend" })}
              disabled={subscriptionAction.isPending}
            >
              {t("superAdmin.suspend")}
            </Button>
          </div>

          {/* Extend trial */}
          <div className="space-y-2">
            <Label htmlFor="extend-date">{t("superAdmin.extendTrialUntil")}</Label>
            <div className="flex gap-2 items-center">
              <Input
                id="extend-date"
                type="date"
                value={extendDate}
                onChange={(e) => setExtendDate(e.target.value)}
                className="w-48"
              />
              <Button
                variant="outline"
                disabled={!extendDate || subscriptionAction.isPending}
                onClick={() =>
                  subscriptionAction.mutate({
                    action: "extend",
                    endsAt: extendDate ? new Date(extendDate).toISOString() : undefined,
                  })
                }
              >
                {t("superAdmin.extendTrial")}
              </Button>
            </div>
          </div>

          {/* Renew with date */}
          <div className="space-y-2">
            <Label htmlFor="renew-date">{t("superAdmin.renewUntil")}</Label>
            <div className="flex gap-2 items-center">
              <Input
                id="renew-date"
                type="date"
                value={renewDate}
                onChange={(e) => setRenewDate(e.target.value)}
                className="w-48"
              />
              <Button
                disabled={!renewDate || subscriptionAction.isPending}
                onClick={() =>
                  subscriptionAction.mutate({
                    action: "renew",
                    endsAt: renewDate ? new Date(renewDate).toISOString() : undefined,
                  })
                }
              >
                {t("superAdmin.renew")}
              </Button>
            </div>
          </div>

          {/* Change plan */}
          {activePlans.length > 0 && (
            <div className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium">{isAr ? "تغيير الباقة" : "Change Plan"}</p>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="space-y-1">
                  <Label>{isAr ? "الباقة" : "Plan"}</Label>
                  <Select value={changePlanId} onValueChange={setChangePlanId}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder={isAr ? "اختر باقة" : "Select plan"} />
                    </SelectTrigger>
                    <SelectContent>
                      {activePlans.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {isAr ? p.nameAr : p.nameEn}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t("superAdmin.billingCycle")}</Label>
                  <Select
                    value={changeBillingCycle}
                    onValueChange={(v) => setChangeBillingCycle(v as typeof changeBillingCycle)}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">{isAr ? "شهري" : "Monthly"}</SelectItem>
                      <SelectItem value="quarterly">{isAr ? "ربعي" : "Quarterly"}</SelectItem>
                      <SelectItem value="yearly">{isAr ? "سنوي" : "Yearly"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  disabled={!changePlanId || subscriptionAction.isPending}
                  onClick={() =>
                    subscriptionAction.mutate({
                      action: "change_plan",
                      planId: changePlanId,
                      billingCycle: changeBillingCycle,
                    })
                  }
                >
                  {isAr ? "تطبيق التغيير" : "Apply Change"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment requests */}
      {requests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("superAdmin.paymentRequests")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {requests.map((r: any) => (
              <div key={r.id} className="border rounded-lg p-3 text-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {r.amount} {r.currency}{" "}
                    <span className="text-muted-foreground font-normal">
                      · {r.billingCycle} · {r.status}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {r.notes && (
                  <p className="text-xs text-muted-foreground">{isAr ? "ملاحظة الشركة: " : "Company note: "}{r.notes}</p>
                )}
                {r.status === "pending" && (
                  <div className="space-y-2 pt-1 border-t">
                    <Textarea
                      rows={2}
                      value={requestNotes[r.id] ?? ""}
                      onChange={(e) =>
                        setRequestNotes((prev) => ({ ...prev, [r.id]: e.target.value }))
                      }
                      placeholder={isAr ? "ملاحظة للشركة (اختياري)..." : "Note to company (optional)..."}
                      className="text-xs"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          reviewPaymentRequest.mutate({
                            requestId: r.id,
                            action: "approve",
                            notes: requestNotes[r.id],
                          })
                        }
                        disabled={reviewPaymentRequest.isPending}
                      >
                        {t("superAdmin.approve")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          reviewPaymentRequest.mutate({
                            requestId: r.id,
                            action: "reject",
                            notes: requestNotes[r.id],
                          })
                        }
                        disabled={reviewPaymentRequest.isPending}
                      >
                        {t("superAdmin.reject")}
                      </Button>
                    </div>
                  </div>
                )}
                {r.status !== "pending" && r.reviewerNotes && (
                  <p className="text-xs text-muted-foreground">
                    {isAr ? "ملاحظة الإدارة: " : "Admin note: "}{r.reviewerNotes}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
