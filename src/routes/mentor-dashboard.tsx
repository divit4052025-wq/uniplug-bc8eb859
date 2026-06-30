import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { mentorFinalizeSkippedThisSession } from "@/components/mentor-signup/gate";
import {
  MentorDashboardProvider,
  type MentorStatus,
} from "@/components/mentor-dashboard/MentorDashboardContext";
import { resolveUserRole } from "@/lib/auth/role";
import { clientAuthGuard, type AuthContext } from "@/lib/auth/route-guard";
import { withRetry } from "@/lib/retry";

// Mentor "Headquarters" LAYOUT route. Resolves the authenticated mentor + their
// verification status (guard context or the SSR/hard-refresh getSession
// fallback), then renders the full-bleed dark HQ via an <Outlet/>: the 3D world
// at the index and the seven landmark pages beneath it. The guard + the
// finalize gate live here so no child mounts for a signed-out / wrong-role /
// never-submitted mentor. The three verification world-states (pending /
// approved / rejected) are driven by `status`, passed down through context — a
// pending-but-submitted or rejected mentor still enters the world (in its
// under-construction / stalled state); the old Under-Review / Rejected screens
// and the 2D sidebar shell are retired (their messaging now lives in the
// Watchtower + the Forge).
export const Route = createFileRoute("/mentor-dashboard")({
  beforeLoad: () => clientAuthGuard({ signedOutTo: "/mentor-signup", requireRole: "mentor" }),
  head: () => ({
    meta: [{ title: "Headquarters — UniPlug" }],
  }),
  component: MentorDashboardLayout,
});

type MentorRow = {
  full_name: string | null;
  status: MentorStatus | null;
  application_submitted_at: string | null;
  verification_notes: string | null;
  college_email: string | null;
  verified_at: string | null;
};

function MentorDashboardLayout() {
  const ctx = Route.useRouteContext() as AuthContext;
  const navigate = useNavigate();
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
      const meta = (session.user.user_metadata ?? {}) as { role?: string; full_name?: string };
      const role = await resolveUserRole(session.user.id, session.user.email, meta);
      if (cancelled) return;
      // Admin-ness is data-driven now (role system), not an email literal.
      if (role === "admin") {
        navigate({ to: "/admin" });
        return;
      }
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
        .select(
          "full_name, status, application_submitted_at, verification_notes, college_email, verified_at",
        )
        .eq("id", mentorId as string)
        .maybeSingle();
      if (error) throw error;
      return {
        full_name: data?.full_name ?? null,
        status: (data?.status as MentorRow["status"]) ?? null,
        application_submitted_at: data?.application_submitted_at ?? null,
        verification_notes: data?.verification_notes ?? null,
        college_email: data?.college_email ?? null,
        verified_at: data?.verified_at ?? null,
      };
    },
  });

  const fullName = mentorRow?.full_name ?? userMetadata?.full_name ?? "";
  const firstName = fullName.split(" ")[0] ?? "";
  const status: MentorStatus | null = mentorRow?.status ?? null;

  // A pending mentor who has never submitted their application is routed to the
  // finalize step (unless they chose "Finish later" this session).
  const pendingUnsubmitted =
    !!mentorRow && status === "pending" && mentorRow.application_submitted_at == null;
  useEffect(() => {
    if (pendingUnsubmitted && !mentorFinalizeSkippedThisSession()) {
      navigate({ to: "/mentor-signup/finalize" });
    }
  }, [pendingUnsubmitted, navigate]);

  // Dark loading shell (prevents a white flash before the dark HQ paints).
  if (!ready || !mentorId) {
    return <div className="min-h-dvh bg-[var(--brand-night)]" />;
  }
  if (pendingUnsubmitted && !mentorFinalizeSkippedThisSession()) {
    return <div className="min-h-dvh bg-[var(--brand-night)]" />;
  }

  return (
    <MentorDashboardProvider
      value={{
        mentorId,
        status,
        firstName,
        verificationNotes: mentorRow?.verification_notes ?? null,
        collegeEmail: mentorRow?.college_email ?? null,
        verifiedAt: mentorRow?.verified_at ?? null,
      }}
    >
      <Outlet />
    </MentorDashboardProvider>
  );
}
