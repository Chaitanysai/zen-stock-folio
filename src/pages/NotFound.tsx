import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import LogoMark from "@/components/LogoMark";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <main className="atmosphere-bg flex min-h-screen items-center justify-center px-4 py-10 text-foreground">
      <div className="glass-elevated w-full max-w-md animate-fade-up rounded-2xl p-8 text-center shadow-[var(--glass-highlight),var(--shadow-3)] sm:p-10">
        <LogoMark size={40} className="mx-auto" />
        <p className="mt-6 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-brand-ink">Error 404</p>
        <h1 className="mt-2 font-serif text-4xl tracking-tight sm:text-5xl">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          We couldn't find <span className="break-all font-mono text-foreground">{location.pathname}</span>. It may have
          moved, or the link might be mistyped.
        </p>
        <Button asChild className="mt-8 h-11 rounded-full px-6">
          <Link to="/">
            <ArrowLeft aria-hidden="true" />
            Return to home
          </Link>
        </Button>
      </div>
    </main>
  );
};

export default NotFound;
