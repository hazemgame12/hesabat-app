import React from "react";
import { useTranslation } from "react-i18next";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { hasCapability } from "@workspace/permissions";
import { Boxes, FolderKanban, GitBranch } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CostCenters } from "@/pages/cost-centers";
import { Projects } from "@/pages/projects";
import { Branches } from "@/pages/branches";

const DIMENSION_TABS = [
  {
    value: "cost-centers",
    labelKey: "accountingDimensions.tabs.costCenters",
    icon: Boxes,
    canAccess: (role: string) => hasCapability(role, "costCenters:read"),
    component: CostCenters,
  },
  {
    value: "projects",
    labelKey: "accountingDimensions.tabs.projects",
    icon: FolderKanban,
    canAccess: (role: string) => hasCapability(role, "projects:read"),
    component: Projects,
  },
  {
    value: "branches",
    labelKey: "accountingDimensions.tabs.branches",
    icon: GitBranch,
    canAccess: (role: string) => hasCapability(role, "branches:read"),
    component: Branches,
  },
] as const;

export function AccountingDimensions() {
  const { t } = useTranslation();
  const { data: user } = useGetCurrentUser();
  const role = user?.role ?? "";
  const tabs = DIMENSION_TABS.filter((tab) => tab.canAccess(role));
  const [activeTab, setActiveTab] = React.useState<string>(tabs[0]?.value ?? "cost-centers");

  React.useEffect(() => {
    if (!tabs.some((tab) => tab.value === activeTab)) {
      setActiveTab(tabs[0]?.value ?? "cost-centers");
    }
  }, [activeTab, tabs]);

  const active = tabs.find((tab) => tab.value === activeTab) ?? tabs[0];

  if (!active) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">{t("accountingDimensions.noAccess")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="px-8 pt-7 pb-4">
        <h2 className="text-base font-extrabold text-foreground">{t("accountingDimensions.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("accountingDimensions.subtitle")}</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="px-8">
          <TabsList className="h-auto flex-wrap justify-start gap-2 rounded-2xl bg-muted/60 p-1.5">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-2 rounded-xl px-4 py-2 font-semibold">
                <tab.icon className="w-4 h-4" />
                {t(tab.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {tabs.map((tab) => {
          const Component = tab.component;
          return (
            <TabsContent key={tab.value} value={tab.value} className="mt-0">
              <Component embedded />
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
