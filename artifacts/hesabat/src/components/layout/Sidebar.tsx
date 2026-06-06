import React from "react";
import { Link, useLocation } from "wouter";
import { useLogout, useGetCurrentUser, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { hasCapability, ROLE_LABELS, type RoleId, type Capability } from "@workspace/permissions";
import {
  LayoutDashboard,
  Receipt,
  FileText,
  Boxes,
  HandCoins,
  Landmark,
  ListTree,
  LogOut,
  Users,
  ShieldCheck,
  Building2
} from "lucide-react";

type NavItem = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  requires?: Capability;
};

const navItems: NavItem[] = [
  { label: "لوحة التحكم", icon: LayoutDashboard, href: "/dashboard" },
  { label: "شجرة الحسابات", icon: ListTree, href: "/accounts" },
  { label: "القيود اليومية", icon: FileText, href: "/journal" },
  { label: "البنوك والنقدية", icon: Landmark, href: "/bank" },
  { label: "العهد والسلف", icon: HandCoins, href: "/advances" },
  { label: "المبيعات والعملاء", icon: Users, href: "/sales" },
  { label: "المشتريات والموردين", icon: Receipt, href: "/purchases" },
  { label: "مراكز التكلفة والمشاريع", icon: Boxes, href: "/cost-centers" },
  { label: "التقارير المالية", icon: FileText, href: "/reports" },
  { label: "الفريق والصلاحيات", icon: ShieldCheck, href: "/team", requires: "team:manage" },
  { label: "بيانات الشركة", icon: Building2, href: "/company" },
];

export function Sidebar() {
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

  return (
    <aside className="w-64 bg-card border-l border-border flex flex-col fixed h-full z-20 top-0 right-0">
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl leading-none">
          ح
        </div>
        <span className="font-bold text-xl text-primary tracking-tight">حسابات</span>
      </div>

      <nav className="flex-1 px-4 py-2 flex flex-col gap-1 overflow-y-auto">
        {navItems.filter((item) => !item.requires || hasCapability(user?.role ?? "", item.requires)).map((item) => {
          const isActive = location === item.href || (location.startsWith(item.href) && item.href !== "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all text-right ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1 text-right">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border mt-auto">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted transition-colors">
            <div className="w-10 h-10 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold uppercase shrink-0">
              {user?.name?.[0] || 'م'}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-bold truncate">{user?.name}</span>
              <span className="text-xs text-muted-foreground truncate">{ROLE_LABELS[user?.role as RoleId] ?? "عضو"}</span>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            disabled={logout.isPending}
            className="flex items-center justify-center gap-2 w-full py-2 text-sm font-semibold text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            تسجيل الخروج
          </button>
        </div>
      </div>
    </aside>
  );
}