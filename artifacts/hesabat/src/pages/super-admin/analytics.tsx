import React from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, TrendingUp, Globe, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

async function fetchStats() {
  const res = await fetch(`${import.meta.env.BASE_URL}api/super-admin/stats`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export function SuperAdminAnalytics() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["super-admin-stats"],
    queryFn: fetchStats,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("superAdmin.analyticsTitle")}</h1>
        <p className="text-muted-foreground">{t("superAdmin.analyticsSubtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="w-5 h-5 text-primary" />
              {t("superAdmin.monthlySignups")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-4 text-muted-foreground">{t("common.loading")}</div>
            ) : (
              <div className="space-y-2">
                {data?.monthlySignups?.map((row: any) => (
                  <div key={row.month} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <span className="text-sm font-medium">{row.month}</span>
                    <span className="text-sm font-bold">{row.count}</span>
                  </div>
                ))}
                {data?.monthlySignups?.length === 0 && (
                  <div className="text-muted-foreground text-center py-4">No data yet</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Globe className="w-5 h-5 text-primary" />
              {t("superAdmin.byCountry")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-4 text-muted-foreground">{t("common.loading")}</div>
            ) : (
              <div className="space-y-2">
                {data?.byCountry?.map((row: any) => (
                  <div key={row.country} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <span className="text-sm font-medium">{row.country}</span>
                    <span className="text-sm font-bold">{row.count}</span>
                  </div>
                ))}
                {data?.byCountry?.length === 0 && (
                  <div className="text-muted-foreground text-center py-4">No data yet</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="w-5 h-5 text-primary" />
              {t("superAdmin.byStatus")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-4 text-muted-foreground">{t("common.loading")}</div>
            ) : (
              <div className="space-y-2">
                {data?.byStatus?.map((row: any) => (
                  <div key={row.status || "unknown"} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <span className="text-sm font-medium">{row.status || "unknown"}</span>
                    <span className="text-sm font-bold">{row.count}</span>
                  </div>
                ))}
                {data?.byStatus?.length === 0 && (
                  <div className="text-muted-foreground text-center py-4">No data yet</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
