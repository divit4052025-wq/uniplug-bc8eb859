import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy /dashboard/documents → The Locker (the Quarter landmark for documents).
// The Locker renders the same MyDocumentsSection, so this is a zero-loss
// redirect that keeps old links + bookmarks working.
export const Route = createFileRoute("/dashboard/documents")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/locker" });
  },
});
