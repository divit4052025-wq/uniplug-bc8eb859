import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy route → its Headquarters landmark. Profile / verification now live in
// the dark HQ at The Forge. Old links / bookmarks keep working via this redirect.
export const Route = createFileRoute("/mentor-dashboard/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/mentor-dashboard/forge" });
  },
});
