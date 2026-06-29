import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy /dashboard/sessions → The Studio (the Quarter landmark for sessions).
// The Studio renders the same Upcoming/Past/SessionNotes sections, so this is a
// zero-loss redirect that keeps old links + bookmarks working.
export const Route = createFileRoute("/dashboard/sessions")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/studio" });
  },
});
