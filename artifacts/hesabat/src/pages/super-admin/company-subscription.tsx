import React from "react";
import { useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

async function fetchData(companyId: string) {
  const res = await fetch(`/api/super-admin/companies/${companyId}/subscription`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export function SuperAdminCompanySubscription() {
  const [, params] = useRoute("/super-admin/companies/:companyId/subscription");
  const companyId = params?.companyId ?? "";
  const queryClient = useQueryClient();
  const [endDate, setEndDate] = React.useState("");
  const { data, isLoading } = useQuery({ queryKey: ["sa-company-subscription", companyId], queryFn: () => fetchData(companyId), enabled: !!companyId });
  const patch = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/super-admin/companies/${companyId}/subscription`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sa-company-subscription", companyId] }),
  });
  const renew = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/super-admin/companies/${companyId}/renew`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ endsAt: endDate || undefined }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sa-company-subscription", companyId] }),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Company Subscription</h1>
      <Card>
        <CardContent className="p-5 space-y-2 text-sm">
          <div>Package: {data?.plan?.nameAr ?? "-"}</div>
          <div>Status: {data?.company?.subscriptionStatus ?? "-"}</div>
          <div>Trial Ends: {data?.company?.trialEndsAt ? new Date(data.company.trialEndsAt).toLocaleDateString() : "-"}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => patch.mutate({ subscriptionStatus: "active" })}>Activate</Button>
            <Button variant="outline" onClick={() => patch.mutate({ subscriptionStatus: "suspended" })}>Suspend</Button>
            <Button variant="outline" onClick={() => patch.mutate({ subscriptionStatus: "trial" })}>Extend Trial</Button>
          </div>
          <div className="flex gap-2 items-center">
            <Input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <Button onClick={() => renew.mutate()}>Renew</Button>
          </div>
          <div className="space-y-2">
            {(data?.requests ?? []).map((r: any) => (
              <div key={r.id} className="border rounded p-2 text-sm flex items-center justify-between">
                <span>{r.amount} {r.currency} - {r.status}</span>
                {r.status === "pending" ? (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => patch.mutate({ renewalRequestId: r.id, renewalDecision: "approved" })}>Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => patch.mutate({ renewalRequestId: r.id, renewalDecision: "rejected" })}>Reject</Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
