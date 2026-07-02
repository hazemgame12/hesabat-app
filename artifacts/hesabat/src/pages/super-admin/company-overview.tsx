import { useMutation, useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type ActivityRow = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
};

type OverviewData = {
  company: {
    id: string;
    name: string;
    country: string;
    subscriptionStatus: string;
    trialEndsAt: string | null;
    planId: string | null;
    createdAt: string;
  };
  plan: { nameAr: string; nameEn: string; price: string; currency: string } | null;
  activeSubscription: { endsAt: string | null; billingCycle: string | null; amount: string | null; currency: string | null } | null;
  summary: {
    usersCount: number;
    journalEntries: number;
    invoices: number;
    customers: number;
    suppliers: number;
    bankAccounts: number;
    fixedAssets: number;
    employees: number;
  };
};

const STATUS_BADGE: Record<string, string> = {
  trial: "bg-yellow-100 text-yellow-800",
  active: "bg-green-100 text-green-800",
  expired: "bg-red-100 text-red-800",
  suspended: "bg-orange-100 text-orange-800",
  pending_payment: "bg-blue-100 text-blue-800",
};

export function SuperAdminCompanyOverview() {
  const [, params] = useRoute("/super-admin/companies/:companyId/overview");
  const companyId = params?.companyId ?? "";
  const { t, i18n } = useTranslation();
  const isAr = i18n.language !== "en";
  const { toast } = useToast();

  const { data, isLoading } = useQuery<OverviewData>({
    queryKey: ["sa-company-overview", companyId],
    queryFn: async () => {
      const res = await fetch(`/api/super-admin/companies/${companyId}/overview`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!companyId,
  });

  const { data: activity = [] } = useQuery<ActivityRow[]>({
    queryKey: ["sa-company-activity", companyId],
    queryFn: async () => {
      const res = await fetch(`/api/super-admin/companies/${companyId}/activity`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!companyId,
  });

  const impersonate = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/super-admin/companies/${companyId}/impersonate`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      window.location.href = "/hesabat/";
    },
    onError: () => toast({ title: t("common.error"), variant: "destructive" }),
  });

  if (isLoading) return <div className="text-muted-foreground">{t("common.loading")}</div>;

  const company = data?.company;
  const plan = data?.plan;
  const sub = data?.activeSubscription;
  const summary = data?.summary;

  const planName = plan ? (isAr ? plan.nameAr : plan.nameEn) : null;

  const fmt = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString(isAr ? "ar-EG" : "en-US") : "-";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("superAdmin.companyOverviewTitle")}</h1>

      {/* Company & Subscription Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("superAdmin.companyInfo")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="font-medium">{t("superAdmin.companyName")}:</span>
            <span>{company?.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">{t("superAdmin.country")}:</span>
            <span>{company?.country}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-medium">{t("superAdmin.subscriptionStatus")}:</span>
            <Badge className={STATUS_BADGE[company?.subscriptionStatus ?? ""] ?? "bg-gray-100 text-gray-800"}>
              {company?.subscriptionStatus ?? "-"}
            </Badge>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">{isAr ? "الباقة الحالية" : "Current Plan"}:</span>
            <span>{planName ?? "-"}</span>
          </div>
          {plan && (
            <div className="flex justify-between">
              <span className="font-medium">{isAr ? "سعر الباقة" : "Plan Price"}:</span>
              <span>{plan.price} {plan.currency}</span>
            </div>
          )}
          {sub && (
            <>
              <div className="flex justify-between">
                <span className="font-medium">{isAr ? "ينتهي الاشتراك" : "Subscription ends"}:</span>
                <span>{fmt(sub.endsAt)}</span>
              </div>
              {sub.amount && (
                <div className="flex justify-between">
                  <span className="font-medium">{isAr ? "قيمة الاشتراك" : "Subscription amount"}:</span>
                  <span>{sub.amount} {sub.currency} / {sub.billingCycle}</span>
                </div>
              )}
            </>
          )}
          {company?.subscriptionStatus === "trial" && (
            <div className="flex justify-between">
              <span className="font-medium">{t("superAdmin.trialEndsAt")}:</span>
              <span>{fmt(company.trialEndsAt)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="font-medium">{isAr ? "تاريخ التسجيل" : "Registered"}:</span>
            <span>{fmt(company?.createdAt)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Usage summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isAr ? "ملخص الاستخدام" : "Usage Summary"}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {[
            [t("superAdmin.usersCount"), summary?.usersCount],
            [t("superAdmin.journalEntries"), summary?.journalEntries],
            [t("superAdmin.invoices"), summary?.invoices],
            [t("superAdmin.customers"), summary?.customers],
            [t("superAdmin.suppliers"), summary?.suppliers],
            [t("superAdmin.bankAccounts"), summary?.bankAccounts],
            [t("superAdmin.fixedAssets"), summary?.fixedAssets],
            [t("superAdmin.employees"), summary?.employees],
          ].map(([label, val]) => (
            <div key={String(label)} className="flex flex-col items-center justify-center rounded-md border p-2 text-center">
              <span className="text-lg font-bold">{val ?? 0}</span>
              <span className="text-xs text-muted-foreground">{String(label)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Impersonate */}
      <Button onClick={() => impersonate.mutate()} disabled={impersonate.isPending}>
        {t("superAdmin.loginAsCompany")}
      </Button>

      {/* Activity log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("superAdmin.latestActivity")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {activity.length === 0 && (
            <div className="text-muted-foreground">{t("superAdmin.noActivity")}</div>
          )}
          {activity.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-2 border-b last:border-0 pb-1.5 last:pb-0">
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium truncate">{a.action}</p>
                <p className="text-xs text-muted-foreground">
                  {a.entity}{a.entityId ? ` · ${a.entityId.slice(0, 8)}` : ""}
                  {a.userName ? ` · ${a.userName}` : a.userEmail ? ` · ${a.userEmail}` : ""}
                </p>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(a.createdAt).toLocaleString(isAr ? "ar-EG" : "en-US")}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
