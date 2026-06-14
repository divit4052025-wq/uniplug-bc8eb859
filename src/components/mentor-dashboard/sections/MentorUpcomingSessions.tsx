import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { X, FileText } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useOptimisticMutation } from "@/lib/hooks/useOptimisticMutation";
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
import { formatBookingDate, isBookingEnded, todayInIST } from "@/lib/time";

type Row = {
  id: string;
  date: string;
  time_slot: string;
  duration: number;
  student_id: string;
  student?: {
    full_name: string;
    grade: string;
    school: string;
  };
};

type Document = { id: string; file_name: string };
type School = { id: string; name: string; category: string };

const upcomingKey = (mentorId: string) => ["mentor-upcoming-sessions", mentorId] as const;

export function MentorUpcomingSessions({ mentorId }: { mentorId: string }) {
  const [profile, setProfile] = useState<{
    name: string;
    grade: string;
    school: string;
    docs: Document[];
    schools: School[];
  } | null>(null);

  const {
    data: rows = [],
    isError,
    refetch,
  } = useQuery<Row[]>({
    queryKey: upcomingKey(mentorId),
    queryFn: async () => {
      // P10a: read through the per-party SECURITY DEFINER accessor (returns the
      // mentor-relevant column set incl duration; payout_id stays server-side).
      // The mentor never select(*)s bookings — the sensitive financial columns
      // are REVOKEd from the browser.
      const { data, error } = await supabase.rpc("get_my_bookings_as_mentor");
      if (error) throw error;
      const today = todayInIST();
      const bookings = (data ?? []).filter(
        (b) =>
          !!b.student_id &&
          b.status === "confirmed" &&
          b.date >= today &&
          // B (P10): duration-aware — a 30-min session leaves the list 30 min
          // after start, not 60.
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

  const openProfile = async (studentId: string, name: string, grade: string, school: string) => {
    const { data } = await supabase.rpc("get_student_overview_for_mentor", {
      _student_id: studentId,
    });
    const result = (data as { documents?: Document[]; schools?: School[] }[] | null)?.[0];
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
            <p className="px-4 py-8 text-center text-[14px] font-light text-[#1A1A1A]/70">
              No upcoming sessions yet.
            </p>
          ) : (
            <ul className="divide-y divide-[#EDE0DB]">
              {rows.map((r) => (
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
                      {formatBookingDate(r.date)} · {r.time_slot}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() =>
                        openProfile(
                          r.student_id,
                          r.student?.full_name ?? "Student",
                          r.student?.grade ?? "",
                          r.student?.school ?? "",
                        )
                      }
                      className="inline-flex h-9 items-center justify-center rounded-full border border-[#1A1A1A]/15 px-4 text-[12px] font-medium text-[#1A1A1A] hover:border-[#C4907F] hover:text-[#C4907F]"
                    >
                      View Profile
                    </button>
                    <Link
                      to="/messages"
                      search={{ peer: r.student_id, peerName: r.student?.full_name ?? "Student" }}
                      className="inline-flex h-9 items-center justify-center rounded-full border border-[#1A1A1A]/15 px-4 text-[12px] font-medium text-[#1A1A1A] hover:border-[#C4907F] hover:text-[#C4907F]"
                    >
                      Message
                    </Link>
                    <CancelButton
                      booking={r}
                      mentorId={mentorId}
                      studentName={r.student?.full_name ?? "your student"}
                    />
                    <Link
                      to="/call/$bookingId"
                      params={{ bookingId: r.id }}
                      className="inline-flex h-9 items-center justify-center rounded-full bg-[#C4907F] px-4 text-[12px] font-medium text-white hover:opacity-90"
                    >
                      Join Call
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
            <h3 className="font-display text-[22px] font-semibold text-[#1A1A1A]">
              {profile.name}
            </h3>
            <p className="text-[12px] text-[#1A1A1A]/60">
              {profile.grade} · {profile.school}
            </p>

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
                  <li key={d.id} className="flex items-center gap-2 text-[13px] text-[#1A1A1A]">
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

type CancelResult = { tier: string; refundable_inr: number; captured_inr: number };

/**
 * Mentor-initiated cancellation. cancel_booking_as_mentor (SECURITY DEFINER) is
 * the authority: it full-refunds the student and reverses/claws back the mentor's
 * accrual in one transaction. The mentor is warned of both effects before
 * confirming. The booking leaves the confirmed list optimistically.
 */
function CancelButton({
  booking,
  mentorId,
  studentName,
}: {
  booking: Row;
  mentorId: string;
  studentName: string;
}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const cancel = useOptimisticMutation<Row[], void, CancelResult>({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("cancel_booking_as_mentor", {
        _booking_id: booking.id,
      });
      if (error) throw error;
      return data as unknown as CancelResult;
    },
    queryKeys: [upcomingKey(mentorId)],
    optimisticUpdate: (old) => (old ?? []).filter((b) => b.id !== booking.id),
    errorMessage: (err) => (err instanceof Error ? err.message : "Couldn't cancel this session."),
    mutationOptions: {
      onSuccess: (data) => {
        setOpen(false);
        const refundable = data?.refundable_inr ?? 0;
        toast.success(
          refundable > 0
            ? `Session cancelled — ₹${refundable.toLocaleString("en-IN")} refunded to ${studentName}.`
            : "Session cancelled.",
        );
        // Free slot + earnings change → refresh the mentor's schedule/earnings.
        void qc.invalidateQueries({ queryKey: ["mentor-earnings", mentorId] });
        void qc.invalidateQueries({ queryKey: ["mentor-schedule", mentorId] });
      },
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center rounded-full border border-[#1A1A1A]/15 px-4 text-[12px] font-medium text-[#1A1A1A] transition hover:border-destructive hover:text-destructive"
        >
          Cancel
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this session?</AlertDialogTitle>
          <AlertDialogDescription>
            {formatBookingDate(booking.date)} · {booking.time_slot} with {studentName}. Cancelling
            refunds {studentName} in full and reverses your earnings for this session. This can't be
            undone.
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
