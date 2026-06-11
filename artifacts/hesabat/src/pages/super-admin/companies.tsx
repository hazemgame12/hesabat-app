import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Building2, Users, ChevronDown, ChevronUp, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

async function fetchCompanies(q?: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  const res = await fetch(
    `${import.meta.env.BASE_URL}api/super-admin/companies?${params}`,
    { credentials: "include" },
  );
  if (!res.ok) throw new Error("Failed to fetch companies");
  return res.json();
}

const statusColors: Record<string, string> = {
  trial: "bg-yellow-100 text-yellow-800",
  active: "bg-green-100 text-green-800",
  expired: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
  suspended: "bg-orange-100 text-orange-800",
};

export function SuperAdminCompanies() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [companyDetail, setCompanyDetail] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["super-admin-companies", search],
    queryFn: () => fetchCompanies(search),
  });

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setCompanyDetail(null);
      return;
    }
    setExpandedId(id);
    const res = await fetch(
      `${import.meta.env.BASE_URL}api/super-admin/companies/${id}`,
      { credentials: "include" },
    );
    if (res.ok) {
      setCompanyDetail(await res.json());
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("superAdmin.companiesTitle")}</h1>
          <p className="text-muted-foreground">{t("superAdmin.companiesSubtitle")}</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="ps-9"
          placeholder={t("superAdmin.searchCompanies")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">{t("common.loading")}</div>
        ) : (
          data?.companies?.map((company: any) => (
            <Card key={company.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-semibold">{company.name}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <span>{company.country}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {company.userCount}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={statusColors[company.subscriptionStatus] || "bg-gray-100"}>
                      {company.subscriptionStatus}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleExpand(company.id)}
                    >
                      {expandedId === company.id ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {expandedId === company.id && companyDetail && (
                  <div className="mt-4 pt-4 border-t border-border space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <div className="text-sm font-medium text-muted-foreground mb-1">
                          {t("superAdmin.companyInfo")}
                        </div>
                        <div className="text-sm space-y-1">
                          <div>ID: {companyDetail.company.id}</div>
                          <div>Country: {companyDetail.company.country}</div>
                          <div>Currency: {companyDetail.company.baseCurrency}</div>
                          <div>Active: {companyDetail.company.isActive ? "Yes" : "No"}</div>
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-muted-foreground mb-1">
                          {t("superAdmin.users")}
                        </div>
                        <div className="text-sm space-y-1">
                          {companyDetail.users.map((u: any) => (
                            <div key={u.id}>
                              {u.name} ({u.email}) — {u.role}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-muted-foreground mb-1">
                          {t("superAdmin.tickets")}
                        </div>
                        <div className="text-sm space-y-1">
                          {companyDetail.tickets.length === 0 ? (
                            <div className="text-muted-foreground">No tickets</div>
                          ) : (
                            companyDetail.tickets.map((t: any) => (
                              <div key={t.id}>
                                {t.subject} — {t.status}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
