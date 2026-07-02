import { useMutation, useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

async function fetchOverview(companyId: string) {
  const res = await fetch(`/api/super-admin/companies/${companyId}/overview`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function fetchActivity(companyId: string) {
  const res = await fetch(`/api/super-admin/companies/${companyId}/activity`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export function SuperAdminCompanyOverview() {
  const [, params] = useRoute("/super-admin/companies/:companyId/overview");
  const companyId = params?.companyId ?? "";
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["sa-company-overview", companyId],
    queryFn: () => fetchOverview(companyId),
    enabled: !!companyId,
  });
  const { data: activity = [] } = useQuery({
    queryKey: ["sa-company-activity", companyId],
    queryFn: () => fetchActivity(companyId),
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
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("superAdmin.companyOverviewTitle")}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("superAdmin.companyInfo")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div><span className="font-medium">{t("superAdmin.companyName")}: </span>{data?.company?.name}</div>
          <div><span className="font-medium">{t("superAdmin.country")}: </span>{data?.company?.country}</div>
          <div><span className="font-medium">{t("superAdmin.subscriptionStatus")}: </span>{data?.company?.subscriptionStatus}</div>
          <div><span className="font-medium">{t("superAdmin.usersCount")}: </span>{data?.summary?.usersCount ?? 0}</div>
          <div><span className="font-medium">{t("superAdmin.journalEntries")}: </span>{data?.summary?.journalEntries ?? 0}</div>
          <div><span className="font-medium">{t("superAdmin.invoices")}: </span>{data?.summary?.invoices ?? 0}</div>
          <div><span className="font-medium">{t("superAdmin.customers")}: </span>{data?.summary?.customers ?? 0}</div>
          <div><span className="font-medium">{t("superAdmin.suppliers")}: </span>{data?.summary?.suppliers ?? 0}</div>
          <div><span className="font-medium">{t("superAdmin.bankAccounts")}: </span>{data?.summary?.bankAccounts ?? 0}</div>
          <div><span className="font-medium">{t("superAdmin.fixedAssets")}: </span>{data?.summary?.fixedAssets ?? 0}</div>
          <div><span className="font-medium">{t("superAdmin.employees")}: </span>{data?.summary?.employees ?? 0}</div>
        </CardContent>
      </Card>
      <Button onClick={() => impersonate.mutate()} disabled={impersonate.isPending}>
        {t("superAdmin.loginAsCompany")}
      </Button>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("superAdmin.latestActivity")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(activity as any[]).length === 0 && (
            <div className="text-muted-foreground">{t("superAdmin.noActivity")}</div>
          )}
          {(activity as any[]).map((a: any) => (
            <div key={a.id}>{a.action} — {new Date(a.createdAt).toLocaleString()}</div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
