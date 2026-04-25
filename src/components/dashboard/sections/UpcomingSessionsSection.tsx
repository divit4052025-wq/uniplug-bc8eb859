import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type BookingRow = {
  id: string;
  mentor_id: string;
  date: string;
  time_slot: string;
  mentorName: string;
};

export function UpcomingSessionsSection({ studentId }: { studentId: string }) {
  const [rows, setRows] = useState<BookingRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await (supabase as any)
        .from("bookings")
        .select("id, mentor_id, date, time_slot")
        .eq("student_id", studentId)
        .eq("status", "confirmed")
        .gte("date", today)
        .order("date", { ascending: true })
        .order("time_slot", { ascending: true });
      const bookings = data ?? [];
      const ids = Array.from(new Set(bookings.map((b: { mentor_id: string }) => b.mentor_id)));
      const { data: mentors } = ids.length
        ? await (supabase as any).rpc("get_mentor_booking_names", { _ids: ids })
        : { data: [] };
      if (cancelled) return;
      const names = new Map((mentors ?? []).map((m: { id: string; full_name: string }) => [m.id, m.full_name]));
      setRows(bookings.map((b: { id: string; mentor_id: string; date: string; time_slot: string }) => ({
        ...b,
        mentorName: names.get(b.mentor_id) ?? "Mentor",
      })));
    };
    void load();
    return () => { cancelled = true; };
  }, [studentId]);

  return (
    <section id="section-sessions" className="scroll-mt-24">
      <h2 className="font-display text-[22px] font-semibold text-[#1A1A1A]">Upcoming Sessions</h2>
      <div className="mt-4 rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-2">
        {rows.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-[15px] font-light text-[#1A1A1A]">No upcoming sessions — book one now</p>
            <a href="/browse" className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-[#C4907F] px-6 text-[13px] font-medium text-white transition hover:opacity-90">Find a Plug</a>
          </div>
        ) : (
          <ul className="divide-y divide-[#EDE0DB]">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[15px] font-medium text-[#1A1A1A]">{r.mentorName}</p>
                  <p className="mt-1 text-[12px] text-[#1A1A1A]/60">
                    {new Date(`${r.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · {r.time_slot}
                  </p>
                </div>
                <a href="#" className="inline-flex h-9 items-center justify-center rounded-full bg-[#C4907F] px-4 text-[12px] font-medium text-white hover:opacity-90">Join Call</a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
