import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { MentorUpcomingSessions } from "@/components/mentor-dashboard/sections/MentorUpcomingSessions";
import { PostSessionNotesSection } from "@/components/mentor-dashboard/sections/PostSessionNotesSection";
import { useMentorDashboard } from "@/components/mentor-dashboard/MentorDashboardContext";
import { MentorHqHome } from "@/components/mentor-hq/MentorHqHome";

// Home — the mentor dashboard index (/mentor-dashboard). As of the Mentor HQ
// rebuild this renders the 3D "Headquarters" world (MentorHqHome), full-bleed via
// the layout's index-in-place branch.
//
// The one preserved legacy path: the `?edit=<noteId>` deep-link from a
// session-note detail page still lands here and opens the notes editor in the
// normal shell (the layout keeps its chrome whenever `edit` is present). The
// upcoming-sessions + notes surfaces move into the Watchtower / Forum in later
// slices; until then this guarantees that deep-link does not regress.
export const Route = createFileRoute("/mentor-dashboard/")({
  validateSearch: (search: Record<string, unknown>): { edit?: string } => {
    const edit = typeof search.edit === "string" ? (search.edit as string) : undefined;
    return edit ? { edit } : {};
  },
  component: MentorDashboardHome,
});

function MentorDashboardHome() {
  const { mentorId } = useMentorDashboard();
  const { edit } = Route.useSearch();
  const navigate = useNavigate();

  if (edit) {
    return (
      <div className="mt-8 space-y-12 animate-hero-rise">
        <MentorUpcomingSessions mentorId={mentorId} />
        <PostSessionNotesSection
          mentorId={mentorId}
          editNoteId={edit}
          onEditConsumed={() => navigate({ to: "/mentor-dashboard", search: {} })}
        />
      </div>
    );
  }

  return <MentorHqHome />;
}
