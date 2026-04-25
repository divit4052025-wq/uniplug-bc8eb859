import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardSidebar, type SectionKey } from "@/components/dashboard/DashboardSidebar";
import { MobileBottomNav } from "@/components/dashboard/MobileBottomNav";
import { DashboardTopbar } from "@/components/dashboard/DashboardTopbar";
import { MyPlugsSection } from "@/components/dashboard/sections/MyPlugsSection";
import { UpcomingSessionsSection } from "@/components/dashboard/sections/UpcomingSessionsSection";
import { MySchoolsSection } from "@/components/dashboard/sections/MySchoolsSection";
import { MyDocumentsSection } from "@/components/dashboard/sections/MyDocumentsSection";
import { SessionNotesSection } from "@/components/dashboard/sections/SessionNotesSection";
import { resolveUserRole } from "@/lib/auth/role";

export const Route = createFileRoute("/dashboard")({
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
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [active, setActive] = useState<SectionKey>("home");
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      const session = data.session;
      if (!session) {
        navigate({ to: "/student-signup" });
        return;
      }
      if ((session.user.email ?? "").toLowerCase() === "divitfatehpuria7@gmail.com") {
        navigate({ to: "/admin" });
        return;
      }
      // Block mentors from the student dashboard
      const role = await resolveUserRole(session.user.id, session.user.email);
      if (cancelled) return;
      if (role === "mentor") {
        navigate({ to: "/mentor-dashboard", search: {} });
        return;
      }
      setUserId(session.user.id);
      const { data: row } = await supabase
        .from("students")
        .select("full_name")
        .eq("id", session.user.id)
        .maybeSingle();
      if (cancelled) return;
      const full = row?.full_name ?? (session.user.user_metadata?.full_name as string | undefined) ?? "";
      setFirstName(full.split(" ")[0] ?? "");
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const select = (key: SectionKey) => {
    setActive(key);
    if (key === "settings") {
      setComingSoon("Settings");
      setTimeout(() => setComingSoon(null), 2200);
      return;
    }
    setComingSoon(null);
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
          <DashboardTopbar firstName={firstName} />
          <div className="mt-8 space-y-12 animate-hero-rise">
            <MyPlugsSection studentId={userId} />
            <UpcomingSessionsSection studentId={userId} />
            <SessionNotesSection studentId={userId} />
            <MySchoolsSection userId={userId} />
            <MyDocumentsSection userId={userId} />
          </div>
        </div>
      </main>

      <MobileBottomNav active={active} onSelect={select} />

      {comingSoon && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[#1A1A1A] px-5 py-2.5 text-[13px] font-medium text-white shadow-lg md:bottom-8">
          {comingSoon} — coming soon
        </div>
      )}
    </div>
  );
}
