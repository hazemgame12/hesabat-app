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
  CalendarRange,
  Database,
  LifeBuoy,
  Inbox,
} from "lucide-react";
import { CompanyProfile } from "@/pages/company";
import { Team } from "@/pages/team";
import { CostCenters } from "@/pages/cost-centers";
import { Currencies } from "@/pages/currencies";
import { Taxes } from "@/pages/taxes";
import { FiscalYears } from "@/pages/fiscal-years";
import { Backup } from "@/pages/backup";
import { Support } from "@/pages/support";
import { AdminSupport } from "@/pages/admin-support";

type SettingsTab = {
  key: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  component: React.ComponentType;
  requires?: Capability;
};

const TABS: SettingsTab[] = [
  { key: "company",      labelKey: "settings.tabs.company",      icon: Building2,    component: CompanyProfile },
  { key: "team",         labelKey: "settings.tabs.team",         icon: ShieldCheck,  component: Team,          requires: "team:manage" },
  { key: "cost-centers", labelKey: "settings.tabs.costCenters",  icon: Boxes,        component: CostCenters,   requires: "costCenters:read" },
  { key: "currencies",   labelKey: "settings.tabs.currencies",   icon: Coins,        component: Currencies,    requires: "currencies:read" },
  { key: "taxes",        labelKey: "settings.tabs.taxes",        icon: Percent,      component: Taxes,         requires: "taxes:read" },
  { key: "fiscal-years", labelKey: "settings.tabs.fiscalYears",  icon: CalendarRange,component: FiscalYears,   requires: "fiscalyear:read" },
  { key: "backup",       labelKey: "settings.tabs.backup",       icon: Database,     component: Backup },
  { key: "support",      labelKey: "settings.tabs.support",      icon: LifeBuoy,     component: Support,       requires: "support:read" },
  { key: "support-admin",labelKey: "settings.tabs.supportAdmin",  icon: Inbox,        component: AdminSupport,  requires: "support:admin" },
];

export function Settings() {
  const { t } = useTranslation();
  const [location, setLocation] = useLocation();
  const { data: user } = useGetCurrentUser();
  const role = user?.role ?? "";

  const tabs = TABS.filter((tab) => !tab.requires || hasCapability(role, tab.requires));
  const currentKey = location.split("/")[2] || tabs[0]?.key;
  const active = tabs.find((tab) => tab.key === currentKey) ?? tabs[0];
  const ActiveComponent = active?.component;

  React.useEffect(() => {
    if (active && currentKey !== active.key) {
      setLocation(`/settings/${active.key}`, { replace: true });
    }
  }, [currentKey, active, setLocation]);

  return (
    <div className="flex min-h-screen">
      {/* Settings sidebar nav — sticky, fixed width */}
      <aside className="w-56 border-l bg-card/50 flex flex-col sticky top-0 h-screen overflow-y-auto shrink-0">
        {/* Sidebar header */}
        <div className="px-4 pt-6 pb-4 border-b">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <SettingsIcon className="w-4 h-4" />
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-foreground leading-tight truncate">
                {t("settings.title")}
              </p>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">
                {t("settings.subtitle")}
              </p>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex flex-col gap-0.5 p-3 flex-1">
          {tabs.map((tab) => {
            const isActive = tab.key === active?.key;
            return (
              <Link
                key={tab.key}
                href={`/settings/${tab.key}`}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <tab.icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{t(tab.labelKey)}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Content area */}
      <div className="flex-1 overflow-auto min-h-screen bg-background">
        {ActiveComponent ? <ActiveComponent /> : null}
      </div>
    </div>
  );
}
