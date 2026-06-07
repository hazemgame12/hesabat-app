import React from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Login } from "@/pages/login";
import { Signup } from "@/pages/signup";
import { Dashboard } from "@/pages/dashboard";
import { Accounts } from "@/pages/accounts";
import { Taxes } from "@/pages/taxes";
import { CostCenters } from "@/pages/cost-centers";
import { Currencies } from "@/pages/currencies";
import { Journal } from "@/pages/journal";
import { Team } from "@/pages/team";
import { CompanyProfile } from "@/pages/company";
import { AcceptInvite } from "@/pages/accept-invite";
import { ComingSoon } from "@/pages/coming-soon";
import { AppLayout } from "@/components/layout/AppLayout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoutes() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/accounts" component={Accounts} />
        <Route path="/taxes" component={Taxes} />
        <Route path="/cost-centers" component={CostCenters} />
        <Route path="/currencies" component={Currencies} />
        <Route path="/team" component={Team} />
        <Route path="/company" component={CompanyProfile} />
        <Route path="/journal" component={Journal} />
        <Route path="/bank" component={ComingSoon} />
        <Route path="/advances" component={ComingSoon} />
        <Route path="/sales" component={ComingSoon} />
        <Route path="/purchases" component={ComingSoon} />
        <Route path="/reports" component={ComingSoon} />
        <Route path="/" component={Dashboard} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/invite/:token" component={AcceptInvite} />
      <Route path="/*" component={ProtectedRoutes} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;