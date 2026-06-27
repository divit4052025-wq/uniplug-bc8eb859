import { createFileRoute } from "@tanstack/react-router";

import { EmbassyPage } from "@/components/mentor-hq/pages/EmbassyPage";

// The Embassy (/mentor-dashboard/embassy) — safety reporting (always reachable),
// disputes + support (approval-only).
export const Route = createFileRoute("/mentor-dashboard/embassy")({
  component: EmbassyPage,
});
