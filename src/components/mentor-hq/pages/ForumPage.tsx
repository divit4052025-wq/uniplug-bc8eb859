import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, Download, FileText, MessageSquare, Video, X, User } from "lucide-react";
import { toast } from "sonner";

import { HqCard, HqEmpty, HqLoading, HqPageShell } from "@/components/mentor-hq/HqPageShell";
import { useMentorDashboard } from "@/components/mentor-dashboard/MentorDashboardContext";
import { PostSessionNotesSection } from "@/components/mentor-dashboard/sections/PostSessionNotesSection";
import { supabase } from "@/integrations/supabase/client";
import { getDocumentDownloadUrl } from "@/lib/documents/download.functions";
import { formatBookingDate } from "@/lib/time";
import { ApprovalLockedCard, HqSectionTitle } from "./shared";
import { useMentorUpcoming, usePastEndedBookings } from "./data";

type SharedDoc = {
  id: string;
  file_name: string;
  created_at: string;
  size_bytes: number | null;
};
type School = { id: string; name: string; category: string };

function formatBytes(b: number | null): string {
  if (!b || b <= 0) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export function ForumPage({
  editNoteId,
  onEditConsumed,
}: {
  editNoteId?: string | null;
  onEditConsumed?: () => void;
}) {
  const { mentorId, status } = useMentorDashboard();

  if (status !== "approved") {
    return (
      <HqPageShell kind="Sessions" title="The Forum">
        <ApprovalLockedCard landmark="The Forum" />
      </HqPageShell>
    );
  }

  return (
    <ForumContent mentorId={mentorId} editNoteId={editNoteId} onEditConsumed={onEditConsumed} />
  );
}

function ForumContent({
  mentorId,
  editNoteId,
  onEditConsumed,
}: {
  mentorId: string;
  editNoteId?: string | null;
  onEditConsumed?: () => void;
}) {
  const upcoming = useMentorUpcoming(mentorId);
  const past = usePastEndedBookings(mentorId);

  const [profile, setProfile] = useState<{
    name: string;
    meta: string;
    docs: SharedDoc[];
    schools: School[];
  } | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const openProfile = async (studentId: string, name: string, meta: string) => {
    const { data, error } = await supabase.rpc("get_student_overview_for_mentor", {
      _student_id: studentId,
    });
    if (error) {
      toast.error("Couldn't load this student's documents.");
      return;
    }
    const result = (
      data as unknown as { documents?: SharedDoc[]; schools?: School[] }[] | null
    )?.[0];
    setProfile({
      name,
      meta,
      docs: result?.documents ?? [],
      schools: result?.schools ?? [],
    });
  };

  const download = async (doc: SharedDoc) => {
    setDownloading(doc.id);
    try {
      const { url } = await getDocumentDownloadUrl({ data: { documentId: doc.id } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Couldn't open that document. You may no longer have access.");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <HqPageShell
      kind="Sessions"
      title="The Forum"
      intro="Your sessions, the students you're meeting, and the documents they've shared with you."
    >
      <div className="space-y-10">
        {/* Upcoming */}
        <section>
          <HqSectionTitle>Upcoming sessions</HqSectionTitle>
          {upcoming.isLoading ? (
            <HqLoading rows={3} />
          ) : (upcoming.data ?? []).length === 0 ? (
            <HqEmpty icon={<CalendarClock className="h-6 w-6" aria-hidden="true" />}>
              No upcoming sessions yet.
            </HqEmpty>
          ) : (
            <ul className="space-y-3">
              {(upcoming.data ?? []).map((s) => (
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
                          {s.student?.school}
                        </p>
                        <p className="mt-1 text-[12px]" style={{ color: "var(--brand-ink-faint)" }}>
                          {formatBookingDate(s.date)} · {s.time_slot} IST
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            openProfile(
                              s.student_id,
                              s.student?.full_name ?? "Student",
                              [s.student?.grade, s.student?.school].filter(Boolean).join(" · "),
                            )
                          }
                          className="inline-flex h-11 items-center gap-1.5 rounded-full border border-[rgba(250,245,239,0.16)] px-4 text-[13px] font-semibold transition hover:border-[rgba(250,245,239,0.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-rose)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--brand-night)]"
                        >
                          <User className="h-4 w-4" aria-hidden="true" />
                          View profile
                        </button>
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

        {/* Past */}
        <section>
          <HqSectionTitle>Past sessions</HqSectionTitle>
          {past.isLoading ? (
            <HqLoading rows={2} />
          ) : (past.data ?? []).length === 0 ? (
            <HqEmpty icon={<CalendarClock className="h-6 w-6" aria-hidden="true" />}>
              No past sessions yet.
            </HqEmpty>
          ) : (
            <ul className="space-y-3">
              {(past.data ?? []).map((b) => (
                <li key={b.id}>
                  <HqCard>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-display text-base font-semibold">{b.student_name}</p>
                        <p className="text-[12px]" style={{ color: "var(--brand-ink-faint)" }}>
                          {b.date ? formatBookingDate(b.date) : "Session"}
                          {b.time_slot ? ` · ${b.time_slot} IST` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openProfile(b.student_id, b.student_name, "")}
                        className="inline-flex h-11 items-center gap-1.5 rounded-full border border-[rgba(250,245,239,0.16)] px-4 text-[13px] font-semibold transition hover:border-[rgba(250,245,239,0.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-rose)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--brand-night)]"
                      >
                        <User className="h-4 w-4" aria-hidden="true" />
                        View profile
                      </button>
                    </div>
                  </HqCard>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Session notes desk — the existing editor (kept so the ?edit deep-link
            still works). It is the one light surface inside the dark Forum. */}
        <section>
          <HqSectionTitle sub="Write up what you covered. Students see your summary on their dashboard.">
            Session notes
          </HqSectionTitle>
          <div className="rounded-2xl bg-[var(--brand-paper)] p-4 sm:p-6">
            <PostSessionNotesSection
              mentorId={mentorId}
              editNoteId={editNoteId}
              onEditConsumed={onEditConsumed}
            />
          </div>
        </section>
      </div>

      {/* Student profile + shared documents panel */}
      {profile ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(8,7,6,0.66)" }}
            onClick={() => setProfile(null)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${profile.name} — shared documents`}
            className="hq-shell relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[rgba(250,245,239,0.12)] p-6 shadow-2xl"
            style={{ background: "#1f1c19", color: "var(--brand-paper)" }}
          >
            <button
              type="button"
              onClick={() => setProfile(null)}
              aria-label="Close"
              className="absolute right-4 top-4 rounded-full p-1.5 transition hover:bg-[rgba(250,245,239,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-rose)]"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <h3 className="font-display text-xl font-bold">{profile.name}</h3>
            {profile.meta ? (
              <p className="text-[12px]" style={{ color: "var(--brand-ink-faint)" }}>
                {profile.meta}
              </p>
            ) : null}

            {profile.schools.length > 0 ? (
              <div className="mt-5">
                <p
                  className="text-[12px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: "var(--brand-ink-faint)" }}
                >
                  School list
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {profile.schools.map((s) => (
                    <span
                      key={s.id}
                      className="rounded-full border border-[rgba(250,245,239,0.14)] bg-[rgba(250,245,239,0.05)] px-3 py-1 text-[12px]"
                    >
                      {s.name}{" "}
                      <span style={{ color: "var(--brand-ink-faint)" }}>· {s.category}</span>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5">
              <p
                className="text-[12px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: "var(--brand-ink-faint)" }}
              >
                Shared documents
              </p>
              {profile.docs.length === 0 ? (
                <p className="mt-2 text-[13px]" style={{ color: "var(--brand-ink-faint)" }}>
                  No documents shared.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {profile.docs.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(250,245,239,0.1)] bg-[rgba(250,245,239,0.04)] px-3 py-2.5"
                    >
                      <span className="flex min-w-0 items-center gap-2 text-[13px]">
                        <FileText
                          className="h-4 w-4 shrink-0"
                          style={{ color: "var(--brand-rose)" }}
                          aria-hidden="true"
                        />
                        <span className="min-w-0">
                          <span className="block truncate">{d.file_name}</span>
                          <span className="text-[11px]" style={{ color: "var(--brand-ink-faint)" }}>
                            {formatBookingDate((d.created_at ?? "").slice(0, 10))}
                            {formatBytes(d.size_bytes) ? ` · ${formatBytes(d.size_bytes)}` : ""}
                          </span>
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => download(d)}
                        disabled={downloading === d.id}
                        aria-label={`Download ${d.file_name}`}
                        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-[rgba(250,245,239,0.16)] px-3.5 text-[12px] font-semibold transition hover:border-[rgba(250,245,239,0.34)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-rose)]"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        {downloading === d.id ? "Opening…" : "Download"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </HqPageShell>
  );
}
