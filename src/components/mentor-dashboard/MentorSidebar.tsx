import { Link, useNavigate } from "@tanstack/react-router";
import { Home, CalendarClock, Users, Wallet, Settings, LogOut } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { supabase } from "@/integrations/supabase/client";

export type MentorSectionKey =
  | "home"
  | "schedule"
  | "students"
  | "earnings"
  | "settings";

interface Props {
  active: MentorSectionKey;
  onSelect: (key: MentorSectionKey) => void;
}

const items: { key: MentorSectionKey; label: string; icon: typeof Home }[] = [
  { key: "home", label: "Home", icon: Home },
  { key: "schedule", label: "My Schedule", icon: CalendarClock },
  { key: "students", label: "My Students", icon: Users },
  { key: "earnings", label: "Earnings", icon: Wallet },
  { key: "settings", label: "Settings", icon: Settings },
];

export function MentorSidebar({ active, onSelect }: Props) {
  const navigate = useNavigate();
  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
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
              onClick={() => onSelect(it.key)}
              className={`relative flex items-center gap-3 px-6 py-3 text-left text-[14px] font-medium transition ${
                isActive ? "text-white" : "text-white/60 hover:text-white"
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