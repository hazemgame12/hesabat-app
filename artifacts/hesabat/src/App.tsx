import React from "react";
import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Login } from "@/pages/login";
import { Signup } from "@/pages/signup";
import { ForgotPassword } from "@/pages/forgot-password";
import { ResetPassword } from "@/pages/reset-password";
import { Dashboard } from "@/pages/dashboard";
import { Accounts } from "@/pages/accounts";
import { Journal } from "@/pages/journal";
import { FixedAssets } from "@/pages/fixed-assets";
import { Inventory } from "@/pages/inventory";
import { Payroll } from "@/pages/payroll";
import { Customers } from "@/pages/customers";
import { Suppliers } from "@/pages/suppliers";
import { Bank } from "@/pages/bank";
import { Advances } from "@/pages/advances";
import SalesInvoicesPage from "@/pages/sales-invoices";
import PurchaseInvoicesPage from "@/pages/purchase-invoices";
import PrintInvoicePage from "@/pages/print-invoice";
import PrintPaymentPage from "@/pages/print-payment";
import { PrintGuard } from "@/components/print/PrintGuard";
import { Reports } from "@/pages/reports";
import { Revaluation } from "@/pages/revaluation";
import { Audit } from "@/pages/audit";
import { OpeningBalances } from "@/pages/opening-balances";
import { Settings } from "@/pages/settings";
import { EInvoice } from "@/pages/e-invoice";
import { Support } from "@/pages/support";
import { AdminSupport } from "@/pages/admin-support";
import { AcceptInvite } from "@/pages/accept-invite";
import { ChoosePlan } from "@/pages/choose-plan";
import { LandingPage } from "@/pages/landing";
import { FAQ } from "@/pages/faq";
import { Terms } from "@/pages/terms";
import { AppLayout } from "@/components/layout/AppLayout";
import { SuperAdminLayout } from "@/components/super-admin-layout";
import { SuperAdminLogin } from "@/pages/super-admin/login";
import { SuperAdminDashboard } from "@/pages/super-admin/dashboard";
import { SuperAdminCompanies } from "@/pages/super-admin/companies";
import { SuperAdminUsers } from "@/pages/super-admin/users";
import { SuperAdminPlans } from "@/pages/super-admin/plans";
import { SuperAdminSubscriptions } from "@/pages/super-admin/subscriptions";
import { SuperAdminSupportTickets } from "@/pages/super-admin/support-tickets";
import { SuperAdminAnalytics } from "@/pages/super-admin/analytics";
import { SuperAdminLandingPage } from "@/pages/super-admin/landing-page";

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
        <Route path="/advances" component={Advances} />
        <Route path="/sales" component={Customers} />
        <Route path="/purchases" component={Suppliers} />
        <Route path="/invoices/sales" component={SalesInvoicesPage} />
        <Route path="/invoices/purchases" component={PurchaseInvoicesPage} />
        <Route path="/revaluation" component={Revaluation} />
        <Route path="/reports" component={Reports} />
        <Route path="/audit" component={Audit} />
        <Route path="/e-invoice" component={EInvoice} />
        <Route path="/support" component={Support} />
        <Route path="/admin/support" component={AdminSupport} />
        <Route path="/fiscal-years">
          <Redirect to="/settings/fiscal-years" />
        </Route>
        <Route path="/opening-balances" component={OpeningBalances} />
        <Route path="/" component={Dashboard} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function SuperAdminRoutes() {
  return (
    <SuperAdminLayout>
      <Switch>
        <Route path="/super-admin" component={SuperAdminDashboard} />
        <Route path="/super-admin/companies" component={SuperAdminCompanies} />
        <Route path="/super-admin/users" component={SuperAdminUsers} />
        <Route path="/super-admin/plans" component={SuperAdminPlans} />
        <Route path="/super-admin/subscriptions" component={SuperAdminSubscriptions} />
        <Route path="/super-admin/support-tickets" component={SuperAdminSupportTickets} />
        <Route path="/super-admin/analytics" component={SuperAdminAnalytics} />
        <Route path="/super-admin/landing-page" component={SuperAdminLandingPage} />
        <Route component={SuperAdminDashboard} />
      </Switch>
    </SuperAdminLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/invite/:token" component={AcceptInvite} />
      <Route path="/choose-plan" component={ChoosePlan} />
      <Route path="/faq" component={FAQ} />
      <Route path="/terms" component={Terms} />
      <Route path="/super-admin/login" component={SuperAdminLogin} />
      <Route path="/super-admin" component={SuperAdminRoutes} />
      <Route path="/super-admin/*" component={SuperAdminRoutes} />
      <Route path="/print/invoice/:id">
        <PrintGuard>
          <PrintInvoicePage />
        </PrintGuard>
      </Route>
      <Route path="/print/payment/:id">
        <PrintGuard>
          <PrintPaymentPage />
        </PrintGuard>
      </Route>
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