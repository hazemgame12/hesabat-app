import React from "react";
import { useTranslation } from "react-i18next";
import { Sidebar } from "./Sidebar";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Spinner } from "@/components/ui/spinner";

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
      if (isExpired || isTrialWithoutPlan) {
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

  // Prevent showing the app layout when the user needs to choose a plan
  const isExpired = user.subscriptionStatus === "expired";
  const isTrialWithoutPlan = user.subscriptionStatus === "trial" && !user.planId;
  if (isExpired || isTrialWithoutPlan) {
    return null;
  }

  const trialEndsAt = user.trialEndsAt ? new Date(user.trialEndsAt).getTime() : null;
  const remainingTrialDays = trialEndsAt ? Math.ceil((trialEndsAt - Date.now()) / (24 * 60 * 60 * 1000)) : null;
  const showPreExpiryWarning = remainingTrialDays !== null && remainingTrialDays > 0 && remainingTrialDays <= 7;
  const isImpersonating = Boolean((user as any)?.isImpersonating);

  return (
    <div className="min-h-screen flex w-full bg-background font-sans text-foreground">
      <Sidebar />
      <main className="flex-1 ms-64 flex flex-col min-h-screen">
        {isImpersonating && (
          <div className="bg-amber-100 text-amber-900 px-4 py-2 text-sm flex items-center justify-between">
            <span>أنت الآن داخل هذه الشركة كسوبر أدمن / You are viewing this company as Super Admin</span>
            <button
              className="underline font-medium"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
                setLocation("/super-admin");
              }}
            >
              الخروج من عرض الشركة / Exit Company View
            </button>
          </div>
        )}
        {showPreExpiryWarning && (
          <div className="bg-yellow-100 text-yellow-900 px-4 py-2 text-sm">
            {`Subscription expires in ${remainingTrialDays} day(s).`}
          </div>
        )}
        {user.subscriptionStatus === "expired" && (
          <div className="bg-red-100 text-red-900 px-4 py-2 text-sm">Subscription expired — request renewal from Subscription page.</div>
        )}
        {user.subscriptionStatus === "suspended" && (
          <div className="bg-orange-100 text-orange-900 px-4 py-2 text-sm">Account is suspended. Access limited to subscription page.</div>
        )}
        {children}
      </main>
    </div>
  );
}