import React from "react";
import { Sidebar } from "./Sidebar";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Spinner } from "@/components/ui/spinner";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, isError } = useGetCurrentUser();
  const [, setLocation] = useLocation();

  React.useEffect(() => {
    if (isError) {
      setLocation("/login");
    }
  }, [isError, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="w-8 h-8 text-primary" />
          <p className="text-muted-foreground font-medium text-sm">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div dir="rtl" className="min-h-screen flex w-full bg-background font-sans text-foreground">
      <Sidebar />
      <main className="flex-1 mr-64 flex flex-col min-h-screen">
        {children}
      </main>
    </div>
  );
}