import React from "react";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Spinner } from "@/components/ui/spinner";

export function PrintGuard({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, isError } = useGetCurrentUser();
  const [, setLocation] = useLocation();

  React.useEffect(() => {
    if (isError) {
      setLocation("/login");
    }
  }, [isError, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Spinner className="w-8 h-8 text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
