import { useEffect, useState } from "react";
import { X, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  id: string;
  date: string;
  time_slot: string;
  student_id: string;
  student?: {
    full_name: string;
    grade: string;
    school: string;
  };
};

type Document = { id: string; file_name: string };
type School = { id: string; name: string; category: string };

export function MentorUpcomingSessions({ mentorId }: { mentorId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [profile, setProfile] = useState<{
    name: string;
    grade: string;
    school: string;
    docs: Document[];
    schools: School[];
  } | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorId]);

  const load = async () => {
    const { data } = await (supabase as any)
      .from("bookings")
      .select("id, date, time_slot, student_id")
      .eq("mentor_id", mentorId)
      .eq("status", "confirmed")
      .order("date", { ascending: true })
      .order("time_slot", { ascending: true });
    const bookings = data ?? [];
    const ids = Array.from(new Set(bookings.map((s: { student_id: string }) => s.student_id)));
    const studMap = new Map<string, { full_name: string; grade: string; school: string }>();
    if (ids.length) {
      const { data: studs } = await (supabase as any).rpc("get_student_booking_names", { _ids: ids });
      (studs ?? []).forEach((s: { id: string; full_name: string; grade: string; school: string }) => studMap.set(s.id, { full_name: s.full_name, grade: s.grade, school: s.school }));
    }
    setRows(
      bookings.map((s: { id: string; date: string; time_slot: string; student_id: string }) => ({
        id: s.id,
        date: s.date,
        time_slot: s.time_slot,
        student_id: s.student_id,
        student: studMap.get(s.student_id),
      }))
    );
  };

  const openProfile = async (studentId: string, name: string, grade: string, school: string) => {
    const { data } = await (supabase as any).rpc("get_student_overview_for_mentor", {
      _student_id: studentId,
    });
    const result = (data as any[])?.[0];
    setProfile({
      name,
      grade,
      school,
      docs: result?.documents ?? [],
      schools: result?.schools ?? [],
    });
  };

  return (
    <section id="section-upcoming" className="scroll-mt-24">
      <h2 className="font-display text-[22px] font-semibold text-[#1A1A1A]">Upcoming Sessions</h2>
      <div className="mt-4 rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-2">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[14px] font-light text-[#1A1A1A]/70">
            No upcoming sessions yet.
          </p>
        ) : (
          <ul className="divide-y divide-[#EDE0DB]">
            {rows.map((r) => {
              const dt = new Date(`${r.date}T00:00:00`);
              return (
                <li
                  key={r.id}
                  className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-[15px] font-medium text-[#1A1A1A]">
                      {r.student?.full_name ?? "Student"}
                    </p>
                    <p className="text-[12px] text-[#1A1A1A]/60">
                      {r.student?.grade} · {r.student?.school}
                    </p>
                    <p className="mt-1 text-[12px] text-[#1A1A1A]/60">
                      {dt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · {r.time_slot}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        openProfile(
                          r.student_id,
                          r.student?.full_name ?? "Student",
                          r.student?.grade ?? "",
                          r.student?.school ?? ""
                        )
                      }
                      className="inline-flex h-9 items-center justify-center rounded-full border border-[#1A1A1A]/15 px-4 text-[12px] font-medium text-[#1A1A1A] hover:border-[#C4907F] hover:text-[#C4907F]"
                    >
                      View Profile
                    </button>
                    <a
                      href="#"
                      className="inline-flex h-9 items-center justify-center rounded-full bg-[#C4907F] px-4 text-[12px] font-medium text-white hover:opacity-90"
                    >
                      Join Call
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {profile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-[#1A1A1A]/40" onClick={() => setProfile(null)} />
          <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[#FFFCFB] p-6 shadow-2xl">
            <button
              onClick={() => setProfile(null)}
              aria-label="Close"
              className="absolute right-4 top-4 rounded-full p-1.5 text-[#1A1A1A]/60 hover:bg-[#EDE0DB]"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="font-display text-[22px] font-semibold text-[#1A1A1A]">{profile.name}</h3>
            <p className="text-[12px] text-[#1A1A1A]/60">{profile.grade} · {profile.school}</p>

            <div className="mt-5">
              <p className="text-[13px] font-medium text-[#1A1A1A]">School List</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {profile.schools.length === 0 && (
                  <p className="text-[12px] text-[#1A1A1A]/50">None added.</p>
                )}
                {profile.schools.map((s) => (
                  <span
                    key={s.id}
                    className="rounded-full bg-[#EDE0DB] px-3 py-1 text-[12px] text-[#1A1A1A]"
                  >
                    {s.name} <span className="opacity-50">· {s.category}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <p className="text-[13px] font-medium text-[#1A1A1A]">Documents</p>
              <ul className="mt-2 space-y-1.5">
                {profile.docs.length === 0 && (
                  <p className="text-[12px] text-[#1A1A1A]/50">No documents shared.</p>
                )}
                {profile.docs.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center gap-2 text-[13px] text-[#1A1A1A]"
                  >
                    <FileText className="h-4 w-4 text-[#C4907F]" />
                    {d.file_name}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}