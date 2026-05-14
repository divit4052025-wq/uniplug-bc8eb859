import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { resolveUserRole } from "@/lib/auth/role";
import { ErrorBanner } from "@/components/ui/error-banner";
import { formatBookingDateTime } from "@/lib/time";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [{ title: "Notifications — UniPlug" }],
  }),
  component: NotificationsPage,
});

type NotificationRow = {
  id: string;
  recipient_id: string;
  booking_id: string | null;
  kind: string;
  student_name: string;
  booking_date: string;
  booking_time_slot: string;
  read_at: string | null;
  created_at: string;
};

function NotificationsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const notificationsKey = ["notifications", "list", userId] as const;

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      const session = data.session;
      if (!session) {
        navigate({ to: "/login" });
        return;
      }
      const meta = (session.user.user_metadata ?? {}) as { role?: string };
      const role = await resolveUserRole(session.user.id, session.user.email, meta);
      if (cancelled) return;
      if (role !== "mentor") {
        navigate({ to: "/dashboard" });
        return;
      }
      setUserId(session.user.id);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const { data: rows = [], isError, refetch } = useQuery<NotificationRow[]>({
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

  const markAsReadMutation = useMutation({
    mutationFn: async ({ id, readAt }: { id: string; readAt: string }) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: readAt })
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, readAt }) => {
      await qc.cancelQueries({ queryKey: notificationsKey });
      const prev = qc.getQueryData<NotificationRow[]>(notificationsKey) ?? [];
      qc.setQueryData<NotificationRow[]>(
        notificationsKey,
        prev.map((r) => (r.id === id ? { ...r, read_at: readAt } : r)),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(notificationsKey, ctx.prev);
      setMutationError("Could not mark notification as read.");
    },
  });

  const markAsRead = (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row || row.read_at) return;
    markAsReadMutation.mutate({ id, readAt: new Date().toISOString() });
  };

  if (!ready) return <div className="min-h-screen bg-[#FFFCFB]" />;

  return (
    <div className="min-h-screen bg-[#FFFCFB]">
      <div className="mx-auto max-w-[1100px] px-5 pb-20 pt-8 sm:px-8 md:pt-12">
        <Link
          to="/mentor-dashboard"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#1A1A1A]/70 hover:text-[#C4907F]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
        <h1 className="mt-5 font-display text-[32px] font-semibold text-[#1A1A1A] md:text-[40px]">
          Notifications
        </h1>
        <p className="mt-1 text-[14px] font-light text-[#1A1A1A]/60">
          Updates on your sessions and students.
        </p>

        {isError && (
          <div className="mt-6">
            <ErrorBanner
              message="Could not load notifications."
              onRetry={() => void refetch()}
            />
          </div>
        )}
        {mutationError && (
          <div className="mt-6 flex items-start justify-between gap-3 rounded-r-2xl border-l-4 border-[#C4907F] bg-[#EDE0DB] px-5 py-3">
            <p className="text-[13px] text-[#1A1A1A]">{mutationError}</p>
            <button
              type="button"
              onClick={() => setMutationError(null)}
              className="text-[12px] font-medium text-[#1A1A1A]/70 hover:text-[#C4907F]"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-2">
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-[14px] font-light text-[#1A1A1A]/70">
              No notifications yet. You'll be notified here when a student books a session with you.
            </p>
          ) : (
            <ul className="divide-y divide-[#EDE0DB]">
              {rows.map((n) => (
                <li
                  key={n.id}
                  onClick={() => markAsRead(n.id)}
                  className={`flex cursor-pointer items-start justify-between gap-4 px-5 py-4 transition hover:bg-[#EDE0DB]/40 ${
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
                      <p className="text-[15px] font-medium text-[#1A1A1A]">
                        New booking from {n.student_name}
                      </p>
                      <p className="mt-0.5 text-[13px] text-[#1A1A1A]/60">
                        {formatBookingDateTime(n.booking_date, n.booking_time_slot)}
                      </p>
                    </div>
                  </div>
                  <p className="shrink-0 text-[12px] text-[#1A1A1A]/50">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
