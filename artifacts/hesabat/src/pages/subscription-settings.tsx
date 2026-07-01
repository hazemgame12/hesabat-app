import React from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { CreditCard, CalendarRange, Package } from "lucide-react";

type PaymentRequest = {
  id: string;
  planId: string;
  amount: string;
  currency: string;
  billingCycle: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

type Plan = {
  id: string;
  nameAr: string;
  nameEn: string;
  price: string;
  currency: string;
  billingCycle: string;
};

async function fetchPaymentRequests(): Promise<PaymentRequest[]> {
  const res = await fetch("/api/payment-requests", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch payment requests");
  return res.json();
}

async function fetchPlans(country: string): Promise<Plan[]> {
  const res = await fetch(`/api/plans?country=${country}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch plans");
  return res.json();
}

const STATUS_BADGE: Record<string, string> = {
  trial: "bg-yellow-100 text-yellow-800",
  active: "bg-green-100 text-green-800",
  expired: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
  suspended: "bg-orange-100 text-orange-800",
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
  const [, setLocation] = useLocation();
  const { data: user } = useGetCurrentUser();

  const subscriptionStatus = user?.subscriptionStatus ?? "trial";
  const planId = user?.planId;
  const country = user?.country ?? "EG";
  const trialEndsAt = user?.trialEndsAt;

  const { data: plans } = useQuery({
    queryKey: ["plans", country],
    queryFn: () => fetchPlans(country),
    enabled: !!country,
  });

  const { data: paymentRequests = [] } = useQuery({
    queryKey: ["payment-requests"],
    queryFn: fetchPaymentRequests,
  });

  const currentPlan = plans?.find((p) => p.id === planId);
  const planName = currentPlan ? (isAr ? currentPlan.nameAr : currentPlan.nameEn) : null;

  const formatDate = (date: string | null | undefined) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString(isAr ? "ar-EG" : "en-US");
  };

  const hasPendingRequest = paymentRequests.some((r) => r.status === "pending");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">{t("settings.subscription.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("settings.subscription.subtitle")}</p>
      </div>

      {/* Current Plan Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            {t("settings.subscription.currentPlan")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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

          {subscriptionStatus === "trial" && trialEndsAt && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <CalendarRange className="w-3.5 h-3.5" />
                {t("settings.subscription.trialEndsAt")}
              </span>
              <span className="font-medium">{formatDate(trialEndsAt)}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Renewal / Choose plan CTA */}
      {(subscriptionStatus === "expired" || subscriptionStatus === "trial" || !planId) && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {hasPendingRequest ? (
                  <p className="text-sm">{t("settings.subscription.pendingReview")}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("settings.subscription.contactSupport")}</p>
                )}
              </div>
              {!hasPendingRequest && (
                <Button
                  size="sm"
                  onClick={() => setLocation("/choose-plan")}
                  className="gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  {t("settings.subscription.choosePlan")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Renewal Requests */}
      <div>
        <h3 className="text-sm font-medium mb-3">{t("settings.subscription.renewalRequests")}</h3>
        {paymentRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("settings.subscription.noRequests")}</p>
        ) : (
          <div className="space-y-2">
            {paymentRequests.map((req) => {
              const reqPlan = plans?.find((p) => p.id === req.planId);
              const reqPlanName = reqPlan ? (isAr ? reqPlan.nameAr : reqPlan.nameEn) : req.planId;
              return (
                <Card key={req.id}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{reqPlanName}</p>
                        <p className="text-xs text-muted-foreground">
                          {req.amount} {req.currency} · {formatDate(req.createdAt)}
                        </p>
                      </div>
                      <Badge className={REQUEST_STATUS_BADGE[req.status] ?? "bg-gray-100 text-gray-800"}>
                        {t(`settings.subscription.requestStatus.${req.status}`, { defaultValue: req.status })}
                      </Badge>
                    </div>
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
