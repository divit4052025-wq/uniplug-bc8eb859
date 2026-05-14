import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, ArrowLeft } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { ErrorBanner } from "@/components/ui/error-banner";
import { clientAuthGuard, type AuthContext } from "@/lib/auth/route-guard";
import { withRetry } from "@/lib/retry";

export const Route = createFileRoute("/progress")({
  beforeLoad: () =>
    clientAuthGuard({ signedOutTo: "/student-signup", requireRole: "student" }),
  head: () => ({
    meta: [{ title: "My Progress — UniPlug" }],
  }),
  component: ProgressPage,
});

type Note = {
  id: string;
  mentor_name: string;
  date: string | null;
  summary: string;
  action_points: string[];
  completions: Record<number, boolean>;
  updated_at: string;
  created_at: string;
};

function ProgressPage() {
  const ctx = Route.useRouteContext() as AuthContext;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [studentId, setStudentId] = useState<string | null>(ctx.userId ?? null);
  const [authReady, setAuthReady] = useState(!!ctx.userId);

  const notesKey = ["progress-notes", studentId] as const;

  // SSR / hard-refresh fallback (see dashboard.tsx for the rationale).
  useEffect(() => {
    if (ctx.userId) return;
    let cancelled = false;
    void (async () => {
      const { data: sessionData, error: sessErr } = await withRetry(() =>
        supabase.auth.getSession(),
      );
      if (cancelled) return;
      const session = sessionData?.session;
      if (sessErr || !session) {
        navigate({ to: "/student-signup" });
        return;
      }
      setStudentId(session.user.id);
      setAuthReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, ctx.userId]);

  const { data: notes = [], isError, refetch } = useQuery<Note[]>({
    queryKey: notesKey,
    enabled: !!studentId,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("session_notes")
        .select("id, mentor_id, booking_id, summary, action_points, created_at, updated_at")
        .eq("student_id", studentId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const list = rows ?? [];
      if (list.length === 0) return [];
      const mentorIds = Array.from(new Set(list.map((n) => n.mentor_id).filter((v): v is string => !!v)));
      const bookingIds = Array.from(
        new Set(list.map((n) => n.booking_id).filter((v): v is string => !!v)),
      );
      const noteIds = list.map((n) => n.id);
      const [mentorsRes, bookingsRes, completionsRes] = await Promise.all([
        mentorIds.length
          ? supabase.rpc("get_mentor_booking_names", { _ids: mentorIds })
          : Promise.resolve({ data: [] as { id: string; full_name: string }[], error: null }),
        bookingIds.length
          ? supabase.from("bookings").select("id, date").in("id", bookingIds)
          : Promise.resolve({ data: [] as { id: string; date: string }[], error: null }),
        supabase
          .from("action_point_completions")
          .select("session_note_id, action_point_index, completed")
          .in("session_note_id", noteIds),
      ]);
      if (mentorsRes.error) throw mentorsRes.error;
      if (bookingsRes.error) throw bookingsRes.error;
      if (completionsRes.error) throw completionsRes.error;
      const mentorMap = new Map<string, string>();
      ((mentorsRes.data ?? []) as { id: string; full_name: string }[]).forEach((m) =>
        mentorMap.set(m.id, m.full_name),
      );
      const bookingDate = new Map<string, string>();
      ((bookingsRes.data ?? []) as { id: string; date: string }[]).forEach((b) =>
        bookingDate.set(b.id, b.date),
      );
      const compMap = new Map<string, Record<number, boolean>>();
      ((completionsRes.data ?? []) as {
        session_note_id: string;
        action_point_index: number;
        completed: boolean;
      }[]).forEach((c) => {
        const cur = compMap.get(c.session_note_id) ?? {};
        cur[c.action_point_index] = c.completed;
        compMap.set(c.session_note_id, cur);
      });
      return list.map((n) => ({
        id: n.id,
        mentor_name: mentorMap.get(n.mentor_id) ?? "Mentor",
        date: n.booking_id ? (bookingDate.get(n.booking_id) ?? null) : null,
        summary: n.summary ?? "",
        action_points: Array.isArray(n.action_points) ? (n.action_points as string[]) : [],
        completions: compMap.get(n.id) ?? {},
        updated_at: n.updated_at,
        created_at: n.created_at,
      }));
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ noteId, index, next }: { noteId: string; index: number; next: boolean }) => {
      if (!studentId) return;
      const { error } = await supabase.from("action_point_completions").upsert(
        {
          session_note_id: noteId,
          action_point_index: index,
          completed: next,
          student_id: studentId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "session_note_id,action_point_index" },
      );
      if (error) throw error;
    },
    onMutate: async ({ noteId, index, next }) => {
      await qc.cancelQueries({ queryKey: notesKey });
      const prev = qc.getQueryData<Note[]>(notesKey) ?? [];
      qc.setQueryData<Note[]>(
        notesKey,
        prev.map((n) =>
          n.id === noteId ? { ...n, completions: { ...n.completions, [index]: next } } : n,
        ),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(notesKey, ctx.prev);
    },
  });

  const toggle = (note: Note, index: number) => {
    toggleMutation.mutate({
      noteId: note.id,
      index,
      next: !note.completions[index],
    });
  };

  const totalSessions = notes.length;
  const totalActionPoints = notes.reduce((sum, n) => sum + n.action_points.length, 0);
  const completedActionPoints = notes.reduce(
    (sum, n) => sum + n.action_points.filter((_, i) => n.completions[i]).length,
    0,
  );

  if (!authReady) return <div className="min-h-screen bg-[#FFFCFB]" />;

  return (
    <div className="min-h-screen bg-[#FFFCFB]">
      <div className="mx-auto max-w-[900px] px-5 pb-20 pt-8 sm:px-8 md:pt-12">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#1A1A1A]/70 hover:text-[#C4907F]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
        <h1 className="mt-5 font-display text-[32px] font-semibold text-[#1A1A1A] md:text-[40px]">
          My Progress
        </h1>
        <p className="mt-1 text-[14px] font-light text-[#1A1A1A]/60">
          All your session notes and action points in one place.
        </p>

        {isError && (
          <div className="mt-6">
            <ErrorBanner message="Couldn't load your progress." onRetry={() => void refetch()} />
          </div>
        )}

        <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-4">
          <div className="rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-4 sm:p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#1A1A1A]/60">
              Sessions
            </p>
            <p className="mt-1 font-display text-[28px] font-semibold text-[#1A1A1A] sm:text-[32px]">
              {totalSessions}
            </p>
          </div>
          <div className="rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-4 sm:p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#1A1A1A]/60">
              Action points
            </p>
            <p className="mt-1 font-display text-[28px] font-semibold text-[#1A1A1A] sm:text-[32px]">
              {totalActionPoints}
            </p>
          </div>
          <div className="rounded-2xl border border-[#EDE0DB] bg-[#EDE0DB]/40 p-4 sm:p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#C4907F]">
              Completed
            </p>
            <p className="mt-1 font-display text-[28px] font-semibold text-[#C4907F] sm:text-[32px]">
              {completedActionPoints}
              <span className="text-[16px] text-[#1A1A1A]/40">/{totalActionPoints}</span>
            </p>
          </div>
        </div>

        <div className="mt-8 space-y-4">
          {notes.length === 0 ? (
            <div className="rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-8 text-center">
              <p className="text-[14px] font-light text-[#1A1A1A]/70">
                No session notes yet. After your first session, your mentor's notes will appear here.
              </p>
            </div>
          ) : (
            notes.map((n) => {
              const wasEdited =
                new Date(n.updated_at).getTime() - new Date(n.created_at).getTime() > 2000;
              return (
                <article
                  key={n.id}
                  className="rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[15px] font-medium text-[#1A1A1A]">{n.mentor_name}</p>
                      <p className="text-[12px] text-[#1A1A1A]/60">
                        {n.date ? new Date(n.date).toLocaleDateString() : "Session"}
                      </p>
                    </div>
                  </div>
                  {n.summary && (
                    <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-[#1A1A1A]">
                      {n.summary}
                    </p>
                  )}
                  {n.action_points.length > 0 && (
                    <div className="mt-4">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-[#1A1A1A]/60">
                        Action points
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {n.action_points.map((ap, i) => {
                          const done = !!n.completions[i];
                          return (
                            <li key={i}>
                              <button
                                onClick={() => toggle(n, i)}
                                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-[#EDE0DB]/40"
                              >
                                <span
                                  className={`grid h-5 w-5 place-content-center rounded-full border ${
                                    done
                                      ? "border-[#C4907F] bg-[#C4907F] text-white"
                                      : "border-[#1A1A1A]/30 bg-white"
                                  }`}
                                >
                                  {done && <Check className="h-3 w-3" />}
                                </span>
                                <span
                                  className={`text-[13px] ${
                                    done ? "text-[#1A1A1A]/50 line-through" : "text-[#1A1A1A]"
                                  }`}
                                >
                                  {ap}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  <div className="mt-4 flex items-center gap-2 border-t border-[#EDE0DB] pt-3">
                    <p className="text-[11px] text-[#1A1A1A]/50">
                      Last updated {new Date(n.updated_at).toLocaleString()}
                    </p>
                    {wasEdited && (
                      <span className="rounded-full bg-[#C4907F]/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#C4907F]">
                        Updated
                      </span>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
