import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import {
  Bell, ChevronDown, HelpCircle, Info, LogOut, Menu, Moon, Pencil, Search, Sun,
} from "lucide-react";
import LogoMark from "@/components/LogoMark";
import AccentPicker from "@/components/AccentPicker";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { PriceAlert } from "@/data/sampleData";
import type { ThemeName } from "@/hooks/useThemeReveal";
import { inr } from "@/lib/dashboard/format";
import { NAV_GROUPS, PRIMARY_NAV, navItem, type ActiveTab } from "./nav";
import { RefreshControl } from "./RefreshControl";

export type { ThemeName };

function Tip({ label, side = "bottom", children }: { label: string; side?: "bottom" | "right"; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}

// ─── Left icon rail ───────────────────────────────────────────────────────────
interface RailProps {
  tab: ActiveTab;
  onSelect: (id: ActiveTab) => void;
  theme: ThemeName;
  onTheme: (theme: ThemeName, event: MouseEvent<HTMLElement>) => void;
  onHelp: () => void;
  onSignOut: () => void;
}

export function Rail({ tab, onSelect, theme, onTheme, onHelp, onSignOut }: RailProps) {
  const navRef = useRef<HTMLElement | null>(null);
  const pillRef = useRef<HTMLSpanElement | null>(null);
  const previousRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const animationRef = useRef<Animation | null>(null);

  // The pill is measured from the active button so its size always matches the
  // button's box (the rail shrinks at short viewports). Width and height stay
  // equal so the highlight remains a perfect circle while it travels.
  useLayoutEffect(() => {
    const nav = navRef.current;
    const pill = pillRef.current;
    if (!nav || !pill) return;

    const targetFor = () => {
      const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
      return active
        ? { x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight }
        : null;
    };

    const place = (target: { x: number; y: number; w: number; h: number }) => {
      pill.style.transform = `translate(${target.x}px, ${target.y}px)`;
      pill.style.width = `${target.w}px`;
      pill.style.height = `${target.h}px`;
    };

    const sync = () => {
      const next = targetFor();
      if (!next) {
        pill.style.opacity = "0";
        return;
      }
      animationRef.current?.cancel();
      previousRef.current = next;
      place(next);
      pill.dataset.ready = "";
    };

    const next = targetFor();
    if (!next) {
      pill.style.opacity = "0";
      return;
    }

    const previous = previousRef.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    animationRef.current?.cancel();

    if (previous && !reduced && typeof pill.animate === "function") {
      animationRef.current = pill.animate(
        [
          { transform: `translate(${previous.x}px, ${previous.y}px)` },
          { transform: `translate(${next.x}px, ${next.y}px)` },
        ],
        { duration: 380, easing: "cubic-bezier(.22,.9,.28,1.06)" },
      );
    }

    previousRef.current = next;
    place(next);
    pill.dataset.ready = "";

    const observer = new ResizeObserver(sync);
    observer.observe(nav);
    return () => {
      observer.disconnect();
      animationRef.current?.cancel();
    };
  }, [tab]);

  return (
    <aside className="zf-rail zf-glass" aria-label="Section rail">
      <div className="zf-theme" role="group" aria-label="Theme">
        <Tip label="Light theme" side="right">
          <button type="button" className="zf-rbtn" aria-label="Light theme" aria-pressed={theme === "light"} onClick={(e) => onTheme("light", e)}>
            <Sun aria-hidden="true" />
          </button>
        </Tip>
        <Tip label="Dark theme" side="right">
          <button type="button" className="zf-rbtn" aria-label="Dark theme" aria-pressed={theme === "dark"} onClick={(e) => onTheme("dark", e)}>
            <Moon aria-hidden="true" />
          </button>
        </Tip>
        <AccentPicker />
      </div>

      <nav className="zf-rail-mid" aria-label="Sections" ref={navRef}>
        <span ref={pillRef} className="zf-rail-pill" aria-hidden="true" />
        {NAV_GROUPS.map((group, index) => (
          <div key={group.label} className="zf-rail-group" role="group" aria-label={group.label}>
            {index > 0 && <span className="zf-rail-sep" aria-hidden="true" />}
            {group.items.map(({ id, label, icon: Icon }) => (
              <Tip key={id} label={label} side="right">
                <button
                  type="button"
                  className="zf-rbtn"
                  aria-label={label}
                  aria-current={tab === id ? "page" : undefined}
                  onClick={() => onSelect(id)}
                >
                  <Icon aria-hidden="true" />
                </button>
              </Tip>
            ))}
          </div>
        ))}
      </nav>

      <div className="zf-rail-group">
        <Tip label="Help and guide" side="right">
          <button type="button" className="zf-rbtn" aria-label="Help and guide" onClick={onHelp}>
            <HelpCircle aria-hidden="true" />
          </button>
        </Tip>
        <Tip label="Sign out" side="right">
          <button type="button" className="zf-rbtn zf-danger" aria-label="Sign out" onClick={onSignOut}>
            <LogOut aria-hidden="true" />
          </button>
        </Tip>
      </div>
    </aside>
  );
}

// ─── Top bar ──────────────────────────────────────────────────────────────────
interface TopBarProps {
  tab: ActiveTab;
  onSelect: (id: ActiveTab) => void;
  onMenu: () => void;
  market: { isOpen: boolean; label: string; description: string; istTime: string };
  onRefresh: () => void;
  refreshing: boolean;
  /** True when the last price request failed, so the control can show it. */
  refreshFailed?: boolean;
  /** Spoken to assistive tech through a polite live region. */
  refreshStatus: string;
  onSearch: () => void;
  triggeredAlerts: PriceAlert[];
  onDismissAlert: (id: string) => void;
  onManageAlerts: () => void;
  onInfo: () => void;
  userName: string;
  userEmail: string;
  onDisplayName: () => void;
  onSignOut: () => void;
}

export function TopBar(props: TopBarProps) {
  const { tab, onSelect, market, triggeredAlerts } = props;
  const [bellOpen, setBellOpen] = useState(false);
  const extraTab = PRIMARY_NAV.includes(tab) ? null : tab;
  // The current section is appended as an extra pill only while the header has
  // room for it; an overflowed pill leaves a clipped crescent of its indicator.
  const [fitExtra, setFitExtra] = useState(true);
  const pills = extraTab && fitExtra ? [...PRIMARY_NAV, extraTab] : PRIMARY_NAV;
  const count = triggeredAlerts.length;

  // Sliding active-pill indicator: measure the active button so the fill can
  // travel between pills instead of snapping. position starts hidden and only
  // becomes visible once measured, so it never flies in from the left on mount.
  const pillNavRef = useRef<HTMLElement | null>(null);
  const [indicator, setIndicator] = useState({ x: 0, w: 0 });
  const [indicatorReady, setIndicatorReady] = useState(false);

  useLayoutEffect(() => {
    const nav = pillNavRef.current;
    if (!nav) return;
    const header = nav.closest<HTMLElement>(".zf-top");

    const syncExtra = () => {
      if (!extraTab || nav.clientWidth === 0) return;
      if (window.matchMedia("(max-width: 768px)").matches) {
        setFitExtra(true);
        return;
      }
      const left = header?.querySelector<HTMLElement>(".zf-top-left");
      const right = header?.querySelector<HTMLElement>(".zf-top-right");
      if (!left || !right) return;
      const probe = document.createElement("span");
      probe.className = "zf-nav-item";
      probe.textContent = navItem(extraTab).label;
      probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;";
      nav.appendChild(probe);
      const extraWidth = probe.offsetWidth;
      probe.remove();
      const compactWidth = nav.scrollWidth - (fitExtra ? extraWidth : 0);
      const available = right.getBoundingClientRect().left - left.getBoundingClientRect().right - 24;
      const fits = available >= compactWidth + extraWidth + 2;
      setFitExtra((current) => (current === fits ? current : fits));
    };

    const measure = () => {
      const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active) {
        // Collapse the fill too: an absolutely positioned indicator left at its
        // old width still counts toward the nav's scrollable overflow.
        setIndicator({ x: 0, w: 0 });
        setIndicatorReady(false);
        return;
      }
      setIndicator({ x: active.offsetLeft, w: active.offsetWidth });
      setIndicatorReady(true);
      // Narrow headers scroll the pill row; reveal the active pill so the
      // indicator never shows up as a clipped crescent at the scroll edge.
      const pad = 4;
      const start = active.offsetLeft - pad;
      const end = active.offsetLeft + active.offsetWidth + pad;
      let next = nav.scrollLeft;
      if (start < nav.scrollLeft) next = start;
      else if (end > nav.scrollLeft + nav.clientWidth) next = end - nav.clientWidth;
      if (next !== nav.scrollLeft) {
        const starts = Array.from(nav.querySelectorAll<HTMLElement>(".zf-nav-item"))
          .map((el) => el.offsetLeft - pad)
          .filter((s) => s <= start && s + nav.clientWidth >= end);
        if (starts.length > 0) {
          const ahead = starts.filter((s) => s >= next).sort((a, b) => a - b);
          next = ahead[0] ?? starts.sort((a, b) => b - a)[0];
        }
        nav.scrollLeft = next;
      }
    };

    syncExtra();
    measure();
    const ro = new ResizeObserver(() => {
      syncExtra();
      measure();
    });
    ro.observe(nav);
    if (header) ro.observe(header);
    return () => ro.disconnect();
  }, [tab, pills.length, fitExtra, extraTab]);

  return (
    <header className="zf-top">
      <div className="zf-top-left">
        <button type="button" className="zf-iconbtn zf-glass zf-menu-btn" aria-label="Open menu" aria-haspopup="dialog" onClick={props.onMenu}>
          <Menu aria-hidden="true" />
        </button>
        <button type="button" className="zf-brand zf-glass" aria-label="ZenFolio, go to overview" onClick={() => onSelect("overview")}>
          <span className="zf-brand-mark"><LogoMark size={34} /></span>
          <span className="zf-brand-name">ZenFolio</span>
        </button>
      </div>

      <nav className="zf-nav zf-pills zf-glass" aria-label="Primary" ref={pillNavRef}>
        {/* Decorative sliding fill behind the active pill. aria-hidden keeps it out of the
            accessibility tree; each button still carries aria-current for assistive tech. */}
        <span
          className="zf-nav-indicator"
          data-ready={indicatorReady ? "" : undefined}
          style={{ transform: `translateX(${indicator.x}px)`, width: indicator.w }}
          aria-hidden="true"
        />
        {pills.map((id) => (
          <button
            key={id}
            type="button"
            className="zf-nav-item"
            aria-current={tab === id ? "page" : undefined}
            onClick={() => onSelect(id)}
          >
            {navItem(id).label}
          </button>
        ))}
      </nav>

      <div className="zf-top-right">
        <div className="zf-pills zf-glass">
          <div className="zf-market" data-open={market.isOpen} title={market.description}>
            <i aria-hidden="true" />
            <span className="zf-market-text">NSE {market.label}</span>
            <span className="zf-mono zf-market-time">{market.istTime} IST</span>
          </div>

          <RefreshControl busy={props.refreshing} failed={props.refreshFailed} onRefresh={props.onRefresh} />
          <span className="zf-sr-only" role="status" aria-live="polite">{props.refreshStatus}</span>

          <Tip label="Search symbols">
            <button type="button" className="zf-iconbtn" aria-label="Search symbols" aria-haspopup="dialog" onClick={props.onSearch}>
              <Search aria-hidden="true" />
            </button>
          </Tip>

          <Popover open={bellOpen} onOpenChange={setBellOpen}>
            <Tip label="Notifications">
              <PopoverTrigger asChild>
                <button type="button" className="zf-iconbtn" aria-label={count > 0 ? `Notifications, ${count} triggered` : "Notifications"}>
                  <Bell aria-hidden="true" />
                  {count > 0 && <span className="zf-dot" aria-hidden="true" />}
                </button>
              </PopoverTrigger>
            </Tip>
            <PopoverContent align="end" className="w-80 p-3">
              <p className="zf-card-title" style={{ padding: "4px 6px 8px" }}>Triggered alerts</p>
              {count === 0 ? (
                <p className="zf-empty" style={{ padding: "12px 8px" }}>
                  Nothing has triggered. Alerts are checked while this app is open.
                </p>
              ) : (
                <ul className="zf-status-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {triggeredAlerts.map((a) => (
                    <li key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px" }}>
                      <span className="zf-num" style={{ fontWeight: 600, fontSize: 13 }}>
                        {a.ticker} {a.direction === "above" ? "≥" : a.direction === "below" ? "≤" : "in range"} {inr(a.targetPrice)}
                      </span>
                      <button type="button" className="zf-link" onClick={() => props.onDismissAlert(a.id)} aria-label={`Dismiss alert for ${a.ticker}`}>
                        Dismiss
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div style={{ padding: "8px 6px 2px" }}>
                <button type="button" className="zf-link" onClick={() => { setBellOpen(false); props.onManageAlerts(); }}>
                  Manage alerts
                </button>
              </div>
            </PopoverContent>
          </Popover>

          <Tip label="Data and integrations">
            <button type="button" className="zf-iconbtn zf-hide-mobile" aria-label="Data and integrations" aria-haspopup="dialog" onClick={props.onInfo}>
              <Info aria-hidden="true" />
            </button>
          </Tip>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="zf-user zf-glass" aria-label={`Account menu for ${props.userName}`}>
              <span className="zf-avatar" aria-hidden="true">{props.userName.slice(0, 1).toUpperCase()}</span>
              <span className="zf-user-text">
                <span className="zf-user-name">{props.userName}</span>
                <span className="zf-user-mail">{props.userEmail}</span>
              </span>
              <ChevronDown aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>
              <span className="zf-menu-head" style={{ padding: 0 }}>
                <b>{props.userName}</b>
                <span>{props.userEmail}</span>
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={props.onDisplayName}><Pencil className="h-4 w-4" aria-hidden="true" /> Display name</DropdownMenuItem>
            <DropdownMenuItem onSelect={props.onSignOut}><LogOut className="h-4 w-4" aria-hidden="true" /> Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

// ─── Mobile menu (sheet) ──────────────────────────────────────────────────────
interface MobileMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: ActiveTab;
  onSelect: (id: ActiveTab) => void;
  theme: ThemeName;
  onTheme: (theme: ThemeName, event: MouseEvent<HTMLElement>) => void;
  userName: string;
  userEmail: string;
  onDisplayName: () => void;
  onHelp: () => void;
  onInfo: () => void;
  onSignOut: () => void;
}

export function MobileMenu(p: MobileMenuProps) {
  const act = (fn: () => void) => () => { p.onOpenChange(false); fn(); };
  return (
    <Sheet open={p.open} onOpenChange={p.onOpenChange}>
      <SheetContent side="left" className="zf-sheet overflow-y-auto p-4">
        <SheetTitle className="zf-brand-name" style={{ display: "block", fontSize: 18, fontWeight: 700, padding: "4px 8px 0" }}>ZenFolio</SheetTitle>
        <SheetDescription className="zf-sr-only">Navigate between sections, change theme or manage your account.</SheetDescription>

        <div className="zf-seg" role="group" aria-label="Theme" style={{ margin: "14px 8px 0", display: "flex" }}>
          <button type="button" style={{ flex: 1, minHeight: 40 }} aria-pressed={p.theme === "light"} onClick={(e) => p.onTheme("light", e)}>Light</button>
          <button type="button" style={{ flex: 1, minHeight: 40 }} aria-pressed={p.theme === "dark"} onClick={(e) => p.onTheme("dark", e)}>Dark</button>
        </div>

        <div className="zf-accent-row">
          <span className="zf-accent-row-label">Accent colour</span>
          <AccentPicker />
        </div>

        <nav aria-label="All sections">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="zf-sheet-group">{group.label}</p>
              <ul className="zf-sheet-list">
                {group.items.map(({ id, label, icon: Icon }) => (
                  <li key={id}>
                    <button type="button" className="zf-sheet-item" aria-current={p.tab === id ? "page" : undefined} onClick={act(() => p.onSelect(id))}>
                      <Icon aria-hidden="true" /> {label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <p className="zf-sheet-group">Account</p>
        <div style={{ padding: "0 14px 6px" }}>
          <b style={{ display: "block", fontSize: 14 }}>{p.userName}</b>
          <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>{p.userEmail}</span>
        </div>
        <ul className="zf-sheet-list">
          <li><button type="button" className="zf-sheet-item" onClick={act(p.onDisplayName)}><Pencil aria-hidden="true" /> Display name</button></li>
          <li><button type="button" className="zf-sheet-item" onClick={act(p.onInfo)}><Info aria-hidden="true" /> Data and integrations</button></li>
          <li><button type="button" className="zf-sheet-item" onClick={act(p.onHelp)}><HelpCircle aria-hidden="true" /> Help and guide</button></li>
          <li><button type="button" className="zf-sheet-item" onClick={act(p.onSignOut)}><LogOut aria-hidden="true" /> Sign out</button></li>
        </ul>
      </SheetContent>
    </Sheet>
  );
}
