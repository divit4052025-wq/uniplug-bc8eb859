import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { ForumPage } from "@/components/mentor-hq/pages/ForumPage";

// The Forum (/mentor-dashboard/forum) — sessions + shared docs + the session
// notes desk. Approval-only. Preserves the legacy `?edit=<noteId>` deep-link
// into the post-session note editor.
export const Route = createFileRoute("/mentor-dashboard/forum")({
  validateSearch: (search: Record<string, unknown>): { edit?: string } => {
    const edit = typeof search.edit === "string" ? (search.edit as string) : undefined;
    return edit ? { edit } : {};
  },
  component: ForumRoute,
});

function ForumRoute() {
  const { edit } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <ForumPage
      editNoteId={edit ?? null}
      onEditConsumed={() => navigate({ to: "/mentor-dashboard/forum", search: {} })}
    />
  );
}
