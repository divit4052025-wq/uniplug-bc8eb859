import { Link, useRouterState } from "@tanstack/react-router";
import { Home, CalendarClock, Users, Wallet, MessageCircle, Settings, LogOut } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { supabase } from "@/integrations/supabase/client";

export type MentorSectionKey =
  | "home"
  | "schedule"
  | "students"
  | "messages"
  | "earnings"
  | "settings";

type NavItem = {
  key: MentorSectionKey;
  label: string;
  icon: typeof Home;
  to: string;
  exact?: boolean;
};

export const MENTOR_NAV: NavItem[] = [
  { key: "home", label: "Home", icon: Home, to: "/mentor-dashboard", exact: true },
  { key: "schedule", label: "My Schedule", icon: CalendarClock, to: "/mentor-dashboard/schedule" },
  { key: "students", label: "My Students", icon: Users, to: "/mentor-dashboard/students" },
  { key: "messages", label: "Messages", icon: MessageCircle, to: "/messages" },
  { key: "earnings", label: "Earnings", icon: Wallet, to: "/mentor-dashboard/earnings" },
  { key: "settings", label: "Settings", icon: Settings, to: "/mentor-dashboard/settings" },
];

export function isMentorNavActive(pathname: string, to: string, exact?: boolean): boolean {
  return exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
}

export function MentorSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };
  return (
    <aside className="fixed left-0 top-0 z-30 hidden h-screen w-[240px] flex-col bg-[#1A1A1A] md:flex">
      <Link to="/" className="flex items-center gap-2 px-6 pb-6 pt-7" aria-label="UniPlug home">
        <span className="inline-flex items-center rounded-lg bg-[#FFFCFB] p-1.5">
          <Logo className="h-7 w-auto" />
        </span>
      </Link>
      <nav className="mt-2 flex flex-1 flex-col">
        {MENTOR_NAV.map((it) => {
          const isActive = isMentorNavActive(pathname, it.to, it.exact);
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
