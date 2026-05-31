/**
 * V1 chat client API — thin typed wrappers over the SECURITY DEFINER RPCs +
 * the RLS-gated message read path. The DB is the authority for every limit;
 * these helpers only surface the server's result. send_message RAISEs for
 * no-side-effect rejects (supabase-js returns `error`) and RETURNs a jsonb for
 * success + the pii_blocked reject — both are normalized to SendResult here.
 */
import { supabase } from "@/integrations/supabase/client";

export const MESSAGE_MAX = 500;

/** Friendly, inline copy per server reason. Keys match the RPC's RAISE / reason strings. */
export const SEND_REASON_COPY: Record<string, string> = {
  too_long: "Messages are limited to 500 characters.",
  empty: "Type a message first.",
  pii_blocked:
    "For everyone's safety, keep phone numbers, emails, links, and social handles off UniPlug. Please remove them and try again.",
  rate_limited: "You're sending messages too quickly — give it a moment.",
  pre_booking_cap:
    "You've reached the message limit before booking. Book a session to keep chatting.",
  mentor_cannot_initiate:
    "You can message a student once they've reached out or you have a booked session together.",
  mentor_not_available: "This mentor isn't available to message right now.",
  blocked: "This conversation is blocked.",
  invalid_recipient:
    "You can only message the other party in a mentorship (a mentor, or a student).",
  invalid_sender: "Your account can't send messages.",
  "authentication required": "Please sign in again to send messages.",
  unknown: "Couldn't send your message. Please try again.",
};

export function reasonCopy(reason: string): string {
  return SEND_REASON_COPY[reason] ?? SEND_REASON_COPY.unknown;
}

export type SendResult =
  | { ok: true; conversation_id: string; message_id: string }
  | { ok: false; reason: string };

const KNOWN_REASONS = Object.keys(SEND_REASON_COPY);

/** Send a message. Normalizes RAISE (error) and RETURN (jsonb) into one shape. */
export async function sendMessage(recipientId: string, body: string): Promise<SendResult> {
  const { data, error } = await supabase.rpc("send_message", {
    _recipient_id: recipientId,
    _body: body,
  });
  if (error) {
    const msg = (error.message ?? "").toLowerCase();
    const reason =
      KNOWN_REASONS.find((k) => k !== "unknown" && msg.includes(k.toLowerCase())) ?? "unknown";
    return { ok: false, reason };
  }
  const j = data as {
    ok?: boolean;
    reason?: string;
    conversation_id?: string;
    message_id?: string;
  } | null;
  if (j?.ok && j.conversation_id && j.message_id) {
    return { ok: true, conversation_id: j.conversation_id, message_id: j.message_id };
  }
  return { ok: false, reason: j?.reason ?? "unknown" };
}

export type ConversationSummary = {
  conversation_id: string;
  peer_id: string;
  peer_name: string | null;
  peer_subtitle: string | null;
  peer_photo_url: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  is_blocked: boolean;
  i_blocked: boolean;
  has_session: boolean;
};

export async function getMyConversations(): Promise<ConversationSummary[]> {
  const { data, error } = await supabase.rpc("get_my_conversations");
  if (error) throw error;
  return (data ?? []) as ConversationSummary[];
}

export type ConversationHeader = {
  conversation_id: string;
  peer_id: string;
  peer_name: string | null;
  peer_subtitle: string | null;
  peer_photo_url: string | null;
  is_blocked: boolean;
  i_blocked: boolean;
  has_session: boolean;
};

export async function getConversation(conversationId: string): Promise<ConversationHeader | null> {
  const { data, error } = await supabase.rpc("get_conversation", {
    _conversation_id: conversationId,
  });
  if (error) throw error;
  return ((data ?? [])[0] as ConversationHeader | undefined) ?? null;
}

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  soft_deleted: boolean;
  reported: boolean;
};

/** Thread read path: direct RLS SELECT (participants see own non-deleted rows). */
export async function fetchMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select(
      "id, conversation_id, sender_id, recipient_id, body, created_at, soft_deleted, reported",
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}

export async function blockConversation(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc("block_conversation", { _conversation_id: conversationId });
  if (error) throw error;
}

export async function unblockConversation(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc("unblock_conversation", {
    _conversation_id: conversationId,
  });
  if (error) throw error;
}

export async function submitReport(
  conversationId: string,
  messageId: string | null,
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc("submit_report", {
    _conversation_id: conversationId,
    _message_id: messageId as string, // RPC accepts NULL
    _reason: reason,
  });
  if (error) throw error;
}

export async function softDeleteMessage(messageId: string): Promise<void> {
  const { error } = await supabase.rpc("soft_delete_message", { _message_id: messageId });
  if (error) throw error;
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc("mark_conversation_read", {
    _conversation_id: conversationId,
  });
  if (error) throw error;
}

export const conversationsKey = (userId: string) => ["chat", "conversations", userId] as const;
export const threadKey = (conversationId: string) => ["chat", "thread", conversationId] as const;
