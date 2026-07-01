import { useMutation, useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
  const { data, isLoading } = useQuery({ queryKey: ["sa-company-overview", companyId], queryFn: () => fetchOverview(companyId), enabled: !!companyId });
  const { data: activity = [] } = useQuery({ queryKey: ["sa-company-activity", companyId], queryFn: () => fetchActivity(companyId), enabled: !!companyId });
  const impersonate = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/super-admin/companies/${companyId}/impersonate`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      window.location.href = "/hesabat/";
    },
  });

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Company Overview</h1>
      <Card><CardContent className="p-5 space-y-2 text-sm">
        <div>Name: {data?.company?.name}</div>
        <div>Country: {data?.company?.country}</div>
        <div>Status: {data?.company?.subscriptionStatus}</div>
        <div>Users: {data?.summary?.usersCount ?? 0}</div>
        <div>Journal Entries: {data?.summary?.journalEntries ?? 0}</div>
        <div>Invoices: {data?.summary?.invoices ?? 0}</div>
        <div>Customers: {data?.summary?.customers ?? 0}</div>
        <div>Suppliers: {data?.summary?.suppliers ?? 0}</div>
        <div>Bank Accounts: {data?.summary?.bankAccounts ?? 0}</div>
        <div>Fixed Assets: {data?.summary?.fixedAssets ?? 0}</div>
        <div>Employees: {data?.summary?.employees ?? 0}</div>
      </CardContent></Card>
      <Button onClick={() => impersonate.mutate()}>Login as Company</Button>
      <Card><CardContent className="p-5 space-y-2 text-sm">
        <div className="font-semibold">Latest Activity</div>
        {activity.map((a: any) => (
          <div key={a.id}>{a.action} - {new Date(a.createdAt).toLocaleString()}</div>
        ))}
      </CardContent></Card>
    </div>
  );
}
