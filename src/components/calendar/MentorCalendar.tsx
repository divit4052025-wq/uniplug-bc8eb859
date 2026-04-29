import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sendBookingEmails } from "@/lib/email/booking.functions";

// Hand-written shape of the get_mentor_calendar RPC response. Stays in sync
// with supabase/migrations/20260429000002_bug4_get_mentor_calendar.sql.
type CalendarSlot = {
  date: string;       // "YYYY-MM-DD"
  time_slot: string;  // "HH:MM" with leading zero, e.g. "14:00"
  state: "available" | "booked";
};

type MentorCalendarProps = {
  mentorId: string;
  mentorName: string;
  pricePerSessionInr: number;
};

const DURATION_MINUTES = 60;

function isCalendarSlot(value: unknown): value is CalendarSlot {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.date === "string" &&
    typeof v.time_slot === "string" &&
    (v.state === "available" || v.state === "booked")
  );
}

function formatFriendlyDate(iso: string): string {
  // Render as "Mon 5 May" in the browser locale. Use a stable midnight construction
  // so the user-facing day label matches the date string regardless of timezone.
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function MentorCalendar({
  mentorId,
  mentorName,
  pricePerSessionInr,
}: MentorCalendarProps) {
  const [slots, setSlots] = useState<CalendarSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selected, setSelected] = useState<CalendarSlot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);

  const loadCalendar = async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await (supabase as any).rpc("get_mentor_calendar", {
      _mentor_id: mentorId,
    });
    if (error) {
      setSlots([]);
      setLoadError("Calendar unavailable right now.");
      setLoading(false);
      return;
    }
    if (!Array.isArray(data)) {
      setSlots([]);
      setLoadError("Calendar unavailable right now.");
      setLoading(false);
      return;
    }
    const safe = data.filter(isCalendarSlot);
    setSlots(safe);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadCalendar();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorId]);

  // Group slots by date. Days the mentor doesn't advertise simply don't appear.
  const days = useMemo(() => {
    const map = new Map<string, CalendarSlot[]>();
    for (const s of slots) {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    // Keep only days with at least one slot, sort dates ASC, sort slots within ASC.
    const ordered = Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([date, list]) => ({
        date,
        slots: [...list].sort((x, y) => x.time_slot.localeCompare(y.time_slot)),
      }));
    return ordered;
  }, [slots]);

  const onChipClick = (slot: CalendarSlot) => {
    if (slot.state === "booked") return;
    setSubmitError(null);
    setNeedsAuth(false);
    setSelected((prev) =>
      prev && prev.date === slot.date && prev.time_slot === slot.time_slot ? null : slot,
    );
  };

  const onConfirm = async () => {
    if (!selected) return;
    setSubmitting(true);
    setSubmitError(null);
    setNeedsAuth(false);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const studentId = sessionData.session?.user.id;
      if (!studentId) {
        setNeedsAuth(true);
        return;
      }
      const { data: inserted, error: insErr } = await (supabase as any)
        .from("bookings")
        .insert({
          mentor_id: mentorId,
          student_id: studentId,
          date: selected.date,
          time_slot: selected.time_slot,
          duration: DURATION_MINUTES,
          price: pricePerSessionInr,
          status: "confirmed",
        })
        .select("id")
        .single();
      if (insErr) {
        setSubmitError(insErr.message ?? "Could not book session.");
        return;
      }
      if (inserted?.id) {
        try {
          await sendBookingEmails({ data: { bookingId: inserted.id } });
        } catch (e) {
          // Email dispatch failure is non-fatal: the booking is already saved.
          console.error("[booking-emails] dispatch failed", e);
        }
      }
      setSelected(null);
      await loadCalendar();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not book session.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-3xl border border-[#EDE0DB] bg-[#FFFCFB] p-6 shadow-[0_20px_40px_-20px_rgba(26,26,26,0.15)]">
      <h3 className="font-display text-[20px] font-semibold text-[#1A1A1A]">Book a session</h3>
      <p className="mt-1 text-[12px] text-[#1A1A1A]/60">
        Showing the next 30 days. Tap a time to select it.
      </p>

      {/* Calendar grid */}
      <div className="mt-5 space-y-6">
        {loading && (
          <div className="space-y-4" aria-label="Loading calendar">
            {[0, 1, 2].map((i) => (
              <div key={i}>
                <div className="h-4 w-24 rounded bg-[#EDE0DB]" />
                <div className="mt-3 flex flex-wrap gap-2">
                  {[0, 1, 2, 3].map((j) => (
                    <div key={j} className="h-11 w-20 rounded-full bg-[#EDE0DB]" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && loadError && (
          <p className="text-[13px] text-[#1A1A1A]/70">{loadError}</p>
        )}

        {!loading && !loadError && days.length === 0 && (
          <p className="text-[13px] text-[#1A1A1A]/70">
            No availability in the next 30 days.
          </p>
        )}

        {!loading && !loadError && days.map(({ date, slots: daySlots }) => (
          <div key={date}>
            <h4 className="font-display text-[16px] font-semibold text-[#1A1A1A]">
              {formatFriendlyDate(date)}
            </h4>
            <div className="mt-2 flex flex-wrap gap-2">
              {daySlots.map((slot) => {
                const isSelected =
                  selected?.date === slot.date && selected?.time_slot === slot.time_slot;
                if (slot.state === "booked") {
                  return (
                    <div
                      key={`${slot.date}-${slot.time_slot}`}
                      aria-disabled
                      className="inline-flex h-11 cursor-not-allowed items-center justify-center rounded-full bg-[#EDE0DB] px-4 text-[13px] font-medium text-[#1A1A1A]/50"
                    >
                      {slot.time_slot} · Booked
                    </div>
                  );
                }
                return (
                  <button
                    key={`${slot.date}-${slot.time_slot}`}
                    type="button"
                    onClick={() => onChipClick(slot)}
                    aria-pressed={isSelected}
                    className={
                      isSelected
                        ? "inline-flex h-11 items-center justify-center rounded-full bg-[#C4907F] px-4 text-[13px] font-medium text-[#FFFCFB] transition"
                        : "inline-flex h-11 items-center justify-center rounded-full border border-[#C4907F] bg-[#FFFCFB] px-4 text-[13px] font-medium text-[#1A1A1A] transition hover:bg-[#E8C4B8]"
                    }
                  >
                    {slot.time_slot}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Confirm Booking CTA */}
      {selected && (
        <div className="mt-6 border-t border-[#EDE0DB] pt-5">
          <p className="text-[14px] leading-relaxed text-[#1A1A1A]">
            Booking <span className="font-medium">{selected.time_slot}</span> on{" "}
            <span className="font-medium">{formatFriendlyDate(selected.date)}</span> with{" "}
            <span className="font-medium">{mentorName}</span> for{" "}
            <span className="font-medium">₹{pricePerSessionInr.toLocaleString("en-IN")}</span>.
          </p>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={submitting}
            className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#1A1A1A] px-6 font-display text-[14px] font-semibold text-[#FFFCFB] transition hover:opacity-90 disabled:opacity-60 sm:w-auto sm:px-10"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting ? "Confirming…" : "Confirm Booking"}
          </button>

          {submitError && (
            <p className="mt-3 text-[13px] text-destructive">{submitError}</p>
          )}
          {needsAuth && (
            <p className="mt-3 text-[13px] text-[#1A1A1A]/80">
              <Link to="/login" className="underline decoration-[#C4907F] underline-offset-4">
                Sign in
              </Link>{" "}
              to book this session.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
