import { createFileRoute } from "@tanstack/react-router";

import { SundialPage } from "@/components/mentor-hq/pages/SundialPage";

// The Sundial (/mentor-dashboard/sundial) — weekly availability editor.
// Approval-only.
export const Route = createFileRoute("/mentor-dashboard/sundial")({
  component: SundialPage,
});
