import { FormEvent, useEffect, useState, useCallback } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, Check, X } from "lucide-react";
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
  if (text.includes("not configured") || text.includes("vite_supabase")) {
    return "Sign-in is temporarily unavailable. Please try again later.";
  }
  return "Something went wrong. Please try again.";
}

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading, signIn, signUpWithEmail, resendConfirmationEmail, resetPassword, isConfigured } = useAuth();
  const [mode, setMode] = useState<Mode>(location.pathname === "/signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [lastSignupEmail, setLastSignupEmail] = useState<string | null>(null);

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/";

  useEffect(() => {
    setMode(location.pathname === "/signup" ? "signup" : "signin");
    setError(null);
    setNotice(null);
  }, [location.pathname]);

  const switchMode = useCallback((next: Mode) => {
    if (transitioning || submitting) return;
    
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
      <div className="min-h-screen bg-[#f4f1ea] dark:bg-[#10161f] flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-[#3d4a5c] dark:text-[#c9c2b4]">
          <Loader2 className="h-4 w-4 animate-spin" />
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

  return (
    <div className="min-h-screen bg-[#f4f1ea] text-[#142033] dark:bg-[#0a0f1a] dark:text-[#f3efe6]">
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          * {
            transition-duration: 0.01ms !important;
            animation-duration: 0.01ms !important;
          }
        }
        @media (max-width: 1024px) {
          .hero-visuals {
            display: none;
          }
        }
        @media (max-width: 640px) {
          .auth-section {
            padding: 0 1rem;
          }
        }
      `}</style>
      <div className="mx-auto grid min-h-screen max-w-7xl lg:grid-cols-[1.1fr_0.9fr]">
        {/* Hero Section with Market Visuals */}
        <section className="hidden flex-col justify-between px-8 py-8 lg:flex hero-visuals">
          <div className="flex items-center gap-3">
            <LogoMark size={40} />
            <span className="text-xl font-bold tracking-tight">ZenFolio</span>
          </div>
          
          {/* Market Visuals */}
          <div className="relative flex-1 flex items-center justify-center">
            <LoginHeroVisuals className="absolute inset-0" />
            <div className="relative z-10 max-w-md space-y-6">
              <p className="font-serif text-5xl leading-[1.05] tracking-tight text-[#142033] dark:text-[#f3efe6]">
                Your market. Your strategy. Your next move.
              </p>
              <p className="text-base leading-7 text-[#5c5346] dark:text-[#a89fa8]">
                A clearer view of your investments, watchlists, and market opportunities—all in one focused workspace.
              </p>
            </div>
          </div>
          
          <p className="text-xs tracking-wide text-[#7a7164] dark:text-[#8d8476]">Portfolio · Watchlist · Market context</p>
        </section>

        {/* Authentication Section */}
        <section className="flex items-center justify-center px-4 py-8 sm:px-6 lg:px-8 auth-section">
          <div className="w-full max-w-[420px]">
            <div className="mb-8 flex items-center justify-between">
              <div className="flex items-center gap-3 lg:hidden">
                <LogoMark size={36} />
                <span className="text-lg font-bold tracking-tight">ZenFolio</span>
              </div>
              <div className="ml-auto">
                <ThemeToggle />
              </div>
            </div>

              {/* Premium Auth Card with transition */}
              <div className="rounded-2xl border border-[#e2dacb]/80 bg-white/60 p-6 shadow-[0_20px_60px_-30px_rgba(20,32,51,0.55)] backdrop-blur-lg dark:border-[#2a3546]/60 dark:bg-[#17202c]/80 sm:p-8 transition-all duration-300 ease-out">
              {mode !== "reset" && (
                <div className="mb-6 grid grid-cols-2 rounded-full bg-[#efe8db] dark:bg-[#101820]/80 p-1 text-sm border border-[#e2dacb]/50 dark:border-[#2a3546]/50">
                  <button
                    type="button"
                    className={`rounded-full px-3 py-2 transition-all duration-300 ease-out ${
                      mode === "signin" 
                        ? "bg-[#142033] text-[#f4efe6] shadow-md" 
                        : "text-[#5c5346] dark:text-[#c4bbaa] hover:bg-[#142033]/10 dark:hover:bg-[#f3efe6]/10"
                    }`}
                    onClick={() => switchMode("signin")}
                    disabled={transitioning}
                    aria-pressed={mode === "signin"}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-2 transition-all duration-300 ease-out ${
                      mode === "signup" 
                        ? "bg-[#142033] text-[#f4efe6] shadow-md" 
                        : "text-[#5c5346] dark:text-[#c4bbaa] hover:bg-[#142033]/10 dark:hover:bg-[#f3efe6]/10"
                    }`}
                    onClick={() => switchMode("signup")}
                    disabled={transitioning}
                    aria-pressed={mode === "signup"}
                  >
                    Create account
                  </button>
                </div>
              )}

              {/* Animated heading */}
              <div className="mb-1">
                <h1 className="text-2xl font-bold tracking-tight transition-all duration-300 ease-out">
                  {title}
                </h1>
              </div>
              
              <p className="mt-1 mb-6 text-sm text-[#6b6256] dark:text-[#b7ad9d] transition-all duration-300 ease-out">
                {mode === "reset"
                  ? "We'll email a link to choose a new password."
                  : mode === "signup"
                  ? "Create your ZenFolio account to get started."
                  : "Sign in to access your portfolio and market data."}
              </p>

              <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                {/* Email Input */}
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm font-medium text-[#142033] dark:text-[#f3efe6]">
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
                    className="h-11 bg-white/80 dark:bg-[#17202c]/80 border-[#e2dacb]/80 dark:border-[#2a3546]/80 focus:border-[#C4A574] focus:ring-2 focus:ring-[#C4A574]/20 transition-all duration-200"
                    disabled={submitting || transitioning}
                    required
                  />
                </div>

                {mode !== "reset" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-sm font-medium text-[#142033] dark:text-[#f3efe6]">
                        Password
                      </Label>
                      {mode === "signin" && (
                        <button 
                          type="button" 
                          className="text-xs text-[#8a6a32] dark:text-[#c4bbaa] hover:text-[#C4A574] transition-colors"
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
                        className="h-11 pr-11 bg-white/80 dark:bg-[#17202c]/80 border-[#e2dacb]/80 dark:border-[#2a3546]/80 focus:border-[#C4A574] focus:ring-2 focus:ring-[#C4A574]/20 transition-all duration-200"
                        disabled={submitting || transitioning}
                        required
                        minLength={8}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b6256] dark:text-[#b7ad9d] hover:text-[#C4A574] transition-colors"
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
                    <Label htmlFor="confirm" className="text-sm font-medium text-[#142033] dark:text-[#f3efe6]">
                      Confirm password
                    </Label>
                    <Input
                      id="confirm"
                      name="confirm"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(event) => setConfirm(event.target.value)}
                      className="h-11 bg-white/80 dark:bg-[#17202c]/80 border-[#e2dacb]/80 dark:border-[#2a3546]/80 focus:border-[#C4A574] focus:ring-2 focus:ring-[#C4A574]/20 transition-all duration-200"
                      disabled={submitting || transitioning}
                      required
                      minLength={8}
                    />
                  </div>
                )}

                {/* Status Messages */}
                <div className="space-y-3">
                  {!isConfigured && (
                    <p className="rounded-lg border border-[#e7c7c2] bg-[#fdf4f2] px-3 py-2 text-sm text-[#8a3b32] dark:bg-[#2a1a1a]/30 dark:border-[#8a3b32]/30 dark:text-[#ff6b6b]" role="alert">
                      Sign-in is temporarily unavailable. Please try again later.
                    </p>
                  )}
                  {error && (
                    <p className="rounded-lg border border-[#e7c7c2] bg-[#fdf4f2] px-3 py-2 text-sm text-[#8a3b32] dark:bg-[#2a1a1a]/30 dark:border-[#8a3b32]/30 dark:text-[#ff6b6b] flex items-center gap-2" role="alert">
                      <X className="h-4 w-4 flex-shrink-0" />
                      {error}
                    </p>
                  )}
                  {notice && (
                    <p className="rounded-lg border border-[#d5e4d4] bg-[#f3f8f2] px-3 py-2 text-sm text-[#245c38] dark:bg-[#1a2a1a]/30 dark:border-[#245c38]/30 dark:text-[#22c55e] flex items-center gap-2" role="status">
                      <Check className="h-4 w-4 flex-shrink-0" />
                      {notice}
                    </p>
                  )}
                  
                  {/* Resend confirmation email */}
                  {showResend && (
                    <div className="rounded-lg border border-[#C4A574]/30 bg-[#C4A574]/5 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-[#8a6a32] dark:text-[#c4bbaa]">
                          Didn't receive the email?
                        </span>
                        <button
                          type="button"
                          onClick={handleResendConfirmation}
                          disabled={resendLoading}
                          className="text-xs font-medium text-[#C4A574] hover:text-[#142033] dark:hover:text-[#f3efe6] transition-colors flex items-center gap-1"
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
                        <p className="text-[#15803d] text-xs mt-1 flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          {resendSuccess}
                        </p>
                      )}
                      {resendError && (
                        <p className="text-[#c94444] text-xs mt-1 flex items-center gap-1">
                          <X className="h-3 w-3" />
                          {resendError}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Submit Button */}
                <Button 
                  type="submit" 
                  className="h-11 w-full rounded-full bg-[#142033] text-[#f4efe6] hover:bg-[#1d2c45] active:bg-[#2a3546] transition-all duration-200 shadow-lg shadow-[#142033]/20 hover:shadow-xl hover:shadow-[#142033]/30 disabled:opacity-70 disabled:cursor-not-allowed"
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
                  className="mt-4 text-sm text-[#8a6a32] dark:text-[#c4bbaa] hover:text-[#C4A574] transition-colors"
                  onClick={() => switchMode("signin")}
                >
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
