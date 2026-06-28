import { createFileRoute } from "@tanstack/react-router";

import { ForgePage } from "@/components/mentor-hq/pages/ForgePage";

// The Forge (/mentor-dashboard/forge) — editable profile + read-only identity +
// verification status. Always renders (state-aware).
export const Route = createFileRoute("/mentor-dashboard/forge")({
  component: ForgePage,
});
