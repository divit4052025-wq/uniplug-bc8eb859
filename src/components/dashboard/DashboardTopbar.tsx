import { Bell } from "lucide-react";

export function DashboardTopbar({ firstName }: { firstName: string }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <div className="flex items-start justify-between gap-4 pb-2">
      <h1
        className="font-display text-[#1A1A1A]"
        style={{ fontSize: "clamp(22px, 4vw, 28px)", fontWeight: 600, letterSpacing: "-0.02em" }}
      >
        {greeting}{firstName ? `, ${firstName}` : ""}
      </h1>
      <button
        aria-label="Notifications"
        className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#EDE0DB] bg-[#FFFCFB] text-[#1A1A1A] transition hover:border-[#C4907F]"
      >
        <Bell className="h-[18px] w-[18px]" />
        <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#C4907F]" />
      </button>
    </div>
  );
}
