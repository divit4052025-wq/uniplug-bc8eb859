import { useState } from "react";
import { Link } from "@tanstack/react-router";

import { MESSAGE_MAX, reasonCopy, sendMessage, type SendResult } from "@/lib/chat/api";

/**
 * Message composer. Client-side it only enforces UX (≤500 counter, disabled
 * send) — the server gate is authoritative. On a server reject it surfaces the
 * friendly reason inline; at the pre-booking cap it links the student into the
 * mentor's booking flow.
 */
export function Composer({
  recipientId,
  disabled,
  disabledReason,
  bookMentorId,
  onSent,
}: {
  recipientId: string;
  /** Hard-disable (e.g. conversation blocked). */
  disabled?: boolean;
  disabledReason?: string;
  /** When set, the pre-booking-cap prompt links to this mentor's booking page. */
  bookMentorId?: string | null;
  onSent: (result: Extract<SendResult, { ok: true }>) => void;
}) {
  const [body, setBody] = useState("");
  const [reason, setReason] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const remaining = MESSAGE_MAX - body.length;
  const trimmed = body.trim();
  const canSend = !disabled && !sending && trimmed.length > 0 && body.length <= MESSAGE_MAX;

  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    setReason(null);
    const result = await sendMessage(recipientId, trimmed);
    setSending(false);
    if (result.ok) {
      setBody("");
      onSent(result);
    } else {
      setReason(result.reason);
    }
  };

  if (disabled) {
    return (
      <div className="border-t border-[#EDE0DB] px-4 py-3 text-center text-[13px] font-light text-[#1A1A1A]/60">
        {disabledReason ?? "This conversation is read-only."}
      </div>
    );
  }

  return (
    <div className="border-t border-[#EDE0DB] px-3 py-3">
      {reason && (
        <p className="mb-2 px-1 text-[12px] text-[#C4907F]">
          {reasonCopy(reason)}
          {reason === "pre_booking_cap" && bookMentorId && (
            <>
              {" "}
              <Link
                to="/mentor/$id"
                params={{ id: bookMentorId }}
                className="font-semibold underline underline-offset-2"
              >
                Book a session
              </Link>
            </>
          )}
        </p>
      )}
      <div className="flex items-end gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, MESSAGE_MAX))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={1}
          maxLength={MESSAGE_MAX}
          placeholder="Write a message…"
          aria-label="Message"
          className="max-h-32 min-h-[40px] flex-1 resize-y rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] px-3.5 py-2.5 text-[14px] text-[#1A1A1A] outline-none focus:border-[#C4907F]"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSend}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-[#C4907F] px-5 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
      <p
        className={`mt-1 px-1 text-right text-[11px] ${remaining < 0 ? "text-red-600" : "text-[#1A1A1A]/40"}`}
        aria-live="polite"
      >
        {body.length} / {MESSAGE_MAX}
      </p>
    </div>
  );
}
