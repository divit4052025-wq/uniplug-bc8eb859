import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { formatBookingDateTime } from "@/lib/time";
import { useOptimisticMutation } from "@/lib/hooks/useOptimisticMutation";
import "./quarter.css";

/**
 * QuarterBeacon — the student's notifications slide-over (the world's bell ←
 * /notifications). Real notification rows (recipient_id = the student), the
 * canonical optimistic mark-read pattern, click-through to the real conversation
 * thread. Honest empty state; no fabricated activity.
 */

type NotificationRow = {
  id: string;
  recipient_id: string;
  booking_id: string | null;
  conversation_id: string | null;
  kind: string;
  student_name: string | null;
  mentor_name: string | null;
  sender_name: string | null;
  booking_date: string | null;
  booking_time_slot: string | null;
  read_at: string | null;
  created_at: string;
};

function headline(n: NotificationRow): string {
  if (n.kind === "new_message") return `New message from ${n.sender_name?.trim() || "someone"}`;
  if (n.kind === "session_completed")
    return `Session completed with ${n.mentor_name?.trim() || "your mentor"}`;
  if (n.kind === "booking_confirmed")
    return `Session confirmed with ${n.mentor_name?.trim() || "your mentor"}`;
  return n.kind.replace(/_/g, " ");
}

export function QuarterBeacon({
  open,
  onClose,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
}) {
  const navigate = useNavigate();
  const notificationsKey = ["notifications", "list", userId] as const;

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    addEventListener("keydown", h);
    return () => removeEventListener("keydown", h);
  }, [open, onClose]);

  const { data: rows = [] } = useQuery<NotificationRow[]>({
    queryKey: notificationsKey,
    enabled: open && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("recipient_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });

  const markAll = useOptimisticMutation<NotificationRow[], { ids: string[]; readAt: string }, void>(
    {
      mutationFn: async ({ ids, readAt }) => {
        if (ids.length === 0) return;
        const { error } = await supabase
          .from("notifications")
          .update({ read_at: readAt })
          .in("id", ids);
        if (error) throw error;
      },
      queryKeys: [notificationsKey],
      optimisticUpdate: (rs, { readAt }) =>
        (rs ?? []).map((r) => (r.read_at ? r : { ...r, read_at: readAt })),
      errorMessage: "Could not mark all as read.",
    },
  );

  const markOne = useOptimisticMutation<NotificationRow[], { id: string; readAt: string }, void>({
    mutationFn: async ({ id, readAt }) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: readAt })
        .eq("id", id);
      if (error) throw error;
    },
    queryKeys: [notificationsKey],
    optimisticUpdate: (rs, { id, readAt }) =>
      (rs ?? []).map((r) => (r.id === id ? { ...r, read_at: readAt } : r)),
    errorMessage: "Could not mark notification as read.",
  });

  if (!open) return null;

  const unread = rows.filter((r) => !r.read_at);

  const onItem = (n: NotificationRow) => {
    if (!n.read_at) markOne.mutate({ id: n.id, readAt: new Date().toISOString() });
    if (n.kind === "new_message" && n.conversation_id) {
      onClose();
      navigate({ to: "/messages/$conversationId", params: { conversationId: n.conversation_id } });
    }
  };

  return (
    <>
      <div
        className="qbeacon-scrim"
        role="button"
        tabIndex={-1}
        aria-label="Close notifications"
        onClick={onClose}
      />
      <aside className="qbeacon" role="dialog" aria-label="Notifications">
        <div className="qbeacon-h">
          <h2>The Beacon</h2>
          {unread.length > 0 && (
            <button
              type="button"
              className="qbeacon-all"
              disabled={markAll.isPending}
              onClick={() =>
                markAll.mutate({ ids: unread.map((r) => r.id), readAt: new Date().toISOString() })
              }
            >
              {markAll.isPending ? "Marking…" : "Mark all read"}
            </button>
          )}
          <span className="x" role="button" tabIndex={0} aria-label="Close" onClick={onClose}>
            ✕
          </span>
        </div>
        <div className="qbeacon-b">
          {rows.length === 0 ? (
            <p
              style={{
                padding: "28px 12px",
                textAlign: "center",
                color: "var(--q-ink55)",
                fontSize: 13.5,
              }}
            >
              No notifications yet. You’ll hear from the Beacon when a session wraps up or a Plug
              messages you.
            </p>
          ) : (
            rows.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`qbeacon-item ${n.read_at ? "" : "unread"}`}
                onClick={() => onItem(n)}
              >
                <div
                  className="ic"
                  style={{ background: "var(--q-rose-soft)" }}
                  aria-hidden="true"
                />
                <div style={{ minWidth: 0 }}>
                  <div className="nt">{headline(n)}</div>
                  <div className="nm-time">
                    {n.kind === "new_message"
                      ? "Tap to open the conversation · "
                      : n.booking_date && n.booking_time_slot
                        ? formatBookingDateTime(n.booking_date, n.booking_time_slot) + " · "
                        : ""}
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
