import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/progress")({
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
  const navigate = useNavigate();
  const [studentId, setStudentId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      const session = data.session;
      if (!session) {
        navigate({ to: "/student-signup" });
        return;
      }
      setStudentId(session.user.id);
      await load(session.user.id);
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const load = async (sid: string) => {
    const { data: rows } = await supabase
      .from("session_notes")
      .select("id, mentor_id, booking_id, summary, action_points, created_at, updated_at")
      .eq("student_id", sid)
      .order("created_at", { ascending: false });
    const list = rows ?? [];
    if (list.length === 0) {
      setNotes([]);
      return;
    }
    const mentorIds = Array.from(new Set(list.map((n) => n.mentor_id)));
    const bookingIds = Array.from(
      new Set(list.map((n) => n.booking_id).filter((v): v is string => !!v)),
    );
    const noteIds = list.map((n) => n.id);
    const [mentorsRes, bookingsRes, completionsRes] = await Promise.all([
      supabase.rpc("get_mentor_booking_names", { _ids: mentorIds }),
      bookingIds.length
        ? supabase.from("bookings").select("id, date").in("id", bookingIds)
        : Promise.resolve({ data: [] as { id: string; date: string }[] }),
      supabase
        .from("action_point_completions")
        .select("session_note_id, action_point_index, completed")
        .in("session_note_id", noteIds),
    ]);
    const mentorMap = new Map<string, string>();
    (mentorsRes.data ?? []).forEach((m: { id: string; full_name: string }) =>
      mentorMap.set(m.id, m.full_name),
    );
    const bookingDate = new Map<string, string>();
    (bookingsRes.data ?? []).forEach((b: { id: string; date: string }) =>
      bookingDate.set(b.id, b.date),
    );
    const compMap = new Map<string, Record<number, boolean>>();
    (completionsRes.data ?? []).forEach(
      (c: { session_note_id: string; action_point_index: number; completed: boolean }) => {
        const cur = compMap.get(c.session_note_id) ?? {};
        cur[c.action_point_index] = c.completed;
        compMap.set(c.session_note_id, cur);
      },
    );
    setNotes(
      list.map((n) => ({
        id: n.id,
        mentor_name: mentorMap.get(n.mentor_id) ?? "Mentor",
        date: n.booking_id ? (bookingDate.get(n.booking_id) ?? null) : null,
        summary: n.summary ?? "",
        action_points: Array.isArray(n.action_points) ? (n.action_points as string[]) : [],
        completions: compMap.get(n.id) ?? {},
        updated_at: n.updated_at,
        created_at: n.created_at,
      })),
    );
  };

  const toggle = async (note: Note, index: number) => {
    if (!studentId) return;
    const next = !note.completions[index];
    setNotes((prev) =>
      prev.map((n) =>
        n.id === note.id
          ? { ...n, completions: { ...n.completions, [index]: next } }
          : n,
      ),
    );
    await supabase
      .from("action_point_completions")
      .upsert(
        {
          session_note_id: note.id,
          action_point_index: index,
          completed: next,
          student_id: studentId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "session_note_id,action_point_index" },
      );
  };

  const totalSessions = notes.length;
  const totalActionPoints = notes.reduce((sum, n) => sum + n.action_points.length, 0);
  const completedActionPoints = notes.reduce(
    (sum, n) => sum + n.action_points.filter((_, i) => n.completions[i]).length,
    0,
  );

  if (!ready) return <div className="min-h-screen bg-[#FFFCFB]" />;

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

        {/* Progress summary */}
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

        {/* Notes */}
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