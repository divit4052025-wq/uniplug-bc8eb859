import { useEffect, useState } from "react";
import { Plus, Trash2, Pencil, Eye } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { ErrorBanner } from "@/components/ui/error-banner";
import { isBookingEnded } from "@/lib/time";

type BookingOption = {
  id: string;
  date: string;
  time_slot: string;
  student_id: string;
  student_name: string;
};

type PreviousNote = {
  id: string;
  booking_id: string | null;
  student_id: string;
  student_name: string;
  date: string | null;
  time_slot: string | null;
  summary: string;
  action_points: string[];
  updated_at: string;
  created_at: string;
};

export function PostSessionNotesSection({
  mentorId,
  editNoteId,
  onEditConsumed,
}: {
  mentorId: string;
  editNoteId?: string | null;
  onEditConsumed?: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const bookingsKey = ["post-session-bookings", mentorId] as const;
  const previousKey = ["post-session-previous", mentorId] as const;

  const [selected, setSelected] = useState<string>("");
  const [summary, setSummary] = useState("");
  const [points, setPoints] = useState<string[]>([""]);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [extraBookings, setExtraBookings] = useState<BookingOption[]>([]);

  const { data: bookingsBase = [], isError: bErr, refetch: refetchBookings } = useQuery<BookingOption[]>({
    queryKey: bookingsKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, date, time_slot, student_id, status")
        .eq("mentor_id", mentorId)
        .in("status", ["confirmed", "completed"])
        .order("date", { ascending: false })
        .limit(50);
      if (error) throw error;
      const past = (data ?? []).filter((b) =>
        isBookingEnded(b.date, (b.time_slot ?? "00:00").slice(0, 5)),
      );
      const ids = Array.from(new Set(past.map((r) => r.student_id).filter((v): v is string => !!v)));
      const nameMap = new Map<string, string>();
      if (ids.length) {
        const { data: studs, error: rpcErr } = await supabase.rpc(
          "get_student_booking_names",
          { _ids: ids },
        );
        if (rpcErr) throw rpcErr;
        ((studs ?? []) as { id: string; full_name: string }[]).forEach((s) =>
          nameMap.set(s.id, s.full_name),
        );
      }
      return past.map((b) => ({
        id: b.id,
        date: b.date,
        time_slot: b.time_slot,
        student_id: b.student_id ?? "",
        student_name: b.student_id ? (nameMap.get(b.student_id) ?? "Student") : "Student",
      }));
    },
  });

  const bookings = [...bookingsBase, ...extraBookings];

  const { data: previous = [], isError: pErr, refetch: refetchPrevious } = useQuery<PreviousNote[]>({
    queryKey: previousKey,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("session_notes")
        .select("id, booking_id, student_id, summary, action_points, created_at, updated_at")
        .eq("mentor_id", mentorId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const list = rows ?? [];
      if (list.length === 0) return [];
      const studentIds = Array.from(new Set(list.map((n) => n.student_id).filter((v): v is string => !!v)));
      const bookingIds = Array.from(
        new Set(list.map((n) => n.booking_id).filter((v): v is string => !!v)),
      );
      const [studsRes, bookingsRes] = await Promise.all([
        studentIds.length
          ? supabase.rpc("get_student_booking_names", { _ids: studentIds })
          : Promise.resolve({ data: [] as { id: string; full_name: string }[], error: null }),
        bookingIds.length
          ? supabase.from("bookings").select("id, date, time_slot").in("id", bookingIds)
          : Promise.resolve({ data: [] as { id: string; date: string; time_slot: string }[], error: null }),
      ]);
      if (studsRes.error) throw studsRes.error;
      if (bookingsRes.error) throw bookingsRes.error;
      const nameMap = new Map<string, string>();
      ((studsRes.data ?? []) as { id: string; full_name: string }[]).forEach((s) =>
        nameMap.set(s.id, s.full_name),
      );
      const bookingMap = new Map<string, { date: string; time_slot: string }>();
      ((bookingsRes.data ?? []) as { id: string; date: string; time_slot: string }[]).forEach((b) =>
        bookingMap.set(b.id, { date: b.date, time_slot: b.time_slot }),
      );
      return list.map((n) => {
        const bk = n.booking_id ? bookingMap.get(n.booking_id) : undefined;
        return {
          id: n.id,
          booking_id: n.booking_id,
          student_id: n.student_id,
          student_name: nameMap.get(n.student_id) ?? "Student",
          date: bk?.date ?? null,
          time_slot: bk?.time_slot ?? null,
          summary: n.summary ?? "",
          action_points: Array.isArray(n.action_points) ? (n.action_points as string[]) : [],
          updated_at: n.updated_at,
          created_at: n.created_at,
        };
      });
    },
  });

  // Load existing note when a booking is selected
  useEffect(() => {
    if (!selected) {
      setSummary("");
      setPoints([""]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("session_notes")
        .select("summary, action_points")
        .eq("booking_id", selected)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setSummary(data.summary ?? "");
        const ap = Array.isArray(data.action_points) ? (data.action_points as string[]) : [];
        setPoints(ap.length ? ap : [""]);
      } else {
        setSummary("");
        setPoints([""]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  // When mentor arrives via "Edit" link, preload that note
  useEffect(() => {
    if (!editNoteId || previous.length === 0) return;
    const target = previous.find((p) => p.id === editNoteId);
    if (target) {
      editPrevious(target);
      onEditConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editNoteId, previous]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No booking selected");
      const booking = bookings.find((b) => b.id === selected);
      if (!booking) throw new Error("Booking not found");
      const cleaned = points.map((p) => p.trim()).filter(Boolean);
      const { data: existing } = await supabase
        .from("session_notes")
        .select("id")
        .eq("booking_id", selected)
        .maybeSingle();
      if (existing?.id) {
        const { error } = await supabase
          .from("session_notes")
          .update({ summary, action_points: cleaned, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("session_notes").insert({
          booking_id: selected,
          mentor_id: mentorId,
          student_id: booking.student_id,
          summary,
          action_points: cleaned,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Notes saved successfully.");
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2200);
      clearForm();
      void qc.invalidateQueries({ queryKey: previousKey });
    },
    onError: () => {
      toast.error("Could not save notes. Please try again.");
    },
  });

  const clearForm = () => {
    setSelected("");
    setSummary("");
    setPoints([""]);
  };

  const editPrevious = (n: PreviousNote) => {
    if (!n.booking_id) {
      toast.error("This note has no associated session.");
      return;
    }
    if (!bookings.some((b) => b.id === n.booking_id)) {
      setExtraBookings((prev) => [
        ...prev,
        {
          id: n.booking_id as string,
          date: n.date ?? "",
          time_slot: n.time_slot ?? "",
          student_id: n.student_id,
          student_name: n.student_name,
        },
      ]);
    }
    setSelected(n.booking_id);
    setSummary(n.summary);
    setPoints(n.action_points.length ? n.action_points : [""]);
    document
      .getElementById("section-notes")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section id="section-notes" className="scroll-mt-24">
      <h2 className="font-display text-[22px] font-semibold text-[#1A1A1A]">Post Session Notes</h2>
      {(bErr || pErr) && (
        <div className="mt-4">
          <ErrorBanner
            message="Couldn't load past sessions or notes."
            onRetry={() => {
              if (bErr) void refetchBookings();
              if (pErr) void refetchPrevious();
            }}
          />
        </div>
      )}
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
            onClick={() => saveMutation.mutate()}
            disabled={!selected || saveMutation.isPending}
            className="inline-flex h-10 items-center justify-center rounded-full bg-[#C4907F] px-6 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {saveMutation.isPending ? "Saving…" : "Save Notes"}
          </button>
          {savedAt && (
            <span className="text-[12px] font-medium text-[#3F9D6E]">✓ Saved</span>
          )}
        </div>
      </div>

      {/* Previous Notes */}
      <div className="mt-10">
        <h3 className="font-display text-[18px] font-semibold text-[#1A1A1A]">Previous Notes</h3>
        <div className="mt-3 space-y-3">
          {previous.length === 0 ? (
            <div className="rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-5 text-[13px] font-light text-[#1A1A1A]/60">
              No notes saved yet.
            </div>
          ) : (
            previous.map((n) => {
              const wasEdited =
                new Date(n.updated_at).getTime() - new Date(n.created_at).getTime() > 2000;
              return (
                <article
                  key={n.id}
                  className="rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium text-[#1A1A1A]">
                        {n.student_name}
                        {wasEdited && (
                          <span className="ml-2 rounded-full bg-[#C4907F]/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#C4907F]">
                            Updated
                          </span>
                        )}
                      </p>
                      <p className="text-[12px] text-[#1A1A1A]/60">
                        {n.date ? new Date(n.date).toLocaleDateString() : "Session"}
                        {n.time_slot ? ` · ${n.time_slot}` : ""}
                      </p>
                      <p className="mt-2 line-clamp-2 text-[13px] text-[#1A1A1A]/80">
                        {n.summary || "—"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => editPrevious(n)}
                        className="inline-flex h-8 items-center gap-1 rounded-full border border-[#1A1A1A]/15 px-3 text-[12px] font-medium text-[#1A1A1A] hover:border-[#C4907F] hover:text-[#C4907F]"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        onClick={() =>
                          navigate({ to: "/session-notes/$noteId", params: { noteId: n.id } })
                        }
                        className="inline-flex h-8 items-center gap-1 rounded-full bg-[#1A1A1A] px-3 text-[12px] font-medium text-white hover:opacity-90"
                      >
                        <Eye className="h-3.5 w-3.5" /> View
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
