import { createFileRoute } from "@tanstack/react-router";

import { QuarterPageShell } from "@/components/student-quarter/QuarterPageShell";
import { ConversationList } from "@/components/messages/ConversationList";
import { useStudentDashboard } from "@/components/dashboard/DashboardContext";

// The Line ← /messages. Your direct line to your Plugs — the real conversation
// list (get_my_conversations). Opening a conversation goes to the real thread
// view at /messages/$conversationId (kept as the in-thread surface, like the
// /call screen). Full re-skin of the thread pane lands in the Line slice.
export const Route = createFileRoute("/dashboard/line")({
  component: LinePage,
});

function LinePage() {
  const { userId } = useStudentDashboard();
  return (
    <QuarterPageShell
      kind="Messages"
      title="The Line"
      intro="Your direct line to your Plugs — every conversation, in one place."
    >
      <div className="qc" style={{ padding: 10 }}>
        <ConversationList userId={userId} role="student" />
      </div>
    </QuarterPageShell>
  );
}
