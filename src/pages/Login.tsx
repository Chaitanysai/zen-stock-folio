import { FormEvent, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import LogoMark from "@/components/LogoMark";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";

type Mode = "signin" | "signup" | "reset";

function friendlyError(message: string) {
  const text = message.toLowerCase();
  if (text.includes("invalid login") || text.includes("invalid credentials")) {
    return "Email or password is incorrect.";
  }
  if (text.includes("already registered") || text.includes("already been registered")) {
    return "An account with this email already exists. Sign in instead.";
  }
  if (text.includes("password") && text.includes("least")) {
    return "Use a password of at least 8 characters.";
  }
  if (text.includes("email") && (text.includes("invalid") || text.includes("valid"))) {
    return "Enter a valid email address.";
  }
  if (text.includes("network") || text.includes("fetch")) {
    return "We couldn't reach the service. Check your connection and try again.";
  }
  if (text.includes("not configured") || text.includes("vite_supabase")) {
    return "Sign-in is temporarily unavailable. Please try again later.";
  }
  return "Something went wrong. Please try again.";
}

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading, signIn, signUpWithEmail, resetPassword, isConfigured } = useAuth();
  const [mode, setMode] = useState<Mode>(location.pathname === "/signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/";

  useEffect(() => {
    setMode(location.pathname === "/signup" ? "signup" : "signin");
    setError(null);
    setNotice(null);
  }, [location.pathname]);

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f4f1ea] dark:bg-[#10161f] flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-[#3d4a5c] dark:text-[#c9c2b4]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Restoring your session
        </div>
      </div>
    );
  }

  function switchMode(next: Mode) {
    setError(null);
    setNotice(null);
    setMode(next);
    if (next === "signup") navigate("/signup", { replace: true, state: location.state });
    else navigate("/login", { replace: true, state: location.state });
  }

  function validate(): string | null {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Enter a valid email address.";
    if (mode === "reset") return null;
    if (password.length < 8) return "Use a password of at least 8 characters.";
    if (mode === "signup" && password !== confirm) return "Passwords do not match.";
    return null;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const validation = validate();
    if (validation) {
      setError(validation);
      setNotice(null);
      return;
    }

    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "reset") {
        await resetPassword(email.trim());
        setNotice("If an account exists for that email, a reset link is on its way.");
      } else if (mode === "signup") {
        const result = await signUpWithEmail(email.trim(), password);
        if (result === "CONFIRM_EMAIL") {
          setNotice("Account created. Check your email to confirm it, then sign in.");
          setMode("signin");
        } else if (result) {
          setError(friendlyError(result));
        } else {
          navigate(from, { replace: true });
        }
      } else {
        await signIn(email.trim(), password);
        navigate(from, { replace: true });
      }
    } catch (authError) {
      setError(friendlyError(authError instanceof Error ? authError.message : "Unable to continue"));
    } finally {
      setSubmitting(false);
    }
  }

  const title = mode === "signup" ? "Create your account" : mode === "reset" ? "Reset your password" : "Welcome back";
  const action = mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in";

  return (
    <div className="min-h-screen bg-[#f4f1ea] text-[#142033] dark:bg-[#10161f] dark:text-[#f3efe6]">
      <div className="mx-auto grid min-h-screen max-w-6xl lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden flex-col justify-between px-12 py-10 lg:flex">
          <div className="flex items-center gap-3">
            <LogoMark size={36} />
            <span className="text-lg tracking-tight">ZenFolio</span>
          </div>
          <div className="max-w-md space-y-5">
            <p className="font-serif text-5xl leading-[1.05] tracking-tight">
              Your market. Your strategy. Your next move.
            </p>
            <p className="text-base leading-7 text-[#5c5346] dark:text-[#c4bbaa]">
              A clearer view of your investments, watchlists, and market opportunities—all in one focused workspace.
            </p>
          </div>
          <p className="text-xs tracking-wide text-[#7a7164] dark:text-[#8d8476]">Portfolio · Watchlist · Market context</p>
        </section>

        <section className="flex items-center justify-center px-4 py-8 sm:px-8">
          <div className="w-full max-w-[420px]">
            <div className="mb-8 flex items-center justify-between">
              <div className="flex items-center gap-3 lg:hidden">
                <LogoMark size={32} />
                <span className="text-base tracking-tight">ZenFolio</span>
              </div>
              <div className="ml-auto">
                <ThemeToggle />
              </div>
            </div>

            <div className="rounded-2xl border border-[#e2dacb] bg-white/80 p-6 shadow-[0_20px_50px_-30px_rgba(20,32,51,0.45)] backdrop-blur-sm dark:border-[#2a3546] dark:bg-[#17202c]/90 sm:p-8">
              {mode !== "reset" && (
                <div className="mb-6 grid grid-cols-2 rounded-full bg-[#efe8db] p-1 text-sm dark:bg-[#101820]">
                  <button
                    type="button"
                    className={`rounded-full px-3 py-2 transition ${mode === "signin" ? "bg-[#142033] text-[#f4efe6]" : "text-[#5c5346] dark:text-[#c4bbaa]"}`}
                    onClick={() => switchMode("signin")}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-2 transition ${mode === "signup" ? "bg-[#142033] text-[#f4efe6]" : "text-[#5c5346] dark:text-[#c4bbaa]"}`}
                    onClick={() => switchMode("signup")}
                  >
                    Create account
                  </button>
                </div>
              )}

              <h1 className="text-2xl tracking-tight">{title}</h1>
              <p className="mt-1 mb-6 text-sm text-[#6b6256] dark:text-[#b7ad9d]">
                {mode === "reset"
                  ? "We'll email a link to choose a new password."
                  : "Use the email and password for your ZenFolio account."}
              </p>

              <form className="space-y-4" onSubmit={handleSubmit} noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-11"
                    disabled={submitting}
                    required
                  />
                </div>

                {mode !== "reset" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      {mode === "signin" && (
                        <button type="button" className="text-xs text-[#8a6a32] hover:underline" onClick={() => setMode("reset")}>
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete={mode === "signup" ? "new-password" : "current-password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="h-11 pr-11"
                        disabled={submitting}
                        required
                        minLength={8}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b6256]"
                        onClick={() => setShowPassword((value) => !value)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                )}

                {mode === "signup" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="confirm">Confirm password</Label>
                    <Input
                      id="confirm"
                      name="confirm"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(event) => setConfirm(event.target.value)}
                      className="h-11"
                      disabled={submitting}
                      required
                      minLength={8}
                    />
                  </div>
                )}

                {!isConfigured && (
                  <p className="rounded-lg border border-[#e7c7c2] bg-[#fdf4f2] px-3 py-2 text-sm text-[#8a3b32]" role="alert">
                    Sign-in is temporarily unavailable. Please try again later.
                  </p>
                )}
                {error && (
                  <p className="rounded-lg border border-[#e7c7c2] bg-[#fdf4f2] px-3 py-2 text-sm text-[#8a3b32]" role="alert">
                    {error}
                  </p>
                )}
                {notice && (
                  <p className="rounded-lg border border-[#d5e4d4] bg-[#f3f8f2] px-3 py-2 text-sm text-[#245c38]" role="status">
                    {notice}
                  </p>
                )}

                <Button type="submit" className="h-11 w-full rounded-full bg-[#142033] text-[#f4efe6] hover:bg-[#1d2c45]" disabled={submitting || !isConfigured}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : action}
                </Button>
              </form>

              {mode === "reset" && (
                <button type="button" className="mt-4 text-sm text-[#8a6a32] hover:underline" onClick={() => setMode("signin")}>
                  Back to sign in
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Login;
