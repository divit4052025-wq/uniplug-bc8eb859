import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { resolveUserRole } from "@/lib/auth/role";
import { withRetry } from "@/lib/retry";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { MobileBottomNav } from "@/components/dashboard/MobileBottomNav";
import { DashboardTopbar } from "@/components/dashboard/DashboardTopbar";
import { MentorSidebar } from "@/components/mentor-dashboard/MentorSidebar";
import { MentorMobileNav } from "@/components/mentor-dashboard/MentorMobileNav";

type Ready = { userId: string; role: "student" | "mentor"; firstName: string };

/**
 * Shared shell for the /messages routes — renders the role-appropriate sidebar
 * + topbar + mobile nav (with "Messages" active) and resolves the signed-in
 * user. Non-"messages" nav selections route back to the dashboard.
 */
export function MessagesLayout({
  children,
}: {
  children: (ctx: { userId: string; role: "student" | "mentor" }) => ReactNode;
}) {
  const navigate = useNavigate();
  const [ctx, setCtx] = useState<Ready | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await withRetry(() => supabase.auth.getSession());
      const session = data?.session;
      if (error || !session) {
        navigate({ to: "/login" });
        return;
      }
      const meta = (session.user.user_metadata ?? {}) as { role?: string; full_name?: string };
      const role = await resolveUserRole(session.user.id, session.user.email, meta);
      if (cancelled) return;
      if (role !== "student" && role !== "mentor") {
        navigate({ to: "/" });
        return;
      }
      setCtx({
        userId: session.user.id,
        role,
        firstName: (meta.full_name ?? "").trim().split(" ")[0] ?? "",
      });
    })().catch(() => {
      if (!cancelled) navigate({ to: "/login" });
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (!ctx) return <div className="min-h-screen bg-[#FFFCFB]" />;

  const toDash = () => navigate({ to: ctx.role === "mentor" ? "/mentor-dashboard" : "/dashboard" });

  return (
    <div className="min-h-screen bg-[#FFFCFB]">
      {ctx.role === "mentor" ? (
        <MentorSidebar active="messages" onSelect={toDash} />
      ) : (
        <DashboardSidebar active="messages" onSelect={toDash} />
      )}
      <main className="md:ml-[240px]">
        <div className="mx-auto max-w-[1100px] px-5 pb-28 pt-6 sm:px-8 md:px-10 md:pb-12 md:pt-10">
          <DashboardTopbar firstName={ctx.firstName} role={ctx.role} />
          <div className="mt-6">{children({ userId: ctx.userId, role: ctx.role })}</div>
        </div>
      </main>
      {ctx.role === "mentor" ? (
        <MentorMobileNav active="messages" onSelect={toDash} />
      ) : (
        <MobileBottomNav active="messages" onSelect={toDash} />
      )}
    </div>
  );
}
