import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { ErrorBanner } from "@/components/ui/error-banner";
import { endOfISTWeekSunday, startOfISTWeekMonday } from "@/lib/time";

// mentor_availability.day_of_week stores ISO 8601 weekdays: 1=Mon..7=Sun.
// DAYS is in Monday-first order so the label for an ISO day is DAYS[day_of_week - 1].
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 15 }, (_, i) => 8 + i); // 8..22

type Slot = { day_of_week: number; start_hour: number };
type Booking = {
  date: string;
  time_slot: string;
  student_name: string;
};

export function ScheduleSection({ mentorId }: { mentorId: string }) {
  const qc = useQueryClient();
  const [panelOpen, setPanelOpen] = useState(false);

  const slotsKey = ["mentor-availability", mentorId] as const;
  const bookingsKey = ["mentor-week-bookings", mentorId] as const;

  const { data: slots = [], isError: slotsErr, refetch: refetchSlots } = useQuery<Slot[]>({
    queryKey: slotsKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mentor_availability")
        .select("day_of_week,start_hour")
        .eq("mentor_id", mentorId);
      if (error) throw error;
      return (data ?? []) as Slot[];
    },
  });

  const { data: bookings = [], isError: bookingsErr, refetch: refetchBookings } = useQuery<Booking[]>({
    queryKey: bookingsKey,
    queryFn: async () => {
      const weekStartStr = startOfISTWeekMonday();
      const weekEndStr = endOfISTWeekSunday();
      const { data, error } = await supabase
        .from("bookings")
        .select("date, time_slot, student_id")
        .eq("mentor_id", mentorId)
        .in("status", ["confirmed"])
        .gte("date", weekStartStr)
        .lte("date", weekEndStr);
      if (error) throw error;
      const rows = data ?? [];
      const ids = Array.from(new Set(rows.map((r) => r.student_id).filter((v): v is string => !!v)));
      const nameMap = new Map<string, string>();
      if (ids.length) {
        const { data: studs, error: rpcErr } = await supabase.rpc(
          "get_student_booking_names",
          { _ids: ids },
        );
        if (rpcErr) throw rpcErr;
        ((studs ?? []) as { id: string; full_name: string }[]).forEach((s) =>
          nameMap.set(s.id, s.full_name),
        );
      }
      return rows.map((r) => ({
        date: r.date,
        time_slot: r.time_slot,
        student_name: r.student_id ? (nameMap.get(r.student_id) ?? "Student") : "Student",
      }));
    },
  });

  // slotSet keys use the 0-based DAYS index so the render-side `${di}-${h}`
  // lookup keeps working unchanged. ISO day_of_week 1..7 → DAYS index 0..6.
  const slotSet = useMemo(
    () => new Set(slots.map((s) => `${s.day_of_week - 1}-${s.start_hour}`)),
    [slots],
  );

  const bookingMap = useMemo(() => {
    const map = new Map<string, string>();
    const weekStartStr = startOfISTWeekMonday();
    const ws = new Date(`${weekStartStr}T00:00:00Z`).getTime();
    bookings.forEach((b) => {
      const dt = new Date(`${b.date}T00:00:00Z`).getTime();
      const day = Math.round((dt - ws) / 86400000);
      const hour = parseInt(b.time_slot.split(":")[0], 10);
      if (day >= 0 && day < 7) map.set(`${day}-${hour}`, b.student_name);
    });
    return map;
  }, [bookings]);

  const toggleMutation = useMutation({
    mutationFn: async ({ day, hour, hadIt }: { day: number; hour: number; hadIt: boolean }) => {
      const isoDay = day + 1;
      if (hadIt) {
        const { error } = await supabase
          .from("mentor_availability")
          .delete()
          .eq("mentor_id", mentorId)
          .eq("day_of_week", isoDay)
          .eq("start_hour", hour);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("mentor_availability")
          .insert({ mentor_id: mentorId, day_of_week: isoDay, start_hour: hour });
        if (error) throw error;
      }
    },
    onMutate: async ({ day, hour, hadIt }) => {
      await qc.cancelQueries({ queryKey: slotsKey });
      const prev = qc.getQueryData<Slot[]>(slotsKey) ?? [];
      const isoDay = day + 1;
      const next = hadIt
        ? prev.filter((s) => !(s.day_of_week === isoDay && s.start_hour === hour))
        : [...prev, { day_of_week: isoDay, start_hour: hour }];
      qc.setQueryData<Slot[]>(slotsKey, next);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(slotsKey, ctx.prev);
    },
  });

  const toggleSlot = (day: number, hour: number) => {
    const hadIt = slotSet.has(`${day}-${hour}`);
    toggleMutation.mutate({ day, hour, hadIt });
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

      {(slotsErr || bookingsErr) && (
        <div className="mt-4">
          <ErrorBanner
            message="Couldn't load your schedule."
            onRetry={() => {
              if (slotsErr) void refetchSlots();
              if (bookingsErr) void refetchBookings();
            }}
          />
        </div>
      )}

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
