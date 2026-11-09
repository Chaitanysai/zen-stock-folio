import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { EventExperienceProvider } from "@/components/events/EventExperienceProvider";
import { lazy, Suspense, useEffect } from "react";
import { SessionLoading } from "@/components/ProtectedRoute";
import ProtectedRoute from "@/components/ProtectedRoute";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { RouteEnter } from "@/components/RouteEnter";
import { installHistoryRouteTransition, setLastRoutePath } from "@/lib/navigation/routeTransition";
import { DASHBOARD_BASE } from "@/lib/navigation/routes";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

// The dashboard pulls in recharts, lightweight-charts and react-markdown; split it
// out so signed-out visitors (landing, login) don't download it.
const Index = lazy(() => import("./pages/Index"));

// Must run before BrowserRouter creates its history (and popstate listener).
installHistoryRouteTransition();

/** Remembers the committed path so the history bridge can ignore hash-only moves. */
const RouteLocationTracker = () => {
  const location = useLocation();
  useEffect(() => {
    setLastRoutePath(location.pathname + location.search);
  }, [location.pathname, location.search]);
  return null;
};

const queryClient = new QueryClient();

/**
 * `/`: the public landing page for signed-out visitors; a redirect into the
 * dashboard for signed-in users. Sections are addressed by URL now, so `/` is
 * only an entry point, never a section itself.
 *
 * The search string and hash are carried across the redirect: a broker OAuth
 * callback returns to `/?broker=connected&…#…`, and that result must survive
 * the hop to the dashboard so the Brokers section can read it.
 */
const HomeRedirect = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <SessionLoading />;
  if (!isAuthenticated) return <RouteEnter key="landing"><Landing /></RouteEnter>;
  return <Navigate to={`${DASHBOARD_BASE}${location.search}${location.hash}`} replace />;
};

/** The auth-gated dashboard shell; the active section is read from the URL. */
const Dashboard = () => (
  <Suspense fallback={<DashboardSkeleton />}>
    <RouteEnter key="dashboard"><Index /></RouteEnter>
  </Suspense>
);

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="theme" disableTransitionOnChange>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* One event resolution for the whole app: the public hero, the
            dashboard and the auth pages all read the same active festival. */}
        <EventExperienceProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <RouteLocationTracker />
              <Routes>
                <Route path="/login" element={<RouteEnter><Login /></RouteEnter>} />
                <Route path="/signup" element={<RouteEnter><Login /></RouteEnter>} />
                <Route path="/" element={<HomeRedirect />} />

                {/* Authenticated sections. `/dashboard` and `/dashboard/:section`
                    both render the same shell, which resolves the section from
                    the URL; an unknown section renders Not Found. */}
                <Route element={<ProtectedRoute />}>
                  <Route path={`${DASHBOARD_BASE}/:section`} element={<Dashboard />} />
                  <Route path={DASHBOARD_BASE} element={<Dashboard />} />
                </Route>

                <Route path="*" element={<RouteEnter><NotFound /></RouteEnter>} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </EventExperienceProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
