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
  ReceiptText,
  FileText,
  FileSpreadsheet,
  HandCoins,
  Landmark,
  ListTree,
  LogOut,
  Users,
  Boxes,
  Package,
  Wallet,
  Scale,
  Settings,
  History,
  TrendingUp,
  Calculator,
  ShoppingCart,
  Warehouse,
  Banknote,
  UserCog,
  BarChart3,
  ChevronDown,
  ShieldCheck,
  ClipboardList,
  FileOutput,
  ArrowDownLeft,
  ArrowUpRight,
  FileBarChart2,
  TrendingUp as TrendingUpIcon,
  Inbox,
} from "lucide-react";

type IconType = React.ComponentType<{ className?: string }>;

type NavLink = {
  labelKey: string;
  icon: IconType;
  href: string;
  requires?: Capability;
};

type NavGroup = {
  groupKey: string;
  labelKey: string;
  icon: IconType;
  children: NavLink[];
};

type NavEntry = NavLink | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return (entry as NavGroup).children !== undefined;
}

const navEntries: NavEntry[] = [
  // 1. لوحة التحكم
  { labelKey: "nav.dashboard", icon: LayoutDashboard, href: "/dashboard" },
  // 2. الخزينة والبنوك
  {
    groupKey: "treasury",
    labelKey: "nav.groups.treasury",
    icon: Banknote,
    children: [
      { labelKey: "nav.bank", icon: Landmark, href: "/bank", requires: "bank:read" },
      { labelKey: "nav.advances", icon: HandCoins, href: "/advances", requires: "advances:read" },
    ],
  },
  // 3. العملاء والمبيعات
  {
    groupKey: "sales",
    labelKey: "nav.groups.sales",
    icon: ShoppingCart,
    children: [
      { labelKey: "nav.sales", icon: Users, href: "/sales", requires: "customers:read" },
      { labelKey: "nav.invoicesSales", icon: ReceiptText, href: "/invoices/sales", requires: "invoices:read" },
      { labelKey: "nav.quotations", icon: FileOutput, href: "/quotations", requires: "invoices:read" },
      { labelKey: "nav.collections", icon: ArrowDownLeft, href: "/collections", requires: "payments:read" },
    ],
  },
  // 4. الموردين والمشتريات
  {
    groupKey: "purchases",
    labelKey: "nav.groups.purchases",
    icon: Warehouse,
    children: [
      { labelKey: "nav.purchases", icon: Receipt, href: "/purchases", requires: "suppliers:read" },
      { labelKey: "nav.invoicesPurchases", icon: FileSpreadsheet, href: "/invoices/purchases", requires: "invoices:read" },
      { labelKey: "nav.purchaseOrders", icon: ClipboardList, href: "/purchase-orders", requires: "invoices:read" },
      { labelKey: "nav.vendorPayments", icon: ArrowUpRight, href: "/vendor-payments", requires: "payments:read" },
    ],
  },
  // 5. المحاسبة (القيود + شجرة الحسابات + أرصدة افتتاحية + إعادة تقييم)
  {
    groupKey: "accounting",
    labelKey: "nav.groups.accounting",
    icon: Calculator,
    children: [
      { labelKey: "nav.journal", icon: FileText, href: "/journal" },
      { labelKey: "nav.accounts", icon: ListTree, href: "/accounts" },
      { labelKey: "nav.openingBalances", icon: Scale, href: "/opening-balances", requires: "journal:read" },
      { labelKey: "nav.revaluation", icon: TrendingUp, href: "/revaluation", requires: "revaluation:read" },
    ],
  },
  // 6. الأصول الثابتة
  { labelKey: "nav.assets", icon: Boxes, href: "/assets", requires: "assets:read" },
  // 7. المخزون
  { labelKey: "nav.inventory", icon: Package, href: "/inventory", requires: "inventory:read" },
  // 8. الفاتورة الإلكترونية
  { labelKey: "nav.eInvoice", icon: Receipt, href: "/e-invoice" },
  // 9. الموارد البشرية
  {
    groupKey: "hr",
    labelKey: "nav.groups.hr",
    icon: UserCog,
    children: [
      { labelKey: "nav.team", icon: Users, href: "/settings/team" },
      { labelKey: "nav.payroll", icon: Wallet, href: "/payroll", requires: "payroll:read" },
    ],
  },
  // 10. التقارير والمراجعة
  {
    groupKey: "reports",
    labelKey: "nav.groups.reports",
    icon: BarChart3,
    children: [
      { labelKey: "nav.financialReports", icon: FileBarChart2, href: "/reports/financial" },
      { labelKey: "nav.taxDeclarations", icon: ClipboardList, href: "/reports/tax" },
      { labelKey: "nav.financialAnalysis", icon: TrendingUpIcon, href: "/reports/analysis" },
      { labelKey: "nav.audit", icon: History, href: "/audit", requires: "audit:read" },
    ],
  },
  // 11. صندوق المستندات
  { labelKey: "nav.documents", icon: Inbox, href: "/documents" },
  // 12. إعدادات الشركة
  { labelKey: "nav.settings", icon: Settings, href: "/settings" },
];

function useLinkActive() {
  const [location] = useLocation();
  return (href: string) =>
    location === href || (href !== "/" && location.startsWith(href));
}

export function Sidebar() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user } = useGetCurrentUser();
  const logout = useLogout();
  const isLinkActive = useLinkActive();

  const role = user?.role ?? "";
  const canSee = (item: NavLink) => !item.requires || hasCapability(role, item.requires);

  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({});

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

  const renderLink = (item: NavLink, nested = false) => {
    const active = isLinkActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all text-start ${
          nested ? "ps-6" : ""
        } ${
          active
            ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <item.icon className="w-5 h-5 flex-shrink-0" />
        <span className="flex-1 text-start">{t(item.labelKey)}</span>
      </Link>
    );
  };

  return (
    <aside className="w-64 bg-card border-e border-border flex flex-col fixed h-full z-20 top-0 start-0">
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl leading-none">
          ح
        </div>
        <span className="font-bold text-xl text-primary tracking-tight">{t("common.appName")}</span>
      </div>

      <nav className="flex-1 px-4 py-2 flex flex-col gap-1 overflow-y-auto">
        {navEntries.map((entry) => {
          if (!isGroup(entry)) {
            return canSee(entry) ? renderLink(entry) : null;
          }

          const visibleChildren = entry.children.filter(canSee);
          if (visibleChildren.length === 0) return null;

          const groupActive = visibleChildren.some((c) => isLinkActive(c.href));
          const expanded = openGroups[entry.groupKey] ?? groupActive;

          return (
            <div key={entry.groupKey} className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() =>
                  setOpenGroups((prev) => ({ ...prev, [entry.groupKey]: !expanded }))
                }
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all text-start ${
                  groupActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <entry.icon className="w-5 h-5 flex-shrink-0" />
                <span className="flex-1 text-start">{t(entry.labelKey)}</span>
                <ChevronDown
                  className={`w-4 h-4 flex-shrink-0 transition-transform ${
                    expanded ? "" : "-rotate-90"
                  }`}
                />
              </button>
              {expanded && (
                <div className="flex flex-col gap-1">
                  {visibleChildren.map((child) => renderLink(child, true))}
                </div>
              )}
            </div>
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
