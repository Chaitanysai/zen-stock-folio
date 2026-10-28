import { useEffect, useRef, useState, type FocusEvent } from "react";
import { RouteLink } from "@/components/RouteTransition";
import { ArrowRight, Menu, X } from "lucide-react";
import LogoMark from "@/components/LogoMark";
import ThemeToggle from "@/components/ThemeToggle";

export const SECTIONS = [
  { id: "features", label: "Features" },
  { id: "workflow", label: "How it works" },
  { id: "trust", label: "Your data" },
] as const;

export default function LandingNav() {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes the menu and returns focus to the toggle.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);

  // Tabbing past the menu (out of the header) closes it, so it never sits
  // open over content the keyboard user has moved on to.
  const onBlur = (e: FocusEvent<HTMLElement>) => {
    if (open && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
  };

  return (
    <header className="zl-header" onBlur={onBlur}>
      <div className="zl-wrap">
        <nav className="zl-nav" aria-label="Main">
          <RouteLink to="/" className="zl-brand" aria-label="ZenFolio home">
            <LogoMark size={30} />
            <span className="zl-brand-name">ZenFolio</span>
          </RouteLink>

          <ul className="zl-links">
            {SECTIONS.map((s) => (
              <li key={s.id}><a href={`#${s.id}`}>{s.label}</a></li>
            ))}
          </ul>

          <div className="zl-nav-actions">
            <ThemeToggle />
            <RouteLink to="/login" className="zl-signin">Sign in</RouteLink>
            <RouteLink to="/signup" className="zl-btn zl-btn-primary zl-btn-sm">
              Get started <ArrowRight aria-hidden="true" />
            </RouteLink>
            <button
              ref={btnRef}
              type="button"
              className="zl-menu-btn"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="zl-mobile-menu"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
            </button>
          </div>
        </nav>

        {open && (
          <div id="zl-mobile-menu" ref={panelRef} className="zl-mobile">
            <ul>
              {SECTIONS.map((s) => (
                <li key={s.id}><a href={`#${s.id}`} onClick={close}>{s.label}</a></li>
              ))}
            </ul>
            <div className="zl-mobile-cta">
              <RouteLink to="/login" className="zl-btn zl-btn-ghost zl-btn-sm" onClick={close}>Sign in</RouteLink>
              <RouteLink to="/signup" className="zl-btn zl-btn-primary zl-btn-sm" onClick={close}>Get started</RouteLink>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
