import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { startOfMonth } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { createBookingOrder } from "@/lib/payments/order.functions";
import { openRazorpayCheckout } from "@/lib/payments/checkout";
import { formatBookingDate, todayInIST } from "@/lib/time";
import { Calendar } from "@/components/ui/calendar";

// Self-contained mentor booking picker: a month calendar → pick a day → pick a
// 30- or 60-minute slot → confirm. Consumes get_mentor_calendar (which already
// emits :00/:30 sub-slots with availability state) — no new RPC. Duration is
// threaded to createBookingOrder; the SERVER computes the scaled price (this
// component's price is display-only). Reusable: the reschedule flow has the same
// shape and may adopt this later (not wired here).

type CalendarSlot = {
  date: string; // "YYYY-MM-DD" (IST calendar day)
  time_slot: string; // "HH:MM"
  state: "available" | "booked";
};
type Duration = 30 | 60;

type MentorCalendarProps = {
  mentorId: string;
  mentorName: string;
  pricePerSessionInr: number; // the 60-min base price; 30-min is derived
};

function isCalendarSlot(value: unknown): value is CalendarSlot {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.date === "string" &&
    typeof v.time_slot === "string" &&
    (v.state === "available" || v.state === "booked")
  );
}

// Date <-> "YYYY-MM-DD" using LOCAL calendar fields. The slot dates are plain IST
// calendar days; we never round-trip through UTC (toISOString) which could shift
// the day.
function dateToStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
function strToDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
// The HH:MM slot `mins` minutes later, same day. "" if it rolls past midnight
// (a 60-min start at 23:30 would need 00:00 the next day — not coverable).
function slotPlus(timeSlot: string, mins: number): string {
  const [h, m] = timeSlot.split(":").map(Number);
  const total = h * 60 + m + mins;
  if (total >= 24 * 60) return "";
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export default function MentorCalendar({
  mentorId,
  mentorName,
  pricePerSessionInr,
}: MentorCalendarProps) {
  const qc = useQueryClient();
  const calendarKey = ["mentor-calendar", mentorId] as const;

  const [duration, setDuration] = useState<Duration>(30);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);

  const {
    data: slots = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<CalendarSlot[]>({
    queryKey: calendarKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_mentor_calendar", { _mentor_id: mentorId });
      if (error) throw error;
      if (!Array.isArray(data)) return [];
      return (data as unknown[]).filter(isCalendarSlot);
    },
  });

  // Index by date; per date keep the ordered slot list + the set of AVAILABLE
  // times (for the 60-min consecutive-coverage check).
  const { byDate, availByDate, datesWithAvail } = useMemo(() => {
    const byDate = new Map<string, CalendarSlot[]>();
    const availByDate = new Map<string, Set<string>>();
    for (const s of slots) {
      const list = byDate.get(s.date) ?? [];
      list.push(s);
      byDate.set(s.date, list);
      if (s.state === "available") {
        const set = availByDate.get(s.date) ?? new Set<string>();
        set.add(s.time_slot);
        availByDate.set(s.date, set);
      }
    }
    for (const list of byDate.values()) list.sort((a, b) => a.time_slot.localeCompare(b.time_slot));
    const datesWithAvail = new Set(availByDate.keys());
    return { byDate, availByDate, datesWithAvail };
  }, [slots]);

  // A start slot is bookable for the chosen duration iff it's available and (for
  // 60-min) the consecutive :30 sub-slot is also available (so the full hour is
  // open). book_session re-checks authoritatively.
  const slotFits = (date: string, time: string): boolean => {
    const avail = availByDate.get(date);
    if (!avail || !avail.has(time)) return false;
    if (duration === 30) return true;
    const next = slotPlus(time, 30);
    return next !== "" && avail.has(next);
  };

  const priceFor = (d: Duration) => Math.round((pricePerSessionInr * d) / 60);

  const onPickDuration = (d: Duration) => {
    setDuration(d);
    // A selected slot that no longer fits the new duration is cleared.
    if (selectedSlot && selectedDate) {
      const next = d === 60 ? slotPlus(selectedSlot, 30) : "";
      const fits =
        d === 30
          ? availByDate.get(selectedDate)?.has(selectedSlot)
          : next !== "" && availByDate.get(selectedDate)?.has(next);
      if (!fits) setSelectedSlot(null);
    }
    setSubmitError(null);
  };

  const onPickSlot = (time: string) => {
    if (!selectedDate || !slotFits(selectedDate, time)) return;
    setSubmitError(null);
    setNeedsAuth(false);
    setSelectedSlot((prev) => (prev === time ? null : time));
  };

  const daySlots = selectedDate ? (byDate.get(selectedDate) ?? []) : [];

  // Calendar month bounds derived from the data window.
  const today = todayInIST();
  const sortedDates = useMemo(() => Array.from(datesWithAvail).sort(), [datesWithAvail]);
  const defaultMonth = startOfMonth(strToDate(sortedDates[0] ?? today));
  const startMonth = startOfMonth(strToDate(today));
  const endMonth = startOfMonth(strToDate(sortedDates[sortedDates.length - 1] ?? today));

  const confirmMutation = useMutation({
    mutationFn: async (args: { date: string; timeSlot: string; duration: Duration }) => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.user.id) return { needsAuth: true as const };

      const result = await createBookingOrder({
        data: {
          mentorId,
          date: args.date,
          timeSlot: args.timeSlot,
          duration: args.duration,
        },
      });
      if (!result.ok) throw new Error(result.reason ?? "Could not start payment.");

      if (result.confirmed) return { needsAuth: false as const, confirmed: true as const };

      await openRazorpayCheckout({
        keyId: result.keyId,
        orderId: result.orderId,
        amount: result.amount,
        prefill: { email: sessionData.session?.user.email ?? undefined },
        onProcessing: () => {
          toast.success("Payment received — you'll get a confirmation email shortly.");
          setSelectedSlot(null);
          void qc.invalidateQueries({ queryKey: calendarKey });
        },
        onDismiss: () => void qc.invalidateQueries({ queryKey: calendarKey }),
      });
      return { needsAuth: false as const, confirmed: false as const };
    },
    onSuccess: (result) => {
      if (result?.needsAuth) {
        setNeedsAuth(true);
        return;
      }
      if (result?.confirmed) toast.success("Session booked.");
      setSelectedSlot(null);
      void qc.invalidateQueries({ queryKey: calendarKey });
    },
    onError: (err) => {
      setSubmitError(err instanceof Error ? err.message : "Could not book session.");
    },
  });

  const onConfirm = () => {
    if (!selectedDate || !selectedSlot) return;
    setSubmitError(null);
    setNeedsAuth(false);
    confirmMutation.mutate({ date: selectedDate, timeSlot: selectedSlot, duration });
  };

  return (
    <div className="rounded-3xl border border-[#EDE0DB] bg-[#FFFCFB] p-6 shadow-[0_20px_40px_-20px_rgba(26,26,26,0.15)]">
      <h3 className="font-display text-[20px] font-semibold text-[#1A1A1A]">Book a session</h3>
      <p className="mt-1 text-[12px] text-[#1A1A1A]/60">
        Pick a day, then a time. Showing the next 30 days.
      </p>

      {/* Duration toggle */}
      <div className="mt-4 inline-flex rounded-full border border-[#EDE0DB] bg-[#FFFCFB] p-1">
        {([30, 60] as Duration[]).map((d) => {
          const on = duration === d;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              onClick={() => onPickDuration(d)}
              className={
                on
                  ? "inline-flex h-10 items-center rounded-full bg-[#1A1A1A] px-4 text-[12px] font-medium text-[#FFFCFB] transition"
                  : "inline-flex h-10 items-center rounded-full px-4 text-[12px] font-medium text-[#1A1A1A]/70 transition hover:text-[#1A1A1A]"
              }
            >
              {d} min · ₹{priceFor(d).toLocaleString("en-IN")}
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        {isLoading && (
          <div className="flex justify-center py-10" aria-label="Loading calendar">
            <Loader2 className="h-6 w-6 animate-spin text-[#C4907F]" />
          </div>
        )}

        {!isLoading && isError && (
          <div>
            <p className="text-[13px] text-[#1A1A1A]/70">Calendar unavailable right now.</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-2 text-[12px] font-semibold text-[#C4907F] underline underline-offset-2 hover:opacity-80"
            >
              Try again
            </button>
          </div>
        )}

        {!isLoading && !isError && datesWithAvail.size === 0 && (
          <p className="text-[13px] text-[#1A1A1A]/70">No availability in the next 30 days.</p>
        )}

        {!isLoading && !isError && datesWithAvail.size > 0 && (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            {/* Month calendar */}
            <div className="shrink-0">
              <Calendar
                mode="single"
                defaultMonth={defaultMonth}
                startMonth={startMonth}
                endMonth={endMonth}
                selected={selectedDate ? strToDate(selectedDate) : undefined}
                onSelect={(d) => {
                  if (!d) return;
                  setSelectedDate(dateToStr(d));
                  setSelectedSlot(null);
                  setSubmitError(null);
                }}
                disabled={(d) => !datesWithAvail.has(dateToStr(d))}
                modifiers={{ hasSlots: (d) => datesWithAvail.has(dateToStr(d)) }}
                modifiersClassNames={{
                  hasSlots:
                    "relative font-medium after:absolute after:bottom-[3px] after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-[#C4907F] after:content-['']",
                }}
              />
            </div>

            {/* Slots for the selected day */}
            <div className="min-w-0 flex-1">
              {!selectedDate ? (
                <p className="text-[13px] text-[#1A1A1A]/60">
                  Select a highlighted day to see open times.
                </p>
              ) : (
                <>
                  <h4 className="font-display text-[16px] font-semibold text-[#1A1A1A]">
                    {formatBookingDate(selectedDate)}
                  </h4>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {daySlots.map((slot) => {
                      const key = `${slot.date}-${slot.time_slot}`;
                      if (slot.state === "booked") {
                        return (
                          <span
                            key={key}
                            aria-disabled
                            className="inline-flex h-11 cursor-not-allowed items-center justify-center rounded-full bg-[#EDE0DB] px-4 text-[13px] font-medium text-[#1A1A1A]/50"
                          >
                            {slot.time_slot} · Booked
                          </span>
                        );
                      }
                      const fits = slotFits(slot.date, slot.time_slot);
                      if (!fits) {
                        return (
                          <span
                            key={key}
                            aria-disabled
                            aria-label={`${slot.time_slot} — not enough open time for a 60-minute session`}
                            title="Not enough open time for a 60-minute session"
                            className="inline-flex h-11 cursor-not-allowed items-center justify-center gap-1 rounded-full border border-dashed border-[#EDE0DB] px-4 text-[13px] font-medium text-[#1A1A1A]/45"
                          >
                            {slot.time_slot}
                            <span className="text-[11px] font-normal">· no 60-min</span>
                          </span>
                        );
                      }
                      const isSelected = selectedSlot === slot.time_slot;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => onPickSlot(slot.time_slot)}
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
                  {daySlots.length > 0 &&
                    duration === 60 &&
                    !daySlots.some(
                      (s) => s.state === "available" && slotFits(s.date, s.time_slot),
                    ) && (
                      <p className="mt-3 text-[12px] text-[#1A1A1A]/60">
                        No 60-minute slots open on this day — try 30 minutes.
                      </p>
                    )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {selectedDate && selectedSlot && (
        <div className="mt-6 border-t border-[#EDE0DB] pt-5">
          <p className="text-[14px] leading-relaxed text-[#1A1A1A]">
            Booking a <span className="font-medium">{duration}-minute</span> session at{" "}
            <span className="font-medium">{selectedSlot}</span> on{" "}
            <span className="font-medium">{formatBookingDate(selectedDate)}</span> with{" "}
            <span className="font-medium">{mentorName}</span> for{" "}
            <span className="font-medium">₹{priceFor(duration).toLocaleString("en-IN")}</span>.
          </p>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmMutation.isPending}
            className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#1A1A1A] px-6 font-display text-[14px] font-semibold text-[#FFFCFB] transition hover:opacity-90 disabled:opacity-60 sm:w-auto sm:px-10"
          >
            {confirmMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirmMutation.isPending ? "Confirming…" : "Confirm Booking"}
          </button>

          {submitError && <p className="mt-3 text-[13px] text-destructive">{submitError}</p>}
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
