import React from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, CalendarRange, Package, Clock, AlertTriangle, Info } from "lucide-react";

type Plan = {
  id: string;
  nameAr: string;
  nameEn: string;
  price: string;
  currency: string;
  billingCycle: string;
  monthlyPrice?: string | null;
  yearlyPrice?: string | null;
  trialDays?: number;
};

type PaymentMethod = {
  methodName: string;
  type: string;
  instructionsAr: string | null;
  instructionsEn: string | null;
  accountDetails: Record<string, unknown> | null;
};

type SubscriptionData = {
  company: { subscriptionStatus: string; trialEndsAt: string | null; planId: string | null; country: string };
  plan: Plan | null;
  latestSubscription: { endsAt: string | null; billingCycle: string | null; amount: string | null; currency: string | null } | null;
  latestRequest: { status: string; planId: string; amount: string; currency: string; billingCycle: string; createdAt: string } | null;
  remainingDays: number | null;
  manualInstructions: PaymentMethod[];
};

type PaymentRequest = {
  id: string;
  planId: string;
  amount: string;
  currency: string;
  billingCycle: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewerNotes?: string | null;
};

const STATUS_BADGE: Record<string, string> = {
  trial: "bg-yellow-100 text-yellow-800",
  active: "bg-green-100 text-green-800",
  expired: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
  suspended: "bg-orange-100 text-orange-800",
  pending_payment: "bg-blue-100 text-blue-800",
};

const REQUEST_STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export function SubscriptionSettings() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language !== "en";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useGetCurrentUser();

  const [selectedPlanId, setSelectedPlanId] = React.useState("");
  const [billingCycle, setBillingCycle] = React.useState<"monthly" | "quarterly" | "yearly">("monthly");
  const [notes, setNotes] = React.useState("");
  const [showForm, setShowForm] = React.useState(false);

  const { data: subData, isLoading: subLoading } = useQuery<SubscriptionData>({
    queryKey: ["company-subscription"],
    queryFn: async () => {
      const res = await fetch("/api/company/subscription", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  // Use fresh DB-sourced country from subscription endpoint; fall back to session country
  const country = subData?.company?.country ?? user?.country ?? "EG";

  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ["plans", country],
    queryFn: async () => {
      const res = await fetch(`/api/plans?country=${country}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!country,
  });

  const { data: paymentRequests = [] } = useQuery<PaymentRequest[]>({
    queryKey: ["payment-requests"],
    queryFn: async () => {
      const res = await fetch("/api/payment-requests", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const submitRenewal = useMutation({
    mutationFn: async () => {
      const plan = plans.find((p) => p.id === selectedPlanId);
      if (!plan) throw new Error("Plan not selected");
      const amount =
        billingCycle === "yearly"
          ? (plan.yearlyPrice ?? plan.price)
          : billingCycle === "quarterly"
          ? String(Math.round(Number(plan.monthlyPrice ?? plan.price) * 3))
          : (plan.monthlyPrice ?? plan.price);
      const res = await fetch("/api/company/subscription/renewal-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          planId: selectedPlanId,
          billingCycle,
          amount: String(amount),
          currency: plan.currency,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("settings.subscription.renewalSuccess") });
      queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
      queryClient.invalidateQueries({ queryKey: ["company-subscription"] });
      setShowForm(false);
      setSelectedPlanId("");
      setNotes("");
    },
    onError: (err: Error) =>
      toast({ title: t("settings.subscription.renewalError"), description: err.message, variant: "destructive" }),
  });

  const subscriptionStatus = subData?.company?.subscriptionStatus ?? user?.subscriptionStatus ?? "trial";
  const remainingDays = subData?.remainingDays;
  const plan = subData?.plan;
  const latestSubscription = subData?.latestSubscription;
  const manualInstructions = subData?.manualInstructions ?? [];
  const hasPendingRequest = paymentRequests.some((r) => r.status === "pending");
  const isSuspended = subscriptionStatus === "suspended";
  const isExpired = subscriptionStatus === "expired";
  const needsRenewal = isSuspended || isExpired;

  const planName = plan ? (isAr ? plan.nameAr : plan.nameEn) : null;

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const computedAmount =
    selectedPlan
      ? billingCycle === "yearly"
        ? (selectedPlan.yearlyPrice ?? selectedPlan.price)
        : billingCycle === "quarterly"
        ? String(Math.round(Number(selectedPlan.monthlyPrice ?? selectedPlan.price) * 3))
        : (selectedPlan.monthlyPrice ?? selectedPlan.price)
      : null;

  const formatDate = (date: string | null | undefined) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString(isAr ? "ar-EG" : "en-US");
  };

  if (subLoading) {
    return <div className="text-sm text-muted-foreground">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("settings.subscription.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("settings.subscription.subtitle")}</p>
      </div>

      {/* Suspended / Expired alert */}
      {needsRenewal && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-destructive/50 bg-destructive/5 text-destructive">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="text-sm">
            {isSuspended
              ? isAr ? "حساب شركتك موقوف مؤقتاً. قدّم طلب تجديد أو تواصل مع الدعم." : "Your account is suspended. Submit a renewal request or contact support."
              : isAr ? "انتهى اشتراكك. قدّم طلب تجديد للاستمرار." : "Your subscription has expired. Submit a renewal request to continue."}
          </p>
        </div>
      )}

      {/* Current Plan */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            {t("settings.subscription.currentPlan")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("settings.subscription.currentPlan")}</span>
            <span className="font-medium">{planName ?? t("settings.subscription.noPlan")}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("settings.subscription.status")}</span>
            <Badge className={STATUS_BADGE[subscriptionStatus] ?? "bg-gray-100 text-gray-800"}>
              {t(`settings.subscription.statusLabels.${subscriptionStatus}`, { defaultValue: subscriptionStatus })}
            </Badge>
          </div>

          {remainingDays !== null && remainingDays !== undefined && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {isAr ? "الأيام المتبقية" : "Days remaining"}
              </span>
              <span className={`font-medium ${remainingDays <= 7 ? "text-destructive" : ""}`}>{remainingDays}</span>
            </div>
          )}

          {subscriptionStatus === "trial" && subData?.company?.trialEndsAt && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <CalendarRange className="w-3.5 h-3.5" />
                {t("settings.subscription.trialEndsAt")}
              </span>
              <span className="font-medium">{formatDate(subData.company.trialEndsAt)}</span>
            </div>
          )}

          {latestSubscription?.endsAt && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {isAr ? "ينتهي الاشتراك" : "Subscription ends"}
              </span>
              <span className="font-medium">{formatDate(latestSubscription.endsAt)}</span>
            </div>
          )}

          {latestSubscription && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{isAr ? "المبلغ" : "Amount"}</span>
              <span className="font-medium">
                {latestSubscription.amount} {latestSubscription.currency}
                {latestSubscription.billingCycle ? ` / ${isAr ? (latestSubscription.billingCycle === "yearly" ? "سنوياً" : latestSubscription.billingCycle === "quarterly" ? "ربعياً" : "شهرياً") : latestSubscription.billingCycle}` : ""}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment instructions */}
      {manualInstructions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Info className="w-4 h-4 text-primary" />
              {isAr ? "طرق الدفع المتاحة" : "Available Payment Methods"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {manualInstructions.map((m, i) => (
              <div key={i} className="space-y-1">
                <p className="text-sm font-medium">{m.methodName}</p>
                {isAr && m.instructionsAr && <p className="text-sm text-muted-foreground">{m.instructionsAr}</p>}
                {!isAr && m.instructionsEn && <p className="text-sm text-muted-foreground">{m.instructionsEn}</p>}
                {m.accountDetails && (
                  <pre className="text-xs bg-muted rounded p-2 whitespace-pre-wrap">
                    {JSON.stringify(m.accountDetails, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Renewal request form */}
      {plans.length === 0 && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0" />
              {isAr
                ? "لا توجد باقات متاحة لدولتك حالياً. تواصل مع الدعم لتفعيل اشتراكك."
                : "No plans available for your country yet. Contact support to activate your subscription."}
            </p>
          </CardContent>
        </Card>
      )}
      {plans.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              {t("settings.subscription.requestRenewal")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasPendingRequest && !showForm ? (
              <p className="text-sm text-muted-foreground">{t("settings.subscription.pendingReview")}</p>
            ) : showForm ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>{isAr ? "الباقة" : "Plan"}</Label>
                  <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                    <SelectTrigger>
                      <SelectValue placeholder={isAr ? "اختر باقة" : "Choose a plan"} />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {isAr ? p.nameAr : p.nameEn} — {p.price} {p.currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>{t("superAdmin.billingCycle")}</Label>
                  <Select value={billingCycle} onValueChange={(v) => setBillingCycle(v as typeof billingCycle)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">{isAr ? "شهري" : "Monthly"}</SelectItem>
                      <SelectItem value="quarterly">{isAr ? "ربع سنوي" : "Quarterly"}</SelectItem>
                      <SelectItem value="yearly">{isAr ? "سنوي" : "Yearly"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {computedAmount && selectedPlan && (
                  <div className="rounded-md bg-muted px-3 py-2 text-sm">
                    {isAr ? "المبلغ المطلوب: " : "Amount due: "}
                    <span className="font-semibold">{computedAmount} {selectedPlan.currency}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>{isAr ? "ملاحظات (اختياري)" : "Notes (optional)"}</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={isAr ? "أي تفاصيل إضافية عن الدفع..." : "Any additional payment details..."}
                    rows={3}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    disabled={!selectedPlanId || submitRenewal.isPending}
                    onClick={() => submitRenewal.mutate()}
                  >
                    {submitRenewal.isPending
                      ? t("settings.subscription.requesting")
                      : t("settings.subscription.requestRenewal")}
                  </Button>
                  <Button variant="ghost" onClick={() => setShowForm(false)}>
                    {isAr ? "إلغاء" : "Cancel"}
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" onClick={() => setShowForm(true)} className="gap-2">
                <CreditCard className="w-4 h-4" />
                {t("settings.subscription.requestRenewal")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Request history */}
      <div>
        <h3 className="text-sm font-medium mb-3">{t("settings.subscription.renewalRequests")}</h3>
        {paymentRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("settings.subscription.noRequests")}</p>
        ) : (
          <div className="space-y-2">
            {paymentRequests.map((req) => {
              const reqPlan = plans.find((p) => p.id === req.planId);
              const reqPlanName = reqPlan ? (isAr ? reqPlan.nameAr : reqPlan.nameEn) : "-";
              return (
                <Card key={req.id}>
                  <CardContent className="py-3 px-4 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{reqPlanName}</p>
                        <p className="text-xs text-muted-foreground">
                          {req.amount} {req.currency} ·{" "}
                          {isAr
                            ? req.billingCycle === "yearly" ? "سنوي" : req.billingCycle === "quarterly" ? "ربعي" : "شهري"
                            : req.billingCycle}{" "}
                          · {new Date(req.createdAt).toLocaleDateString(isAr ? "ar-EG" : "en-US")}
                        </p>
                      </div>
                      <Badge className={REQUEST_STATUS_BADGE[req.status] ?? "bg-gray-100 text-gray-800"}>
                        {t(`settings.subscription.requestStatus.${req.status}`, { defaultValue: req.status })}
                      </Badge>
                    </div>
                    {req.reviewerNotes && req.status === "rejected" && (
                      <p className="text-xs text-muted-foreground border-t pt-1 mt-1">
                        {isAr ? "ملاحظة: " : "Note: "}{req.reviewerNotes}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
