import { createFileRoute } from "@tanstack/react-router";

import { EarningsSection } from "@/components/mentor-dashboard/sections/EarningsSection";
import { useMentorDashboard } from "@/components/mentor-dashboard/MentorDashboardContext";

// Earnings (/mentor-dashboard/earnings) — read-only earnings + payout history.
export const Route = createFileRoute("/mentor-dashboard/earnings")({
  component: MentorEarnings,
});

function MentorEarnings() {
  const { mentorId } = useMentorDashboard();
  return (
    <div className="mt-8 space-y-12 animate-hero-rise">
      <EarningsSection mentorId={mentorId} />
    </div>
  );
}
