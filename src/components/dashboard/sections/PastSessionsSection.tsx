import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { ErrorBanner } from "@/components/ui/error-banner";
import { formatBookingDate } from "@/lib/time";
import { ReviewForm } from "@/components/reviews/ReviewForm";

type PastSessionRow = {
  id: string;
  mentor_id: string;
  date: string;
  time_slot: string;
  mentorName: string;
  noteId: string | null;
  actionTotal: number;
  actionDone: number;
  hasReviewed: boolean;
};

const COLLAPSED_LIMIT = 5;

export function PastSessionsSection({ studentId }: { studentId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<{
    mentorId: string;
    mentorName: string;
  } | null>(null);

  const pastSessionsKey = ["past-sessions", "student", studentId] as const;
  const studentReviewedKey = ["reviews", "by-student", studentId] as const;

  const {
    data: rows = [],
    isError,
    refetch,
  } = useQuery<PastSessionRow[]>({
    queryKey: pastSessionsKey,
    queryFn: async () => {
      // 1. Completed bookings for this student, newest first.
      const { data: bookingRows, error: bErr } = await supabase
        .from("bookings")
        .select("id, mentor_id, date, time_slot")
        .eq("student_id", studentId)
        .eq("status", "completed")
        .order("date", { ascending: false })
        .order("time_slot", { ascending: false });
      if (bErr) throw bErr;

      const bookings = (bookingRows ?? []).filter(
        (b): b is { id: string; mentor_id: string; date: string; time_slot: string } =>
          !!b.mentor_id,
      );
      if (bookings.length === 0) return [];

      const mentorIds = Array.from(new Set(bookings.map((b) => b.mentor_id)));
      const bookingIds = bookings.map((b) => b.id);

      // 2. Resolve mentor display names, session notes for these bookings,
      //    and which mentors the student has already reviewed.
      const [namesRes, notesRes, reviewsRes] = await Promise.all([
        supabase.rpc("get_mentor_booking_names", { _ids: mentorIds }),
        supabase
          .from("session_notes")
          .select("id, booking_id, action_points")
          .in("booking_id", bookingIds),
        supabase
          .from("reviews")
          .select("mentor_id")
          .eq("student_id", studentId),
      ]);
      if (namesRes.error) throw namesRes.error;
      if (notesRes.error) throw notesRes.error;
      if (reviewsRes.error) throw reviewsRes.error;

      const nameMap = new Map(
        ((namesRes.data ?? []) as { id: string; full_name: string }[]).map((m) => [
          m.id,
          m.full_name,
        ]),
      );

      const noteByBooking = new Map<string, { id: string; actionTotal: number }>();
      ((notesRes.data ?? []) as {
        id: string;
        booking_id: string | null;
        action_points: unknown;
      }[]).forEach((n) => {
        if (!n.booking_id) return;
        const total = Array.isArray(n.action_points) ? n.action_points.length : 0;
        noteByBooking.set(n.booking_id, { id: n.id, actionTotal: total });
      });

      const reviewedMentors = new Set(
        ((reviewsRes.data ?? []) as { mentor_id: string }[]).map((r) => r.mentor_id),
      );

      const noteIds = Array.from(noteByBooking.values()).map((n) => n.id);
      const completedByNote = new Map<string, number>();
      if (noteIds.length) {
        const { data: comps, error: cErr } = await supabase
          .from("action_point_completions")
          .select("session_note_id, completed")
          .in("session_note_id", noteIds)
          .eq("completed", true);
        if (cErr) throw cErr;
        ((comps ?? []) as { session_note_id: string; completed: boolean }[]).forEach((c) => {
          completedByNote.set(
            c.session_note_id,
            (completedByNote.get(c.session_note_id) ?? 0) + 1,
          );
        });
      }

      return bookings.map((b) => {
        const note = noteByBooking.get(b.id);
        return {
          id: b.id,
          mentor_id: b.mentor_id,
          date: b.date,
          time_slot: b.time_slot,
          mentorName: nameMap.get(b.mentor_id) ?? "Mentor",
          noteId: note?.id ?? null,
          actionTotal: note?.actionTotal ?? 0,
          actionDone: note ? completedByNote.get(note.id) ?? 0 : 0,
          hasReviewed: reviewedMentors.has(b.mentor_id),
        };
      });
    },
  });

  if (isError) {
    return (
      <section id="section-past-sessions" className="scroll-mt-24">
        <h2 className="font-display text-[22px] font-semibold text-[#1A1A1A]">Past Sessions</h2>
        <div className="mt-4">
          <ErrorBanner
            message="Couldn't load your past sessions."
            onRetry={() => void refetch()}
          />
        </div>
      </section>
    );
  }

  if (rows.length === 0) {
    return (
      <section id="section-past-sessions" className="scroll-mt-24">
        <h2 className="font-display text-[22px] font-semibold text-[#1A1A1A]">Past Sessions</h2>
        <div className="mt-4 rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-6 text-center">
          <p className="text-[14px] font-light text-[#1A1A1A]/70">
            Your completed sessions will appear here.
          </p>
        </div>
      </section>
    );
  }

  const visible = expanded ? rows : rows.slice(0, COLLAPSED_LIMIT);
  const hiddenCount = rows.length - visible.length;

  return (
    <section id="section-past-sessions" className="scroll-mt-24">
      <h2 className="font-display text-[22px] font-semibold text-[#1A1A1A]">Past Sessions</h2>
      <div className="mt-4 rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-2">
        <ul className="divide-y divide-[#EDE0DB]">
          {visible.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-[15px] font-medium text-[#1A1A1A]">{r.mentorName}</p>
                <p className="mt-1 text-[12px] text-[#1A1A1A]/60">
                  {formatBookingDate(r.date)} · {r.time_slot}
                </p>
                {r.noteId && (
                  <p className="mt-1.5 text-[12px] text-[#1A1A1A]/70">
                    {r.actionTotal > 0 ? (
                      <>
                        Action points: {r.actionDone}/{r.actionTotal} complete
                      </>
                    ) : (
                      <>Notes available</>
                    )}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {r.noteId && (
                  <a
                    href="#section-session-notes"
                    className="inline-flex h-9 items-center justify-center rounded-full border border-[#EDE0DB] bg-[#FFFCFB] px-4 text-[12px] font-medium text-[#1A1A1A] hover:border-[#C4907F]"
                  >
                    View notes
                  </a>
                )}
                {r.hasReviewed ? (
                  <span className="inline-flex h-9 items-center justify-center rounded-full bg-[#EDE0DB]/60 px-4 text-[12px] font-medium text-[#1A1A1A]/60">
                    Reviewed
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setReviewTarget({ mentorId: r.mentor_id, mentorName: r.mentorName })
                    }
                    className="inline-flex h-9 items-center justify-center rounded-full bg-[#C4907F] px-4 text-[12px] font-medium text-white hover:opacity-90"
                  >
                    Leave Review
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {hiddenCount > 0 && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-1 w-full rounded-xl px-4 py-3 text-center text-[12px] font-semibold text-[#C4907F] hover:bg-[#EDE0DB]/40"
          >
            Show all ({rows.length})
          </button>
        )}
        {expanded && rows.length > COLLAPSED_LIMIT && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="mt-1 w-full rounded-xl px-4 py-3 text-center text-[12px] font-semibold text-[#C4907F] hover:bg-[#EDE0DB]/40"
          >
            Show fewer
          </button>
        )}
      </div>

      {reviewTarget && (
        <ReviewForm
          open={!!reviewTarget}
          onOpenChange={(open) => {
            if (!open) setReviewTarget(null);
          }}
          studentId={studentId}
          mentorId={reviewTarget.mentorId}
          mentorName={reviewTarget.mentorName}
          invalidateOnSuccess={[
            pastSessionsKey,
            studentReviewedKey,
            ["mentor-profile-page", reviewTarget.mentorId],
          ]}
        />
      )}
    </section>
  );
}
