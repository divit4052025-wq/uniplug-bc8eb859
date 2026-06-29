import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy /dashboard/settings → The Dorm (the Quarter landmark for profile &
// settings). The Dorm renders the same ProfileSection + AccountDataSection plus
// the consent status, so this is a zero-loss redirect that keeps old links +
// bookmarks working.
export const Route = createFileRoute("/dashboard/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/dorm" });
  },
});
