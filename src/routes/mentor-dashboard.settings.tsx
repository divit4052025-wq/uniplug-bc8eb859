import { createFileRoute } from "@tanstack/react-router";

import { SettingsSection } from "@/components/mentor-dashboard/sections/SettingsSection";
import { useMentorDashboard } from "@/components/mentor-dashboard/MentorDashboardContext";

// Settings (/mentor-dashboard/settings) — allowlisted profile editor + account.
export const Route = createFileRoute("/mentor-dashboard/settings")({
  component: MentorSettings,
});

function MentorSettings() {
  const { mentorId } = useMentorDashboard();
  return (
    <div className="mt-8 animate-hero-rise">
      <SettingsSection mentorId={mentorId} />
    </div>
  );
}
