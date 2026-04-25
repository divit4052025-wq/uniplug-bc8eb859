import { useEffect, useState } from "react";
import { X, FileText, Check, Circle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type StudentRow = {
  id: string;
  full_name: string;
  grade: string;
  school: string;
  total: number;
  last: string | null;
};

type StudentNote = {
  id: string;
  summary: string;
  created_at: string;
  action_points: string[];
  completions: Record<number, boolean>;
};

export function MyStudentsSection({ mentorId }: { mentorId: string }) {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [open, setOpen] = useState<{
    name: string;
    docs: { id: string; file_name: string }[];
    schools: { id: string; name: string; category: string }[];
    notes: StudentNote[];
  } | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorId]);

  const load = async () => {
    const { data: sessions } = await supabase
      .from("sessions")
      .select("student_id, scheduled_at")
      .eq("mentor_id", mentorId)
      .order("scheduled_at", { ascending: false });
    const list = sessions ?? [];
    const agg = new Map<string, { total: number; last: string }>();
    list.forEach((s) => {
      const cur = agg.get(s.student_id);
      if (!cur) agg.set(s.student_id, { total: 1, last: s.scheduled_at });
      else cur.total += 1;
    });
    const ids = Array.from(agg.keys());
    if (ids.length === 0) {
      setRows([]);
      return;
    }
    const { data: studs } = await supabase
      .from("students")
      .select("id, full_name, grade, school")
      .in("id", ids);
    setRows(
      (studs ?? []).map((s) => ({
        id: s.id,
        full_name: s.full_name,
        grade: s.grade,
        school: s.school,
        total: agg.get(s.id)?.total ?? 0,
        last: agg.get(s.id)?.last ?? null,
      }))
    );
  };

  const view = async (studentId: string, name: string) => {
    const [{ data: docs }, { data: schools }, { data: notes }] = await Promise.all([
      supabase.from("student_documents").select("id, file_name").eq("student_id", studentId),
      supabase.from("student_schools").select("id, name, category").eq("student_id", studentId),
      supabase
        .from("session_notes")
        .select("id, summary, created_at, action_points")
        .eq("student_id", studentId)
        .eq("mentor_id", mentorId)
        .order("created_at", { ascending: false }),
    ]);
    const noteRows = notes ?? [];
    const noteIds = noteRows.map((n) => n.id);
    const compMap = new Map<string, Record<number, boolean>>();
    if (noteIds.length) {
      const { data: comps } = await supabase
        .from("action_point_completions")
        .select("session_note_id, action_point_index, completed")
        .in("session_note_id", noteIds);
      (comps ?? []).forEach((c) => {
        const cur = compMap.get(c.session_note_id) ?? {};
        cur[c.action_point_index] = c.completed;
        compMap.set(c.session_note_id, cur);
      });
    }
    setOpen({
      name,
      docs: docs ?? [],
      schools: schools ?? [],
      notes: noteRows.map((n) => ({
        id: n.id,
        summary: n.summary ?? "",
        created_at: n.created_at,
        action_points: Array.isArray(n.action_points) ? (n.action_points as string[]) : [],
        completions: compMap.get(n.id) ?? {},
      })),
    });
  };

  return (
    <section id="section-students" className="scroll-mt-24">
      <h2 className="font-display text-[22px] font-semibold text-[#1A1A1A]">My Students</h2>
      <div className="mt-4 rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-2">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[14px] font-light text-[#1A1A1A]/70">
            No students yet. Once a student books a session with you, they'll appear here.
          </p>
        ) : (
          <ul className="divide-y divide-[#EDE0DB]">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-[15px] font-medium text-[#1A1A1A]">{r.full_name}</p>
                  <p className="text-[12px] text-[#1A1A1A]/60">
                    {r.grade} · {r.school}
                  </p>
                  <p className="mt-1 text-[12px] text-[#1A1A1A]/60">
                    {r.total} session{r.total === 1 ? "" : "s"}
                    {r.last ? ` · last ${new Date(r.last).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => view(r.id, r.full_name)}
                  className="inline-flex h-9 items-center justify-center rounded-full bg-[#C4907F] px-4 text-[12px] font-medium text-white hover:opacity-90"
                >
                  View Dashboard
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-[#1A1A1A]/40" onClick={() => setOpen(null)} />
          <div className="relative max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-[#FFFCFB] p-6 shadow-2xl">
            <button
              onClick={() => setOpen(null)}
              aria-label="Close"
              className="absolute right-4 top-4 rounded-full p-1.5 text-[#1A1A1A]/60 hover:bg-[#EDE0DB]"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="font-display text-[22px] font-semibold text-[#1A1A1A]">{open.name}</h3>

            <div className="mt-5">
              <p className="text-[13px] font-medium text-[#1A1A1A]">School List</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {open.schools.length === 0 && (
                  <p className="text-[12px] text-[#1A1A1A]/50">None added.</p>
                )}
                {open.schools.map((s) => (
                  <span key={s.id} className="rounded-full bg-[#EDE0DB] px-3 py-1 text-[12px] text-[#1A1A1A]">
                    {s.name} <span className="opacity-50">· {s.category}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <p className="text-[13px] font-medium text-[#1A1A1A]">Documents</p>
              <ul className="mt-2 space-y-1.5">
                {open.docs.length === 0 && (
                  <p className="text-[12px] text-[#1A1A1A]/50">No documents shared.</p>
                )}
                {open.docs.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 text-[13px] text-[#1A1A1A]">
                    <FileText className="h-4 w-4 text-[#C4907F]" />
                    {d.file_name}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-5">
              <p className="text-[13px] font-medium text-[#1A1A1A]">Previous Session Notes</p>
              <ul className="mt-2 space-y-3">
                {open.notes.length === 0 && (
                  <p className="text-[12px] text-[#1A1A1A]/50">No notes yet.</p>
                )}
                {open.notes.map((n) => (
                  <li key={n.id} className="rounded-lg bg-[#EDE0DB]/60 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-[#1A1A1A]/50">
                      {new Date(n.created_at).toLocaleDateString()}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-[13px] text-[#1A1A1A]">
                      {n.summary || "—"}
                    </p>
                    {n.action_points.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {n.action_points.map((ap, i) => {
                          const done = !!n.completions[i];
                          return (
                            <li key={i} className="flex items-center gap-2 text-[12px]">
                              {done ? (
                                <span className="grid h-4 w-4 place-content-center rounded-full bg-[#3F9D6E] text-white">
                                  <Check className="h-2.5 w-2.5" />
                                </span>
                              ) : (
                                <Circle className="h-4 w-4 text-[#1A1A1A]/30" />
                              )}
                              <span className={done ? "text-[#1A1A1A]/60 line-through" : "text-[#1A1A1A]"}>
                                {ap}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}