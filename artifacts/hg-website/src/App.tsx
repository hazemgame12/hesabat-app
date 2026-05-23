import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/lib/language";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Articles from "@/pages/articles";
import ArticleDetail from "@/pages/article-detail";
import AdminLogin from "@/pages/admin/login";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminArticles from "@/pages/admin/articles";
import ArticleForm from "@/pages/admin/article-form";
import AdminServices from "@/pages/admin/services";
import ServiceForm from "@/pages/admin/service-form";
import AdminPackages from "@/pages/admin/packages";
import PackageForm from "@/pages/admin/package-form";
import AdminLeads from "@/pages/admin/leads";
import AdminSettings from "@/pages/admin/settings";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60 * 5, retry: 1 } },
});

function Router() {
  return (
    <Switch>
      {/* Public */}
      <Route path="/" component={Home} />
      <Route path="/articles" component={Articles} />
      <Route path="/articles/:slug" component={ArticleDetail} />

      {/* Admin */}
      <Route path="/admin" component={AdminLogin} />
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin/articles" component={AdminArticles} />
      <Route path="/admin/articles/new" component={ArticleForm} />
      <Route path="/admin/articles/:id/edit" component={ArticleForm} />
      <Route path="/admin/services" component={AdminServices} />
      <Route path="/admin/services/new" component={ServiceForm} />
      <Route path="/admin/services/:id/edit" component={ServiceForm} />
      <Route path="/admin/packages" component={AdminPackages} />
      <Route path="/admin/packages/new" component={PackageForm} />
      <Route path="/admin/packages/:id/edit" component={PackageForm} />
      <Route path="/admin/leads" component={AdminLeads} />
      <Route path="/admin/settings" component={AdminSettings} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LanguageProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </LanguageProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
