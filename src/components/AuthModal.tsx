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
    setError(null);
    setSuccess(null);
    setLoading(true);

    const err =
      mode === "signin"
        ? await signInWithEmail(email, password)
        : await signUpWithEmail(email, password);

    setLoading(false);
    if (err) {
      setError(err);
    } else if (mode === "signup") {
      setSuccess("Check your email to confirm your account, then sign in.");
    } else {
      onOpenChange(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    await signInWithGoogle();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="gradient-text text-lg">
            {mode === "signin" ? "Sign in to sync your portfolio" : "Create an account"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Your portfolio will be saved to the cloud and accessible from any device.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {/* Google */}
          <Button variant="outline" className="w-full gap-2" onClick={handleGoogle}>
            <Chrome className="h-4 w-4" />
            Continue with Google
          </Button>

          <div className="relative flex items-center gap-2">
            <div className="flex-1 border-t border-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="flex-1 border-t border-border" />
          </div>

          {/* Email / Password */}
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="text-sm"
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleEmailSubmit()}
            className="text-sm"
          />

          {error && <p className="text-xs text-destructive">{error}</p>}
          {success && <p className="text-xs text-profit">{success}</p>}

          <Button
            className="w-full gap-2 gradient-primary text-primary-foreground"
            onClick={handleEmailSubmit}
            disabled={loading || !email || !password}
          >
            <Mail className="h-4 w-4" />
            {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            {mode === "signin" ? (
              <>
                No account?{" "}
                <button onClick={() => { setMode("signup"); setError(null); }} className="text-primary underline">
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have one?{" "}
                <button onClick={() => { setMode("signin"); setError(null); }} className="text-primary underline">
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Small header button to trigger the modal or show user info
export function AuthButton() {
  const { user, signOut, loading } = useAuth();
  const [open, setOpen] = useState(false);

  if (loading) return null;

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground hidden sm:block max-w-[120px] truncate">
          {user.email}
        </span>
        <Button variant="ghost" size="sm" onClick={signOut} className="text-xs text-muted-foreground h-7 px-2">
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5 text-xs h-7">
        <LogIn className="h-3.5 w-3.5" />
        Sign in
      </Button>
      <AuthModal open={open} onOpenChange={setOpen} />
    </>
  );
}
