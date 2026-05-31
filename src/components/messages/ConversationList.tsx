import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";

import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState, LoadingSkeleton } from "@/components/ui/state-views";
import { formatMessageTime } from "@/lib/time";
import { conversationsKey, getMyConversations } from "@/lib/chat/api";

export function ConversationList({
  userId,
  role,
  activeId,
}: {
  userId: string;
  role: "student" | "mentor";
  activeId?: string;
}) {
  const {
    data: rows = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: conversationsKey(userId),
    queryFn: getMyConversations,
    // Realtime (useIncomingMessageRefresh) is the primary refresh path; this is
    // the fallback so a new conversation still surfaces if the socket drops.
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });

  if (isLoading) return <LoadingSkeleton rows={4} ariaLabel="Loading conversations" />;
  if (isError)
    return <ErrorBanner message="Couldn't load your messages." onRetry={() => void refetch()} />;
  if (rows.length === 0)
    return role === "mentor" ? (
      // Mentors can't initiate — a conversation only exists once a student
      // messages them, so there's no "find someone" action here.
      <EmptyState
        icon={<MessageCircle className="h-8 w-8" />}
        title="No messages yet"
        description="When a student messages you, the conversation will show up here."
      />
    ) : (
      <EmptyState
        icon={<MessageCircle className="h-8 w-8" />}
        title="No messages yet"
        description="Message a mentor from their profile to start a conversation."
        cta={
          <Link
            to="/browse"
            className="inline-flex h-10 items-center justify-center rounded-full bg-[#C4907F] px-6 text-[13px] font-medium text-white transition hover:opacity-90"
          >
            Find a mentor
          </Link>
        }
      />
    );

  return (
    <ul className="divide-y divide-[#EDE0DB] overflow-hidden rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB]">
      {rows.map((c) => (
        <li key={c.conversation_id}>
          <Link
            to="/messages/$conversationId"
            params={{ conversationId: c.conversation_id }}
            className={`flex items-center gap-3 px-4 py-3 transition hover:bg-[#EDE0DB]/40 ${
              c.conversation_id === activeId ? "bg-[#EDE0DB]/50" : ""
            }`}
          >
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#EDE0DB] text-[14px] font-semibold text-[#1A1A1A]">
              {c.peer_photo_url ? (
                <img src={c.peer_photo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                (c.peer_name ?? "?").slice(0, 1).toUpperCase()
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-[14px] font-medium text-[#1A1A1A]">
                  {c.peer_name ?? "Conversation"}
                </span>
                {c.last_message_at && (
                  <span className="shrink-0 text-[11px] text-[#1A1A1A]/40">
                    {formatMessageTime(c.last_message_at)}
                  </span>
                )}
              </span>
              <span className="mt-0.5 flex items-center justify-between gap-2">
                <span className="truncate text-[12px] text-[#1A1A1A]/60">
                  {c.is_blocked ? "Blocked" : (c.last_message ?? "No messages yet")}
                </span>
                {c.unread_count > 0 && (
                  <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#C4907F] px-1.5 text-[11px] font-semibold text-white">
                    {c.unread_count}
                  </span>
                )}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
