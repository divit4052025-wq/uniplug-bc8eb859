import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { RejectedScreen, UnderReviewScreen } from "@/components/mentor-signup/MentorStatusScreens";
import { mentorFinalizeSkippedThisSession } from "@/components/mentor-signup/gate";
import { MentorSidebar, type MentorSectionKey } from "@/components/mentor-dashboard/MentorSidebar";
import { MentorMobileNav } from "@/components/mentor-dashboard/MentorMobileNav";
import { DashboardTopbar } from "@/components/dashboard/DashboardTopbar";
import { ScheduleSection } from "@/components/mentor-dashboard/sections/ScheduleSection";
import { MentorUpcomingSessions } from "@/components/mentor-dashboard/sections/MentorUpcomingSessions";
import { MyStudentsSection } from "@/components/mentor-dashboard/sections/MyStudentsSection";
import { PostSessionNotesSection } from "@/components/mentor-dashboard/sections/PostSessionNotesSection";
import { EarningsSection } from "@/components/mentor-dashboard/sections/EarningsSection";
import { SettingsSection } from "@/components/mentor-dashboard/sections/SettingsSection";
import { resolveUserRole } from "@/lib/auth/role";
import { clientAuthGuard, type AuthContext } from "@/lib/auth/route-guard";
import { withRetry } from "@/lib/retry";

export const Route = createFileRoute("/mentor-dashboard")({
  beforeLoad: () => clientAuthGuard({ signedOutTo: "/mentor-signup", requireRole: "mentor" }),
  head: () => ({
    meta: [{ title: "Mentor Dashboard — UniPlug" }],
  }),
  validateSearch: (search: Record<string, unknown>): { edit?: string } => {
    const edit = typeof search.edit === "string" ? (search.edit as string) : undefined;
    return edit ? { edit } : {};
  },
  component: MentorDashboard,
});

const SECTION_TO_ANCHOR: Partial<Record<MentorSectionKey, string>> = {
  home: "section-schedule",
  schedule: "section-schedule",
  students: "section-students",
  earnings: "section-earnings",
};

type MentorRow = {
  full_name: string | null;
  status: "pending" | "approved" | "rejected" | null;
  application_submitted_at: string | null;
  verification_notes: string | null;
};

function MentorDashboard() {
  const ctx = Route.useRouteContext() as AuthContext;
  const navigate = useNavigate();
  const { edit } = Route.useSearch();
  const [mentorId, setMentorId] = useState<string | null>(ctx.userId ?? null);
  const [userMetadata, setUserMetadata] = useState<{ role?: string; full_name?: string } | null>(
    ctx.userMetadata ?? null,
  );
  const [active, setActive] = useState<MentorSectionKey>("home");
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
        .select("full_name, status, application_submitted_at, verification_notes")
        .eq("id", mentorId as string)
        .maybeSingle();
      if (error) throw error;
      return {
        full_name: data?.full_name ?? null,
        status: (data?.status as MentorRow["status"]) ?? null,
        application_submitted_at: data?.application_submitted_at ?? null,
        verification_notes: data?.verification_notes ?? null,
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

  const select = (key: MentorSectionKey) => {
    setActive(key);
    if (key === "settings") return;
    const anchor = SECTION_TO_ANCHOR[key];
    if (anchor) {
      const el = document.getElementById(anchor);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (!ready || !mentorId) {
    return <div className="min-h-screen bg-[#FFFCFB]" />;
  }

  // Mentor application gate — route the non-approved states (approved falls
  // through to the dashboard). The loading shell above prevents a flash.
  if (mentorRow && status !== "approved") {
    if (status === "rejected") {
      return (
        <RejectedScreen
          mentorId={mentorId}
          reason={mentorRow.verification_notes}
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
    return <UnderReviewScreen />;
  }

  return (
    <div className="min-h-screen bg-[#FFFCFB]">
      <MentorSidebar active={active} onSelect={select} />

      <main className="md:ml-[240px]">
        <div className="mx-auto max-w-[1100px] px-5 pb-28 pt-6 sm:px-8 md:px-10 md:pb-12 md:pt-10">
          <DashboardTopbar firstName={firstName} role="mentor" />
          {active !== "settings" && availabilityCount === 0 && (
            <div className="mt-6 flex flex-col gap-4 rounded-r-2xl border-l-4 border-[#C4907F] bg-[#EDE0DB] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <h3 className="font-display text-[18px] font-semibold text-[#1A1A1A]">
                  Your profile is live but students cannot book you yet.
                </h3>
                <p className="mt-1 text-[13px] text-[#1A1A1A]/80">
                  Add your weekly availability to start receiving sessions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => select("schedule")}
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-[#1A1A1A] px-5 font-display text-[13px] font-semibold text-[#FFFCFB] transition hover:opacity-90"
              >
                Set Availability
              </button>
            </div>
          )}
          {active === "settings" ? (
            <div className="mt-8 animate-hero-rise">
              <SettingsSection mentorId={mentorId} />
            </div>
          ) : (
            <div className="mt-8 space-y-12 animate-hero-rise">
              <ScheduleSection mentorId={mentorId} />
              <MentorUpcomingSessions mentorId={mentorId} />
              <MyStudentsSection mentorId={mentorId} />
              <PostSessionNotesSection
                mentorId={mentorId}
                editNoteId={edit ?? null}
                onEditConsumed={() => navigate({ to: "/mentor-dashboard", search: {} })}
              />
              <EarningsSection mentorId={mentorId} />
            </div>
          )}
        </div>
      </main>

      <MentorMobileNav active={active} onSelect={select} />
    </div>
  );
}
