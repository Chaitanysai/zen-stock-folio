import {
  Activity, BarChart3, Bell, BookOpen, Brain, Eye, History, LayoutDashboard, Newspaper,
  PieChart, ScrollText, Wallet, Zap, type LucideIcon,
} from "lucide-react";

export type ActiveTab =
  | "overview" | "holdings" | "trades" | "watchlist" | "ai"
  | "charts" | "analytics" | "history" | "journal"
  | "sector" | "alerts" | "export" | "news";

export interface NavItem {
  id: ActiveTab;
  label: string;
  icon: LucideIcon;
  /** One line shown in the Help dialog. */
  hint: string;
}

/** Every destination. The left rail and the mobile menu render this in full. */
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Main",
    items: [
      { id: "overview", label: "Overview", icon: LayoutDashboard, hint: "Portfolio value, today's P&L, holdings and watchlist at a glance." },
      { id: "holdings", label: "Portfolio", icon: Wallet, hint: "Add, edit and import equity trades." },
      { id: "trades", label: "Trades", icon: ScrollText, hint: "Trade plans with targets and stop-losses, plus F&O positions." },
      { id: "history", label: "History", icon: History, hint: "Closed trades and how long you held them." },
      { id: "journal", label: "Journal", icon: BookOpen, hint: "Notes on why you took each trade and what you learned." },
    ],
  },
  {
    label: "Insight",
    items: [
      { id: "charts", label: "Charts", icon: BarChart3, hint: "Candles, P&L by holding and allocation." },
      { id: "sector", label: "Sectors", icon: PieChart, hint: "How your invested value is spread across sectors." },
      { id: "analytics", label: "Analytics", icon: Activity, hint: "Win rate, average win and loss, holding period." },
    ],
  },
  {
    label: "Tools",
    items: [
      { id: "watchlist", label: "Watchlist", icon: Eye, hint: "Symbols you plan to buy, with entry zones and targets." },
      { id: "news", label: "News", icon: Newspaper, hint: "Headlines for the stocks you hold." },
      { id: "ai", label: "AI Insights", icon: Brain, hint: "An AI review of your portfolio's risk and allocation." },
      { id: "alerts", label: "Alerts", icon: Bell, hint: "Price alerts that fire while the app is open." },
      { id: "export", label: "Export", icon: Zap, hint: "Download your portfolio as CSV or XLSX." },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** Destinations in the centre pill navigation. */
export const PRIMARY_NAV: ActiveTab[] = ["overview", "holdings", "trades", "watchlist", "analytics"];

export const PAGE_TITLES: Record<ActiveTab, string> = {
  overview: "Overview", holdings: "Portfolio holdings", trades: "Trades & F&O",
  watchlist: "Watchlist", ai: "AI insights", charts: "Charts", analytics: "Trade analytics",
  history: "Trade history", journal: "Trade journal", sector: "Sector allocation",
  alerts: "Price alerts", export: "Export data", news: "Holdings news",
};

export const navItem = (id: ActiveTab): NavItem => NAV_ITEMS.find((i) => i.id === id)!;
