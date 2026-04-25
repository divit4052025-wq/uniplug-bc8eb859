import { useEffect, useState } from "react";
import { Check, Circle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Note = {
  id: string;
  mentor_id: string;
  mentor_name: string;
  booking_id: string | null;
  date: string | null;
  summary: string;
  action_points: string[];
  completions: Record<number, boolean>;
  created_at: string;
  updated_at: string;
};

export function SessionNotesSection({ studentId }: { studentId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const load = async () => {
    const { data: rows } = await supabase
      .from("session_notes")
      .select("id, mentor_id, booking_id, summary, action_points, created_at, updated_at")
      .eq("student_id", studentId)
      .order("updated_at", { ascending: false });
    const list = rows ?? [];
    if (list.length === 0) {
      setNotes([]);
      setLoaded(true);
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
        mentor_id: n.mentor_id,
        mentor_name: mentorMap.get(n.mentor_id) ?? "Mentor",
        booking_id: n.booking_id,
        date: n.booking_id ? (bookingDate.get(n.booking_id) ?? null) : null,
        summary: n.summary ?? "",
        action_points: Array.isArray(n.action_points) ? (n.action_points as string[]) : [],
        completions: compMap.get(n.id) ?? {},
        created_at: n.created_at,
        updated_at: n.updated_at,
      })),
    );
    setLoaded(true);
  };

  const toggle = async (note: Note, index: number) => {
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

  return (
    <section id="section-session-notes" className="scroll-mt-24">
      <h2 className="font-display text-[22px] font-semibold text-[#1A1A1A]">Session Notes</h2>
      <div className="mt-4 space-y-4">
        {!loaded ? null : notes.length === 0 ? (
          <div className="rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-6 text-center">
            <p className="text-[14px] font-light text-[#1A1A1A]/70">
              No session notes yet. After your mentor writes notes from a session, they'll appear here.
            </p>
          </div>
        ) : (
          notes.map((n) => (
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
                                  : "border-[#1A1A1A]/30 bg-white text-transparent"
                              }`}
                            >
                              {done ? <Check className="h-3 w-3" /> : <Circle className="h-3 w-3 opacity-0" />}
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
                {new Date(n.updated_at).getTime() - new Date(n.created_at).getTime() > 2000 && (
                  <span className="rounded-full bg-[#C4907F]/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#C4907F]">
                    Updated
                  </span>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
