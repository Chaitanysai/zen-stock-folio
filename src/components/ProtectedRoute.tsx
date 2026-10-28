import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

/** Full-screen "checking session" state shared by every auth-gated route. */
export const SessionLoading = () => (
  <div className="atmosphere-bg flex min-h-screen items-center justify-center px-4">
    <div className="glass-elevated flex items-center gap-3 rounded-2xl px-6 py-5" role="status">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10" aria-hidden="true">
        <Loader2 className="h-5 w-5 animate-spin text-brand-ink" />
      </span>
      <div className="text-left">
        <p className="text-sm font-medium">Checking session</p>
        <p className="text-xs text-muted-foreground">Restoring your dashboard access</p>
      </div>
    </div>
  </div>
);

const ProtectedRoute = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <SessionLoading />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
