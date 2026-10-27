import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { lazy, Suspense } from "react";
import { SessionLoading } from "@/components/ProtectedRoute";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

// The dashboard pulls in recharts, lightweight-charts and react-markdown; split it
// out so signed-out visitors (landing, login) don't download it.
const Index = lazy(() => import("./pages/Index"));

const queryClient = new QueryClient();

/** `/`: dashboard for signed-in users, public landing page for everyone else. */
const Home = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <SessionLoading />;
  if (!isAuthenticated) return <Landing />;
  return (
    <Suspense fallback={<SessionLoading />}>
      <Index />
    </Suspense>
  );
};

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Login />} />
              <Route path="/" element={<Home />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
