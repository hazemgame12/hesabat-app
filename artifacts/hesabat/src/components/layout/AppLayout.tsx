import React from "react";
import { useTranslation } from "react-i18next";
import { Sidebar } from "./Sidebar";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Spinner } from "@/components/ui/spinner";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { data: user, isLoading, isError } = useGetCurrentUser();
  const [, setLocation] = useLocation();

  React.useEffect(() => {
    if (isError) {
      setLocation("/login");
      return;
    }
    if (user) {
      const isExpired = user.subscriptionStatus === "expired";
      const isTrialWithoutPlan = user.subscriptionStatus === "trial" && !user.planId;
      if (isExpired || isTrialWithoutPlan) {
        setLocation("/choose-plan");
      }
    }
  }, [isError, user, setLocation]);

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

  return (
    <div className="min-h-screen flex w-full bg-background font-sans text-foreground">
      <Sidebar />
      <main className="flex-1 ms-64 flex flex-col min-h-screen">
        {children}
      </main>
    </div>
  );
}