import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, Ban, Trash2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { formatMessageTime } from "@/lib/time";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/state-views";
import {
  fetchMessages,
  getConversation,
  markConversationRead,
  softDeleteMessage,
  threadKey,
  type ConversationHeader,
} from "@/lib/chat/api";
import { Composer } from "./Composer";
import { ReportDialog } from "./ReportDialog";
import { BlockDialog } from "./BlockDialog";

type Props = {
  currentUserId: string;
  role: "student" | "mentor";
  /** Existing conversation. */
  conversationId?: string;
  /** Compose mode: starting a new conversation with this peer. */
  composePeer?: { id: string; name: string };
};

export function Thread({ currentUserId, role, conversationId, composePeer }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [reportOpen, setReportOpen] = useState(false);
  const [blockMode, setBlockMode] = useState<"block" | "unblock" | null>(null);

  // Header (existing conversation only).
  const headerQ = useQuery<ConversationHeader | null>({
    queryKey: ["chat", "header", conversationId ?? "none"],
    enabled: !!conversationId,
    queryFn: () => getConversation(conversationId as string),
  });

  // Messages (existing conversation only).
  const msgsQ = useQuery({
    queryKey: threadKey(conversationId ?? "none"),
    enabled: !!conversationId,
    queryFn: () => fetchMessages(conversationId as string),
  });

  // Realtime: any change to this thread's messages → refetch (RLS-gated
  // delivery; a non-participant's client receives nothing). Also refresh the
  // conversation list (last message / unread).
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: threadKey(conversationId) });
          void qc.invalidateQueries({ queryKey: ["chat", "conversations"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, qc]);

  // Mark read on open.
  useEffect(() => {
    if (!conversationId) return;
    void markConversationRead(conversationId)
      .then(() => {
        void qc.invalidateQueries({ queryKey: ["notifications"] });
        void qc.invalidateQueries({ queryKey: ["chat", "conversations"] });
      })
      .catch(() => {});
  }, [conversationId, qc]);

  const header = headerQ.data;
  const peerName = composePeer?.name ?? header?.peer_name ?? "Conversation";
  const peerSubtitle = header?.peer_subtitle ?? null;
  const recipientId = composePeer?.id ?? header?.peer_id ?? "";
  const isBlocked = header?.is_blocked ?? false;
  const iBlocked = header?.i_blocked ?? false;
  // The cap prompt links to the mentor's booking page — only meaningful for a student.
  const bookMentorId = role === "student" ? recipientId : null;

  const handleDelete = async (id: string) => {
    try {
      await softDeleteMessage(id);
      if (conversationId) void qc.invalidateQueries({ queryKey: threadKey(conversationId) });
    } catch {
      toast.error("Couldn't delete the message.");
    }
  };

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-[#EDE0DB] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => navigate({ to: "/messages" })}
            aria-label="Back to messages"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#1A1A1A]/60 hover:bg-[#EDE0DB] md:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium text-[#1A1A1A]">{peerName}</p>
            {peerSubtitle && (
              <p className="truncate text-[12px] text-[#1A1A1A]/60">{peerSubtitle}</p>
            )}
          </div>
        </div>
        {conversationId && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              aria-label="Report conversation"
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#1A1A1A]/15 px-3 text-[12px] font-medium text-[#1A1A1A] hover:border-[#C4907F] hover:text-[#C4907F]"
            >
              <Flag className="h-3.5 w-3.5" /> Report
            </button>
            {iBlocked ? (
              <button
                type="button"
                onClick={() => setBlockMode("unblock")}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#1A1A1A]/15 px-3 text-[12px] font-medium text-[#1A1A1A] hover:border-[#C4907F] hover:text-[#C4907F]"
              >
                <Ban className="h-3.5 w-3.5" /> Unblock
              </button>
            ) : !isBlocked ? (
              <button
                type="button"
                onClick={() => setBlockMode("block")}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#1A1A1A]/15 px-3 text-[12px] font-medium text-[#1A1A1A] hover:border-red-400 hover:text-red-600"
              >
                <Ban className="h-3.5 w-3.5" /> Block
              </button>
            ) : null}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {conversationId && msgsQ.isLoading && (
          <LoadingSkeleton rows={4} ariaLabel="Loading messages" />
        )}
        {conversationId && msgsQ.isError && (
          <ErrorBanner
            message="Couldn't load this conversation."
            onRetry={() => void msgsQ.refetch()}
          />
        )}
        {conversationId && msgsQ.data?.length === 0 && (
          <p className="py-8 text-center text-[13px] font-light text-[#1A1A1A]/60">
            No messages yet — say hello.
          </p>
        )}
        {composePeer && (
          <p className="py-8 text-center text-[13px] font-light text-[#1A1A1A]/60">
            Start the conversation with {composePeer.name}.
          </p>
        )}
        {msgsQ.data?.map((m) => {
          const mine = m.sender_id === currentUserId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`group max-w-[78%] ${mine ? "items-end" : "items-start"}`}>
                <div
                  className={`rounded-2xl px-3.5 py-2 text-[14px] ${
                    mine ? "bg-[#C4907F] text-white" : "bg-[#EDE0DB] text-[#1A1A1A]"
                  }`}
                >
                  <span className="whitespace-pre-wrap break-words">{m.body}</span>
                </div>
                <div
                  className={`mt-0.5 flex items-center gap-2 text-[10px] text-[#1A1A1A]/40 ${
                    mine ? "justify-end" : "justify-start"
                  }`}
                >
                  <span>{formatMessageTime(m.created_at)}</span>
                  {mine && (
                    <button
                      type="button"
                      onClick={() => void handleDelete(m.id)}
                      aria-label="Delete message"
                      className="inline-flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100 hover:text-red-600"
                    >
                      <Trash2 className="h-3 w-3" /> delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <Composer
        recipientId={recipientId}
        disabled={isBlocked}
        disabledReason={
          isBlocked
            ? iBlocked
              ? "You blocked this conversation. Unblock to send messages."
              : "This conversation is blocked."
            : undefined
        }
        bookMentorId={bookMentorId}
        onSent={(result) => {
          if (conversationId) {
            void qc.invalidateQueries({ queryKey: threadKey(conversationId) });
          } else {
            // Compose → switch to the real conversation thread.
            void qc.invalidateQueries({ queryKey: ["chat", "conversations"] });
            navigate({
              to: "/messages/$conversationId",
              params: { conversationId: result.conversation_id },
            });
          }
        }}
      />

      {conversationId && (
        <>
          <ReportDialog
            open={reportOpen}
            onOpenChange={setReportOpen}
            conversationId={conversationId}
          />
          {blockMode && (
            <BlockDialog
              open={!!blockMode}
              onOpenChange={(o) => !o && setBlockMode(null)}
              conversationId={conversationId}
              mode={blockMode}
              onDone={() => {
                setBlockMode(null);
                void qc.invalidateQueries({ queryKey: ["chat", "header", conversationId] });
                void qc.invalidateQueries({ queryKey: ["chat", "conversations"] });
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
