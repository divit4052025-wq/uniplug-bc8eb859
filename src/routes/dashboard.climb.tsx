import { createFileRoute } from "@tanstack/react-router";

import { QuarterPageShell } from "@/components/student-quarter/QuarterPageShell";
import { SessionNotesSection } from "@/components/dashboard/sections/SessionNotesSection";
import { useStudentDashboard } from "@/components/dashboard/DashboardContext";

// The Climb ← /progress. How far you've come — your mentor's session notes and
// the action points you've ticked off (the real action_point_completions). All
// mentor-authored / student-toggled real data; no fabricated streaks or scores.
export const Route = createFileRoute("/dashboard/climb")({
  component: ClimbPage,
});

function ClimbPage() {
  const { userId } = useStudentDashboard();
  return (
    <QuarterPageShell
      kind="Progress"
      title="The Climb"
      intro="How far you’ve come — your session notes, action points, and what’s done."
    >
      <SessionNotesSection studentId={userId} />
    </QuarterPageShell>
  );
}
