import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { generatePrepQuestions } from "@/lib/ai/prep-questions.functions";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/state-views";
import { formatBookingDate, isBookingEnded, todayInIST } from "@/lib/time";

type BookingRow = {
  id: string;
  mentor_id: string;
  date: string;
  time_slot: string;
  mentorName: string;
};

export function UpcomingSessionsSection({ studentId }: { studentId: string }) {
  const {
    data: rows = [],
    isError,
    refetch,
  } = useQuery<BookingRow[]>({
    queryKey: ["upcoming-sessions", "student", studentId],
    queryFn: async () => {
      const today = todayInIST();
      const { data, error } = await supabase
        .from("bookings")
        .select("id, mentor_id, date, time_slot")
        .eq("student_id", studentId)
        .eq("status", "confirmed")
        .gte("date", today)
        .order("date", { ascending: true })
        .order("time_slot", { ascending: true });
      if (error) throw error;
      const bookings = (data ?? []).filter(
        (b): b is { id: string; mentor_id: string; date: string; time_slot: string } =>
          !!b.mentor_id && !isBookingEnded(b.date, b.time_slot),
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
                <li key={r.id} className="px-4 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[15px] font-medium text-[#1A1A1A]">{r.mentorName}</p>
                      <p className="mt-1 text-[12px] text-[#1A1A1A]/60">
                        {formatBookingDate(r.date)} · {r.time_slot}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        to="/messages"
                        search={{ peer: r.mentor_id, peerName: r.mentorName }}
                        className="inline-flex h-9 items-center justify-center rounded-full border border-[#1A1A1A]/15 px-4 text-[12px] font-medium text-[#1A1A1A] hover:border-[#C4907F] hover:text-[#C4907F]"
                      >
                        Message
                      </Link>
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
