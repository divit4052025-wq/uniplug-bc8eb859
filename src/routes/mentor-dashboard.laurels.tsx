import { createFileRoute } from "@tanstack/react-router";

import { LaurelsPage } from "@/components/mentor-hq/pages/LaurelsPage";

// The Laurels (/mentor-dashboard/laurels) — aggregate ratings summary.
// Approval-only.
export const Route = createFileRoute("/mentor-dashboard/laurels")({
  component: LaurelsPage,
});
