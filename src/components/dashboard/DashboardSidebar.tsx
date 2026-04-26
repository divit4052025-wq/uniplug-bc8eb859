import { Link, useNavigate } from "@tanstack/react-router";
import { Home, Search, CalendarClock, FileText, TrendingUp, Settings, LogOut } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { supabase } from "@/integrations/supabase/client";

export type SectionKey = "home" | "browse" | "sessions" | "documents" | "progress" | "settings";

interface Props {
  active: SectionKey;
  onSelect: (key: SectionKey) => void;
}

const items: { key: SectionKey; label: string; icon: typeof Home }[] = [
  { key: "home", label: "Home", icon: Home },
  { key: "browse", label: "Browse Plugs", icon: Search },
  { key: "sessions", label: "My Sessions", icon: CalendarClock },
  { key: "documents", label: "My Documents", icon: FileText },
  { key: "progress", label: "My Progress", icon: TrendingUp },
  { key: "settings", label: "Settings", icon: Settings },
];

export function DashboardSidebar({ active, onSelect }: Props) {
  const navigate = useNavigate();
  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };
  return (
    <aside className="fixed left-0 top-0 z-30 hidden h-screen w-[240px] flex-col bg-[#1A1A1A] md:flex">
      <Link to="/" className="flex items-center px-6 pb-6 pt-7" aria-label="UniPlug home">
        <Logo variant="umark-offwhite" className="h-9 w-auto" />
      </Link>
      <nav className="mt-2 flex flex-1 flex-col">
        {items.map((it) => {
          const isActive = it.key === active;
          const Icon = it.icon;
          return (
            <button
              key={it.key}
              onClick={() => {
                if (it.key === "browse") {
                  navigate({ to: "/browse" });
                  return;
                }
                if (it.key === "progress") {
                  navigate({ to: "/session-notes" });
                  return;
                }
                onSelect(it.key);
              }}
              className={`relative flex items-center gap-3 px-6 py-3 text-left text-[14px] font-medium transition ${
                isActive
                  ? "text-white"
                  : "text-white/60 hover:text-white"
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-[#C4907F]" />
              )}
              <Icon className="h-[18px] w-[18px]" />
              <span>{it.label}</span>
            </button>
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
