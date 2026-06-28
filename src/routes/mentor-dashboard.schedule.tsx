import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy route → its Headquarters landmark. The 2D section shell is retired; the
// availability editor now lives in the dark HQ at The Sundial. Old links /
// bookmarks (and the /messages mentor sidebar) keep working via this redirect.
export const Route = createFileRoute("/mentor-dashboard/schedule")({
  beforeLoad: () => {
    throw redirect({ to: "/mentor-dashboard/sundial" });
  },
});
