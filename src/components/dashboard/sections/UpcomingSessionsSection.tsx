import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { generatePrepQuestions } from "@/lib/ai/prep-questions.functions";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/state-views";
import { useOptimisticMutation } from "@/lib/hooks/useOptimisticMutation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatBookingDate, hoursUntilStartIST, isBookingEnded, todayInIST } from "@/lib/time";

type BookingRow = {
  id: string;
  mentor_id: string;
  date: string;
  time_slot: string;
  duration: number;
  reschedule_count: number;
  mentorName: string;
};

// Server limits (mirrored for honest UI gating; cancel_booking_as_student /
// reschedule_booking remain the authority and re-check everything).
const MAX_RESCHEDULES = 2;
const RESCHEDULE_LEAD_HOURS = 12;

const upcomingKey = (studentId: string) => ["upcoming-sessions", "student", studentId] as const;
const calendarKey = (mentorId: string) => ["mentor-calendar", mentorId] as const;

export function UpcomingSessionsSection({ studentId }: { studentId: string }) {
  const queryKey = upcomingKey(studentId);
  const {
    data: rows = [],
    isError,
    refetch,
  } = useQuery<BookingRow[]>({
    queryKey,
    queryFn: async () => {
      const today = todayInIST();
      const { data, error } = await supabase
        .from("bookings")
        // Only the columns this surface needs. NEVER select(*) on bookings — the
        // row also carries razorpay_order_id / razorpay_payment_id / payout_id,
        // which must never reach the browser (bookings has no column-lock).
        .select("id, mentor_id, date, time_slot, duration, reschedule_count")
        .eq("student_id", studentId)
        .eq("status", "confirmed")
        .gte("date", today)
        .order("date", { ascending: true })
        .order("time_slot", { ascending: true });
      if (error) throw error;
      const bookings = (data ?? []).filter(
        (
          b,
        ): b is {
          id: string;
          mentor_id: string;
          date: string;
          time_slot: string;
          duration: number;
          reschedule_count: number;
        } => !!b.mentor_id && !isBookingEnded(b.date, b.time_slot, b.duration),
      );
      const ids = Array.from(new Set(bookings.map((b) => b.mentor_id)));
      if (ids.length === 0) return [];
      const { data: mentors, error: rpcErr } = await supabase.rpc("get_mentor_booking_names", {
        _ids: ids,
      });
      if (rpcErr) throw rpcErr;
      const names = new Map(
        ((mentors ?? []) as { id: string; full_name: string }[]).map((m) => [m.id, m.full_name]),
      );
      return bookings.map((b) => ({
        ...b,
        mentorName: names.get(b.mentor_id) ?? "Mentor",
      }));
    },
  });

  return (
    <section id="section-sessions" className="scroll-mt-24">
      <h2 className="font-display text-[22px] font-semibold text-[#1A1A1A]">Upcoming Sessions</h2>
      {isError ? (
        <div className="mt-4">
          <ErrorBanner
            message="Couldn't load your upcoming sessions."
            onRetry={() => void refetch()}
          />
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-2">
          {rows.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-[15px] font-light text-[#1A1A1A]">
                No upcoming sessions — book one now
              </p>
              <a
                href="/browse"
                className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-[#C4907F] px-6 text-[13px] font-medium text-white transition hover:opacity-90"
              >
                Find a Plug
              </a>
            </div>
          ) : (
            <ul className="divide-y divide-[#EDE0DB]">
              {rows.map((r) => (
                <li key={r.id} data-testid="upcoming-session-card" className="px-4 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[15px] font-medium text-[#1A1A1A]">{r.mentorName}</p>
                      <p className="mt-1 text-[12px] text-[#1A1A1A]/60">
                        {formatBookingDate(r.date)} · {r.time_slot}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        to="/messages"
                        search={{ peer: r.mentor_id, peerName: r.mentorName }}
                        className="inline-flex h-9 items-center justify-center rounded-full border border-[#1A1A1A]/15 px-4 text-[12px] font-medium text-[#1A1A1A] hover:border-[#C4907F] hover:text-[#C4907F]"
                      >
                        Message
                      </Link>
                      <RescheduleButton booking={r} studentId={studentId} />
                      <CancelButton booking={r} studentId={studentId} />
                      <Link
                        to="/call/$bookingId"
                        params={{ bookingId: r.id }}
                        className="inline-flex h-9 items-center justify-center rounded-full bg-[#C4907F] px-4 text-[12px] font-medium text-white hover:opacity-90"
                      >
                        Join Call
                      </Link>
                    </div>
                  </div>
                  <PrepQuestions bookingId={r.id} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

type CancelResult = { tier: string; refundable_inr: number; captured_inr: number };

/**
 * Cancel a confirmed session. The student is shown the refund tier BEFORE
 * confirming (full ≥24h, 50% 2–24h, none <2h) — but the displayed amount comes
 * back from cancel_booking_as_student, which scales it from the immutable
 * captured-ledger amount and is the sole authority.
 */
function CancelButton({ booking, studentId }: { booking: BookingRow; studentId: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const hours = hoursUntilStartIST(booking.date, booking.time_slot);
  const refundHint =
    hours >= 24
      ? "You'll receive a full refund."
      : hours >= 2
        ? "This session is less than 24 hours away, so you'll receive a 50% refund."
        : "This session is less than 2 hours away, so no refund is available.";

  const cancel = useOptimisticMutation<BookingRow[], void, CancelResult>({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("cancel_booking_as_student", {
        _booking_id: booking.id,
      });
      if (error) throw error;
      return data as unknown as CancelResult;
    },
    queryKeys: [upcomingKey(studentId)],
    // Cancellation moves the booking out of 'confirmed', so it leaves this list.
    optimisticUpdate: (old) => (old ?? []).filter((b) => b.id !== booking.id),
    errorMessage: (err) => (err instanceof Error ? err.message : "Couldn't cancel this session."),
    mutationOptions: {
      onSuccess: (data) => {
        setOpen(false);
        const refundable = data?.refundable_inr ?? 0;
        toast.success(
          refundable > 0
            ? `Session cancelled — ₹${refundable.toLocaleString("en-IN")} will be refunded.`
            : "Session cancelled.",
        );
        // The freed slot becomes bookable again on the mentor's calendar.
        void qc.invalidateQueries({ queryKey: calendarKey(booking.mentor_id) });
      },
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center rounded-full border border-border px-4 text-[12px] font-medium text-foreground transition hover:border-destructive hover:text-destructive"
        >
          Cancel
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this session?</AlertDialogTitle>
          <AlertDialogDescription>
            {formatBookingDate(booking.date)} · {booking.time_slot} with {booking.mentorName}.{" "}
            {refundHint}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cancel.isPending}>Keep session</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              cancel.mutate();
            }}
            disabled={cancel.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {cancel.isPending ? "Cancelling…" : "Cancel session"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type CalSlot = { date: string; time_slot: string; state: "available" | "booked" };

function isCalSlot(v: unknown): v is CalSlot {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.date === "string" &&
    typeof o.time_slot === "string" &&
    (o.state === "available" || o.state === "booked")
  );
}

/**
 * Reschedule a confirmed session. Reuses get_mentor_calendar for the available
 * slots and calls reschedule_booking, which re-validates lead time (≥12h),
 * the reschedule cap (≤2), and that the new slot covers the booking's duration.
 */
function RescheduleButton({ booking, studentId }: { booking: BookingRow; studentId: string }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<{ date: string; time_slot: string } | null>(null);
  const qc = useQueryClient();

  const atLimit = booking.reschedule_count >= MAX_RESCHEDULES;
  const tooLate = hoursUntilStartIST(booking.date, booking.time_slot) < RESCHEDULE_LEAD_HOURS;
  const blockedReason = atLimit
    ? "This session has already been rescheduled the maximum of two times."
    : tooLate
      ? "Reschedules must be requested at least 12 hours before the session."
      : null;

  const {
    data: slots = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<CalSlot[]>({
    queryKey: calendarKey(booking.mentor_id),
    enabled: open && !blockedReason,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_mentor_calendar", {
        _mentor_id: booking.mentor_id,
      });
      if (error) throw error;
      return (Array.isArray(data) ? (data as unknown[]) : []).filter(isCalSlot);
    },
  });

  // Open slots only, excluding the booking's current slot, grouped by date.
  const days = useMemo(() => {
    const map = new Map<string, CalSlot[]>();
    for (const s of slots) {
      if (s.state !== "available") continue;
      if (s.date === booking.date && s.time_slot === booking.time_slot) continue;
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([date, list]) => ({
        date,
        slots: [...list].sort((x, y) => x.time_slot.localeCompare(y.time_slot)),
      }));
  }, [slots, booking.date, booking.time_slot]);

  const reschedule = useOptimisticMutation<
    BookingRow[],
    { date: string; time_slot: string },
    string
  >({
    mutationFn: async (vars) => {
      const { data, error } = await supabase.rpc("reschedule_booking", {
        _booking_id: booking.id,
        _new_date: vars.date,
        _new_time_slot: vars.time_slot,
      });
      if (error) throw error;
      return data as string;
    },
    queryKeys: [upcomingKey(studentId)],
    optimisticUpdate: (old, vars) =>
      (old ?? []).map((b) =>
        b.id === booking.id
          ? {
              ...b,
              date: vars.date,
              time_slot: vars.time_slot,
              reschedule_count: b.reschedule_count + 1,
            }
          : b,
      ),
    errorMessage: (err) =>
      err instanceof Error ? err.message : "Couldn't reschedule this session.",
    mutationOptions: {
      onSuccess: () => {
        setOpen(false);
        setPicked(null);
        toast.success("Session rescheduled.");
        void qc.invalidateQueries({ queryKey: calendarKey(booking.mentor_id) });
      },
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setPicked(null);
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center rounded-full border border-border px-4 text-[12px] font-medium text-foreground transition hover:border-primary hover:bg-secondary"
        >
          Reschedule
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reschedule session</DialogTitle>
          <DialogDescription>
            Currently {formatBookingDate(booking.date)} · {booking.time_slot} with{" "}
            {booking.mentorName}. Pick a new time below.
          </DialogDescription>
        </DialogHeader>

        {blockedReason ? (
          <p className="py-4 text-[14px] font-light text-foreground/80">{blockedReason}</p>
        ) : isLoading ? (
          <div className="py-2">
            <LoadingSkeleton rows={3} ariaLabel="Loading availability" />
          </div>
        ) : isError ? (
          <ErrorBanner message="Couldn't load availability." onRetry={() => void refetch()} />
        ) : days.length === 0 ? (
          <p className="py-4 text-[14px] font-light text-foreground/80">
            No open times in the next 30 days. Please try again later.
          </p>
        ) : (
          <div className="space-y-5 py-1">
            {days.map(({ date, slots: daySlots }) => (
              <div key={date}>
                <h4 className="font-display text-[15px] font-semibold text-foreground">
                  {formatBookingDate(date)}
                </h4>
                <div className="mt-2 flex flex-wrap gap-2">
                  {daySlots.map((slot) => {
                    const isPicked =
                      picked?.date === slot.date && picked?.time_slot === slot.time_slot;
                    return (
                      <button
                        key={`${slot.date}-${slot.time_slot}`}
                        type="button"
                        aria-pressed={isPicked}
                        onClick={() => setPicked({ date: slot.date, time_slot: slot.time_slot })}
                        className={
                          isPicked
                            ? "inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground"
                            : "inline-flex h-10 items-center justify-center rounded-full border border-primary bg-background px-4 text-[13px] font-medium text-foreground transition hover:bg-brand-blush"
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
        )}

        {!blockedReason && (
          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={reschedule.isPending}
              className="inline-flex h-10 items-center justify-center rounded-full border border-border px-5 text-[13px] font-medium text-foreground transition hover:bg-secondary disabled:opacity-60"
            >
              Keep current time
            </button>
            <button
              type="button"
              disabled={!picked || reschedule.isPending}
              onClick={() => picked && reschedule.mutate(picked)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-5 text-[13px] font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {reschedule.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {reschedule.isPending ? "Rescheduling…" : "Confirm new time"}
            </button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Phase D1 UI: "Prepare for this session" — calls generatePrepQuestions on
 * demand (button-triggered, not auto-loaded: auto-loading would generate +
 * rate-limit-charge AI questions for every upcoming booking a student never
 * opens). A cache hit returns instantly; a miss generates and caches. The
 * server-fn returns { ok: false, reason } for business failures rather than
 * throwing, so we branch on the result, never crash, never hang.
 */
function PrepQuestions({ bookingId }: { bookingId: string }) {
  const prep = useMutation({
    mutationFn: async () => generatePrepQuestions({ data: { bookingId } }),
  });

  const result = prep.data;
  const failed = prep.isError || (result && !result.ok);

  return (
    <div className="mt-3 border-t border-border pt-3">
      {prep.isIdle && (
        <button
          type="button"
          onClick={() => prep.mutate()}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3.5 text-[12px] font-medium text-foreground transition hover:border-primary hover:text-primary"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          Prepare for this session
        </button>
      )}

      {prep.isPending && (
        <div>
          <p className="mb-2 text-[12px] font-medium text-muted-foreground">
            Generating prep questions…
          </p>
          <LoadingSkeleton rows={3} ariaLabel="Generating prep questions" />
        </div>
      )}

      {!prep.isPending && failed && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[12px] font-light text-muted-foreground">
            Couldn&apos;t generate prep questions right now — try again later.
          </p>
          <button
            type="button"
            onClick={() => prep.mutate()}
            className="text-[12px] font-semibold text-primary underline underline-offset-2 hover:opacity-80"
          >
            Try again
          </button>
        </div>
      )}

      {!prep.isPending && result?.ok && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Prepare for this session
          </p>
          <ul className="space-y-1.5">
            {result.questions.map((q, i) => (
              <li key={i} className="flex gap-2 text-[13px] font-light text-foreground/85">
                <span className="select-none text-primary">{i + 1}.</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
