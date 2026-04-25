import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type BookingOption = {
  id: string;
  date: string;
  time_slot: string;
  student_id: string;
  student_name: string;
};

export function PostSessionNotesSection({ mentorId }: { mentorId: string }) {
  const [bookings, setBookings] = useState<BookingOption[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [summary, setSummary] = useState("");
  const [points, setPoints] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorId]);

  // Load existing note when a booking is selected
  useEffect(() => {
    if (!selected) {
      setSummary("");
      setPoints([""]);
      return;
    }
    void loadNote(selected);
  }, [selected]);

  const load = async () => {
    // Real completed sessions = bookings whose date+time is in the past, status confirmed/completed
    const { data } = await supabase
      .from("bookings")
      .select("id, date, time_slot, student_id, status")
      .eq("mentor_id", mentorId)
      .in("status", ["confirmed", "completed"])
      .order("date", { ascending: false })
      .limit(50);
    const now = new Date();
    const past = (data ?? []).filter((b) => {
      const dt = new Date(`${b.date}T${(b.time_slot ?? "00:00").slice(0, 5)}:00`);
      return dt.getTime() <= now.getTime();
    });
    const ids = Array.from(new Set(past.map((r) => r.student_id)));
    const nameMap = new Map<string, string>();
    if (ids.length) {
      const { data: studs } = await supabase.rpc("get_student_booking_names", { _ids: ids });
      (studs ?? []).forEach((s: { id: string; full_name: string }) =>
        nameMap.set(s.id, s.full_name),
      );
    }
    setBookings(
      past.map((b) => ({
        id: b.id,
        date: b.date,
        time_slot: b.time_slot,
        student_id: b.student_id,
        student_name: nameMap.get(b.student_id) ?? "Student",
      })),
    );
  };

  const loadNote = async (bookingId: string) => {
    const { data } = await supabase
      .from("session_notes")
      .select("summary, action_points")
      .eq("booking_id", bookingId)
      .maybeSingle();
    if (data) {
      setSummary(data.summary ?? "");
      const ap = Array.isArray(data.action_points) ? (data.action_points as string[]) : [];
      setPoints(ap.length ? ap : [""]);
    } else {
      setSummary("");
      setPoints([""]);
    }
  };

  const save = async () => {
    if (!selected) return;
    const booking = bookings.find((b) => b.id === selected);
    if (!booking) return;
    setSaving(true);
    const cleaned = points.map((p) => p.trim()).filter(Boolean);
    const { data: existing } = await supabase
      .from("session_notes")
      .select("id")
      .eq("booking_id", selected)
      .maybeSingle();
    if (existing?.id) {
      await supabase
        .from("session_notes")
        .update({ summary, action_points: cleaned })
        .eq("id", existing.id);
    } else {
      await supabase.from("session_notes").insert({
        booking_id: selected,
        mentor_id: mentorId,
        student_id: booking.student_id,
        summary,
        action_points: cleaned,
      });
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
          <option value="">— pick a completed session —</option>
          {bookings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.student_name} · {new Date(b.date).toLocaleDateString()} · {b.time_slot}
            </option>
          ))}
        </select>
        {bookings.length === 0 && (
          <p className="mt-2 text-[12px] text-[#1A1A1A]/50">
            No completed sessions yet. Past bookings will appear here.
          </p>
        )}

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
