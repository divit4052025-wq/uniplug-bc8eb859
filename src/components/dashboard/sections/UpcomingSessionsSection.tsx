import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { ErrorBanner } from "@/components/ui/error-banner";
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
      const { data: mentors, error: rpcErr } = await supabase.rpc(
        "get_mentor_booking_names",
        { _ids: ids },
      );
      if (rpcErr) throw rpcErr;
      const names = new Map(
        ((mentors ?? []) as { id: string; full_name: string }[]).map((m) => [
          m.id,
          m.full_name,
        ]),
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
              <p className="text-[15px] font-light text-[#1A1A1A]">No upcoming sessions — book one now</p>
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
                <li
                  key={r.id}
                  className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-[15px] font-medium text-[#1A1A1A]">{r.mentorName}</p>
                    <p className="mt-1 text-[12px] text-[#1A1A1A]/60">
                      {formatBookingDate(r.date)} · {r.time_slot}
                    </p>
                  </div>
                  <a
                    href="#"
                    className="inline-flex h-9 items-center justify-center rounded-full bg-[#C4907F] px-4 text-[12px] font-medium text-white hover:opacity-90"
                  >
                    Join Call
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
