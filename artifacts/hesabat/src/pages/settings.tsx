import React from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { hasCapability, type Capability } from "@workspace/permissions";
import {
  Settings as SettingsIcon,
  Building2,
  ShieldCheck,
  Boxes,
  Coins,
  Percent,
} from "lucide-react";
import { CompanyProfile } from "@/pages/company";
import { Team } from "@/pages/team";
import { CostCenters } from "@/pages/cost-centers";
import { Currencies } from "@/pages/currencies";
import { Taxes } from "@/pages/taxes";

type SettingsTab = {
  key: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  component: React.ComponentType;
  requires?: Capability;
};

const TABS: SettingsTab[] = [
  {
    key: "company",
    labelKey: "settings.tabs.company",
    icon: Building2,
    component: CompanyProfile,
  },
  {
    key: "team",
    labelKey: "settings.tabs.team",
    icon: ShieldCheck,
    component: Team,
    requires: "team:manage",
  },
  {
    key: "cost-centers",
    labelKey: "settings.tabs.costCenters",
    icon: Boxes,
    component: CostCenters,
    requires: "costCenters:read",
  },
  {
    key: "currencies",
    labelKey: "settings.tabs.currencies",
    icon: Coins,
    component: Currencies,
    requires: "currencies:read",
  },
  {
    key: "taxes",
    labelKey: "settings.tabs.taxes",
    icon: Percent,
    component: Taxes,
    requires: "taxes:read",
  },
];

export function Settings() {
  const { t } = useTranslation();
  const [location, setLocation] = useLocation();
  const { data: user } = useGetCurrentUser();
  const role = user?.role ?? "";

  const tabs = TABS.filter(
    (tab) => !tab.requires || hasCapability(role, tab.requires),
  );
  const currentKey = location.split("/")[2] || tabs[0]?.key;
  const active = tabs.find((tab) => tab.key === currentKey) ?? tabs[0];
  const ActiveComponent = active?.component;

  React.useEffect(() => {
    if (active && currentKey !== active.key) {
      setLocation(`/settings/${active.key}`, { replace: true });
    }
  }, [currentKey, active, setLocation]);

  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-background/80 backdrop-blur-md border-b sticky top-0 z-20">
        <div className="flex items-center gap-4 px-8 pt-5">
          <div className="w-12 h-12 rounded-xl bg-card border shadow-sm flex items-center justify-center text-primary">
            <SettingsIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">
              {t("settings.title")}
            </h1>
            <p className="text-sm text-muted-foreground font-medium">
              {t("settings.subtitle")}
            </p>
          </div>
        </div>
        <nav className="flex gap-1 px-6 mt-4 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = tab.key === active?.key;
            return (
              <Link
                key={tab.key}
                href={`/settings/${tab.key}`}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <tab.icon className="w-4 h-4 flex-shrink-0" />
                {t(tab.labelKey)}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="flex-1">
        {ActiveComponent ? <ActiveComponent /> : null}
      </div>
    </div>
  );
}
