import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Search,
  CalendarClock,
  FileText,
  TrendingUp,
  MessageCircle,
  Settings,
  LogOut,
} from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { supabase } from "@/integrations/supabase/client";

export type SectionKey =
  | "home"
  | "browse"
  | "sessions"
  | "documents"
  | "progress"
  | "messages"
  | "settings";

// Each nav item navigates to a REAL route. `exact` is set for the dashboard
// index so it isn't highlighted while a child section (/dashboard/sessions …)
// is active.
type NavItem = { key: SectionKey; label: string; icon: typeof Home; to: string; exact?: boolean };

export const STUDENT_NAV: NavItem[] = [
  { key: "home", label: "Home", icon: Home, to: "/dashboard", exact: true },
  { key: "browse", label: "Browse Plugs", icon: Search, to: "/browse" },
  { key: "sessions", label: "My Sessions", icon: CalendarClock, to: "/dashboard/sessions" },
  { key: "documents", label: "My Documents", icon: FileText, to: "/dashboard/documents" },
  { key: "progress", label: "My Progress", icon: TrendingUp, to: "/session-notes" },
  { key: "messages", label: "Messages", icon: MessageCircle, to: "/messages" },
  { key: "settings", label: "Settings", icon: Settings, to: "/dashboard/settings" },
];

export function isNavActive(pathname: string, to: string, exact?: boolean): boolean {
  return exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
}

export function DashboardSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };
  return (
    <aside className="fixed left-0 top-0 z-30 hidden h-screen w-[240px] flex-col bg-[#1A1A1A] md:flex">
      <Link to="/" className="flex items-center px-6 pb-6 pt-7" aria-label="UniPlug home">
        <Logo variant="umark-dark" className="h-9 w-auto" />
      </Link>
      <nav className="mt-2 flex flex-1 flex-col">
        {STUDENT_NAV.map((it) => {
          const isActive = isNavActive(pathname, it.to, it.exact);
          const Icon = it.icon;
          return (
            <Link
              key={it.key}
              to={it.to}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex items-center gap-3 px-6 py-3 text-left text-[14px] font-medium transition ${
                isActive ? "text-white" : "text-white/60 hover:text-white"
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-[#C4907F]" />
              )}
              <Icon className="h-[18px] w-[18px]" />
              <span>{it.label}</span>
            </Link>
          );
        })}
      </nav>
      <button
        onClick={signOut}
        className="mx-4 mb-6 mt-2 inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-4 py-2.5 text-[13px] font-medium text-white/70 transition hover:border-white/40 hover:text-white"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </aside>
  );
}
