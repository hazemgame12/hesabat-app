import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Users, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

async function fetchUsers(q?: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  const res = await fetch(
    `${import.meta.env.BASE_URL}api/super-admin/users?${params}`,
    { credentials: "include" },
  );
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json();
}

export function SuperAdminUsers() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["super-admin-users", search],
    queryFn: () => fetchUsers(search),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("superAdmin.usersTitle")}</h1>
        <p className="text-muted-foreground">{t("superAdmin.usersSubtitle")}</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="ps-9"
          placeholder={t("superAdmin.searchUsers")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">{t("common.loading")}</div>
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
                <Badge variant="outline">{user.role}</Badge>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
