import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import NotFound from "@/pages/not-found";

// Pages
import Home from "./pages/Home";
import Onboarding from "./pages/Onboarding";
import Compare from "./pages/Compare";
import PolicyDetail from "./pages/PolicyDetail";
import Apply from "./pages/Apply";
import Confirmation from "./pages/Confirmation";
import Profile from "./pages/Profile";
import Optimizer from "./pages/Optimizer";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/onboard" component={Onboarding} />
      <Route path="/compare" component={Compare} />
      <Route path="/policy/:id" component={PolicyDetail} />
      <Route path="/apply/:id" component={Apply} />
      <Route path="/confirmation" component={Confirmation} />
      <Route path="/profile" component={Profile} />
      <Route path="/optimizer" component={Optimizer} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
