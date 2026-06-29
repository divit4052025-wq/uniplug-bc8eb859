import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { resolveUserRole } from "@/lib/auth/role";
import { ErrorBanner } from "@/components/ui/error-banner";
import { formatBookingDateTime } from "@/lib/time";
import { clientAuthGuard, type AuthContext } from "@/lib/auth/route-guard";
import { withRetry } from "@/lib/retry";
import { useOptimisticMutation } from "@/lib/hooks/useOptimisticMutation";

export const Route = createFileRoute("/notifications")({
  beforeLoad: () => clientAuthGuard({ signedOutTo: "/login", requireRole: "any" }),
  head: () => ({
    meta: [{ title: "Notifications — UniPlug" }],
  }),
  component: NotificationsPage,
});

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

type Role = "student" | "mentor";

function NotificationsPage() {
  const ctx = Route.useRouteContext() as AuthContext;
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(ctx.userId ?? null);
  const [role, setRole] = useState<Role | null>(null);
  const [ready, setReady] = useState(false);

  const notificationsKey = ["notifications", "list", userId] as const;

  // Resolve role on mount (both for the SSR fallback case and the client-nav
  // case where beforeLoad supplied userId but not role). beforeLoad's "any"
  // gate already redirected admins to /admin, so we only need to disambiguate
  // student vs. mentor here.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Fast-path: ctx already has the userId; we just need the role.
      if (ctx.userId) {
        const meta = (ctx.userMetadata ?? {}) as { role?: string };
        // resolveUserRole takes (id, email, meta); we don't have the email here
        // but resolveUserRole tolerates undefined.
        const resolved = await resolveUserRole(ctx.userId, undefined, meta);
        if (cancelled) return;
        if (resolved === "admin") {
          navigate({ to: "/admin" });
          return;
        }
        setUserId(ctx.userId);
        setRole(resolved === "mentor" ? "mentor" : "student");
        setReady(true);
        return;
      }

      // Slow-path: SSR fallback — resolve session ourselves.
      const { data: sessionData, error: sessErr } = await withRetry(() =>
        supabase.auth.getSession(),
      );
      if (cancelled) return;
      if (sessErr) {
        navigate({ to: "/login" });
        return;
      }
      const session = sessionData?.session;
      if (!session) {
        navigate({ to: "/login" });
        return;
      }
      const meta = (session.user.user_metadata ?? {}) as { role?: string };
      const resolved = await resolveUserRole(session.user.id, session.user.email, meta);
      if (cancelled) return;
      if (resolved === "admin") {
        navigate({ to: "/admin" });
        return;
      }
      setUserId(session.user.id);
      setRole(resolved === "mentor" ? "mentor" : "student");
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, ctx.userId, ctx.userMetadata]);

  const {
    data: rows = [],
    isError,
    refetch,
  } = useQuery<NotificationRow[]>({
    queryKey: notificationsKey,
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("recipient_id", userId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });

  // Single-row mark-as-read. Both this and the bulk mutation below use the
  // shared optimistic-mutation hook — proof-of-pattern call site for
  // src/lib/hooks/useOptimisticMutation.ts.
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
    optimisticUpdate: (rows, { id, readAt }) =>
      (rows ?? []).map((r) => (r.id === id ? { ...r, read_at: readAt } : r)),
    errorMessage: "Could not mark notification as read.",
  });

  // Bug 6.8: bulk mark-all-as-read. Client-side enumeration of unread ids
  // (current RLS UPDATE policy permits this; no new RPC required). On
  // failure, the shared hook rolls back the optimistic patch and fires a
  // sonner toast.
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
    optimisticUpdate: (rows, { readAt }) =>
      (rows ?? []).map((r) => (r.read_at ? r : { ...r, read_at: readAt })),
    errorMessage: "Could not mark all as read.",
  });

  const markAsRead = (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row || row.read_at) return;
    markAsReadMutation.mutate({ id, readAt: new Date().toISOString() });
  };

  const unreadCount = rows.filter((r) => !r.read_at).length;
  const markAllRead = () => {
    if (unreadCount === 0) return;
    const ids = rows.filter((r) => !r.read_at).map((r) => r.id);
    markAllReadMutation.mutate({ ids, readAt: new Date().toISOString() });
  };

  if (!ready) return <div className="min-h-screen bg-[#FFFCFB]" />;

  const dashboardTo = role === "mentor" ? "/mentor-dashboard" : "/dashboard";
  const subhead =
    role === "mentor"
      ? "Updates on your sessions and students."
      : "Updates on your sessions and mentors.";
  const emptyMessage =
    role === "mentor"
      ? "No notifications yet. You'll be notified here when a student books a session with you."
      : "No notifications yet. You'll be notified here when a session wraps up.";

  return (
    <div className="min-h-screen bg-[#FFFCFB]">
      <div className="mx-auto max-w-[1100px] px-5 pb-20 pt-8 sm:px-8 md:pt-12">
        <Link
          to={dashboardTo}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#1A1A1A]/70 hover:text-[#C4907F]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
        <div className="mt-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-[32px] font-semibold text-[#1A1A1A] md:text-[40px]">
              Notifications
            </h1>
            <p className="mt-1 text-[14px] font-light text-[#1A1A1A]/60">{subhead}</p>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              disabled={markAllReadMutation.isPending}
              className="shrink-0 self-end text-[12px] font-semibold text-[#C4907F] underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
            >
              {markAllReadMutation.isPending ? "Marking…" : "Mark all as read"}
            </button>
          )}
        </div>

        {isError && (
          <div className="mt-6">
            <ErrorBanner message="Could not load notifications." onRetry={() => void refetch()} />
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-2">
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-[14px] font-light text-[#1A1A1A]/70">
              {emptyMessage}
            </p>
          ) : (
            <ul className="divide-y divide-[#EDE0DB]">
              {rows.map((n) => {
                const activate = () => {
                  markAsRead(n.id);
                  if (n.kind === "new_message" && n.conversation_id) {
                    navigate({
                      to: "/messages/$conversationId",
                      params: { conversationId: n.conversation_id },
                    });
                  }
                };
                return (
                  <li
                    key={n.id}
                    role="button"
                    tabIndex={0}
                    onClick={activate}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        activate();
                      }
                    }}
                    className={`flex cursor-pointer items-start justify-between gap-4 px-5 py-4 transition hover:bg-[#EDE0DB]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C4907F]/40 ${
                      n.read_at ? "opacity-60" : ""
                    }`}
                  >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {!n.read_at ? (
                      <span
                        className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#C4907F]"
                        aria-hidden="true"
                      />
                    ) : (
                      <span className="mt-2 h-2 w-2 shrink-0" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium text-[#1A1A1A]">{renderHeadline(n)}</p>
                      {n.kind === "new_message" ? (
                        <p className="mt-0.5 text-[13px] text-[#1A1A1A]/60">
                          Tap to open the conversation
                        </p>
                      ) : (
                        n.booking_date &&
                        n.booking_time_slot && (
                          <p className="mt-0.5 text-[13px] text-[#1A1A1A]/60">
                            {formatBookingDateTime(n.booking_date, n.booking_time_slot)}
                          </p>
                        )
                      )}
                    </div>
                  </div>
                  <p className="shrink-0 text-[12px] text-[#1A1A1A]/50">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function renderHeadline(n: NotificationRow): string {
  if (n.kind === "new_message") {
    return `New message from ${n.sender_name?.trim() || "someone"}`;
  }
  if (n.kind === "session_completed") {
    const mentor = n.mentor_name?.trim() || "your mentor";
    return `Session completed with ${mentor}`;
  }
  // booking_confirmed (default — also catches any unknown future kinds with
  // sensible mentor-facing copy).
  return `New booking from ${n.student_name?.trim() || "a student"}`;
}
