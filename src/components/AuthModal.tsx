import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LogIn, Chrome, Mail } from "lucide-react";

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
            {mode === "signin"
              ? "Sign in to sync your portfolio across devices."
              : "Create an account to save and sync your portfolio."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <Button variant="outline" className="w-full gap-2" onClick={handleGoogle}>
            <Chrome className="h-4 w-4" /> Continue with Google
          </Button>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or</span>
            </div>
          </div>
          <div className="space-y-2">
            <Input type="email" placeholder="Email" value={email}
              onChange={e => setEmail(e.target.value)} className="bg-secondary" />
            <Input type="password" placeholder="Password" value={password}
              onChange={e => setPassword(e.target.value)} className="bg-secondary"
              onKeyDown={e => e.key === "Enter" && handleEmailSubmit()} />
          </div>
          {error   && <p className="text-xs text-destructive">{error}</p>}
          {success && <p className="text-xs text-profit">{success}</p>}
          <Button className="w-full gap-2" onClick={handleEmailSubmit} disabled={loading}>
            <Mail className="h-4 w-4" />
            {loading ? "Please wait…" : mode === "signin" ? "Sign in with Email" : "Create Account"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {mode === "signin" ? (
              <>No account?{" "}
                <button onClick={() => { setMode("signup"); setError(null); }}
                  className="text-primary underline">Sign up</button></>
            ) : (
              <>Already have one?{" "}
                <button onClick={() => { setMode("signin"); setError(null); }}
                  className="text-primary underline">Sign in</button></>
            )}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── AuthButton: sign-in trigger only (no dropdown — handled by UserDropdown in Index.tsx) ──
export function AuthButton() {
  const { user, loading } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  if (loading || user) return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAuthOpen(true)}
        className="gap-1.5 text-xs h-8 rounded-lg font-medium"
        style={{ borderColor: "hsl(215,50%,60%,0.30)", color: "hsl(215,60%,38%)" }}>
        <LogIn className="h-3.5 w-3.5" />
        <span>Sign in</span>
      </Button>
      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
    </>
  );
}