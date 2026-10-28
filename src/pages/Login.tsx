import { FormEvent, useEffect, useRef, useState, useCallback } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Loader2, Check, X, Chrome } from "lucide-react";
import LogoMark from "@/components/LogoMark";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import LoginHeroVisuals from "@/components/LoginHeroVisuals";

type Mode = "signin" | "signup" | "reset";

function friendlyError(message: string) {
  const text = message.toLowerCase();
  if (text.includes("invalid login") || text.includes("invalid credentials")) {
    return "Email or password is incorrect.";
  }
  if (text.includes("already registered") || text.includes("already been registered")) {
    return "An account with this email already exists. Sign in instead.";
  }
  if (text.includes("not confirmed") || text.includes("email not confirmed")) {
    return "Please confirm your email first. Check your inbox for the confirmation link, then sign in.";
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
  if (text.includes("not configured")) {
    return "Sign-in is temporarily unavailable. Please try again later.";
  }
  return "Something went wrong. Please try again.";
}

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading, signIn, signUpWithEmail, signInWithGoogle, resendConfirmationEmail, resetPassword, isConfigured } = useAuth();
  const [mode, setMode] = useState<Mode>(location.pathname === "/signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [lastSignupEmail, setLastSignupEmail] = useState<string | null>(null);
  // Forgot/Back buttons unmount when the mode flips, so focus moves to the new heading.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusHeadingOnSwitch = useRef(false);

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/";

  useEffect(() => {
    setMode(location.pathname === "/signup" ? "signup" : "signin");
    setError(null);
    setNotice(null);
  }, [location.pathname]);

  useEffect(() => {
    if (!focusHeadingOnSwitch.current) return;
    focusHeadingOnSwitch.current = false;
    headingRef.current?.focus();
  }, [mode]);

  const switchMode = useCallback((next: Mode) => {
    if (transitioning || submitting) return;
    
    focusHeadingOnSwitch.current = next === "reset" || mode === "reset";
    setTransitioning(true);
    setError(null);
    setNotice(null);
    
    // Clear password when switching away from signup
    if (next !== "signup" && mode === "signup") {
      setPassword("");
      setConfirm("");
    }
    
    // Small delay to allow CSS transition to start
    setTimeout(() => {
      setMode(next);
      if (next === "signup") navigate("/signup", { replace: true, state: location.state });
      else navigate("/login", { replace: true, state: location.state });
      
      // Reset transitioning after animation completes
      setTimeout(() => setTransitioning(false), 350);
    }, 50);
  }, [mode, transitioning, submitting, navigate, location.state]);

  const handleResendConfirmation = useCallback(async () => {
    if (!lastSignupEmail || resendLoading) return;
    
    setResendLoading(true);
    setResendError(null);
    setResendSuccess(null);
    
    try {
      const result = await resendConfirmationEmail(lastSignupEmail);
      if (result === null) {
        setResendSuccess("Confirmation email resent. Check your inbox.");
      } else {
        setResendError(friendlyError(result));
      }
    } catch (err) {
      setResendError(friendlyError(err instanceof Error ? err.message : "Unable to resend"));
    } finally {
      setResendLoading(false);
    }
  }, [lastSignupEmail, resendLoading, resendConfirmationEmail]);

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  if (isLoading) {
    return (
      <div className="atmosphere-bg flex min-h-screen items-center justify-center px-4">
        <div className="glass-elevated flex items-center gap-3 rounded-2xl px-5 py-4 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin text-brand-ink" aria-hidden="true" />
          Restoring your session
        </div>
      </div>
    );
  }

  function validate(): string | null {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Enter a valid email address.";
    if (mode === "reset") return null;
    if (password.length < 8) return "Use a password of at least 8 characters.";
    if (mode === "signup" && password !== confirm) return "Passwords do not match.";
    return null;
  }

  async function handleGoogleSignIn() {
    if (googleLoading || submitting || transitioning) return;

    setGoogleLoading(true);
    setError(null);
    setNotice(null);

    try {
      await signInWithGoogle();
      // Resolves silently if the popup is closed without signing in;
      // a successful sign-in navigates via the auth state change.
    } catch (authError) {
      setError(friendlyError(authError instanceof Error ? authError.message : "Unable to continue"));
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting || transitioning) return;
    const validation = validate();
    if (validation) {
      setError(validation);
      setNotice(null);
      return;
    }

    setSubmitting(true);
    setError(null);
    setNotice(null);
    setResendError(null);
    setResendSuccess(null);
    
    try {
      if (mode === "reset") {
        await resetPassword(email.trim());
        setNotice("If an account exists for that email, a reset link is on its way.");
      } else if (mode === "signup") {
        const result = await signUpWithEmail(email.trim(), password);
        if (result === "CONFIRM_EMAIL") {
          setLastSignupEmail(email.trim());
          setNotice("Account created. Email confirmation required to sign in.");
          setMode("signin");
          setPassword("");
          setConfirm("");
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
  
  const showResend = mode === "signin" && lastSignupEmail && !notice?.includes("Account created");

  const brand = (size: number, text: string) => (
    <Link
      to="/"
      aria-label="ZenFolio home"
      className="inline-flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <LogoMark size={size} />
      <span className={`${text} font-bold tracking-tight`}>ZenFolio</span>
    </Link>
  );

  return (
    <div className="atmosphere-bg min-h-screen text-foreground">
      <div className="mx-auto grid min-h-screen max-w-7xl lg:grid-cols-[1.05fr_0.95fr]">
        {/* Desktop hero */}
        <section className="hidden flex-col justify-between px-10 py-8 lg:flex">
          {brand(40, "text-xl")}

          <div className="max-w-lg space-y-10 py-10">
            <div className="space-y-5">
              <p className="font-serif text-5xl leading-[1.05] tracking-tight xl:text-6xl">
                Your market. Your strategy. <span className="italic text-brand-ink">Your next move.</span>
              </p>
              <p className="max-w-md text-base leading-7 text-muted-foreground">
                A clearer view of your investments, watchlists, and market opportunities, all in one focused workspace.
              </p>
            </div>
            <LoginHeroVisuals className="relative max-w-md" />
          </div>

          <p className="text-xs tracking-wide text-muted-foreground">Portfolio &middot; Watchlist &middot; Market context</p>
        </section>

        {/* Authentication */}
        <section className="flex flex-col px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
          <header className="flex items-center justify-between gap-3 lg:justify-end lg:gap-2">
            <Link
              to="/"
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background -ml-3"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to home
            </Link>
            <ThemeToggle />
          </header>

          <main className="flex flex-1 items-center justify-center py-6 sm:py-8">
            <div className="w-full max-w-[420px]">
              {/* Brand + compact hero below desktop */}
              <div className="mb-6 lg:hidden">
                {brand(36, "text-lg")}
                <div className="mt-6 hidden space-y-4 md:block">
                  <p className="font-serif text-4xl leading-[1.05] tracking-tight">
                    Your market. Your strategy. <span className="italic text-brand-ink">Your next move.</span>
                  </p>
                  <LoginHeroVisuals compact />
                </div>
              </div>

              <div className="glass-elevated rounded-2xl p-6 shadow-[var(--glass-highlight),var(--shadow-3)] sm:p-8">
                {mode !== "reset" && (
                  <div className="relative mb-6 grid grid-cols-2 rounded-full border border-[hsl(var(--glass-border))] bg-muted/70 p-1 text-sm">
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-[image:var(--grad-primary)] shadow-[0_4px_14px_-6px_hsl(var(--primary)/.7)] transition-transform duration-300 [transition-timing-function:var(--ease-out)] ${
                        mode === "signup" ? "translate-x-full" : "translate-x-0"
                      }`}
                    />
                    <button
                      type="button"
                      className={`relative z-10 rounded-full px-3 py-2 font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                        mode === "signin" ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => switchMode("signin")}
                      aria-pressed={mode === "signin"}
                    >
                      Sign in
                    </button>
                    <button
                      type="button"
                      className={`relative z-10 rounded-full px-3 py-2 font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                        mode === "signup" ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => switchMode("signup")}
                      aria-pressed={mode === "signup"}
                    >
                      Create account
                    </button>
                  </div>
                )}

                <div key={mode} className="animate-fade-up">
                  <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold tracking-tight focus:outline-none">
                    {title}
                  </h1>
                  <p className="mb-6 mt-1.5 text-sm text-muted-foreground">
                    {mode === "reset"
                      ? "We'll email a link to choose a new password."
                      : mode === "signup"
                      ? "Create your ZenFolio account to get started."
                      : "Sign in to access your portfolio and market data."}
                  </p>
                </div>

                {mode !== "reset" && (
                  <div className="mb-5 space-y-4">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 w-full gap-2 rounded-full"
                      onClick={handleGoogleSignIn}
                      disabled={googleLoading || submitting || transitioning || !isConfigured}
                    >
                      {googleLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Please wait...
                        </>
                      ) : (
                        <>
                          <Chrome className="h-4 w-4" />
                          Continue with Google
                        </>
                      )}
                    </Button>
                    <div className="flex items-center gap-3">
                      <span className="h-px flex-1 bg-border" aria-hidden="true" />
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        or continue with email
                      </span>
                      <span className="h-px flex-1 bg-border" aria-hidden="true" />
                    </div>
                  </div>
                )}

                <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-sm font-medium">
                      Email
                    </Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="h-11"
                      disabled={submitting || transitioning}
                      required
                    />
                  </div>

                  {mode !== "reset" && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password" className="text-sm font-medium">
                          Password
                        </Label>
                        {mode === "signin" && (
                          <button
                            type="button"
                            className="rounded-sm text-xs font-medium text-brand-ink underline-offset-4 hover:underline"
                            onClick={() => switchMode("reset")}
                          >
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
                          disabled={submitting || transitioning}
                          required
                          minLength={8}
                        />
                        <button
                          type="button"
                          className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
                          onClick={() => setShowPassword((value) => !value)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          disabled={submitting || transitioning}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {mode === "signup" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="confirm" className="text-sm font-medium">
                        Confirm password
                      </Label>
                      <Input
                        id="confirm"
                        name="confirm"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={confirm}
                        onChange={(event) => setConfirm(event.target.value)}
                        className="h-11"
                        disabled={submitting || transitioning}
                        required
                        minLength={8}
                      />
                    </div>
                  )}

                  {/* Status messages */}
                  <div className="space-y-3 empty:hidden">
                    {!isConfigured && (
                      <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                        Sign-in is temporarily unavailable. Please try again later.
                      </p>
                    )}
                    {error && (
                      <p className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                        <X className="h-4 w-4 flex-shrink-0" />
                        {error}
                      </p>
                    )}
                    {notice && (
                      <p className="flex items-center gap-2 rounded-lg border border-profit/25 bg-profit/10 px-3 py-2 text-sm text-profit" role="status">
                        <Check className="h-4 w-4 flex-shrink-0" />
                        {notice}
                      </p>
                    )}

                    {showResend && (
                      <div className="rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-foreground/80">Didn't receive the email?</span>
                          <button
                            type="button"
                            onClick={handleResendConfirmation}
                            disabled={resendLoading}
                            className="flex items-center gap-1 rounded-sm text-xs font-semibold text-brand-ink underline-offset-4 hover:underline disabled:opacity-60"
                          >
                            {resendLoading ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Sending...
                              </>
                            ) : (
                              "Resend"
                            )}
                          </button>
                        </div>
                        {resendSuccess && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-profit">
                            <Check className="h-3 w-3" />
                            {resendSuccess}
                          </p>
                        )}
                        {resendError && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                            <X className="h-3 w-3" />
                            {resendError}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="h-11 w-full rounded-full text-[15px] font-semibold"
                    disabled={submitting || transitioning || !isConfigured}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Please wait...
                      </>
                    ) : (
                      action
                    )}
                  </Button>
                </form>

                {mode === "reset" && (
                  <button
                    type="button"
                    className="mt-4 inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-brand-ink underline-offset-4 hover:underline"
                    onClick={() => switchMode("signin")}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    Back to sign in
                  </button>
                )}
              </div>
            </div>
          </main>
        </section>
      </div>
    </div>
  );
};

export default Login;
