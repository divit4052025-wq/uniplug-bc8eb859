import { createFileRoute } from "@tanstack/react-router";

import { UpcomingSessionsSection } from "@/components/dashboard/sections/UpcomingSessionsSection";
import { PastSessionsSection } from "@/components/dashboard/sections/PastSessionsSection";
import { SessionNotesSection } from "@/components/dashboard/sections/SessionNotesSection";
import { useStudentDashboard } from "@/components/dashboard/DashboardContext";

// My Sessions (/dashboard/sessions) — upcoming + past sessions + session notes.
export const Route = createFileRoute("/dashboard/sessions")({
  component: DashboardSessions,
});

function DashboardSessions() {
  const { userId } = useStudentDashboard();
  return (
    <div className="mt-8 space-y-12 animate-hero-rise">
      <UpcomingSessionsSection studentId={userId} />
      <PastSessionsSection studentId={userId} />
      <SessionNotesSection studentId={userId} />
    </div>
  );
}
