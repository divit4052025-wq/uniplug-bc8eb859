import { createFileRoute, redirect } from "@tanstack/react-router";

import { MentorHqHome } from "@/components/mentor-hq/MentorHqHome";

// Home — the mentor dashboard index (/mentor-dashboard): the 3D "Headquarters"
// world, rendered full-bleed by the layout. The legacy session-note deep-link
// (/mentor-dashboard?edit=<noteId>) now opens the editor inside The Forum, so it
// is redirected there — keeping that link working without regressing.
export const Route = createFileRoute("/mentor-dashboard/")({
  validateSearch: (search: Record<string, unknown>): { edit?: string } => {
    const edit = typeof search.edit === "string" ? (search.edit as string) : undefined;
    return edit ? { edit } : {};
  },
  beforeLoad: ({ search }) => {
    if (search.edit) {
      throw redirect({ to: "/mentor-dashboard/forum", search: { edit: search.edit } });
    }
  },
  component: MentorHqHome,
});
