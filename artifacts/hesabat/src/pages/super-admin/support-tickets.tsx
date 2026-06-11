import React from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { HelpCircle, AlertCircle, CheckCircle, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

async function fetchTickets() {
  const res = await fetch(`/api/super-admin/support-tickets`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch tickets");
  return res.json();
}

const priorityColors: Record<string, string> = {
  low: "bg-gray-100 text-gray-800",
  medium: "bg-blue-100 text-blue-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

const statusColors: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-800",
  in_progress: "bg-blue-100 text-blue-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-800",
};

export function SuperAdminSupportTickets() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["super-admin-support-tickets"],
    queryFn: fetchTickets,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("superAdmin.ticketsTitle")}</h1>
        <p className="text-muted-foreground">{t("superAdmin.ticketsSubtitle")}</p>
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">{t("common.loading")}</div>
        ) : (
          data?.map((ticket: any) => (
            <Card key={ticket.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      <HelpCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-semibold">{ticket.subject}</div>
                      <div className="text-sm text-muted-foreground">
                        {ticket.type} · {new Date(ticket.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={priorityColors[ticket.priority] || "bg-gray-100"}>
                      {ticket.priority}
                    </Badge>
                    <Badge className={statusColors[ticket.status] || "bg-gray-100"}>
                      {ticket.status}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
