import React from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Receipt, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

async function fetchSubscriptions() {
  const res = await fetch(`/api/super-admin/subscriptions`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch subscriptions");
  return res.json();
}

const statusIcons: Record<string, React.ReactNode> = {
  trial: <Clock className="w-4 h-4 text-yellow-600" />,
  active: <CheckCircle className="w-4 h-4 text-green-600" />,
  expired: <XCircle className="w-4 h-4 text-red-600" />,
  cancelled: <AlertCircle className="w-4 h-4 text-gray-600" />,
  suspended: <AlertCircle className="w-4 h-4 text-orange-600" />,
};

const statusColors: Record<string, string> = {
  trial: "bg-yellow-100 text-yellow-800",
  active: "bg-green-100 text-green-800",
  expired: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
  suspended: "bg-orange-100 text-orange-800",
};

export function SuperAdminSubscriptions() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["super-admin-subscriptions"],
    queryFn: fetchSubscriptions,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("superAdmin.subscriptionsTitle")}</h1>
        <p className="text-muted-foreground">{t("superAdmin.subscriptionsSubtitle")}</p>
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">{t("common.loading")}</div>
        ) : (
          data?.map((sub: any) => (
            <Card key={sub.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold">
                      {sub.providerSubscriptionId || sub.id}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {sub.amount} {sub.currency} / {sub.billingCycle}
                      · Started {new Date(sub.startedAt).toLocaleDateString()}
                      {sub.endsAt && ` · Ends ${new Date(sub.endsAt).toLocaleDateString()}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {statusIcons[sub.status]}
                  <Badge className={statusColors[sub.status] || "bg-gray-100"}>
                    {sub.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
