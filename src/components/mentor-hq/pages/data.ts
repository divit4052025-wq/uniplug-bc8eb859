// Shared data hooks for the Headquarters landmark interiors. Every hook reuses
// the EXACT React Query key + RPC/table calls of the existing light section
// components, so the dark HQ pages share one cache with them (no drift, no
// double-fetch). Presentation lives in the page components; the query contracts
// live here.
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { isBookingEnded, todayInIST } from "@/lib/time";

// ── Upcoming sessions — reuse MentorUpcomingSessions (["mentor-upcoming-sessions"]).
export type UpcomingRow = {
  id: string;
  date: string;
  time_slot: string;
  duration: number;
  student_id: string;
  student?: { full_name: string; grade: string; school: string };
};

export function useMentorUpcoming(mentorId: string) {
  return useQuery<UpcomingRow[]>({
    queryKey: ["mentor-upcoming-sessions", mentorId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_bookings_as_mentor");
      if (error) throw error;
      const today = todayInIST();
      const bookings = (data ?? []).filter(
        (b) =>
          !!b.student_id &&
          b.status === "confirmed" &&
          b.date >= today &&
          !isBookingEnded(b.date, b.time_slot, b.duration ?? 60),
      );
      bookings.sort((a, b) =>
        a.date === b.date ? a.time_slot.localeCompare(b.time_slot) : a.date.localeCompare(b.date),
      );
      const ids = Array.from(new Set(bookings.map((s) => s.student_id)));
      const studMap = new Map<string, { full_name: string; grade: string; school: string }>();
      if (ids.length) {
        const { data: studs, error: rpcErr } = await supabase.rpc("get_student_booking_names", {
          _ids: ids,
        });
        if (rpcErr) throw rpcErr;
        (
          (studs ?? []) as { id: string; full_name: string; grade: string; school: string }[]
        ).forEach((s) =>
          studMap.set(s.id, { full_name: s.full_name, grade: s.grade, school: s.school }),
        );
      }
      return bookings.map((s) => ({
        id: s.id,
        date: s.date,
        time_slot: s.time_slot,
        duration: s.duration ?? 60,
        student_id: s.student_id,
        student: studMap.get(s.student_id),
      }));
    },
  });
}

// ── Past ended sessions — reuse PostSessionNotesSection (["post-session-bookings"]).
export type PastBooking = {
  id: string;
  date: string;
  time_slot: string;
  student_id: string;
  student_name: string;
};

export function usePastEndedBookings(mentorId: string) {
  return useQuery<PastBooking[]>({
    queryKey: ["post-session-bookings", mentorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, date, time_slot, duration, student_id, status")
        .eq("mentor_id", mentorId)
        .in("status", ["confirmed", "completed"])
        .order("date", { ascending: false })
        .limit(50);
      if (error) throw error;
      const past = (data ?? []).filter((b) =>
        isBookingEnded(b.date, (b.time_slot ?? "00:00").slice(0, 5), b.duration ?? 60),
      );
      const ids = Array.from(
        new Set(past.map((r) => r.student_id).filter((v): v is string => !!v)),
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
      return past.map((b) => ({
        id: b.id,
        date: b.date,
        time_slot: b.time_slot,
        student_id: b.student_id ?? "",
        student_name: b.student_id ? (nameMap.get(b.student_id) ?? "Student") : "Student",
      }));
    },
  });
}

// ── Existing session notes — reuse PostSessionNotesSection (["post-session-previous"]).
export type PreviousNote = {
  id: string;
  booking_id: string | null;
  student_id: string;
  student_name: string;
  date: string | null;
  time_slot: string | null;
  summary: string;
  action_points: string[];
  updated_at: string;
  created_at: string;
};

export function useExistingNotes(mentorId: string) {
  return useQuery<PreviousNote[]>({
    queryKey: ["post-session-previous", mentorId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("session_notes")
        .select("id, booking_id, student_id, summary, action_points, created_at, updated_at")
        .eq("mentor_id", mentorId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const list = rows ?? [];
      if (list.length === 0) return [];
      const studentIds = Array.from(
        new Set(list.map((n) => n.student_id).filter((v): v is string => !!v)),
      );
      const bookingIds = Array.from(
        new Set(list.map((n) => n.booking_id).filter((v): v is string => !!v)),
      );
      const [studsRes, bookingsRes] = await Promise.all([
        studentIds.length
          ? supabase.rpc("get_student_booking_names", { _ids: studentIds })
          : Promise.resolve({ data: [] as { id: string; full_name: string }[], error: null }),
        bookingIds.length
          ? supabase.from("bookings").select("id, date, time_slot").in("id", bookingIds)
          : Promise.resolve({
              data: [] as { id: string; date: string; time_slot: string }[],
              error: null,
            }),
      ]);
      if (studsRes.error) throw studsRes.error;
      if (bookingsRes.error) throw bookingsRes.error;
      const nameMap = new Map<string, string>();
      ((studsRes.data ?? []) as { id: string; full_name: string }[]).forEach((s) =>
        nameMap.set(s.id, s.full_name),
      );
      const bookingMap = new Map<string, { date: string; time_slot: string }>();
      ((bookingsRes.data ?? []) as { id: string; date: string; time_slot: string }[]).forEach((b) =>
        bookingMap.set(b.id, { date: b.date, time_slot: b.time_slot }),
      );
      return list.map((n) => {
        const bk = n.booking_id ? bookingMap.get(n.booking_id) : undefined;
        return {
          id: n.id,
          booking_id: n.booking_id,
          student_id: n.student_id,
          student_name: nameMap.get(n.student_id) ?? "Student",
          date: bk?.date ?? null,
          time_slot: bk?.time_slot ?? null,
          summary: n.summary ?? "",
          action_points: Array.isArray(n.action_points) ? (n.action_points as string[]) : [],
          updated_at: n.updated_at,
          created_at: n.created_at,
        };
      });
    },
  });
}

// ── Students roster — reuse MyStudentsSection (["my-students"]).
export type StudentRow = {
  id: string;
  full_name: string;
  grade: string;
  school: string;
  total: number;
  last: string | null;
};

export function useMentorStudents(mentorId: string) {
  return useQuery<StudentRow[]>({
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
}

// ── Availability slots — reuse ScheduleSection (["mentor-availability"]).
export type AvailabilitySlot = { day_of_week: number; start_hour: number };

export function useMentorAvailability(mentorId: string) {
  return useQuery<AvailabilitySlot[]>({
    queryKey: ["mentor-availability", mentorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mentor_availability")
        .select("day_of_week,start_hour")
        .eq("mentor_id", mentorId);
      if (error) throw error;
      return (data ?? []) as AvailabilitySlot[];
    },
  });
}

// ── Earnings — reuse EarningsSection (["mentor-earnings"]). Authoritative,
//    ledger-sourced (get_mentor_earnings). NEVER recomputed from bookings.price.
export type PayoutState = "pending" | "scheduled" | "paid" | "refunded" | string;

export type EarningsResponse = {
  currency: string;
  summary: {
    lifetime_net_inr: number;
    paid_inr: number;
    scheduled_inr: number;
    pending_inr: number;
    clawback_owed_inr: number;
    paid_session_count: number;
  };
  next_payout_date: string | null;
  sessions: Array<{
    booking_id: string;
    date: string;
    time_slot: string;
    gross_inr: number;
    mentor_share_inr: number;
    payout_state: PayoutState;
  }>;
};

export function useMentorEarnings(mentorId: string) {
  return useQuery<EarningsResponse>({
    queryKey: ["mentor-earnings", mentorId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_mentor_earnings");
      if (error) throw error;
      return data as unknown as EarningsResponse;
    },
  });
}

// ── Rating summary — get_mentor_rating_summary (aggregate ONLY).
export type RatingSummary = {
  avg_rating: number | null;
  review_count: number;
  star1: number;
  star2: number;
  star3: number;
  star4: number;
  star5: number;
};

export function useMentorRatingSummary(mentorId: string) {
  return useQuery<RatingSummary>({
    queryKey: ["mentor-rating-summary", mentorId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_mentor_rating_summary", {
        _mentor_id: mentorId,
      });
      if (error) throw error;
      const row = (data ?? [])[0];
      return (
        row ?? {
          avg_rating: null,
          review_count: 0,
          star1: 0,
          star2: 0,
          star3: 0,
          star4: 0,
          star5: 0,
        }
      );
    },
  });
}
