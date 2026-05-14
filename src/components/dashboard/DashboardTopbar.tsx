import { Bell } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { istGreeting } from "@/lib/time";

export function DashboardTopbar({
  firstName,
  role,
}: {
  firstName: string;
  role: "student" | "mentor";
}) {
  const greeting = istGreeting();

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["notifications", "unread-count", role],
    enabled: role === "mentor",
    queryFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) return 0;
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", session.user.id)
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });

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
