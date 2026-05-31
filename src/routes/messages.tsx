import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { clientAuthGuard } from "@/lib/auth/route-guard";
import { conversationsKey, getMyConversations } from "@/lib/chat/api";
import { LoadingSkeleton } from "@/components/ui/state-views";
import { MessagesLayout } from "@/components/messages/MessagesLayout";
import { ConversationList } from "@/components/messages/ConversationList";
import { Thread } from "@/components/messages/Thread";

type MessagesSearch = { peer?: string; peerName?: string };

export const Route = createFileRoute("/messages")({
  validateSearch: (search: Record<string, unknown>): MessagesSearch => ({
    peer: typeof search.peer === "string" ? search.peer : undefined,
    peerName: typeof search.peerName === "string" ? search.peerName : undefined,
  }),
  beforeLoad: () =>
    clientAuthGuard({ signedOutTo: "/login", requireRole: "any", allowAdmin: false }),
  head: () => ({ meta: [{ title: "Messages — UniPlug" }] }),
  component: MessagesPage,
});

function MessagesPage() {
  const { peer, peerName } = Route.useSearch();
  return (
    <MessagesLayout>
      {({ userId, role }) => (
        <section>
          <h2 className="mb-4 font-display text-[22px] font-semibold text-[#1A1A1A]">Messages</h2>
          {peer ? (
            <ComposeGate
              userId={userId}
              role={role}
              peerId={peer}
              peerName={peerName ?? "Conversation"}
            />
          ) : (
            <ConversationList userId={userId} role={role} />
          )}
        </section>
      )}
    </MessagesLayout>
  );
}

/**
 * Opening a thread from an entry point (?peer=...). If a conversation with that
 * peer already exists, jump to it; otherwise show a compose Thread whose first
 * send creates the conversation.
 */
function ComposeGate({
  userId,
  role,
  peerId,
  peerName,
}: {
  userId: string;
  role: "student" | "mentor";
  peerId: string;
  peerName: string;
}) {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: conversationsKey(userId),
    queryFn: getMyConversations,
    // Match ConversationList's fallback so an existing conversation is found
    // even if the realtime invalidation hasn't fired yet.
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });

  const existing = data?.find((c) => c.peer_id === peerId);

  useEffect(() => {
    if (existing) {
      navigate({
        to: "/messages/$conversationId",
        params: { conversationId: existing.conversation_id },
        replace: true,
      });
    }
  }, [existing, navigate]);

  if (isLoading || existing) return <LoadingSkeleton rows={3} ariaLabel="Opening conversation" />;
  return <Thread currentUserId={userId} role={role} composePeer={{ id: peerId, name: peerName }} />;
}
