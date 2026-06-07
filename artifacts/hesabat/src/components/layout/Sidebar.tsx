import React from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useLogout, useGetCurrentUser, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { hasCapability, type RoleId, type Capability } from "@workspace/permissions";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import {
  LayoutDashboard,
  Receipt,
  FileText,
  HandCoins,
  Landmark,
  ListTree,
  LogOut,
  Users,
  Boxes,
  Package,
  Wallet,
  Settings
} from "lucide-react";

type NavItem = {
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  requires?: Capability;
};

const navItems: NavItem[] = [
  { labelKey: "nav.dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { labelKey: "nav.accounts", icon: ListTree, href: "/accounts" },
  { labelKey: "nav.journal", icon: FileText, href: "/journal" },
  { labelKey: "nav.assets", icon: Boxes, href: "/assets", requires: "assets:read" },
  { labelKey: "nav.inventory", icon: Package, href: "/inventory", requires: "inventory:read" },
  { labelKey: "nav.payroll", icon: Wallet, href: "/payroll", requires: "payroll:read" },
  { labelKey: "nav.bank", icon: Landmark, href: "/bank" },
  { labelKey: "nav.advances", icon: HandCoins, href: "/advances" },
  { labelKey: "nav.sales", icon: Users, href: "/sales" },
  { labelKey: "nav.purchases", icon: Receipt, href: "/purchases" },
  { labelKey: "nav.reports", icon: FileText, href: "/reports" },
  { labelKey: "nav.settings", icon: Settings, href: "/settings" },
];

export function Sidebar() {
  const { t } = useTranslation();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user } = useGetCurrentUser();
  const logout = useLogout();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        queryClient.clear();
        setLocation("/login");
      }
    });
  };

  const roleLabel = user?.role
    ? t(`roles.${user.role as RoleId}.label`, { defaultValue: t("nav.member") })
    : t("nav.member");

  return (
    <aside className="w-64 bg-card border-e border-border flex flex-col fixed h-full z-20 top-0 start-0">
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl leading-none">
          ح
        </div>
        <span className="font-bold text-xl text-primary tracking-tight">{t("common.appName")}</span>
      </div>

      <nav className="flex-1 px-4 py-2 flex flex-col gap-1 overflow-y-auto">
        {navItems.filter((item) => !item.requires || hasCapability(user?.role ?? "", item.requires)).map((item) => {
          const isActive = location === item.href || (location.startsWith(item.href) && item.href !== "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all text-start ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1 text-start">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border mt-auto">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted transition-colors">
            <div className="w-10 h-10 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold uppercase shrink-0">
              {user?.name?.[0] || t("nav.defaultInitial")}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-bold truncate">{user?.name}</span>
              <span className="text-xs text-muted-foreground truncate">{roleLabel}</span>
            </div>
          </div>
          <LanguageSwitcher className="w-full justify-center" />
          <button
            onClick={handleLogout}
            disabled={logout.isPending}
            className="flex items-center justify-center gap-2 w-full py-2 text-sm font-semibold text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            {t("nav.logout")}
          </button>
        </div>
      </div>
    </aside>
  );
}
