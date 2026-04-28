import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// day_of_week: 0=Mon..6=Sun (we use ISO-like ordering)
const HOURS = Array.from({ length: 15 }, (_, i) => 8 + i); // 8..22

type Slot = { day_of_week: number; start_hour: number };
type Booking = {
  date: string;
  time_slot: string;
  student_name: string;
};

function startOfWeekMonday(d: Date) {
  const day = (d.getDay() + 6) % 7; // 0=Mon..6=Sun
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - day);
  return out;
}

export function ScheduleSection({ mentorId }: { mentorId: string }) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    void loadAvailability();
    void loadBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorId]);

  const loadAvailability = async () => {
    const { data } = await supabase
      .from("mentor_availability")
      .select("day_of_week,start_hour")
      .eq("mentor_id", mentorId);
    setSlots((data ?? []) as Slot[]);
  };

  const loadBookings = async () => {
    const weekStart = startOfWeekMonday(new Date());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekStartStr = weekStart.toISOString().slice(0, 10);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);
    const { data } = await (supabase as any)
      .from("bookings")
      .select("date, time_slot, student_id")
      .eq("mentor_id", mentorId)
      .in("status", ["confirmed", "pending"])
      .gte("date", weekStartStr)
      .lt("date", weekEndStr);
    const rows = data ?? [];
    const ids = Array.from(new Set(rows.map((r: { student_id: string }) => r.student_id)));
    let nameMap = new Map<string, string>();
    if (ids.length) {
      const { data: studs } = await (supabase as any)
        .rpc("get_student_booking_names", { _ids: ids });
      (studs ?? []).forEach((s: { id: string; full_name: string }) => nameMap.set(s.id, s.full_name));
    }
    const list: Booking[] = rows.map((r: { date: string; time_slot: string; student_id: string }) => ({
      date: r.date,
      time_slot: r.time_slot,
      student_name: nameMap.get(r.student_id) ?? "Student",
    }));
    setBookings(list);
  };

  const slotSet = useMemo(
    () => new Set(slots.map((s) => `${s.day_of_week}-${s.start_hour}`)),
    [slots]
  );

  const bookingMap = useMemo(() => {
    const map = new Map<string, string>();
    const weekStart = startOfWeekMonday(new Date());
    bookings.forEach((b) => {
      const dt = new Date(`${b.date}T00:00:00`);
      const day = Math.floor((dt.getTime() - weekStart.getTime()) / 86400000);
      const hour = parseInt(b.time_slot.split(":")[0], 10);
      if (day >= 0 && day < 7) map.set(`${day}-${hour}`, b.student_name);
    });
    return map;
  }, [bookings]);

  const toggleSlot = async (day: number, hour: number) => {
    const key = `${day}-${hour}`;
    if (slotSet.has(key)) {
      await supabase
        .from("mentor_availability")
        .delete()
        .eq("mentor_id", mentorId)
        .eq("day_of_week", day)
        .eq("start_hour", hour);
      setSlots((prev) => prev.filter((s) => !(s.day_of_week === day && s.start_hour === hour)));
    } else {
      await supabase
        .from("mentor_availability")
        .insert({ mentor_id: mentorId, day_of_week: day, start_hour: hour });
      setSlots((prev) => [...prev, { day_of_week: day, start_hour: hour }]);
    }
  };

  return (
    <section id="section-schedule" className="scroll-mt-24">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-[22px] font-semibold text-[#1A1A1A]">My Schedule</h2>
        <button
          onClick={() => setPanelOpen(true)}
          className="inline-flex h-10 items-center justify-center rounded-full bg-[#C4907F] px-5 text-[13px] font-medium text-white transition hover:opacity-90"
        >
          Manage Availability
        </button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-4">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[60px_repeat(7,_minmax(0,1fr))] gap-1 text-[11px] font-medium uppercase tracking-wide text-[#1A1A1A]/60">
            <div />
            {DAYS.map((d) => (
              <div key={d} className="text-center">{d}</div>
            ))}
          </div>
          {HOURS.map((h) => (
            <div key={h} className="mt-1 grid grid-cols-[60px_repeat(7,_minmax(0,1fr))] gap-1">
              <div className="flex items-center text-[11px] font-light text-[#1A1A1A]/60">
                {h}:00
              </div>
              {DAYS.map((_, di) => {
                const key = `${di}-${h}`;
                const booked = bookingMap.get(key);
                const available = slotSet.has(key);
                return (
                  <div
                    key={key}
                    className="flex h-9 items-center justify-center rounded-md text-[11px]"
                    style={{
                      backgroundColor: booked
                        ? "#C4907F"
                        : available
                          ? "#EDE0DB"
                          : "transparent",
                      color: booked ? "#FFFCFB" : "#1A1A1A",
                      border: booked || available ? "none" : "1px dashed #EDE0DB",
                    }}
                  >
                    {booked ? <span className="truncate px-1">{booked}</span> : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {panelOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-[#1A1A1A]/40"
            onClick={() => setPanelOpen(false)}
          />
          <aside className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-[#FFFCFB] p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-[20px] font-semibold text-[#1A1A1A]">
                Manage Availability
              </h3>
              <button
                onClick={() => setPanelOpen(false)}
                aria-label="Close"
                className="rounded-full p-1.5 text-[#1A1A1A]/60 hover:bg-[#EDE0DB]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1 text-[13px] text-[#1A1A1A]/60">
              Tap a slot to toggle availability for that day & time.
            </p>
            <div className="mt-5 space-y-5">
              {DAYS.map((d, di) => (
                <div key={d}>
                  <p className="text-[13px] font-medium text-[#1A1A1A]">{d}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {HOURS.map((h) => {
                      const active = slotSet.has(`${di}-${h}`);
                      return (
                        <button
                          key={h}
                          onClick={() => toggleSlot(di, h)}
                          className="h-8 rounded-full px-3 text-[12px] font-medium transition"
                          style={{
                            backgroundColor: active ? "#C4907F" : "#EDE0DB",
                            color: active ? "#FFFCFB" : "#1A1A1A",
                          }}
                        >
                          {h}:00
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}