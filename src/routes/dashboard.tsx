import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { DashboardSidebar, type SectionKey } from "@/components/dashboard/DashboardSidebar";
import { MobileBottomNav } from "@/components/dashboard/MobileBottomNav";
import { DashboardTopbar } from "@/components/dashboard/DashboardTopbar";
import { MyPlugsSection } from "@/components/dashboard/sections/MyPlugsSection";
import { TopPicksSection } from "@/components/dashboard/sections/TopPicksSection";
import { UpcomingSessionsSection } from "@/components/dashboard/sections/UpcomingSessionsSection";
import { PastSessionsSection } from "@/components/dashboard/sections/PastSessionsSection";
import { MySchoolsSection } from "@/components/dashboard/sections/MySchoolsSection";
import { MyDocumentsSection } from "@/components/dashboard/sections/MyDocumentsSection";
import { SessionNotesSection } from "@/components/dashboard/sections/SessionNotesSection";
import { AccountDataSection } from "@/components/settings/AccountDataSection";
import { AwaitingConsentNotice } from "@/components/consent/AwaitingConsentNotice";
import { useConsentStatus } from "@/lib/consent/useConsentStatus";
import { resolveUserRole } from "@/lib/auth/role";
import { clientAuthGuard, type AuthContext } from "@/lib/auth/route-guard";
import { withRetry } from "@/lib/retry";
import { finalizeSkippedThisSession } from "@/components/student-signup/gate";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: () => clientAuthGuard({ signedOutTo: "/student-signup", requireRole: "student" }),
  head: () => ({
    meta: [{ title: "Dashboard — UniPlug" }],
  }),
  component: Dashboard,
});

const SECTION_TO_ANCHOR: Partial<Record<SectionKey, string>> = {
  home: "section-plugs",
  browse: "section-plugs",
  sessions: "section-sessions",
  documents: "section-documents",
};

function Dashboard() {
  const ctx = Route.useRouteContext() as AuthContext;
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(ctx.userId ?? null);
  const [userMetadata, setUserMetadata] = useState<{ role?: string; full_name?: string } | null>(
    ctx.userMetadata ?? null,
  );
  const [active, setActive] = useState<SectionKey>("home");
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
      if ((session.user.email ?? "").toLowerCase() === "divitfatehpuria7@gmail.com") {
        navigate({ to: "/admin" });
        return;
      }
      const meta = (session.user.user_metadata ?? {}) as { role?: string; full_name?: string };
      const role = await resolveUserRole(session.user.id, session.user.email, meta);
      if (cancelled) return;
      if (role === "mentor") {
        navigate({ to: "/mentor-dashboard", search: {} });
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
  // them here with a soft nudge banner instead, so a legacy/backfill user is
  // never trapped.
  const profileIncomplete = !!profile && profile.profile_completed_at === null;
  useEffect(() => {
    if (profileIncomplete && !finalizeSkippedThisSession()) {
      navigate({ to: "/student-signup/finalize" });
    }
  }, [profileIncomplete, navigate]);

  const { data: consent } = useConsentStatus(userId);

  const fullName = profile?.full_name ?? userMetadata?.full_name ?? "";
  const firstName = fullName.split(" ")[0] ?? "";

  const select = (key: SectionKey) => {
    setActive(key);
    if (key === "settings") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const anchor = SECTION_TO_ANCHOR[key];
    if (anchor) {
      const el = document.getElementById(anchor);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (!ready || !userId) {
    return <div className="min-h-screen bg-[#FFFCFB]" />;
  }

  return (
    <div className="min-h-screen bg-[#FFFCFB]">
      <DashboardSidebar active={active} onSelect={select} />

      <main className="md:ml-[240px]">
        <div className="mx-auto max-w-[1100px] px-5 pb-28 pt-6 sm:px-8 md:px-10 md:pb-12 md:pt-10">
          <DashboardTopbar firstName={firstName} role="student" />
          {active === "settings" ? (
            <div className="mt-8 animate-hero-rise">
              <h2 className="font-display text-[24px] font-semibold text-[#1A1A1A]">Settings</h2>
              <p className="mt-1 text-[13px] text-[#1A1A1A]/60">Manage your data and account.</p>
              <div className="mt-8">
                <AccountDataSection />
              </div>
            </div>
          ) : (
            <div className="mt-8 space-y-12 animate-hero-rise">
              {profileIncomplete && (
                <div className="flex flex-col gap-3 rounded-2xl border border-[#C4907F]/30 bg-[#E8C4B8]/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#1A1A1A]">
                      Finish setting up your profile
                    </p>
                    <p className="text-[13px] text-[#1A1A1A]/70">
                      Add your subjects, targets and a photo for better mentor matches.
                    </p>
                  </div>
                  {/* Near-black CTA: white-on-dusty-rose (#C4907F) fails WCAG AA
                      contrast (~2.7:1); near-black clears it comfortably. */}
                  <button
                    type="button"
                    onClick={() => navigate({ to: "/student-signup/finalize" })}
                    className="shrink-0 rounded-full bg-[#1A1A1A] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                  >
                    Complete profile
                  </button>
                </div>
              )}
              {consent?.awaiting && (
                <AwaitingConsentNotice studentId={userId} parentEmail={consent.parentEmail} />
              )}
              <MyPlugsSection studentId={userId} />
              <TopPicksSection studentId={userId} />
              <UpcomingSessionsSection studentId={userId} />
              <PastSessionsSection studentId={userId} />
              <SessionNotesSection studentId={userId} />
              <MySchoolsSection userId={userId} />
              <MyDocumentsSection userId={userId} />
            </div>
          )}
        </div>
      </main>

      <MobileBottomNav active={active} onSelect={select} />
    </div>
  );
}
