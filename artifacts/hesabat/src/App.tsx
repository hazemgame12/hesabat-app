import React, { useEffect, useState } from "react";
import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
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
import CollectionsPage from "@/pages/collections";
import VendorPaymentsPage from "@/pages/vendor-payments";
import QuotationsPage from "@/pages/quotations";
import PurchaseOrdersPage from "@/pages/purchase-orders";
import PrintInvoicePage from "@/pages/print-invoice";
import PrintPaymentPage from "@/pages/print-payment";
import { PrintGuard } from "@/components/print/PrintGuard";
import { Reports } from "@/pages/reports";
import { ReportsFinancial } from "@/pages/reports-financial";
import { ReportsFinancialDetail } from "@/pages/reports-financial-detail";
import { ReportsCenter } from "@/pages/reports-center";
import { ReportsTax } from "@/pages/reports-tax";
import { ReportsAnalysis } from "@/pages/reports-analysis";
import { Revaluation } from "@/pages/revaluation";
import { Audit } from "@/pages/audit";
import { OpeningBalances } from "@/pages/opening-balances";
import { Settings } from "@/pages/settings";
import { EInvoice } from "@/pages/e-invoice";
import { Support } from "@/pages/support";
import { DocumentsPage } from "@/pages/documents";
import AccountLedgerPage from "@/pages/account-ledger";
import PartyStatementPage from "@/pages/party-statement";
import { AcceptInvite } from "@/pages/accept-invite";
import { ChoosePlan } from "@/pages/choose-plan";
import { LandingPage } from "@/pages/landing";
import { FAQ } from "@/pages/faq";
import { Terms } from "@/pages/terms";
import { ArticlesPage } from "@/pages/articles";
import { ArticleDetailPage } from "@/pages/article-detail";
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
        <Route path="/accounts/:id/ledger" component={AccountLedgerPage} />
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
          <Redirect to="/settings/accounting-dimensions" />
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
        <Route path="/sales/:id/statement" component={PartyStatementPage} />
        <Route path="/sales" component={Customers} />
        <Route path="/purchases/:id/statement" component={PartyStatementPage} />
        <Route path="/purchases" component={Suppliers} />
        <Route path="/invoices/sales" component={SalesInvoicesPage} />
        <Route path="/invoices/purchases" component={PurchaseInvoicesPage} />
        <Route path="/collections" component={CollectionsPage} />
        <Route path="/vendor-payments" component={VendorPaymentsPage} />
        <Route path="/quotations" component={QuotationsPage} />
        <Route path="/purchase-orders" component={PurchaseOrdersPage} />
        <Route path="/revaluation" component={Revaluation} />
        <Route path="/reports/financial/trial-balance" component={() => <ReportsFinancialDetail reportKey="trial-balance" />} />
        <Route path="/reports/financial/general-ledger" component={() => <ReportsFinancialDetail reportKey="general-ledger" />} />
        <Route path="/reports/financial/account-statement" component={() => <ReportsFinancialDetail reportKey="account-statement" />} />
        <Route path="/reports/financial/income-statement" component={() => <ReportsFinancialDetail reportKey="income-statement" />} />
        <Route path="/reports/financial/balance-sheet" component={() => <ReportsFinancialDetail reportKey="balance-sheet" />} />
        <Route path="/reports/financial/cash-flow" component={() => <ReportsFinancialDetail reportKey="cash-flow" />} />
        <Route path="/reports/financial" component={ReportsFinancial} />
        <Route path="/reports/tax" component={ReportsTax} />
        <Route path="/reports/analysis" component={ReportsAnalysis} />
        <Route path="/reports/center" component={ReportsCenter} />
        <Route path="/reports" component={Reports} />
        <Route path="/audit" component={Audit} />
        <Route path="/e-invoice" component={EInvoice} />
        <Route path="/support"><Redirect to="/settings/support" /></Route>
        <Route path="/admin/support"><Redirect to="/settings/support-admin" /></Route>
        <Route path="/fiscal-years">
          <Redirect to="/settings/fiscal-years" />
        </Route>
        <Route path="/opening-balances" component={OpeningBalances} />
        <Route path="/documents" component={DocumentsPage} />
        <Route path="/" component={Dashboard} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function SuperAdminRoutes() {
  const [, setLocation] = useLocation();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/super-admin/auth/me", { credentials: "include" })
      .then((r) => {
        if (r.status === 401) setLocation("/super-admin/login");
      })
      .catch(() => setLocation("/super-admin/login"))
      .finally(() => setChecking(false));
  }, [setLocation]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground text-sm">جاري التحقق...</div>
      </div>
    );
  }

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
      <Route path="/articles" component={ArticlesPage} />
      <Route path="/article/:slug" component={ArticleDetailPage} />
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