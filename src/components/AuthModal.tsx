import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LogIn, Chrome, Mail, Activity, ScrollText, CreditCard, Settings, FlaskConical, LogOut, ChevronDown, User } from "lucide-react";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const handleEmailSubmit = async () => {
    setError(null); setSuccess(null); setLoading(true);
    const err = mode === "signin"
      ? await signInWithEmail(email, password)
      : await signUpWithEmail(email, password);
    setLoading(false);
    if (err) setError(err);
    else if (mode === "signup") setSuccess("Check your email to confirm your account, then sign in.");
    else onOpenChange(false);
  };

  const handleGoogle = async () => { setError(null); await signInWithGoogle(); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "signin" ? "Sign in" : "Create account"}</DialogTitle>
          <DialogDescription>
            {mode === "signin" ? "Sign in to sync your portfolio across devices." : "Create an account to save and sync your portfolio."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <Button variant="outline" className="w-full gap-2" onClick={handleGoogle}>
            <Chrome className="h-4 w-4" /> Continue with Google
          </Button>
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or</span>
            </div>
          </div>
          <div className="space-y-2">
            <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="bg-secondary" />
            <Input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
              className="bg-secondary" onKeyDown={e => e.key === "Enter" && handleEmailSubmit()} />
          </div>
          {error   && <p className="text-xs text-destructive">{error}</p>}
          {success && <p className="text-xs text-profit">{success}</p>}
          <Button className="w-full gap-2" onClick={handleEmailSubmit} disabled={loading}>
            <Mail className="h-4 w-4" />
            {loading ? "Please wait…" : mode === "signin" ? "Sign in with Email" : "Create Account"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {mode === "signin" ? (
              <>No account? <button onClick={() => { setMode("signup"); setError(null); }} className="text-primary underline">Sign up</button></>
            ) : (
              <>Already have one? <button onClick={() => { setMode("signin"); setError(null); }} className="text-primary underline">Sign in</button></>
            )}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── User dropdown menu ─────────────────────────────────────────────────────────
const MENU_ITEMS = [
  { icon: Activity,      label: "Activity"  },
  { icon: ScrollText,    label: "Logs"      },
  { icon: CreditCard,    label: "Credits"   },
  { icon: Settings,      label: "Settings"  },
  { icon: FlaskConical,  label: "Labs"      },
];

export function AuthButton() {
  const { user, signOut, loading } = useAuth();
  const [authOpen,  setAuthOpen]  = useState(false);
  const [menuOpen,  setMenuOpen]  = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (loading) return null;

  // ── Signed in — avatar + dropdown ──
  if (user) {
    const initials = user.email
      ? user.email.slice(0, 2).toUpperCase()
      : "ME";
    const avatarUrl = user.user_metadata?.avatar_url;

    return (
      <div className="relative" ref={menuRef}>
        {/* Trigger */}
        <button
          onClick={() => setMenuOpen(p => !p)}
          className="flex items-center gap-1.5 transition-all"
          style={{ WebkitTapHighlightColor: "transparent" }}>
          {/* Avatar */}
          <div className="h-8 w-8 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold text-white shrink-0"
               style={{ background: avatarUrl ? "transparent" : "linear-gradient(135deg, hsl(230,50%,30%), hsl(8,90%,46%))" }}>
            {avatarUrl
              ? <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
              : initials}
          </div>
          <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`}
                       style={{ color: "hsl(18,60%,46%)" }} />
        </button>

        {/* Dropdown */}
        {menuOpen && (
          <div className="absolute right-0 top-10 z-50 w-44 rounded-2xl overflow-hidden"
               style={{
                 backdropFilter: "blur(24px) saturate(180%)",
                 WebkitBackdropFilter: "blur(24px) saturate(180%)",
                 background: "hsl(0 0% 100% / 0.92)",
                 border: "1px solid hsl(18 50% 45% / 0.18)",
                 boxShadow: "0 8px 32px hsl(18 95% 52% / 0.12), 0 2px 8px rgba(0,0,0,0.08)"
               }}>
            {/* User info */}
            <div className="px-4 py-3" style={{ borderBottom: "1px solid hsl(18 50% 45% / 0.10)" }}>
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-full overflow-hidden flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                     style={{ background: avatarUrl ? "transparent" : "linear-gradient(135deg, hsl(230,50%,30%), hsl(8,90%,46%))" }}>
                  {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
                </div>
                <p className="text-[11px] font-medium truncate max-w-[96px]" style={{ color: "hsl(230,40%,20%)" }}>
                  {user.email}
                </p>
              </div>
            </div>

            {/* Menu items */}
            <div className="py-1.5">
              {MENU_ITEMS.map(({ icon: Icon, label }) => (
                <button key={label}
                  onClick={() => setMenuOpen(false)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left hover:bg-orange-50"
                  style={{ color: "hsl(230,30%,25%)" }}>
                  <Icon className="h-4 w-4 shrink-0" style={{ color: "hsl(18,70%,50%)" }} />
                  {label}
                </button>
              ))}
            </div>

            {/* Sign out */}
            <div style={{ borderTop: "1px solid hsl(18 50% 45% / 0.10)" }}>
              <button
                onClick={() => { signOut(); setMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors text-left hover:bg-red-50"
                style={{ color: "hsl(0,70%,45%)" }}>
                <LogOut className="h-4 w-4 shrink-0" />
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Signed out ──
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAuthOpen(true)}
        className="gap-1.5 text-xs h-8 rounded-xl font-medium"
        style={{ borderColor: "hsl(18,60%,50%,0.35)", color: "hsl(18,80%,40%)" }}>
        <LogIn className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Sign in</span>
      </Button>
      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
    </>
  );
}