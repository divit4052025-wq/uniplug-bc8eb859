import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy route → its Headquarters landmark. Sessions + students now live in the
// dark HQ at The Forum. Old links / bookmarks keep working via this redirect.
export const Route = createFileRoute("/mentor-dashboard/students")({
  beforeLoad: () => {
    throw redirect({ to: "/mentor-dashboard/forum" });
  },
});
