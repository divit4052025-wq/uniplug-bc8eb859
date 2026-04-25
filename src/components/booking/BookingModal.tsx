import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Calendar, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type BookingMentor = {
  id: string;
  name: string;
  university: string;
  price: number;
};

const SLOTS = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];
const DURATION = 30;

function todayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function BookingModal({
  mentor,
  onClose,
  onBooked,
}: {
  mentor: BookingMentor;
  onClose: () => void;
  onBooked: () => void;
}) {
  const [date, setDate] = useState<string>(todayISO());
  const [slot, setSlot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const initials = useMemo(
    () => mentor.name.split(" ").map((p) => p[0]).slice(0, 2).join(""),
    [mentor.name],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const confirm = async () => {
    if (!slot) { setError("Pick a time slot."); return; }
    setError(null);
    setSubmitting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const studentId = sess.session?.user.id;
      if (!studentId) throw new Error("You must be logged in to book.");

      const scheduledAt = new Date(`${date}T${slot}:00`).toISOString();
      const { error: insErr } = await supabase.from("sessions").insert({
        mentor_id: mentor.id,
        student_id: studentId,
        scheduled_at: scheduledAt,
        duration_minutes: DURATION,
        amount_inr: mentor.price,
        status: "upcoming",
      });
      if (insErr) throw insErr;
      setSuccess(true);
      setTimeout(() => onBooked(), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not book session.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={success ? undefined : onClose} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-t-3xl bg-[#FFFCFB] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.4)] sm:rounded-3xl">
        {success ? (
          <div className="flex flex-col items-center px-8 py-14 text-center">
            <div className="grid h-14 w-14 place-content-center rounded-full bg-[#C4907F]">
              <Check className="h-7 w-7 text-[#FFFCFB]" />
            </div>
            <h2 className="mt-6 font-display text-[26px] font-semibold tracking-tight text-[#1A1A1A]">
              Your session is booked
            </h2>
            <p className="mt-2 text-[14px] text-[#1A1A1A]/70">
              Check your email for the video call link.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between border-b border-[#EDE0DB] px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="grid h-12 w-12 place-content-center rounded-full bg-[#EDE0DB] font-display text-[16px] font-semibold text-[#1A1A1A]">
                    {initials}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-content-center rounded-full bg-[#C4907F] ring-2 ring-[#FFFCFB]">
                    <BadgeCheck className="h-3 w-3 text-[#FFFCFB]" />
                  </span>
                </div>
                <div>
                  <h2 className="font-display text-[20px] font-semibold leading-tight text-[#1A1A1A]">
                    Book {mentor.name}
                  </h2>
                  <p className="text-[13px] text-[#C4907F]">{mentor.university}</p>
                </div>
              </div>
              <button onClick={onClose} aria-label="Close booking" className="rounded-full p-1 text-[#1A1A1A]/60 hover:bg-[#EDE0DB] hover:text-[#1A1A1A]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6 px-6 py-6">
              <div>
                <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-[#1A1A1A]/70">
                  Select a date
                </label>
                <div className="relative">
                  <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1A1A]/40" />
                  <input
                    type="date"
                    min={todayISO()}
                    value={date}
                    onChange={(e) => { setDate(e.target.value); setSlot(null); }}
                    className="w-full rounded-xl border border-[#EDE0DB] bg-[#FFFCFB] py-2.5 pl-9 pr-3 text-[13px] text-[#1A1A1A] focus:border-[#C4907F] focus:outline-none focus:ring-2 focus:ring-[#C4907F]/20"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-[#1A1A1A]/70">
                  Available time slots
                </label>
                <div className="flex flex-wrap gap-2">
                  {SLOTS.map((s) => {
                    const selected = slot === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSlot(s)}
                        className={`rounded-full px-4 py-2 text-[13px] font-medium transition ${
                          selected
                            ? "bg-[#C4907F] text-[#FFFCFB]"
                            : "bg-[#EDE0DB] text-[#1A1A1A] hover:bg-[#E8C4B8]"
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl bg-[#EDE0DB] px-4 py-3 text-[13px] text-[#1A1A1A]">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#1A1A1A]/60">Duration</p>
                  <p className="mt-0.5 font-medium">{DURATION} minutes</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#1A1A1A]/60">Price</p>
                  <p className="mt-0.5 font-display text-[18px] font-semibold">₹{mentor.price.toLocaleString("en-IN")}</p>
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-[#EDE0DB] bg-[#FFFCFB] px-5 py-2.5 text-[13px] font-medium text-[#1A1A1A] hover:bg-[#EDE0DB]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={submitting || !slot}
                  className="rounded-full bg-[#C4907F] px-6 py-2.5 text-[13px] font-medium text-[#FFFCFB] transition hover:opacity-90 disabled:opacity-60"
                >
                  {submitting ? "Booking…" : "Confirm Booking"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
