import { createFileRoute } from "@tanstack/react-router";

import { WatchtowerPage } from "@/components/mentor-hq/pages/WatchtowerPage";

// The Watchtower (/mentor-dashboard/watchtower) — the state-aware HQ home.
// Always renders (approved command center / pending review / rejected fix-up).
export const Route = createFileRoute("/mentor-dashboard/watchtower")({
  component: WatchtowerPage,
});
