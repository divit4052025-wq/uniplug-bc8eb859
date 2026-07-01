import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { StudentDashboardProvider } from "@/components/dashboard/DashboardContext";
import { StudentSupportButton } from "@/components/student-quarter/StudentSupportButton";
import { useConsentStatus } from "@/lib/consent/useConsentStatus";
import { resolveUserRole } from "@/lib/auth/role";
import { clientAuthGuard, type AuthContext } from "@/lib/auth/route-guard";
import { withRetry } from "@/lib/retry";
import { finalizeSkippedThisSession } from "@/components/student-signup/gate";

// Student dashboard LAYOUT route. Renders the persistent shell (sidebar, topbar,
// mobile nav) once and an <Outlet/> for the per-section child routes. The auth
// guard lives here so every child inherits it; the shell stays mounted across
// section navigation, so switching pages never re-renders/re-fetches the chrome.
export const Route = createFileRoute("/dashboard")({
  beforeLoad: () => clientAuthGuard({ signedOutTo: "/student-signup", requireRole: "student" }),
  head: () => ({
    meta: [{ title: "Dashboard — UniPlug" }],
  }),
  component: DashboardLayout,
});

function DashboardLayout() {
  const ctx = Route.useRouteContext() as AuthContext;
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(ctx.userId ?? null);
  const [userMetadata, setUserMetadata] = useState<{ role?: string; full_name?: string } | null>(
    ctx.userMetadata ?? null,
  );
  const [ready, setReady] = useState(!!ctx.userId);

  // SSR / hard-refresh fallback: when beforeLoad was skipped on the server
  // (typeof window check), do the auth resolution after hydration. Skipped
  // entirely on client-side navigation since beforeLoad already populated
  // ctx.userId.
  useEffect(() => {
    if (ctx.userId) return;
    let cancelled = false;
    void (async () => {
      const { data: sessionData, error: sessErr } = await withRetry(() =>
        supabase.auth.getSession(),
      );
      if (cancelled) return;
      if (sessErr) {
        navigate({ to: "/student-signup" });
        return;
      }
      const session = sessionData?.session;
      if (!session) {
        navigate({ to: "/student-signup" });
        return;
      }
      const meta = (session.user.user_metadata ?? {}) as { role?: string; full_name?: string };
      const role = await resolveUserRole(session.user.id, session.user.email, meta);
      if (cancelled) return;
      // Admin-ness is data-driven now (role system), not an email literal.
      if (role === "admin") {
        navigate({ to: "/admin" });
        return;
      }
      if (role === "mentor") {
        navigate({ to: "/mentor-dashboard" });
        return;
      }
      setUserId(session.user.id);
      setUserMetadata(meta);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, ctx.userId]);

  const { data: profile } = useQuery<{
    full_name: string | null;
    profile_completed_at: string | null;
  }>({
    queryKey: ["student-profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("full_name, profile_completed_at")
        .eq("id", userId as string)
        .maybeSingle();
      if (error) throw error;
      return {
        full_name: data?.full_name ?? null,
        profile_completed_at: data?.profile_completed_at ?? null,
      };
    },
  });

  // P7 finalize gate: an authenticated student who hasn't completed their
  // profile is routed to the finalize step. "Skip for now" (per-session) drops
  // them here with a soft nudge banner (rendered on the home child) instead, so
  // a legacy/backfill user is never trapped.
  const profileIncomplete = !!profile && profile.profile_completed_at === null;
  useEffect(() => {
    if (profileIncomplete && !finalizeSkippedThisSession()) {
      navigate({ to: "/student-signup/finalize" });
    }
  }, [profileIncomplete, navigate]);

  const { data: consent } = useConsentStatus(userId);

  const fullName = profile?.full_name ?? userMetadata?.full_name ?? "";
  const firstName = fullName.split(" ")[0] ?? "";

  if (!ready || !userId) {
    return <div className="min-h-screen bg-[#FFFCFB]" />;
  }

  // Index-in-place: the Quarter 3D world IS the dashboard home/nav, and each
  // landmark renders full-bleed (its own QuarterPageShell chrome + "‹ Quarter"
  // return). The old sidebar/topbar/mobile-nav shell is retired here. The guard
  // + finalize gate + context stay; every child inherits them via the Outlet.
  return (
    <StudentDashboardProvider value={{ userId, firstName, profileIncomplete, consent }}>
      <Outlet />
      {/* Persistent emergency-guidance affordance — floats over every landmark
          and the 3D world home. NOT a route/zone; pure React + CSS (three-free).
          Emergency contacts only — no report form (owner-deferred). */}
      <StudentSupportButton />
    </StudentDashboardProvider>
  );
}
