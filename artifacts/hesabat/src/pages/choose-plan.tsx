import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Check, Globe, CreditCard, Clock, AlertTriangle } from "lucide-react";

async function fetchAvailablePlans(country: string) {
  const res = await fetch(`/api/plans?country=${country}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch plans");
  return res.json();
}

async function selectPlan(planId: string) {
  const res = await fetch(`/api/company/select-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ planId }),
  });
  if (!res.ok) throw new Error("Failed to select plan");
  return res.json();
}

export function ChoosePlan() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user, isLoading: isUserLoading } = useGetCurrentUser();
  const [, setLocation] = useLocation();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const isTrialExpired = user?.subscriptionStatus === "expired" || user?.subscriptionStatus === "pending_payment";
  const isTrial = user?.subscriptionStatus === "trial";
  const trialDaysLeft = user?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(user.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const { data: plans, isLoading } = useQuery({
    queryKey: ["available-plans", user?.country ?? "EG"],
    queryFn: () => fetchAvailablePlans(user?.country || "EG"),
    enabled: !isUserLoading && !!user,
  });

  // If user already has a plan and isn't expired, redirect to dashboard
  React.useEffect(() => {
    if (user && !isUserLoading) {
      const isExpired = user.subscriptionStatus === "expired";
      const isTrialWithoutPlan = user.subscriptionStatus === "trial" && !user.planId;
      if (!isExpired && !isTrialWithoutPlan) {
        setLocation("/dashboard");
      }
    }
  }, [user, isUserLoading, setLocation]);

  const select = useMutation({
    mutationFn: selectPlan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["get-current-user"] });
      toast({ title: "تم تحديد الباقة بنجاح" });
      setLocation("/dashboard");
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    },
  });

  const handleSelect = (planId: string) => {
    setSelectedPlanId(planId);
  };

  const handleConfirm = () => {
    if (!selectedPlanId) return;
    select.mutate(selectedPlanId);
  };

  const billingLabel = (cycle: string) => {
    switch (cycle) {
      case "monthly": return "شهري";
      case "quarterly": return "ربع سنوي";
      case "yearly": return "سنوي";
      default: return cycle;
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-4xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-3xl mx-auto shadow-sm">
            ح
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {isTrialExpired ? "التجريب انتهى" : "اختر باقتك"}
          </h1>
          <p className="text-muted-foreground">
            {isTrialExpired ? (
              <span className="flex items-center justify-center gap-2 text-destructive">
                <AlertTriangle className="w-4 h-4" />
                تم انتهاء فترة التجريب المجانية. اختر باقة للمتابعة.
              </span>
            ) : isTrial ? (
              <span className="flex items-center justify-center gap-2">
                <Clock className="w-4 h-4" />
                {trialDaysLeft > 0
                  ? `باقي ${trialDaysLeft} يوم في فترة التجريب المجانية. اختر باقة الآن للاستمرارية.`
                  : `فترة التجريب المجانية انتهت. اختر باقة للمتابعة.`}
              </span>
            ) : (
              "اختر الباقة المناسبة للشركة."
            )}
          </p>
        </div>

        {/* Plans */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">{t("common.loading")}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(plans || []).map((plan: any) => (
              <Card
                key={plan.id}
                className={`cursor-pointer transition-all hover:shadow-lg ${
                  selectedPlanId === plan.id ? "border-primary ring-2 ring-primary/20" : ""
                }`}
                onClick={() => handleSelect(plan.id)}
              >
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{plan.country}</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">{plan.nameAr}</h3>
                    <p className="text-sm text-muted-foreground">{plan.nameEn}</p>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-primary">{plan.monthlyPrice ?? plan.price}</span>
                    <span className="text-muted-foreground">{plan.currencyCode ?? plan.currency}</span>
                    <span className="text-sm text-muted-foreground">/ {billingLabel(plan.billingCycle)}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <span className="inline-block me-3">
                      <CreditCard className="w-3 h-3 inline me-1" />
                      {plan.maxUsers} مستخدم
                    </span>
                    <span className="inline-block">
                      {plan.maxTransactions} عملية
                    </span>
                  </div>
                  <div className="space-y-2">
                    {(plan.features || []).map((feature: string, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-primary" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                  {selectedPlanId === plan.id && (
                    <div className="pt-2">
                      <Button className="w-full" onClick={handleConfirm} disabled={select.isPending}>
                        {select.isPending ? t("common.loading") : "اختر هذه الباقة"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground">
          <p>للاستفسار او مساعدة الدعم ، <a href="/support" className="text-primary font-bold hover:underline">اتصل بنا</a></p>
        </div>
      </div>
    </div>
  );
}
