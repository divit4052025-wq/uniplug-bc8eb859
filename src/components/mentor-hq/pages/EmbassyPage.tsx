import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LifeBuoy, Phone, ShieldAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { HqCard, HqEmpty, HqLoading, HqPageShell } from "@/components/mentor-hq/HqPageShell";
import { useMentorDashboard } from "@/components/mentor-dashboard/MentorDashboardContext";
import { supabase } from "@/integrations/supabase/client";
import { useOptimisticMutation } from "@/lib/hooks/useOptimisticMutation";
import { formatBookingDate } from "@/lib/time";
import { ApprovalLockedCard, HqSectionTitle, StatusChip } from "./shared";

const SAFETY_CATEGORIES: { value: string; label: string }[] = [
  { value: "grooming", label: "Grooming" },
  { value: "harassment", label: "Harassment" },
  { value: "inappropriate_content", label: "Inappropriate content" },
  { value: "safety_threat", label: "Safety threat" },
  { value: "other", label: "Something else" },
];

export function EmbassyPage() {
  const { status } = useMentorDashboard();

  return (
    <HqPageShell
      kind="Support"
      title="The Embassy"
      intro="Raise a safety concern, open a dispute about a session, or reach the UniPlug team."
    >
      <div className="space-y-10">
        {/* SAFETY — always reachable, regardless of approval state (child safety). */}
        <SafetyReportSection />

        {/* Mentor tooling — opens on approval. */}
        {status === "approved" ? (
          <>
            <DisputesSection />
            <SupportSection />
          </>
        ) : (
          <section>
            <HqSectionTitle>Disputes & support</HqSectionTitle>
            <ApprovalLockedCard landmark="Disputes & support" />
          </section>
        )}
      </div>
    </HqPageShell>
  );
}

function SafetyReportSection() {
  const [category, setCategory] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!category) {
      toast.error("Please choose a category.");
      return;
    }
    if (!body.trim()) {
      toast.error("Please describe the concern.");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("submit_safety_report", {
        _category: category,
        _body: body.trim(),
      });
      if (error) throw error;
      toast.success("Report submitted. Thank you for raising this.");
      setCategory("");
      setBody("");
    } catch {
      toast.error("Couldn't submit your report. Please try again, or call Childline 1098.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <HqSectionTitle sub="If a child may be at risk, tell us — and call Childline 1098 now.">
        Report a safety concern
      </HqSectionTitle>

      <HqCard className="border-[#C4907F]/40 bg-[#F3E3DC]/50">
        <div className="flex items-start gap-3">
          <ShieldAlert
            className="mt-0.5 h-5 w-5 shrink-0"
            style={{ color: "#C4907F" }}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            {/* Honest gating notice — do NOT imply 24/7 monitoring is live. */}
            <div className="rounded-xl border-l-2 border-[#C4907F] bg-[#F3E3DC]/60 px-3.5 py-2.5 text-[13px] text-[#1A1A1A]">
              We're bringing this safeguarding channel online. Reports are recorded now, and will be
              monitored and actioned once UniPlug's safeguarding response is fully confirmed — this
              is
              <span className="font-semibold"> not yet a 24/7 monitored line.</span> If a child is
              in immediate danger, do not wait for us.
            </div>

            {/* Standing escalation — always visible, static. */}
            <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-[#EDE0DB] bg-[#FFFCFB] px-3.5 py-2.5">
              <Phone className="h-4 w-4 shrink-0" style={{ color: "#C4907F" }} aria-hidden="true" />
              <p className="text-[13px]">
                <span className="font-semibold">Childline 1098</span>{" "}
                <span className="text-[#1A1A1A]/55">
                  — India's 24/7 free helpline for children in need of care and protection.
                </span>
              </p>
            </div>

            {/* Form */}
            <div className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor="safety-category"
                  className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#1A1A1A]/60"
                >
                  Category
                </label>
                <select
                  id="safety-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-xl border border-[#EDE0DB] bg-[#FFFCFB] px-3 text-[14px] text-[#1A1A1A] focus:border-[#C4907F] focus:outline-none focus:ring-2 focus:ring-[#C4907F]/20"
                >
                  <option value="">— choose a category —</option>
                  {SAFETY_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="safety-body"
                  className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#1A1A1A]/60"
                >
                  What happened
                </label>
                <textarea
                  id="safety-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value.slice(0, 5000))}
                  rows={5}
                  placeholder="Describe what you saw or experienced. Include names, dates and session details if you can."
                  className="mt-1.5 w-full resize-none rounded-xl border border-[#EDE0DB] bg-[#FFFCFB] px-4 py-3 text-[14px] text-[#1A1A1A] placeholder:text-[#1A1A1A]/40 focus:border-[#C4907F] focus:outline-none focus:ring-2 focus:ring-[#C4907F]/20"
                />
                <p className="mt-1 text-right text-[11px] text-[#1A1A1A]/55">{body.length}/5000</p>
              </div>

              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#1A1A1A] px-6 text-[14px] font-bold text-[#FAF5EF] transition hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4907F]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFFCFB]"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Submitting…
                  </>
                ) : (
                  "Submit report"
                )}
              </button>
            </div>
          </div>
        </div>
      </HqCard>
    </section>
  );
}

type DisputeRow = {
  id: string;
  booking_id: string | null;
  reason: string;
  status: string;
  created_at: string;
};

function DisputesSection() {
  const { mentorId } = useMentorDashboard();
  const qc = useQueryClient();
  const disputesKey = ["mentor-disputes", mentorId] as const;

  const [bookingId, setBookingId] = useState("");
  const [reason, setReason] = useState("");

  const { data: disputes = [], isLoading } = useQuery<DisputeRow[]>({
    queryKey: disputesKey,
    queryFn: async () => {
      // Openers-view-own RLS covers this; explicit columns, no select(*).
      const { data, error } = await supabase
        .from("disputes")
        .select("id, booking_id, reason, status, created_at")
        .eq("opened_by", mentorId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DisputeRow[];
    },
  });

  // Booking options to dispute (mentor's own bookings, newest first).
  const { data: bookingOptions = [] } = useQuery<{ id: string; label: string }[]>({
    queryKey: ["mentor-all-bookings", mentorId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_bookings_as_mentor");
      if (error) throw error;
      const rows = (data ?? [])
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date) || b.time_slot.localeCompare(a.time_slot));
      return rows.map((r) => ({
        id: r.id,
        label: `${formatBookingDate(r.date)} · ${r.time_slot} · ${r.status}`,
      }));
    },
  });

  const openDispute = useOptimisticMutation<DisputeRow[], void, void>({
    mutationFn: async () => {
      const { error } = await supabase.rpc("open_dispute", {
        _booking_id: bookingId,
        _reason: reason.trim(),
      });
      if (error) throw error;
    },
    queryKeys: [disputesKey],
    optimisticUpdate: (old) => old,
    successMessage: "Dispute opened. The UniPlug team will review it.",
    errorMessage: (err) => (err instanceof Error ? err.message : "Couldn't open the dispute."),
    mutationOptions: {
      onSuccess: () => {
        setBookingId("");
        setReason("");
        void qc.invalidateQueries({ queryKey: disputesKey });
      },
    },
  });

  const canSubmit = !!bookingId && reason.trim().length > 0 && !openDispute.isPending;

  return (
    <section>
      <HqSectionTitle sub="Flag a problem with a specific session. An open dispute pauses that session's payout while we review.">
        Disputes
      </HqSectionTitle>

      {/* Existing disputes */}
      {isLoading ? (
        <HqLoading rows={2} />
      ) : disputes.length === 0 ? (
        <HqEmpty>No open disputes.</HqEmpty>
      ) : (
        <ul className="space-y-3">
          {disputes.map((d) => (
            <li key={d.id}>
              <HqCard>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-[#1A1A1A]">{d.reason}</p>
                    <p className="mt-1 text-[12px] text-[#1A1A1A]/55">
                      Opened {formatBookingDate((d.created_at ?? "").slice(0, 10))}
                    </p>
                  </div>
                  <StatusChip state={d.status} label={d.status} />
                </div>
              </HqCard>
            </li>
          ))}
        </ul>
      )}

      {/* Open a dispute */}
      <HqCard className="mt-4">
        <p className="text-sm font-semibold">Open a dispute</p>
        <div className="mt-3 space-y-3">
          <div>
            <label
              htmlFor="dispute-booking"
              className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#1A1A1A]/60"
            >
              Session
            </label>
            <select
              id="dispute-booking"
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-[#EDE0DB] bg-[#FFFCFB] px-3 text-[14px] text-[#1A1A1A] focus:border-[#C4907F] focus:outline-none focus:ring-2 focus:ring-[#C4907F]/20"
            >
              <option value="">— pick a session —</option>
              {bookingOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
            {bookingOptions.length === 0 ? (
              <p className="mt-1.5 text-[12px] text-[#1A1A1A]/55">
                You have no sessions to dispute yet.
              </p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="dispute-reason"
              className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#1A1A1A]/60"
            >
              What's wrong
            </label>
            <textarea
              id="dispute-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="Explain the issue with this session."
              className="mt-1.5 w-full resize-none rounded-xl border border-[#EDE0DB] bg-[#FFFCFB] px-4 py-3 text-[14px] text-[#1A1A1A] placeholder:text-[#1A1A1A]/40 focus:border-[#C4907F] focus:outline-none focus:ring-2 focus:ring-[#C4907F]/20"
            />
          </div>

          <button
            type="button"
            onClick={() => openDispute.mutate()}
            disabled={!canSubmit}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#1A1A1A]/15 px-6 text-[13px] font-semibold text-[#1A1A1A] transition hover:border-[#1A1A1A]/30 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4907F]/30"
          >
            {openDispute.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Opening…
              </>
            ) : (
              "Open dispute"
            )}
          </button>
        </div>
      </HqCard>
    </section>
  );
}

function SupportSection() {
  return (
    <section>
      <HqSectionTitle>Contact support</HqSectionTitle>
      <HqCard>
        <div className="flex items-start gap-3">
          <LifeBuoy
            className="mt-0.5 h-5 w-5 shrink-0"
            style={{ color: "#C4907F" }}
            aria-hidden="true"
          />
          <div>
            <p className="text-sm">
              For anything that isn't a safety concern or a session dispute, the UniPlug team is
              here to help.
            </p>
            <a
              href="mailto:support@uniplug.app"
              className="mt-2 inline-flex h-10 items-center rounded-md border border-[#1A1A1A]/15 px-4 text-[13px] font-semibold text-[#1A1A1A] transition hover:border-[#1A1A1A]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4907F]/30"
            >
              support@uniplug.app
            </a>
          </div>
        </div>
      </HqCard>
    </section>
  );
}
