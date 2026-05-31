import { createFileRoute } from "@tanstack/react-router";

import { clientAuthGuard } from "@/lib/auth/route-guard";
import { MessagesLayout } from "@/components/messages/MessagesLayout";
import { ConversationList } from "@/components/messages/ConversationList";
import { Thread } from "@/components/messages/Thread";

export const Route = createFileRoute("/messages/$conversationId")({
  beforeLoad: () =>
    clientAuthGuard({ signedOutTo: "/login", requireRole: "any", allowAdmin: false }),
  head: () => ({ meta: [{ title: "Conversation — UniPlug" }] }),
  component: ConversationPage,
});

function ConversationPage() {
  const { conversationId } = Route.useParams();
  return (
    <MessagesLayout>
      {({ userId, role }) => (
        <section>
          <h2 className="mb-4 font-display text-[22px] font-semibold text-[#1A1A1A]">Messages</h2>
          <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-4">
            {/* Conversation list: beside the thread on desktop, hidden on mobile. */}
            <div className="hidden lg:block">
              <ConversationList userId={userId} activeId={conversationId} />
            </div>
            <Thread currentUserId={userId} role={role} conversationId={conversationId} />
          </div>
        </section>
      )}
    </MessagesLayout>
  );
}
