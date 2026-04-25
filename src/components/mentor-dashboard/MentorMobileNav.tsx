import { Home, CalendarClock, Users, Wallet, Settings } from "lucide-react";
import type { MentorSectionKey } from "./MentorSidebar";

const items: { key: MentorSectionKey; icon: typeof Home; label: string }[] = [
  { key: "home", icon: Home, label: "Home" },
  { key: "schedule", icon: CalendarClock, label: "Schedule" },
  { key: "students", icon: Users, label: "Students" },
  { key: "earnings", icon: Wallet, label: "Earnings" },
  { key: "settings", icon: Settings, label: "Settings" },
];

export function MentorMobileNav({
  active,
  onSelect,
}: {
  active: MentorSectionKey;
  onSelect: (key: MentorSectionKey) => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-white/10 bg-[#1A1A1A] md:hidden">
      {items.map((it) => {
        const Icon = it.icon;
        const isActive = it.key === active;
        return (
          <button
            key={it.key}
            onClick={() => onSelect(it.key)}
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