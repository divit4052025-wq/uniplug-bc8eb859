import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { ErrorBanner } from "@/components/ui/error-banner";

type StudentRow = {
  id: string;
  full_name: string;
  grade: string;
  school: string;
  total: number;
  last: string | null;
};

// Roster of the mentor's students. "View Dashboard" navigates to the per-student
// page (/mentor-dashboard/students/$studentId) — the overview + notes + private
// notes that used to live in a modal are now their own route.
export function MyStudentsSection({ mentorId }: { mentorId: string }) {
  const {
    data: rows = [],
    isError,
    refetch,
  } = useQuery<StudentRow[]>({
    queryKey: ["my-students", mentorId],
    queryFn: async () => {
      const { data: sessions, error: bErr } = await supabase
        .from("bookings")
        .select("student_id, date")
        .eq("mentor_id", mentorId)
        .in("status", ["confirmed", "completed"])
        .order("date", { ascending: false });
      if (bErr) throw bErr;
      const list = sessions ?? [];
      const agg = new Map<string, { total: number; last: string }>();
      list.forEach((s) => {
        if (!s.student_id) return;
        const cur = agg.get(s.student_id);
        if (!cur) agg.set(s.student_id, { total: 1, last: s.date });
        else cur.total += 1;
      });
      const ids = Array.from(agg.keys());
      if (ids.length === 0) return [];
      const { data: studs, error: rpcErr } = await supabase.rpc("get_student_booking_names", {
        _ids: ids,
      });
      if (rpcErr) throw rpcErr;
      return (
        (studs ?? []) as { id: string; full_name: string; grade: string; school: string }[]
      ).map((s) => ({
        id: s.id,
        full_name: s.full_name,
        grade: s.grade,
        school: s.school,
        total: agg.get(s.id)?.total ?? 0,
        last: agg.get(s.id)?.last ?? null,
      }));
    },
  });

  return (
    <section id="section-students" className="scroll-mt-24">
      <h2 className="font-display text-[22px] font-semibold text-[#1A1A1A]">My Students</h2>
      {isError ? (
        <div className="mt-4">
          <ErrorBanner message="Couldn't load your students." onRetry={() => void refetch()} />
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-2">
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-[14px] font-light text-[#1A1A1A]/70">
              No students yet. Once a student books a session with you, they'll appear here.
            </p>
          ) : (
            <ul className="divide-y divide-[#EDE0DB]">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-[15px] font-medium text-[#1A1A1A]">{r.full_name}</p>
                    <p className="text-[12px] text-[#1A1A1A]/60">
                      {r.grade} · {r.school}
                    </p>
                    <p className="mt-1 text-[12px] text-[#1A1A1A]/60">
                      {r.total} session{r.total === 1 ? "" : "s"}
                      {r.last
                        ? ` · last ${new Date(r.last + "T00:00:00").toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                  <Link
                    to="/mentor-dashboard/students/$studentId"
                    params={{ studentId: r.id }}
                    className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[#C4907F] px-4 text-[12px] font-medium text-white transition hover:opacity-90"
                  >
                    View Dashboard
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
