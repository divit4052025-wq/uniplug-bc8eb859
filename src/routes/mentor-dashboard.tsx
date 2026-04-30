import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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

export const Route = createFileRoute("/mentor-dashboard")({
  head: () => ({
    meta: [{ title: "Mentor Dashboard — UniPlug" }],
  }),
  validateSearch: (
    search: Record<string, unknown>,
  ): { edit?: string } => {
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

function MentorDashboard() {
  const navigate = useNavigate();
  const { edit } = Route.useSearch();
  const [mentorId, setMentorId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | null>(null);
  const [active, setActive] = useState<MentorSectionKey>("home");
  const [ready, setReady] = useState(false);
  // null = not yet loaded; suppresses banner while fetching
  const [availabilityCount, setAvailabilityCount] = useState<number | null>(null);

  const loadAvailabilityCount = async (id: string) => {
    const { count } = await supabase
      .from("mentor_availability")
      .select("id", { count: "exact", head: true })
      .eq("mentor_id", id);
    setAvailabilityCount(count ?? 0);
  };

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      const session = data.session;
      if (!session) {
        navigate({ to: "/mentor-signup" });
        return;
      }
      // Block students / admin from the mentor dashboard
      if ((session.user.email ?? "").toLowerCase() === "divitfatehpuria7@gmail.com") {
        navigate({ to: "/admin" });
        return;
      }
      const role = await resolveUserRole(session.user.id, session.user.email);
      if (cancelled) return;
      if (role === "student") {
        navigate({ to: "/dashboard" });
        return;
      }
      setMentorId(session.user.id);
      const { data: row } = await supabase
        .from("mentors")
        .select("full_name, status")
        .eq("id", session.user.id)
        .maybeSingle();
      if (cancelled) return;
      const full = row?.full_name ?? (session.user.user_metadata?.full_name as string | undefined) ?? "";
      setFirstName(full.split(" ")[0] ?? "");
      setStatus((row?.status as typeof status) ?? "pending");
      setReady(true);
      // Fire-and-forget: banner stays hidden while count is null.
      void loadAvailabilityCount(session.user.id);
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const select = (key: MentorSectionKey) => {
    setActive(key);
    if (key === "settings") return; // rendered as its own view below
    const anchor = SECTION_TO_ANCHOR[key];
    if (anchor) {
      const el = document.getElementById(anchor);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (!ready || !mentorId) {
    return <div className="min-h-screen bg-[#FFFCFB]" />;
  }

  if (status !== "approved") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#FFFCFB] px-6">
        <div className="max-w-2xl text-center">
          <p className="font-display text-3xl text-[#1A1A1A] sm:text-4xl">
            Application received — we will review and get back to you within 48 hours.
          </p>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/" });
            }}
            className="mt-8 rounded-full border border-[#1A1A1A] px-6 py-2 text-sm font-medium text-[#1A1A1A] transition hover:bg-[#1A1A1A] hover:text-white"
          >
            Sign out
          </button>
        </div>
      </main>
    );
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
