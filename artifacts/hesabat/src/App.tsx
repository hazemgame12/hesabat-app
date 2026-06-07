import React from "react";
import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Login } from "@/pages/login";
import { Signup } from "@/pages/signup";
import { Dashboard } from "@/pages/dashboard";
import { Accounts } from "@/pages/accounts";
import { Journal } from "@/pages/journal";
import { FixedAssets } from "@/pages/fixed-assets";
import { Inventory } from "@/pages/inventory";
import { Payroll } from "@/pages/payroll";
import { Customers } from "@/pages/customers";
import { Suppliers } from "@/pages/suppliers";
import { Bank } from "@/pages/bank";
import SalesInvoicesPage from "@/pages/sales-invoices";
import PurchaseInvoicesPage from "@/pages/purchase-invoices";
import { Settings } from "@/pages/settings";
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
        <Route path="/journal" component={Journal} />
        <Route path="/assets" component={FixedAssets} />
        <Route path="/inventory" component={Inventory} />
        <Route path="/payroll" component={Payroll} />
        <Route path="/settings/:tab?" component={Settings} />
        <Route path="/taxes">
          <Redirect to="/settings/taxes" />
        </Route>
        <Route path="/cost-centers">
          <Redirect to="/settings/cost-centers" />
        </Route>
        <Route path="/currencies">
          <Redirect to="/settings/currencies" />
        </Route>
        <Route path="/team">
          <Redirect to="/settings/team" />
        </Route>
        <Route path="/company">
          <Redirect to="/settings/company" />
        </Route>
        <Route path="/bank" component={Bank} />
        <Route path="/advances" component={ComingSoon} />
        <Route path="/sales" component={Customers} />
        <Route path="/purchases" component={Suppliers} />
        <Route path="/invoices/sales" component={SalesInvoicesPage} />
        <Route path="/invoices/purchases" component={PurchaseInvoicesPage} />
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