import { Home, Search, CalendarClock, FileText, TrendingUp, Settings } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import type { SectionKey } from "./DashboardSidebar";

const items: { key: SectionKey; icon: typeof Home; label: string }[] = [
  { key: "home", icon: Home, label: "Home" },
  { key: "browse", icon: Search, label: "Browse" },
  { key: "sessions", icon: CalendarClock, label: "Sessions" },
  { key: "documents", icon: FileText, label: "Docs" },
  { key: "progress", icon: TrendingUp, label: "Progress" },
  { key: "settings", icon: Settings, label: "Settings" },
];

export function MobileBottomNav({
  active,
  onSelect,
}: {
  active: SectionKey;
  onSelect: (key: SectionKey) => void;
}) {
  const navigate = useNavigate();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-white/10 bg-[#1A1A1A] md:hidden">
      {items.map((it) => {
        const Icon = it.icon;
        const isActive = it.key === active;
        return (
          <button
            key={it.key}
            onClick={() => {
              if (it.key === "browse") {
                navigate({ to: "/browse" });
                return;
              }
              onSelect(it.key);
            }}
            aria-label={it.label}
            className="flex h-14 items-center justify-center"
          >
            <Icon
              className="h-5 w-5 transition"
              style={{ color: isActive ? "#C4907F" : "rgba(255,255,255,0.55)" }}
            />
          </button>
        );
      })}
    </nav>
  );
}
