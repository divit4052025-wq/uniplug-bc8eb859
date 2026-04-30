import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export function DashboardTopbar({
  firstName,
  role,
}: {
  firstName: string;
  role: "student" | "mentor";
}) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (role !== "mentor") return;
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      const session = data.session;
      if (!session) return;
      const { count, error } = await (supabase as any)
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", session.user.id)
        .is("read_at", null);
      if (cancelled) return;
      if (error) {
        console.error("[topbar] unread count failed", error);
        setUnreadCount(0);
        return;
      }
      setUnreadCount(count ?? 0);
    });
    return () => {
      cancelled = true;
    };
  }, [role]);

  return (
    <div className="flex items-start justify-between gap-4 pb-2">
      <h1
        className="font-display text-[#1A1A1A]"
        style={{ fontSize: "clamp(22px, 4vw, 28px)", fontWeight: 600, letterSpacing: "-0.02em" }}
      >
        {greeting}{firstName ? `, ${firstName}` : ""}
      </h1>
      {role === "mentor" && (
        <Link
          to="/notifications"
          aria-label="Notifications"
          className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#EDE0DB] bg-[#FFFCFB] text-[#1A1A1A] transition hover:border-[#C4907F]"
        >
          <Bell className="h-[18px] w-[18px]" />
          {unreadCount > 0 && (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#C4907F]" />
          )}
        </Link>
      )}
    </div>
  );
}
