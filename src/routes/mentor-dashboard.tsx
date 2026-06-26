import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { RejectedScreen, UnderReviewScreen } from "@/components/mentor-signup/MentorStatusScreens";
import { mentorFinalizeSkippedThisSession } from "@/components/mentor-signup/gate";
import { MentorSidebar } from "@/components/mentor-dashboard/MentorSidebar";
import { MentorMobileNav } from "@/components/mentor-dashboard/MentorMobileNav";
import { DashboardTopbar } from "@/components/dashboard/DashboardTopbar";
import { MentorDashboardProvider } from "@/components/mentor-dashboard/MentorDashboardContext";
import { resolveUserRole } from "@/lib/auth/role";
import { clientAuthGuard, type AuthContext } from "@/lib/auth/route-guard";
import { withRetry } from "@/lib/retry";

// Mentor dashboard LAYOUT route. Renders the persistent shell (sidebar, topbar,
// mobile nav, the "no availability" banner, and the application-status gates)
// once + an <Outlet/> for the per-section child routes. Guard + gates live here
// so no child mounts for a signed-out / wrong-role / non-approved mentor.
export const Route = createFileRoute("/mentor-dashboard")({
  beforeLoad: () => clientAuthGuard({ signedOutTo: "/mentor-signup", requireRole: "mentor" }),
  head: () => ({
    meta: [{ title: "Mentor Dashboard — UniPlug" }],
  }),
  component: MentorDashboardLayout,
});

type MentorRow = {
  full_name: string | null;
  status: "pending" | "approved" | "rejected" | null;
  application_submitted_at: string | null;
  verification_notes: string | null;
  college_email: string | null;
};

function MentorDashboardLayout() {
  const ctx = Route.useRouteContext() as AuthContext;
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search as { edit?: string } });
  const [mentorId, setMentorId] = useState<string | null>(ctx.userId ?? null);
  const [userMetadata, setUserMetadata] = useState<{ role?: string; full_name?: string } | null>(
    ctx.userMetadata ?? null,
  );
  const [ready, setReady] = useState(!!ctx.userId);

  // SSR / hard-refresh fallback (see dashboard.tsx for the rationale).
  useEffect(() => {
    if (ctx.userId) return;
    let cancelled = false;
    void (async () => {
      const { data: sessionData, error: sessErr } = await withRetry(() =>
        supabase.auth.getSession(),
      );
      if (cancelled) return;
      if (sessErr) {
        navigate({ to: "/mentor-signup" });
        return;
      }
      const session = sessionData?.session;
      if (!session) {
        navigate({ to: "/mentor-signup" });
        return;
      }
      if ((session.user.email ?? "").toLowerCase() === "divitfatehpuria7@gmail.com") {
        navigate({ to: "/admin" });
        return;
      }
      const meta = (session.user.user_metadata ?? {}) as { role?: string; full_name?: string };
      const role = await resolveUserRole(session.user.id, session.user.email, meta);
      if (cancelled) return;
      if (role === "student") {
        navigate({ to: "/dashboard" });
        return;
      }
      setMentorId(session.user.id);
      setUserMetadata(meta);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, ctx.userId]);

  const { data: mentorRow } = useQuery<MentorRow>({
    queryKey: ["mentor-profile-header", mentorId],
    enabled: !!mentorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mentors")
        .select("full_name, status, application_submitted_at, verification_notes, college_email")
        .eq("id", mentorId as string)
        .maybeSingle();
      if (error) throw error;
      return {
        full_name: data?.full_name ?? null,
        status: (data?.status as MentorRow["status"]) ?? null,
        application_submitted_at: data?.application_submitted_at ?? null,
        verification_notes: data?.verification_notes ?? null,
        college_email: data?.college_email ?? null,
      };
    },
  });

  const { data: availabilityCount } = useQuery<number>({
    queryKey: ["mentor-availability-count", mentorId],
    enabled: !!mentorId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("mentor_availability")
        .select("id", { count: "exact", head: true })
        .eq("mentor_id", mentorId as string);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const fullName = mentorRow?.full_name ?? userMetadata?.full_name ?? "";
  const firstName = fullName.split(" ")[0] ?? "";
  const status: MentorRow["status"] = mentorRow?.status ?? null;

  // P8 application gate: a pending mentor who hasn't submitted their documents is
  // routed to the finalize step (unless they chose "Finish later" this session).
  const qc = useQueryClient();
  const pendingUnsubmitted =
    !!mentorRow && status === "pending" && mentorRow.application_submitted_at == null;
  useEffect(() => {
    if (pendingUnsubmitted && !mentorFinalizeSkippedThisSession()) {
      navigate({ to: "/mentor-signup/finalize" });
    }
  }, [pendingUnsubmitted, navigate]);

  if (!ready || !mentorId) {
    return <div className="min-h-screen bg-[#FFFCFB]" />;
  }

  // Mentor application gate — route the non-approved states (approved falls
  // through to the dashboard children). The loading shell above prevents a flash.
  if (mentorRow && status !== "approved") {
    if (status === "rejected") {
      return (
        <RejectedScreen
          mentorId={mentorId}
          reason={mentorRow.verification_notes}
          firstName={firstName}
          onResubmitted={() =>
            void qc.invalidateQueries({ queryKey: ["mentor-profile-header", mentorId] })
          }
        />
      );
    }
    // pending + unsubmitted (+ not skipped) → the effect redirects to finalize;
    // render a blank shell meanwhile. Otherwise (submitted / skipped) → review.
    if (pendingUnsubmitted && !mentorFinalizeSkippedThisSession()) {
      return <div className="min-h-screen bg-[#FFFCFB]" />;
    }
    return <UnderReviewScreen firstName={firstName} collegeEmail={mentorRow.college_email} />;
  }

  // Index-in-place (decision Q2): an approved mentor on the exact home path gets
  // the full-bleed 3D "Headquarters" — the layout drops its sidebar / topbar /
  // 1100px box / mobile nav and lets the home render edge-to-edge. The guard +
  // approval gates above still run, and the Outlet stays wrapped in
  // MentorDashboardProvider so the home gets mentorId. Every OTHER child route
  // (and the `?edit` session-note flow) keeps the normal shell below — additive,
  // working pages untouched.
  const isHqHome =
    (pathname === "/mentor-dashboard" || pathname === "/mentor-dashboard/") && !search.edit;
  if (isHqHome) {
    return (
      <MentorDashboardProvider value={{ mentorId }}>
        <Outlet />
      </MentorDashboardProvider>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFCFB]">
      <MentorSidebar />

      <main className="md:ml-[240px]">
        <div className="mx-auto max-w-[1100px] px-5 pb-28 pt-6 sm:px-8 md:px-10 md:pb-12 md:pt-10">
          <DashboardTopbar firstName={firstName} role="mentor" />
          {/* The no-availability nudge is hidden on the schedule editor (where
              you're already setting it) and on settings (matching the prior
              active!=="settings" behaviour). */}
          {availabilityCount === 0 &&
            !pathname.startsWith("/mentor-dashboard/schedule") &&
            !pathname.startsWith("/mentor-dashboard/settings") && (
              <div className="mt-6 flex flex-col gap-4 rounded-r-2xl border-l-4 border-[#C4907F] bg-[#EDE0DB] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div>
                  <h3 className="font-display text-[18px] font-semibold text-[#1A1A1A]">
                    Your profile is live but students cannot book you yet.
                  </h3>
                  <p className="mt-1 text-[13px] text-[#1A1A1A]/80">
                    Add your weekly availability to start receiving sessions.
                  </p>
                </div>
                <Link
                  to="/mentor-dashboard/schedule"
                  className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-[#1A1A1A] px-5 font-display text-[13px] font-semibold text-[#FFFCFB] transition hover:opacity-90"
                >
                  Set Availability
                </Link>
              </div>
            )}
          <MentorDashboardProvider value={{ mentorId }}>
            <Outlet />
          </MentorDashboardProvider>
        </div>
      </main>

      <MentorMobileNav />
    </div>
  );
}
