import React from "react";
import { useTranslation } from "react-i18next";
import { Sidebar } from "./Sidebar";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Spinner } from "@/components/ui/spinner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { Shield, LogOut, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

async function exitImpersonation() {
  const res = await fetch("/api/auth/exit-impersonation", { method: "POST" });
  if (!res.ok) throw new Error("Failed to exit impersonation");
}

function ImpersonationBanner({ adminName }: { adminName: string | null }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language !== "en";
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: exitImpersonation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
      window.location.href = "/super-admin/companies";
    },
  });

  return (
    <div
      className="fixed top-0 inset-x-0 z-50 flex items-center justify-between gap-2 px-4 py-2 bg-amber-500 text-white text-sm font-medium shadow-md"
      dir={isAr ? "rtl" : "ltr"}
    >
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 shrink-0" />
        <span>
          {isAr
            ? `أنت الآن داخل هذه الشركة كسوبر أدمن${adminName ? ` (${adminName})` : ""}`
            : `You are viewing this company as Super Admin${adminName ? ` (${adminName})` : ""}`}
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="border-white text-white hover:bg-amber-600 hover:text-white h-7 gap-1"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
      >
        <LogOut className="w-3.5 h-3.5" />
        {isAr ? "خروج" : "Exit"}
      </Button>
    </div>
  );
}

function SuspendedBanner() {
  const { i18n } = useTranslation();
  const isAr = i18n.language !== "en";
  return (
    <div
      className="fixed top-0 inset-x-0 z-50 flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium shadow-md"
      dir={isAr ? "rtl" : "ltr"}
    >
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>
        {isAr
          ? "حساب شركتك موقوف مؤقتاً. يرجى التواصل مع الدعم لتجديد الاشتراك."
          : "Your company account is suspended. Please contact support to renew your subscription."}
      </span>
    </div>
  );
}

function ExpiredBanner() {
  const { i18n } = useTranslation();
  const isAr = i18n.language !== "en";
  return (
    <div
      className="fixed top-0 inset-x-0 z-50 flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-medium shadow-md"
      dir={isAr ? "rtl" : "ltr"}
    >
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>
        {isAr
          ? "انتهى اشتراكك. يرجى تجديد الاشتراك للاستمرار في الاستخدام."
          : "Your subscription has expired. Please renew to continue using the app."}
      </span>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { data: user, isLoading, isError } = useGetCurrentUser();
  const [location, setLocation] = useLocation();

  React.useEffect(() => {
    if (isError) {
      setLocation("/login");
      return;
    }
    if (user) {
      const isExpired = user.subscriptionStatus === "expired";
      const isTrialWithoutPlan = user.subscriptionStatus === "trial" && !user.planId;
      const isSuspended = user.subscriptionStatus === "suspended";
      // Suspended users go to choose-plan for self-service recovery
      if ((isExpired || isTrialWithoutPlan || isSuspended) && !user.isImpersonating) {
        setLocation("/choose-plan");
        return;
      }
      if (isSuspended && !location.startsWith("/settings/subscription")) {
        setLocation("/settings/subscription");
      }
    }
  }, [isError, user, setLocation, location]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="w-8 h-8 text-primary" />
          <p className="text-muted-foreground font-medium text-sm">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const isImpersonating: boolean = !!user.isImpersonating;
  const impersonatedByName: string | null = user.impersonatedByName ?? null;

  // Prevent showing the app layout when the user needs to choose a plan
  // (unless we are in an impersonation session, where the admin can see all states)
  const isExpired = user.subscriptionStatus === "expired";
  const isTrialWithoutPlan = user.subscriptionStatus === "trial" && !user.planId;
  const isSuspended = user.subscriptionStatus === "suspended";
  if ((isExpired || isTrialWithoutPlan || isSuspended) && !isImpersonating) {
    return null;
  }

  const hasBanner = isImpersonating || isSuspended || isExpired;

  return (
    <div className="min-h-screen flex w-full bg-background font-sans text-foreground">
      {isImpersonating && <ImpersonationBanner adminName={impersonatedByName} />}
      {!isImpersonating && isSuspended && <SuspendedBanner />}
      {!isImpersonating && isExpired && <ExpiredBanner />}
      <Sidebar />
      <main className={`flex-1 ms-64 flex flex-col min-h-screen${hasBanner ? " pt-10" : ""}`}>
        {children}
      </main>
    </div>
  );
}