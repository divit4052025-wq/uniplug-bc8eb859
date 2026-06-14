import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { ErrorBanner } from "@/components/ui/error-banner";
import { formatBookingDate } from "@/lib/time";

// P10c: money is AUTHORITATIVE server-side. This view never recomputes earnings
// from the mutable bookings row — it reads get_mentor_earnings() (a SECURITY
// DEFINER accessor over the immutable payment_ledger.mentor_share snapshot) for
// the mentor's own share, and the mentor's own mentor_payouts rows for the
// weekly payout-batch history. Amounts shown are the mentor's share AFTER
// UniPlug's platform fee; states are labelled honestly (pending / scheduled /
// paid / refunded). V1 disbursement is deferred, so accruals sit at 'scheduled'.

type PayoutState = "pending" | "scheduled" | "paid" | "refunded" | string;

type EarningsResponse = {
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

type PayoutBatch = {
  id: string;
  amount_inr: number;
  status: string;
  payout_date: string | null;
  period_end: string | null;
};

type EarningsData = {
  earnings: EarningsResponse;
  payouts: PayoutBatch[];
};

const fmt = (n: number) => `₹${(n ?? 0).toLocaleString("en-IN")}`;

// Text tones darkened to clear WCAG AA (4.5:1) on their /15 tints (the rose
// #C4907F and green #3F9D6E at full strength fell short for 11px text).
const STATE_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-[#EDE0DB] text-[#1A1A1A]" },
  scheduled: { label: "Scheduled", cls: "bg-[#C4907F]/15 text-[#A8674F]" },
  paid: { label: "Paid out", cls: "bg-[#3F9D6E]/15 text-[#256B49]" },
  refunded: { label: "Refunded", cls: "bg-[#1A1A1A]/10 text-[#1A1A1A]/70" },
};

function StateBadge({ state }: { state: PayoutState }) {
  const meta = STATE_LABEL[state] ?? { label: state, cls: "bg-[#EDE0DB] text-[#1A1A1A]" };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}

export function EarningsSection({ mentorId }: { mentorId: string }) {
  const { data, isLoading, isError, refetch } = useQuery<EarningsData>({
    queryKey: ["mentor-earnings", mentorId],
    queryFn: async () => {
      // Authoritative earnings (ledger-sourced, mentor-scoped via auth.uid()).
      const { data: earnings, error: eErr } = await supabase.rpc("get_mentor_earnings");
      if (eErr) throw eErr;

      // Payout-batch history — the mentor's OWN rows (RLS: auth.uid()=mentor_id).
      // Explicit column allowlist; never select(*).
      const { data: payouts, error: pErr } = await supabase
        .from("mentor_payouts")
        .select("id, amount_inr, status, payout_date, period_end")
        .eq("mentor_id", mentorId)
        .order("payout_date", { ascending: false, nullsFirst: false })
        .order("period_end", { ascending: false, nullsFirst: false });
      if (pErr) throw pErr;

      return {
        earnings: earnings as unknown as EarningsResponse,
        payouts: (payouts ?? []) as PayoutBatch[],
      };
    },
  });

  const summary = data?.earnings.summary;
  const sessions = data?.earnings.sessions ?? [];
  const payouts = data?.payouts ?? [];
  const nextPayout = data?.earnings.next_payout_date ?? null;
  const clawback = summary?.clawback_owed_inr ?? 0;

  return (
    <section id="section-earnings" className="scroll-mt-24">
      <h2 className="font-display text-[22px] font-semibold text-[#1A1A1A]">Earnings</h2>
      <p className="mt-1 text-[13px] font-light text-[#1A1A1A]/60">
        Your share after UniPlug's platform fee. Payouts run weekly.
      </p>

      {isError ? (
        <div className="mt-4">
          <ErrorBanner message="Couldn't load your earnings." onRetry={() => void refetch()} />
        </div>
      ) : isLoading ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[92px] animate-pulse rounded-2xl bg-[#EDE0DB]/50" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Pending"
              value={fmt(summary?.pending_inr ?? 0)}
              hint={nextPayout ? `Next payout ${formatBookingDate(nextPayout)}` : "Awaiting payout"}
            />
            <Stat label="Scheduled" value={fmt(summary?.scheduled_inr ?? 0)} hint="Queued to pay" />
            <Stat label="Paid out" value={fmt(summary?.paid_inr ?? 0)} hint="Marked paid out" />
            <Stat
              label="Lifetime (net)"
              value={fmt(summary?.lifetime_net_inr ?? 0)}
              hint={`${summary?.paid_session_count ?? 0} paid session${
                (summary?.paid_session_count ?? 0) === 1 ? "" : "s"
              }`}
            />
          </div>

          {clawback > 0 && (
            <p className="mt-3 rounded-xl border-l-4 border-[#C4907F] bg-[#EDE0DB]/60 px-4 py-2.5 text-[12px] text-[#1A1A1A]/80">
              {fmt(clawback)} from refunded sessions will be adjusted against a future payout.
            </p>
          )}

          {/* Per-session breakdown */}
          <h3
            id="earnings-sessions-heading"
            className="mt-8 font-display text-[16px] font-semibold text-[#1A1A1A]"
          >
            Session earnings
          </h3>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB]">
            <table
              aria-labelledby="earnings-sessions-heading"
              className="w-full min-w-[420px] text-left text-[13px]"
            >
              <thead className="bg-[#EDE0DB]/50 text-[11px] uppercase tracking-wide text-[#1A1A1A]/60">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Your share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDE0DB] text-[#1A1A1A]">
                {sessions.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-8 text-center text-[13px] font-light text-[#1A1A1A]/60"
                    >
                      No earnings yet. Completed paid sessions will appear here.
                    </td>
                  </tr>
                )}
                {sessions.map((s) => (
                  <tr key={s.booking_id}>
                    <td className="px-4 py-3 text-[#1A1A1A]/80">{formatBookingDate(s.date)}</td>
                    <td className="px-4 py-3">
                      <StateBadge state={s.payout_state} />
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{fmt(s.mentor_share_inr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Weekly payout-batch history */}
          {payouts.length > 0 && (
            <>
              <h3
                id="earnings-payouts-heading"
                className="mt-8 font-display text-[16px] font-semibold text-[#1A1A1A]"
              >
                Payout history
              </h3>
              <div className="mt-3 overflow-x-auto rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB]">
                <table
                  aria-labelledby="earnings-payouts-heading"
                  className="w-full min-w-[420px] text-left text-[13px]"
                >
                  <thead className="bg-[#EDE0DB]/50 text-[11px] uppercase tracking-wide text-[#1A1A1A]/60">
                    <tr>
                      <th className="px-4 py-3 font-medium">Period ending</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EDE0DB] text-[#1A1A1A]">
                    {payouts.map((p) => (
                      <tr key={p.id}>
                        <td className="px-4 py-3 text-[#1A1A1A]/80">
                          {p.period_end
                            ? formatBookingDate(p.period_end.slice(0, 10))
                            : p.payout_date
                              ? formatBookingDate(p.payout_date)
                              : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <StateBadge state={p.status === "scheduled" ? "scheduled" : p.status} />
                        </td>
                        <td className="px-4 py-3 text-right font-medium">{fmt(p.amount_inr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[#1A1A1A]/60">{label}</p>
      <p className="mt-2 font-display text-[24px] font-semibold text-[#1A1A1A]">{value}</p>
      {hint && <p className="mt-1 text-[11px] font-light text-[#1A1A1A]/50">{hint}</p>}
    </div>
  );
}
