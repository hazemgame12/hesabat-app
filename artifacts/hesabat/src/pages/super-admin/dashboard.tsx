import React from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Users,
  CreditCard,
  Clock,
  AlertCircle,
  TrendingUp,
  XCircle,
  HelpCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

async function fetchDashboard() {
  const res = await fetch(`${import.meta.env.BASE_URL}api/super-admin/dashboard`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch dashboard");
  return res.json();
}

export function SuperAdminDashboard() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["super-admin-dashboard"],
    queryFn: fetchDashboard,
  });

  const stats = [
    { label: t("superAdmin.totalCompanies"), value: data?.totalCompanies ?? 0, icon: Building2 },
    { label: t("superAdmin.activeCompanies"), value: data?.activeCompanies ?? 0, icon: TrendingUp },
    { label: t("superAdmin.totalUsers"), value: data?.totalUsers ?? 0, icon: Users },
    { label: t("superAdmin.activeSubscriptions"), value: data?.activeSubscriptions ?? 0, icon: CreditCard },
    { label: t("superAdmin.trialCompanies"), value: data?.trialCompanies ?? 0, icon: Clock },
    { label: t("superAdmin.expiredCompanies"), value: data?.expiredCompanies ?? 0, icon: XCircle },
    { label: t("superAdmin.openTickets"), value: data?.openTickets ?? 0, icon: HelpCircle },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("superAdmin.dashboardTitle")}</h1>
        <p className="text-muted-foreground">{t("superAdmin.dashboardSubtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {isLoading ? "..." : stat.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
