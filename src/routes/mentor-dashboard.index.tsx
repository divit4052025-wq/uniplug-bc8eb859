import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { MentorUpcomingSessions } from "@/components/mentor-dashboard/sections/MentorUpcomingSessions";
import { PostSessionNotesSection } from "@/components/mentor-dashboard/sections/PostSessionNotesSection";
import { useMentorDashboard } from "@/components/mentor-dashboard/MentorDashboardContext";

// Home — the mentor dashboard index (/mentor-dashboard): upcoming sessions +
// post-session notes. The `?edit=<noteId>` deep-link (from a session-note detail
// page) lands here, so its URL is unchanged by the route split.
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

  return (
    <div className="mt-8 space-y-12 animate-hero-rise">
      <MentorUpcomingSessions mentorId={mentorId} />
      <PostSessionNotesSection
        mentorId={mentorId}
        editNoteId={edit ?? null}
        onEditConsumed={() => navigate({ to: "/mentor-dashboard", search: {} })}
      />
    </div>
  );
}
