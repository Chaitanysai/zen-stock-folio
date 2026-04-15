import { FormEvent, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, BarChart3, LockKeyhole, Loader2, ShieldCheck } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading, signIn, isConfigured } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/";

  useEffect(() => {
    setError(null);
  }, [email, password]);

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="glass-card px-6 py-5 flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <div className="text-left">
            <p className="text-sm font-medium">Checking session</p>
            <p className="text-xs text-muted-foreground">Restoring saved login</p>
          </div>
        </div>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await signIn(email.trim(), password);
      navigate(from, { replace: true });
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Unable to sign in");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_hsl(var(--primary)/0.18),_transparent_32%),radial-gradient(circle_at_bottom_right,_hsl(var(--gradient-end)/0.16),_transparent_28%)]" />
      <div className="absolute inset-x-0 top-0 h-1 gradient-primary opacity-80" />

      <div className="relative min-h-screen grid lg:grid-cols-[1.15fr_0.85fr]">
        <section className="hidden lg:flex flex-col justify-between p-10 xl:p-14">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl gradient-primary flex items-center justify-center shadow-lg">
                <BarChart3 className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-tight gradient-text">Smart Stock Tracker</p>
                <p className="text-xs text-muted-foreground">Secure portfolio workspace</p>
              </div>
            </div>
            <ThemeToggle />
          </div>

          <div className="max-w-xl space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                Supabase-backed authentication
              </div>
              <h1 className="text-5xl font-semibold tracking-tight leading-tight">
                Trade with a dashboard that opens only for authenticated users.
              </h1>
              <p className="text-base text-muted-foreground leading-7">
                Portfolio tracking, watchlists, alerts, and AI analysis now sit behind a real login flow instead of an anonymous page load.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="glass-card p-5">
                <p className="text-sm font-medium">Session persistence</p>
                <p className="mt-2 text-sm text-muted-foreground">Restores your session from local storage and refreshes it when needed.</p>
              </div>
              <div className="glass-card p-5">
                <p className="text-sm font-medium">Protected routes</p>
                <p className="mt-2 text-sm text-muted-foreground">Anonymous users are redirected to login before the dashboard renders.</p>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Use a valid email/password account from your Supabase project to access the app.
          </p>
        </section>

        <section className="flex items-center justify-center p-4 sm:p-8">
          <Card className="w-full max-w-md border-border/70 bg-card/85 shadow-2xl backdrop-blur-xl">
            <CardContent className="p-6 sm:p-8 space-y-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="h-11 w-11 rounded-2xl gradient-primary flex items-center justify-center shadow-lg lg:hidden">
                    <BarChart3 className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Login</h1>
                    <p className="text-sm text-muted-foreground">
                      Enter your Supabase account credentials to open the portfolio dashboard.
                    </p>
                  </div>
                </div>
                <div className="lg:hidden">
                  <ThemeToggle />
                </div>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    className="h-11 bg-background/60"
                    disabled={submitting || !isConfigured}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Your password"
                    className="h-11 bg-background/60"
                    disabled={submitting || !isConfigured}
                  />
                </div>

                {!isConfigured && (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    Missing `VITE_SUPABASE_URL` or `VITE_SUPABASE_PUBLISHABLE_KEY`. Add them before using login.
                  </div>
                )}

                {error && (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full h-11 gap-2 text-sm" disabled={submitting || !isConfigured}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
                  {submitting ? "Signing in..." : "Sign in"}
                </Button>
              </form>

              <div className="rounded-2xl bg-secondary/60 border border-border px-4 py-3 text-sm text-muted-foreground">
                After login, you’ll return to the dashboard automatically.
                <span className="inline-flex items-center gap-1 ml-2 text-primary">
                  Protected access
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
};

export default Login;
