import { createFileRoute } from "@tanstack/react-router";

import { ScheduleSection } from "@/components/mentor-dashboard/sections/ScheduleSection";
import { useMentorDashboard } from "@/components/mentor-dashboard/MentorDashboardContext";

// My Schedule (/mentor-dashboard/schedule) — weekly availability editor.
export const Route = createFileRoute("/mentor-dashboard/schedule")({
  component: MentorSchedule,
});

function MentorSchedule() {
  const { mentorId } = useMentorDashboard();
  return (
    <div className="mt-8 space-y-12 animate-hero-rise">
      <ScheduleSection mentorId={mentorId} />
    </div>
  );
}
