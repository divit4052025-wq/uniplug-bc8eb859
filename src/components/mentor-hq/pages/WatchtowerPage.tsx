import { Link } from "@tanstack/react-router";
import { CalendarDays, ClipboardList, MessageSquare, Video, Clock, ArrowRight } from "lucide-react";

import {
  HqCard,
  HqEmpty,
  HqLoading,
  HqStat,
  HqPageShell,
} from "@/components/mentor-hq/HqPageShell";
import { VerifiedBadge } from "@/components/site/VerifiedBadge";
import { useMentorDashboard } from "@/components/mentor-dashboard/MentorDashboardContext";
import { formatBookingDate, todayInIST } from "@/lib/time";
import { HqSectionTitle, inr } from "./shared";
import {
  useExistingNotes,
  useMentorAvailability,
  useMentorEarnings,
  useMentorRatingSummary,
  useMentorStudents,
  useMentorUpcoming,
  usePastEndedBookings,
} from "./data";

export function WatchtowerPage() {
  const { status, firstName, verifiedAt } = useMentorDashboard();

  if (status === "approved") return <ApprovedWatchtower />;
  if (status === "rejected") return <RejectedWatchtower />;
  return <PendingWatchtower firstName={firstName} hasVerified={!!verifiedAt} />;
}

function ApprovedWatchtower() {
  const { mentorId, firstName, verifiedAt } = useMentorDashboard();
  const today = todayInIST();

  const upcoming = useMentorUpcoming(mentorId);
  const pastEnded = usePastEndedBookings(mentorId);
  const notes = useExistingNotes(mentorId);
  const earnings = useMentorEarnings(mentorId);
  const rating = useMentorRatingSummary(mentorId);
  const students = useMentorStudents(mentorId);
  const availability = useMentorAvailability(mentorId);

  const todaySessions = (upcoming.data ?? []).filter((b) => b.date === today);

  const notedBookingIds = new Set(
    (notes.data ?? []).map((n) => n.booking_id).filter((v): v is string => !!v),
  );
  const needsYou = (pastEnded.data ?? []).filter((b) => !notedBookingIds.has(b.id));

  const slotCount = availability.data?.length ?? 0;
  const reviewCount = rating.data?.review_count ?? 0;

  return (
    <HqPageShell
      kind="Home"
      title="The Watchtower"
      intro="Your command center — what's on today, what needs you, and where you stand."
      headerRight={verifiedAt ? <VerifiedBadge /> : undefined}
    >
      <div className="space-y-10">
        {/* At a glance */}
        <section>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <HqStat
              label="Sessions completed"
              value={earnings.isLoading ? "—" : (earnings.data?.summary.paid_session_count ?? 0)}
            />
            <HqStat
              label="Pending earnings"
              value={earnings.isLoading ? "—" : inr(earnings.data?.summary.pending_inr)}
              sub="Your share, awaiting payout"
            />
            <HqStat
              label="Rating"
              value={
                rating.isLoading
                  ? "—"
                  : reviewCount === 0
                    ? "No ratings yet"
                    : `${rating.data?.avg_rating ?? 0} / 5`
              }
              sub={
                reviewCount === 0
                  ? undefined
                  : `${reviewCount} review${reviewCount === 1 ? "" : "s"}`
              }
            />
            <HqStat
              label="Students"
              value={students.isLoading ? "—" : (students.data?.length ?? 0)}
            />
          </div>

          {/* Availability nudge — students can't book without open hours. */}
          {!availability.isLoading && slotCount === 0 ? (
            <Link
              to="/mentor-dashboard/sundial"
              className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-[rgba(244,181,170,0.28)] bg-[rgba(244,181,170,0.08)] px-5 py-3.5 transition hover:border-[rgba(244,181,170,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-rose)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--brand-night)]"
            >
              <span className="flex items-center gap-2.5 text-sm">
                <Clock
                  className="h-4 w-4"
                  style={{ color: "var(--brand-rose)" }}
                  aria-hidden="true"
                />
                <span>
                  <span className="font-semibold">Students can't book you yet.</span>{" "}
                  <span style={{ color: "var(--brand-ink-faint)" }}>
                    Open some hours at The Sundial.
                  </span>
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </Link>
          ) : !availability.isLoading ? (
            <p className="mt-3 text-[13px]" style={{ color: "var(--brand-ink-faint)" }}>
              {slotCount} open hour{slotCount === 1 ? "" : "s"} a week ·{" "}
              <Link
                to="/mentor-dashboard/sundial"
                className="underline underline-offset-2 hover:opacity-80"
              >
                edit at The Sundial
              </Link>
            </p>
          ) : null}
        </section>

        {/* Today */}
        <section>
          <HqSectionTitle sub={formatBookingDate(today)}>Today's sessions</HqSectionTitle>
          {upcoming.isLoading ? (
            <HqLoading rows={2} />
          ) : todaySessions.length === 0 ? (
            <HqEmpty icon={<CalendarDays className="h-6 w-6" aria-hidden="true" />}>
              Nothing on your calendar today.
            </HqEmpty>
          ) : (
            <ul className="space-y-3">
              {todaySessions.map((s) => (
                <li key={s.id}>
                  <HqCard>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-display text-base font-semibold">
                          {s.student?.full_name ?? "Student"}
                        </p>
                        <p className="text-[12px]" style={{ color: "var(--brand-ink-faint)" }}>
                          {s.student?.grade}
                          {s.student?.grade && s.student?.school ? " · " : ""}
                          {s.student?.school} · {s.time_slot} IST
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          to="/messages"
                          search={{
                            peer: s.student_id,
                            peerName: s.student?.full_name ?? "Student",
                          }}
                          className="inline-flex h-11 items-center gap-1.5 rounded-full border border-[rgba(250,245,239,0.16)] px-4 text-[13px] font-semibold transition hover:border-[rgba(250,245,239,0.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-rose)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--brand-night)]"
                        >
                          <MessageSquare className="h-4 w-4" aria-hidden="true" />
                          Message
                        </Link>
                        <Link
                          to="/call/$bookingId"
                          params={{ bookingId: s.id }}
                          className="inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold text-[color:var(--brand-night)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-rose)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--brand-night)]"
                          style={{ background: "var(--brand-rose)" }}
                        >
                          <Video className="h-4 w-4" aria-hidden="true" />
                          Join call
                        </Link>
                      </div>
                    </div>
                  </HqCard>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Needs you */}
        <section>
          <HqSectionTitle sub="Ended sessions still waiting on your notes.">
            Needs you
          </HqSectionTitle>
          {pastEnded.isLoading || notes.isLoading ? (
            <HqLoading rows={2} />
          ) : needsYou.length === 0 ? (
            <HqEmpty icon={<ClipboardList className="h-6 w-6" aria-hidden="true" />}>
              You're all caught up.
            </HqEmpty>
          ) : (
            <ul className="space-y-3">
              {needsYou.map((b) => (
                <li key={b.id}>
                  <HqCard>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-display text-base font-semibold">{b.student_name}</p>
                        <p className="text-[12px]" style={{ color: "var(--brand-ink-faint)" }}>
                          {b.date ? formatBookingDate(b.date) : "Session"}
                          {b.time_slot ? ` · ${b.time_slot}` : ""} · no notes yet
                        </p>
                      </div>
                      <Link
                        to="/mentor-dashboard/forum"
                        className="inline-flex h-11 items-center gap-1.5 rounded-full border border-[rgba(250,245,239,0.16)] px-4 text-[13px] font-semibold transition hover:border-[rgba(250,245,239,0.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-rose)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--brand-night)]"
                      >
                        <ClipboardList className="h-4 w-4" aria-hidden="true" />
                        Write notes
                      </Link>
                    </div>
                  </HqCard>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </HqPageShell>
  );
}

function PendingWatchtower({
  firstName,
  hasVerified,
}: {
  firstName: string;
  hasVerified: boolean;
}) {
  return (
    <HqPageShell
      kind="Home"
      title="The Watchtower"
      intro={firstName ? `Welcome, ${firstName}.` : undefined}
    >
      <HqCard>
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: "var(--brand-rose)" }}
        >
          Under review
        </p>
        <h2 className="mt-1.5 font-display text-2xl font-bold">Application under review</h2>
        <p className="mt-2 max-w-xl text-sm" style={{ color: "var(--brand-ink-faint)" }}>
          Thanks for applying to be a Plug. Our team is checking your college ID and enrolment
          details to confirm you're a current student. This usually takes a couple of days — you
          don't need to do anything right now.
        </p>

        <div className="mt-6 space-y-3">
          <h3 className="font-display text-sm font-semibold">What happens next</h3>
          <ol className="space-y-2.5 text-[13px]" style={{ color: "var(--brand-ink-faint)" }}>
            <li className="flex gap-2.5">
              <Step n={1} />
              We verify your college ID against your enrolment (India model — a current student ID,
              not a .edu email or references).
            </li>
            <li className="flex gap-2.5">
              <Step n={2} />
              Once approved, your campus comes alive: the Sundial, Vault, Laurels, Forum and Embassy
              all unlock.
            </li>
            <li className="flex gap-2.5">
              <Step n={3} />
              You'll set your open hours, and students can start booking. UniPlug handles pricing
              and payouts.
            </li>
          </ol>
        </div>

        <Link
          to="/mentor-dashboard/forge"
          className="mt-6 inline-flex h-11 items-center gap-1.5 rounded-full px-5 text-[13px] font-semibold text-[color:var(--brand-night)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-rose)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--brand-night)]"
          style={{ background: "var(--brand-rose)" }}
        >
          {hasVerified ? "Review your profile in The Forge" : "Check your details in The Forge"}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </HqCard>
    </HqPageShell>
  );
}

function RejectedWatchtower() {
  const { verificationNotes } = useMentorDashboard();
  return (
    <HqPageShell kind="Home" title="The Watchtower">
      <HqCard>
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: "#F4B5AA" }}
        >
          Needs changes
        </p>
        <h2 className="mt-1.5 font-display text-2xl font-bold">Not approved — yet</h2>
        <p className="mt-2 max-w-xl text-sm" style={{ color: "var(--brand-ink-faint)" }}>
          We couldn't approve your application as it stands. This isn't final — fix what's flagged
          below and you can be re-reviewed.
        </p>

        <div
          className="mt-5 rounded-xl border-l-2 px-4 py-3"
          style={{ borderColor: "#D8432A", background: "rgba(216,67,42,0.10)" }}
        >
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: "#F4B5AA" }}
          >
            Why
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--brand-paper)" }}>
            {verificationNotes && verificationNotes.trim()
              ? verificationNotes
              : "The reviewer didn't leave a specific note. Re-check that your college ID is current, clear, and matches your enrolment details."}
          </p>
        </div>

        <Link
          to="/mentor-dashboard/forge"
          className="mt-6 inline-flex h-11 items-center gap-1.5 rounded-full px-5 text-[13px] font-semibold text-[color:var(--brand-night)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-rose)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--brand-night)]"
          style={{ background: "var(--brand-rose)" }}
        >
          Fix in The Forge
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </HqCard>
    </HqPageShell>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span
      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
      style={{ background: "rgba(244,181,170,0.16)", color: "var(--brand-rose)" }}
    >
      {n}
    </span>
  );
}
