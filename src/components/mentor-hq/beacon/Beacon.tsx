import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { formatBookingDateTime } from "@/lib/time";
import { useOptimisticMutation } from "@/lib/hooks/useOptimisticMutation";

/**
 * Beacon — the persistent notification fixture for the mentor HQ. A bell marker
 * (pulsing when there's something unread) + a right-side slide-over panel,
 * reachable from every HQ surface. Reads the existing recipient-scoped
 * `notifications` table and reuses the canonical optimistic markAsRead pattern
 * (src/routes/notifications.tsx). NO realtime (decision Q4 skip d) — the badge
 * refreshes on open / navigation, which is a fully functional fallback.
 */

type NotificationKind = "booking_confirmed" | "session_completed" | "new_message";

type NotificationRow = {
  id: string;
  recipient_id: string;
  booking_id: string | null;
  conversation_id: string | null;
  kind: NotificationKind | string;
  student_name: string | null;
  mentor_name: string | null;
  sender_name: string | null;
  booking_date: string | null;
  booking_time_slot: string | null;
  read_at: string | null;
  created_at: string;
};

function renderHeadline(n: NotificationRow): string {
  if (n.kind === "new_message") return `New message from ${n.sender_name?.trim() || "someone"}`;
  if (n.kind === "session_completed")
    return `Session completed with ${n.mentor_name?.trim() || "your mentor"}`;
  return `New booking from ${n.student_name?.trim() || "a student"}`;
}

function useMentorNotifications(userId: string) {
  const notificationsKey = ["notifications", "list", userId] as const;
  const { data: rows = [], refetch } = useQuery<NotificationRow[]>({
    queryKey: notificationsKey,
    enabled: !!userId,
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

  const markAsReadMutation = useOptimisticMutation<
    NotificationRow[],
    { id: string; readAt: string },
    void
  >({
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

  const markAllReadMutation = useOptimisticMutation<
    NotificationRow[],
    { ids: string[]; readAt: string },
    void
  >({
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
  });

  const unreadCount = rows.filter((r) => !r.read_at).length;
  const markAsRead = (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row || row.read_at) return;
    markAsReadMutation.mutate({ id, readAt: new Date().toISOString() });
  };
  const markAllRead = () => {
    if (unreadCount === 0) return;
    markAllReadMutation.mutate({
      ids: rows.filter((r) => !r.read_at).map((r) => r.id),
      readAt: new Date().toISOString(),
    });
  };

  return { rows, unreadCount, markAsRead, markAllRead, refetch };
}

export function Beacon({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { rows, unreadCount, markAsRead, markAllRead, refetch } = useMentorNotifications(userId);

  // Refresh on open (the no-realtime fallback) + Escape to close.
  useEffect(() => {
    if (!open) return;
    void refetch();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, refetch]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(250,245,239,0.16)] bg-[rgba(250,245,239,0.06)] transition hover:border-[rgba(250,245,239,0.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-rose)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--brand-night)]"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unreadCount > 0 ? (
          <>
            <span
              className="absolute -top-0.5 -right-0.5 motion-safe:animate-ping rounded-full"
              style={{ height: 10, width: 10, background: "var(--brand-rose)", opacity: 0.65 }}
              aria-hidden="true"
            />
            <span
              className="absolute -top-0.5 -right-0.5 flex h-2.5 min-w-2.5 items-center justify-center rounded-full px-1 text-[9px] font-bold text-[#171513]"
              style={{ background: "var(--brand-rose)" }}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          </>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/45"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-label="Notifications"
            className="hq-shell absolute top-0 right-0 flex h-dvh w-[min(420px,92vw)] flex-col border-l border-[rgba(250,245,239,0.1)] shadow-2xl"
            style={{ background: "var(--brand-night)", color: "var(--brand-paper)" }}
          >
            <div className="flex items-center justify-between border-b border-[rgba(250,245,239,0.1)] px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="font-display text-lg font-bold">The Beacon</span>
                {unreadCount > 0 ? (
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-[#171513]"
                    style={{ background: "var(--brand-rose)" }}
                  >
                    {unreadCount} new
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 ? (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="text-[12px] font-semibold underline underline-offset-2"
                    style={{ color: "var(--brand-rose)" }}
                  >
                    Mark all read
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close notifications"
                  className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[rgba(250,245,239,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-rose)]"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2">
              {rows.length === 0 ? (
                <p
                  className="px-4 py-10 text-center text-sm"
                  style={{ color: "var(--brand-ink-faint)" }}
                >
                  No notifications yet. You'll be notified here when a student books a session with
                  you.
                </p>
              ) : (
                <ul>
                  {rows.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => {
                          markAsRead(n.id);
                          if (n.kind === "new_message" && n.conversation_id) {
                            setOpen(false);
                            navigate({
                              to: "/messages/$conversationId",
                              params: { conversationId: n.conversation_id },
                            });
                          }
                        }}
                        className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-[rgba(250,245,239,0.06)] ${n.read_at ? "opacity-55" : ""}`}
                      >
                        <span
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                          style={{ background: n.read_at ? "transparent" : "var(--brand-rose)" }}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{renderHeadline(n)}</span>
                          <span
                            className="mt-0.5 block text-[12px]"
                            style={{ color: "var(--brand-ink-faint)" }}
                          >
                            {n.kind === "new_message"
                              ? "Tap to open the conversation"
                              : n.booking_date && n.booking_time_slot
                                ? formatBookingDateTime(n.booking_date, n.booking_time_slot)
                                : formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
