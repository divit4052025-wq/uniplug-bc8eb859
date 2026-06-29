import { createFileRoute } from "@tanstack/react-router";

import { QuarterPageShell } from "@/components/student-quarter/QuarterPageShell";
import { UpcomingSessionsSection } from "@/components/dashboard/sections/UpcomingSessionsSection";
import { PastSessionsSection } from "@/components/dashboard/sections/PastSessionsSection";
import { SessionNotesSection } from "@/components/dashboard/sections/SessionNotesSection";
import { useStudentDashboard } from "@/components/dashboard/DashboardContext";

// The Studio ← /dashboard/sessions. Upcoming + past sessions (join / reschedule
// / cancel / review via the existing real RPCs), plus your mentor's session
// notes. The /call/:id Daily screen stays the real in-session view.
export const Route = createFileRoute("/dashboard/studio")({
  component: StudioPage,
});

function StudioPage() {
  const { userId } = useStudentDashboard();
  return (
    <QuarterPageShell
      kind="Your sessions"
      title="The Studio"
      intro="Your 1:1 sessions — join, reschedule, review, and read your mentor’s notes."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <UpcomingSessionsSection studentId={userId} />
        <PastSessionsSection studentId={userId} />
        <SessionNotesSection studentId={userId} />
      </div>
    </QuarterPageShell>
  );
}
