import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Search, KeyRound, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

async function fetchUsers(q?: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  const res = await fetch(`/api/super-admin/users?${params}`, { credentials: "include" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${body || res.statusText}`);
  }
  return res.json();
}

async function updatePassword(id: string, password: string) {
  const res = await fetch(`/api/super-admin/users/${id}/password`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error("Failed to update password");
  return res.json();
}

export function SuperAdminUsers() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editingPassword, setEditingPassword] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["super-admin-users", search],
    queryFn: () => fetchUsers(search),
    retry: false,
  });

  const updatePwd = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => updatePassword(id, password),
    onSuccess: () => {
      setEditingPassword(null);
      setNewPassword("");
      toast({ title: t("common.success") });
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("superAdmin.usersTitle")}</h1>
        <p className="text-muted-foreground">{t("superAdmin.usersSubtitle")}</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="ps-9" placeholder={t("superAdmin.searchUsers")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">{t("common.loading")}</div>
        ) : isError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            <span className="font-semibold">خطأ في تحميل المستخدمين: </span>
            {(error as Error)?.message}
          </div>
        ) : (
          data?.users?.map((user: any) => (
            <Card key={user.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                    {user.name?.[0] || "U"}
                  </div>
                  <div>
                    <div className="font-semibold">{user.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {user.email} · {user.companyName}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline">{user.role}</Badge>
                  {editingPassword === user.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        className="w-40 text-sm"
                        placeholder="كلمة مرور جديدة"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <Button size="sm" variant="ghost" onClick={() => updatePwd.mutate({ id: user.id, password: newPassword })}>
                        <Check className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditingPassword(null); setNewPassword(""); }}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setEditingPassword(user.id)}>
                      <KeyRound className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
