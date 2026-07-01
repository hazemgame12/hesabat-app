import React from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

async function fetchSubscription() {
  const res = await fetch("/api/company/subscription", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load subscription");
  return res.json();
}

async function requestRenewal(payload: { packageId?: string; billingPeriod: "monthly" | "yearly" | "custom"; amount: string; currency: string; notes?: string }) {
  const res = await fetch("/api/company/subscription/renewal-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to submit renewal request");
  return res.json();
}

export function SubscriptionSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [amount, setAmount] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const { data, isLoading } = useQuery({ queryKey: ["company-subscription"], queryFn: fetchSubscription });
  const renew = useMutation({
    mutationFn: requestRenewal,
    onSuccess: () => {
      toast({ title: t("subscription.requestRenewal"), description: t("common.success") });
      queryClient.invalidateQueries({ queryKey: ["company-subscription"] });
    },
    onError: () => toast({ title: t("common.error"), variant: "destructive" }),
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">{t("common.loading")}</div>;

  const plan = data?.plan;
  const company = data?.company;
  const status = company?.subscriptionStatus ?? "trial";

  return (
    <div className="p-6 lg:p-8 max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("subscription.title")}</h1>
      </div>
      <Card>
        <CardContent className="p-5 grid md:grid-cols-2 gap-4 text-sm">
          <div><div className="text-muted-foreground">{t("subscription.currentPackage")}</div><div className="font-semibold">{plan?.nameAr ?? "-"}</div></div>
          <div><div className="text-muted-foreground">{t("subscription.status")}</div><Badge>{status}</Badge></div>
          <div><div className="text-muted-foreground">{t("subscription.startDate")}</div><div>{data?.latestSubscription?.startedAt ? new Date(data.latestSubscription.startedAt).toLocaleDateString() : "-"}</div></div>
          <div><div className="text-muted-foreground">{t("subscription.endDate")}</div><div>{data?.latestSubscription?.endsAt ? new Date(data.latestSubscription.endsAt).toLocaleDateString() : "-"}</div></div>
          <div><div className="text-muted-foreground">{t("subscription.remainingDays")}</div><div>{data?.remainingDays ?? "-"}</div></div>
          <div><div className="text-muted-foreground">{t("subscription.country")}</div><div>{company?.country ?? "-"}</div></div>
          <div><div className="text-muted-foreground">{t("subscription.currency")}</div><div>{plan?.currencyCode ?? company?.baseCurrency ?? "-"}</div></div>
          <div><div className="text-muted-foreground">{t("subscription.price")}</div><div>{plan?.monthlyPrice ?? plan?.price ?? "-"}</div></div>
          <div><div className="text-muted-foreground">{t("subscription.usersUsage")}</div><div>{data?.usersCount ?? 0} / {plan?.maxUsers ?? "-"}</div></div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-3">
          <h2 className="font-semibold">{t("subscription.requestRenewal")}</h2>
          <div className="grid md:grid-cols-2 gap-3">
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t("subscription.price")} />
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" />
          </div>
          <Button
            onClick={() =>
              renew.mutate({
                packageId: plan?.id,
                billingPeriod: "monthly",
                amount: amount || String(plan?.monthlyPrice ?? plan?.price ?? "0"),
                currency: plan?.currencyCode ?? company?.baseCurrency ?? "EGP",
                notes,
              })
            }
            disabled={renew.isPending}
          >
            {t("subscription.requestRenewal")}
          </Button>
          <div className="text-sm text-muted-foreground space-y-1">
            {(data?.manualInstructions ?? []).map((m: any, i: number) => (
              <div key={i}>{m.instructionsAr || m.instructionsEn || `${m.methodName}`}</div>
            ))}
            {(data?.manualInstructions ?? []).length === 0 ? <div>Contact support to activate</div> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
