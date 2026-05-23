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
import AdminArticles from "@/pages/admin/articles";
import ArticleForm from "@/pages/admin/article-form";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60 * 5, retry: 1 } },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/articles" component={Articles} />
      <Route path="/articles/:slug" component={ArticleDetail} />
      <Route path="/admin" component={AdminLogin} />
      <Route path="/admin/articles" component={AdminArticles} />
      <Route path="/admin/articles/new" component={ArticleForm} />
      <Route path="/admin/articles/:id/edit" component={ArticleForm} />
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
