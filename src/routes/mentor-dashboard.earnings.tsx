import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy route → its Headquarters landmark. Earnings now live in the dark HQ at
// The Vault. Old links / bookmarks keep working via this redirect.
export const Route = createFileRoute("/mentor-dashboard/earnings")({
  beforeLoad: () => {
    throw redirect({ to: "/mentor-dashboard/vault" });
  },
});
