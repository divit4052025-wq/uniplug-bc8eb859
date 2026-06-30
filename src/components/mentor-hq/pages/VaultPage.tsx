import {
  HqCard,
  HqEmpty,
  HqLoading,
  HqStat,
  HqPageShell,
} from "@/components/mentor-hq/HqPageShell";
import { useMentorDashboard } from "@/components/mentor-dashboard/MentorDashboardContext";
import { formatBookingDate, todayInIST } from "@/lib/time";
import { ApprovalLockedCard, HqSectionTitle, StatusChip, inr } from "./shared";
import { useMentorEarnings } from "./data";

export function VaultPage() {
  const { mentorId, status } = useMentorDashboard();

  if (status !== "approved") {
    return (
      <HqPageShell kind="Earnings" title="The Vault">
        <ApprovalLockedCard landmark="The Vault" />
      </HqPageShell>
    );
  }

  return <VaultContent mentorId={mentorId} />;
}

function VaultContent({ mentorId }: { mentorId: string }) {
  const { data, isLoading, isError } = useMentorEarnings(mentorId);

  const summary = data?.summary;
  const sessions = data?.sessions ?? [];
  const paidOut = summary?.paid_inr ?? 0;
  const clawback = summary?.clawback_owed_inr ?? 0;
  const nextPayout = data?.next_payout_date ?? null;

  // "This month" is derived from the AUTHORITATIVE per-session ledger that
  // get_mentor_earnings returns (mentor_share_inr) — never from bookings.price.
  const month = todayInIST().slice(0, 7);
  const thisMonth = sessions
    .filter((s) => (s.date ?? "").slice(0, 7) === month)
    .reduce((sum, s) => sum + (s.mentor_share_inr ?? 0), 0);

  return (
    <HqPageShell
      kind="Earnings"
      title="The Vault"
      intro="Your share is after UniPlug's platform fee. Payouts run weekly; new earnings queue up here first."
    >
      {isError ? (
        <HqCard>
          <p className="text-sm font-light text-[#1A1A1A]/60">
            Couldn't load your earnings right now. Please try again shortly.
          </p>
        </HqCard>
      ) : isLoading ? (
        <HqLoading rows={4} />
      ) : (
        <div className="space-y-8">
          {/* Lead with Pending + Scheduled — money is never presented as disbursed. */}
          <section>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <HqStat
                label="Pending"
                value={inr(summary?.pending_inr)}
                sub={
                  nextPayout ? `Next payout ${formatBookingDate(nextPayout)}` : "Awaiting payout"
                }
              />
              <HqStat label="Scheduled" value={inr(summary?.scheduled_inr)} sub="Queued to pay" />
              <HqStat label="This month" value={inr(thisMonth)} sub="From completed sessions" />
              <HqStat
                label="Lifetime (net)"
                value={inr(summary?.lifetime_net_inr)}
                sub={`${summary?.paid_session_count ?? 0} paid session${
                  (summary?.paid_session_count ?? 0) === 1 ? "" : "s"
                }`}
              />
            </div>

            {/* "Paid out" appears ONLY once a real disbursement exists (v1: never). */}
            {paidOut > 0 ? (
              <div className="mt-3">
                <HqStat label="Paid out" value={inr(paidOut)} sub="Marked paid out" />
              </div>
            ) : null}

            {clawback > 0 ? (
              <div className="mt-3 rounded-xl border-l-2 border-[#C4907F] bg-[#F3E3DC]/60 px-4 py-3 text-[13px] text-[#1A1A1A]">
                {inr(clawback)} from sessions pending refund will be adjusted against a future
                payout.
              </div>
            ) : null}
          </section>

          {/* Per-session ledger */}
          <section>
            <HqSectionTitle sub="Each completed paid session and where its payout stands.">
              Session earnings
            </HqSectionTitle>
            {sessions.length === 0 ? (
              <HqEmpty>No earnings yet. Completed paid sessions will appear here.</HqEmpty>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB]">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="bg-[#EDE0DB]/50 text-[11px] font-semibold uppercase tracking-wide text-[#1A1A1A]/60">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Your share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s, i) => (
                      <tr
                        key={s.booking_id}
                        style={{
                          borderTop: i === 0 ? "none" : "1px solid #EDE0DB",
                        }}
                      >
                        <td className="px-4 py-3 text-[#1A1A1A]/80">{formatBookingDate(s.date)}</td>
                        <td className="px-4 py-3">
                          <StatusChip state={s.payout_state} />
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {inr(s.mentor_share_inr)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </HqPageShell>
  );
}
