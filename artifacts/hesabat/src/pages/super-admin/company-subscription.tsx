import React from "react";
import { useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

async function fetchSubscriptionData(companyId: string) {
  const res = await fetch(`/api/super-admin/companies/${companyId}/subscription`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load subscription data");
  return res.json();
}

export function SuperAdminCompanySubscription() {
  const [, params] = useRoute("/super-admin/companies/:companyId/subscription");
  const companyId = params?.companyId ?? "";
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [extendDate, setExtendDate] = React.useState("");
  const [renewDate, setRenewDate] = React.useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["sa-company-subscription", companyId],
    queryFn: () => fetchSubscriptionData(companyId),
    enabled: !!companyId,
  });

  /** POST /super-admin/companies/:id/subscription with action payload */
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

  if (isLoading) return <div className="text-muted-foreground">{t("common.loading")}</div>;

  const company = data?.company;
  const plan = data?.plan;
  const requests: any[] = data?.requests ?? [];
  const status: string = company?.subscriptionStatus ?? "-";

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
            {plan?.nameAr ?? plan?.nameEn ?? "-"}
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

      {/* Admin actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("superAdmin.subscriptionActions")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Quick actions */}
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

          {/* Extend trial with date */}
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

          {/* Renew subscription with date */}
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
        </CardContent>
      </Card>

      {/* Payment requests */}
      {requests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("superAdmin.paymentRequests")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {requests.map((r: any) => (
              <div key={r.id} className="border rounded p-3 text-sm flex items-center justify-between">
                <span>
                  {r.amount} {r.currency} — {r.status}
                </span>
                {r.status === "pending" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        subscriptionAction.mutate({ action: "renew", notes: `Approved request ${r.id}` })
                      }
                      disabled={subscriptionAction.isPending}
                    >
                      {t("superAdmin.approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        subscriptionAction.mutate({ action: "suspend", notes: `Rejected request ${r.id}` })
                      }
                      disabled={subscriptionAction.isPending}
                    >
                      {t("superAdmin.reject")}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
