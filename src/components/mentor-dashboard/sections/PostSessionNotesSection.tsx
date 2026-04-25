import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type SessionOption = {
  id: string;
  scheduled_at: string;
  student_id: string;
  student_name: string;
};

export function PostSessionNotesSection({ mentorId }: { mentorId: string }) {
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [summary, setSummary] = useState("");
  const [points, setPoints] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorId]);

  const load = async () => {
    const { data } = await supabase
      .from("sessions")
      .select("id, scheduled_at, student_id")
      .eq("mentor_id", mentorId)
      .eq("status", "completed")
      .order("scheduled_at", { ascending: false })
      .limit(20);
    const list = data ?? [];
    const ids = Array.from(new Set(list.map((r) => r.student_id)));
    const nameMap = new Map<string, string>();
    if (ids.length) {
      const { data: studs } = await supabase
        .from("students")
        .select("id, full_name")
        .in("id", ids);
      (studs ?? []).forEach((s) => nameMap.set(s.id, s.full_name));
    }
    setSessions(
      list.map((s) => ({
        id: s.id,
        scheduled_at: s.scheduled_at,
        student_id: s.student_id,
        student_name: nameMap.get(s.student_id) ?? "Student",
      }))
    );
  };

  const save = async () => {
    if (!selected) return;
    const session = sessions.find((s) => s.id === selected);
    if (!session) return;
    setSaving(true);
    const { data: existing } = await supabase
      .from("session_notes")
      .select("id")
      .eq("session_id", selected)
      .maybeSingle();
    let noteId = existing?.id;
    if (noteId) {
      await supabase.from("session_notes").update({ summary }).eq("id", noteId);
      await supabase.from("session_action_points").delete().eq("note_id", noteId);
    } else {
      const { data: created } = await supabase
        .from("session_notes")
        .insert({
          session_id: selected,
          mentor_id: mentorId,
          student_id: session.student_id,
          summary,
        })
        .select("id")
        .single();
      noteId = created?.id;
    }
    if (noteId) {
      const cleaned = points.map((p) => p.trim()).filter(Boolean);
      if (cleaned.length) {
        await supabase.from("session_action_points").insert(
          cleaned.map((content, i) => ({
            note_id: noteId!,
            mentor_id: mentorId,
            student_id: session.student_id,
            content,
            position: i,
          }))
        );
      }
    }
    setSaving(false);
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt(null), 2200);
  };

  return (
    <section id="section-notes" className="scroll-mt-24">
      <h2 className="font-display text-[22px] font-semibold text-[#1A1A1A]">Post Session Notes</h2>
      <div className="mt-4 rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-5">
        <label className="block text-[12px] font-medium uppercase tracking-wide text-[#1A1A1A]/60">
          Select session
        </label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="mt-1.5 h-10 w-full rounded-lg border border-[#EDE0DB] bg-white px-3 text-[14px] text-[#1A1A1A] outline-none focus:border-[#C4907F]"
        >
          <option value="">— pick a recent completed session —</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.student_name} · {new Date(s.scheduled_at).toLocaleDateString()}
            </option>
          ))}
        </select>

        <label className="mt-5 block text-[12px] font-medium uppercase tracking-wide text-[#1A1A1A]/60">
          Session summary
        </label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={4}
          placeholder="What did you cover in this session?"
          className="mt-1.5 w-full resize-none rounded-lg border border-[#EDE0DB] bg-white p-3 text-[14px] text-[#1A1A1A] outline-none focus:border-[#C4907F]"
        />

        <div className="mt-5 flex items-center justify-between">
          <span className="text-[12px] font-medium uppercase tracking-wide text-[#1A1A1A]/60">
            Action points
          </span>
          <button
            onClick={() => setPoints((p) => [...p, ""])}
            className="inline-flex h-8 items-center gap-1 rounded-full border border-[#1A1A1A]/15 px-3 text-[12px] font-medium text-[#1A1A1A] hover:border-[#C4907F] hover:text-[#C4907F]"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
        <ul className="mt-2 space-y-2">
          {points.map((p, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="text-[#C4907F]">•</span>
              <input
                value={p}
                onChange={(e) =>
                  setPoints((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))
                }
                placeholder={`Action point ${i + 1}`}
                className="h-9 flex-1 rounded-lg border border-[#EDE0DB] bg-white px-3 text-[13px] text-[#1A1A1A] outline-none focus:border-[#C4907F]"
              />
              {points.length > 1 && (
                <button
                  onClick={() => setPoints((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label="Remove"
                  className="rounded-full p-1.5 text-[#1A1A1A]/50 hover:bg-[#EDE0DB] hover:text-[#1A1A1A]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={save}
            disabled={!selected || saving}
            className="inline-flex h-10 items-center justify-center rounded-full bg-[#C4907F] px-6 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Notes"}
          </button>
          {savedAt && (
            <span className="text-[12px] font-medium text-[#1A1A1A]/60">Saved.</span>
          )}
        </div>
      </div>
    </section>
  );
}