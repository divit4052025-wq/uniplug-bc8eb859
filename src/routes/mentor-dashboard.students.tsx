import { createFileRoute } from "@tanstack/react-router";

import { MyStudentsSection } from "@/components/mentor-dashboard/sections/MyStudentsSection";
import { useMentorDashboard } from "@/components/mentor-dashboard/MentorDashboardContext";

// My Students (/mentor-dashboard/students) — roster + per-student private notes.
export const Route = createFileRoute("/mentor-dashboard/students")({
  component: MentorStudents,
});

function MentorStudents() {
  const { mentorId } = useMentorDashboard();
  return (
    <div className="mt-8 space-y-12 animate-hero-rise">
      <MyStudentsSection mentorId={mentorId} />
    </div>
  );
}
