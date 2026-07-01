import React from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  Receipt,
  LifeBuoy,
  BarChart3,
  LogOut,
  Shield,
  ChevronDown,
  Globe,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

const navItems = [
  { labelKey: "superAdmin.nav.dashboard", icon: LayoutDashboard, href: "/super-admin" },
  { labelKey: "superAdmin.nav.companies", icon: Building2, href: "/super-admin/companies" },
  { labelKey: "superAdmin.nav.users", icon: Users, href: "/super-admin/users" },
  { labelKey: "superAdmin.nav.plans", icon: CreditCard, href: "/super-admin/packages" },
  { labelKey: "superAdmin.nav.subscriptions", icon: Receipt, href: "/super-admin/subscriptions" },
  { labelKey: "superAdmin.nav.supportTickets", icon: LifeBuoy, href: "/super-admin/support-tickets" },
  { labelKey: "superAdmin.nav.analytics", icon: BarChart3, href: "/super-admin/analytics" },
  { labelKey: "superAdmin.nav.landingPage", icon: Globe, href: "/super-admin/landing-page" },
];

function useLinkActive() {
  const [location] = useLocation();
  return (href: string) => location === href || (href !== "/" && location.startsWith(href));
}

export function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const isLinkActive = useLinkActive();

  const handleLogout = async () => {
    try {
      const res = await fetch(`/api/super-admin/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setLocation("/super-admin/login");
      }
    } catch {
      toast({ title: t("common.error"), variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 bg-card border-e border-border flex flex-col fixed h-full z-20 top-0 start-0">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl leading-none">
            <Shield className="w-5 h-5" />
          </div>
          <span className="font-bold text-xl text-primary tracking-tight">{t("superAdmin.appName")}</span>
        </div>

        <nav className="flex-1 px-4 py-2 flex flex-col gap-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = isLinkActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all text-start ${
                  active
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

        <div className="p-4 border-t border-border mt-auto flex flex-col gap-2">
          <LanguageSwitcher className="w-full justify-center" />
          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 w-full py-2 text-sm font-semibold text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            {t("nav.logout")}
          </button>
        </div>
      </aside>

      <main className="flex-1 ms-64">
        <div className="p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
