import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

import { HqCard, HqPageShell } from "@/components/mentor-hq/HqPageShell";
import { useMentorDashboard } from "@/components/mentor-dashboard/MentorDashboardContext";
import { supabase } from "@/integrations/supabase/client";
import { endOfISTWeekSunday, startOfISTWeekMonday } from "@/lib/time";
import { ApprovalLockedCard } from "./shared";
import { useMentorAvailability, type AvailabilitySlot } from "./data";

// mentor_availability.day_of_week is ISO 1=Mon..7=Sun; DAYS is Monday-first so the
// label is DAYS[day_of_week - 1].
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const fmtHour = (h: number) => `${String(h).padStart(2, "0")}:00`;
const TIME_GROUPS: { label: string; hours: number[] }[] = [
  { label: "Morning", hours: [5, 6, 7, 8, 9, 10, 11] },
  { label: "Afternoon", hours: [12, 13, 14, 15, 16] },
  { label: "Evening", hours: [17, 18, 19, 20, 21] },
  { label: "Night", hours: [22, 23, 0, 1, 2, 3, 4] },
];

type Occupancy = { date: string; time_slot: string; held: boolean; label: string };

export function SundialPage() {
  const { mentorId, status } = useMentorDashboard();

  if (status !== "approved") {
    return (
      <HqPageShell kind="Availability" title="The Sundial">
        <ApprovalLockedCard landmark="The Sundial" />
      </HqPageShell>
    );
  }

  return <SundialContent mentorId={mentorId} />;
}

function SundialContent({ mentorId }: { mentorId: string }) {
  const qc = useQueryClient();
  const [panelOpen, setPanelOpen] = useState(false);

  const slotsKey = ["mentor-availability", mentorId] as const;
  const bookingsKey = ["mentor-week-bookings", mentorId] as const;

  const { data: slots = [] } = useMentorAvailability(mentorId);

  // FIX (HQ): the old occupancy query only counted 'confirmed'. Widen to include
  // 'pending_payment' so a slot a student is mid-checkout on shows as "held"
  // (distinct from a paid-and-confirmed booking) instead of looking free.
  const { data: bookings = [] } = useQuery<Occupancy[]>({
    queryKey: bookingsKey,
    queryFn: async () => {
      const weekStartStr = startOfISTWeekMonday();
      const weekEndStr = endOfISTWeekSunday();
      const { data, error } = await supabase
        .from("bookings")
        .select("date, time_slot, student_id, status")
        .eq("mentor_id", mentorId)
        .in("status", ["confirmed", "pending_payment"])
        .gte("date", weekStartStr)
        .lte("date", weekEndStr);
      if (error) throw error;
      const rows = data ?? [];
      const ids = Array.from(
        new Set(rows.map((r) => r.student_id).filter((v): v is string => !!v)),
      );
      const nameMap = new Map<string, string>();
      if (ids.length) {
        const { data: studs, error: rpcErr } = await supabase.rpc("get_student_booking_names", {
          _ids: ids,
        });
        if (rpcErr) throw rpcErr;
        ((studs ?? []) as { id: string; full_name: string }[]).forEach((s) =>
          nameMap.set(s.id, s.full_name),
        );
      }
      return rows.map((r) => {
        const held = r.status === "pending_payment";
        return {
          date: r.date,
          time_slot: r.time_slot,
          held,
          label: held
            ? "Held"
            : r.student_id
              ? (nameMap.get(r.student_id) ?? "Student")
              : "Student",
        };
      });
    },
  });

  const slotSet = useMemo(
    () => new Set(slots.map((s) => `${s.day_of_week - 1}-${s.start_hour}`)),
    [slots],
  );

  const bookingMap = useMemo(() => {
    const map = new Map<string, { label: string; held: boolean }>();
    const weekStartStr = startOfISTWeekMonday();
    const ws = new Date(`${weekStartStr}T00:00:00Z`).getTime();
    bookings.forEach((b) => {
      const dt = new Date(`${b.date}T00:00:00Z`).getTime();
      const day = Math.round((dt - ws) / 86400000);
      const hour = parseInt(b.time_slot.split(":")[0], 10);
      if (day >= 0 && day < 7) map.set(`${day}-${hour}`, { label: b.label, held: b.held });
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
      const prev = qc.getQueryData<AvailabilitySlot[]>(slotsKey) ?? [];
      const isoDay = day + 1;
      const next = hadIt
        ? prev.filter((s) => !(s.day_of_week === isoDay && s.start_hour === hour))
        : [...prev, { day_of_week: isoDay, start_hour: hour }];
      qc.setQueryData<AvailabilitySlot[]>(slotsKey, next);
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

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen]);

  const headerRight = (
    <button
      type="button"
      onClick={() => setPanelOpen(true)}
      className="inline-flex h-11 items-center rounded-full px-5 text-[13px] font-semibold text-[color:var(--brand-night)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-rose)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--brand-night)]"
      style={{ background: "var(--brand-rose)" }}
    >
      Manage availability
    </button>
  );

  return (
    <HqPageShell
      kind="Availability"
      title="The Sundial"
      intro="You set your time, not your rate — UniPlug sets pricing. Open whole-hour slots and students book them."
      headerRight={headerRight}
    >
      {slots.length === 0 ? (
        <HqCard className="mb-6 border-[rgba(244,181,170,0.28)] bg-[rgba(244,181,170,0.08)]">
          <p className="font-display text-base font-semibold">No open hours yet</p>
          <p className="mt-1 text-[13px]" style={{ color: "var(--brand-ink-faint)" }}>
            Students can't book you until you open at least one hour. Tap “Manage availability” to
            add your first slot.
          </p>
        </HqCard>
      ) : null}

      {/* Legend */}
      <div
        className="mb-4 flex flex-wrap items-center gap-4 text-[12px]"
        style={{ color: "var(--brand-ink-faint)" }}
      >
        <Legend swatch="rgba(244,181,170,0.22)" border="rgba(244,181,170,0.4)" label="Open" />
        <Legend swatch="var(--brand-rose)" label="Booked" />
        <Legend
          swatch="rgba(244,181,170,0.12)"
          border="rgba(244,181,170,0.45)"
          dashed
          label="Held (mid-checkout)"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[rgba(250,245,239,0.1)] bg-[rgba(250,245,239,0.03)] p-4">
        <div className="min-w-[720px]">
          <div className="max-h-[460px] overflow-y-auto">
            <div
              className="sticky top-0 z-10 grid grid-cols-[60px_repeat(7,_minmax(0,1fr))] gap-1 pb-1 text-[11px] font-semibold uppercase tracking-wide"
              style={{ background: "var(--brand-night)", color: "var(--brand-ink-faint)" }}
            >
              <div />
              {DAYS.map((d) => (
                <div key={d} className="text-center">
                  {d}
                </div>
              ))}
            </div>
            {HOURS.map((h) => (
              <div key={h} className="mt-1 grid grid-cols-[60px_repeat(7,_minmax(0,1fr))] gap-1">
                <div
                  className="flex items-center text-[11px]"
                  style={{ color: "var(--brand-ink-faint)" }}
                >
                  {fmtHour(h)}
                </div>
                {DAYS.map((_, di) => {
                  const key = `${di}-${h}`;
                  const booked = bookingMap.get(key);
                  const available = slotSet.has(key);
                  const held = booked?.held ?? false;
                  return (
                    <div
                      key={key}
                      className="flex h-9 items-center justify-center rounded-md text-[11px]"
                      style={
                        booked
                          ? held
                            ? {
                                backgroundColor: "rgba(244,181,170,0.12)",
                                color: "var(--brand-rose)",
                                border: "1px dashed rgba(244,181,170,0.45)",
                              }
                            : {
                                backgroundColor: "var(--brand-rose)",
                                color: "var(--brand-night)",
                                border: "none",
                              }
                          : available
                            ? {
                                backgroundColor: "rgba(244,181,170,0.22)",
                                color: "var(--brand-paper)",
                                border: "1px solid rgba(244,181,170,0.4)",
                              }
                            : {
                                backgroundColor: "transparent",
                                color: "var(--brand-ink-faint)",
                                border: "1px dashed rgba(250,245,239,0.1)",
                              }
                      }
                    >
                      {booked ? <span className="truncate px-1">{booked.label}</span> : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {panelOpen ? (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(8,7,6,0.66)" }}
            onClick={() => setPanelOpen(false)}
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Manage availability"
            className="hq-shell absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-[rgba(250,245,239,0.12)] p-6 shadow-2xl"
            style={{ background: "#1f1c19", color: "var(--brand-paper)" }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-bold">Manage availability</h3>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label="Close"
                className="rounded-full p-1.5 transition hover:bg-[rgba(250,245,239,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-rose)]"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-1 text-[13px]" style={{ color: "var(--brand-ink-faint)" }}>
              Tap a whole-hour slot to open or close it. UniPlug sets the price — you only set when
              you're free.
            </p>
            <div className="mt-5 space-y-6">
              {DAYS.map((d, di) => (
                <div key={d}>
                  <p className="text-[13px] font-semibold">{d}</p>
                  <div className="mt-2 space-y-3">
                    {TIME_GROUPS.map((group) => (
                      <div key={group.label}>
                        <p
                          className="text-[10px] font-semibold uppercase tracking-wide"
                          style={{ color: "var(--brand-ink-faint)" }}
                        >
                          {group.label}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {group.hours.map((h) => {
                            const active = slotSet.has(`${di}-${h}`);
                            return (
                              <button
                                key={h}
                                type="button"
                                onClick={() => toggleSlot(di, h)}
                                aria-pressed={active}
                                aria-label={`${d} ${fmtHour(h)} ${active ? "open — tap to close" : "closed — tap to open"}`}
                                className="h-9 rounded-full px-3 text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-rose)]"
                                style={
                                  active
                                    ? {
                                        backgroundColor: "var(--brand-rose)",
                                        color: "var(--brand-night)",
                                      }
                                    : {
                                        backgroundColor: "rgba(250,245,239,0.06)",
                                        color: "var(--brand-paper)",
                                        border: "1px solid rgba(250,245,239,0.14)",
                                      }
                                }
                              >
                                {fmtHour(h)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      ) : null}
    </HqPageShell>
  );
}

function Legend({
  swatch,
  border,
  dashed,
  label,
}: {
  swatch: string;
  border?: string;
  dashed?: boolean;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-3.5 w-3.5 rounded-[4px]"
        style={{
          background: swatch,
          border: border ? `1px ${dashed ? "dashed" : "solid"} ${border}` : "none",
        }}
      />
      {label}
    </span>
  );
}
