import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  ShieldAlert,
  BadgeCheck,
  HeartHandshake,
  Snowflake,
  UserX,
  IndianRupee,
  Wallet,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

/**
 * /admin (index) — Overview. Real, honest operator dashboard: aggregate counts pulled
 * from admin_overview_stats (is_admin-gated, no PII), each matching the exact
 * open/pending filter of its module so the number equals what you see on click. No
 * invented metrics — an empty queue reads as 0.
 */
export const Route = createFileRoute("/admin/")({
  component: AdminOverview,
});

interface Stats {
  open_safeguarding: number;
  pending_verifications: number;
  consent_pending: number;
  consent_fallout_open: number;
  accounts_moderated: number;
  refunds_owed_count: number;
  refunds_owed_inr: number;
  payouts_accrued_count: number;
  payouts_accrued_inr: number;
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function AdminOverview() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "overview", "stats"],
    queryFn: async (): Promise<Stats | null> => {
      const { data, error } = await supabase.rpc("admin_overview_stats");
      if (error) throw error;
      return ((data ?? [])[0] as Stats) ?? null;
    },
  });

  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-[13px] leading-relaxed text-[#1A1A1A]/70">
        The safeguarding &amp; operations control room. One side of every transaction is a minor, so
        this console is a safeguarding tool first. Every count below is live and matches its
        module&rsquo;s own queue — nothing is invented.
      </p>

      {isLoading ? (
        <div className="mt-6 py-10 text-center text-[#1A1A1A]/40">
          <Loader2 className="mx-auto h-4 w-4 animate-spin" />
        </div>
      ) : isError || !data ? (
        <div className="mt-6 rounded-lg border border-[#b4453b]/30 bg-[#b4453b]/[0.05] px-4 py-3 text-[13px] text-[#b4453b]">
          Could not load the overview.
        </div>
      ) : (
        <>
          <div className="mt-5 mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#1A1A1A]/45">
            Needs attention
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              to="/admin/safeguarding"
              icon={ShieldAlert}
              label="Open safeguarding"
              value={data.open_safeguarding}
              tone={data.open_safeguarding > 0 ? "alert" : "ok"}
            />
            <StatCard
              to="/admin/verification"
              icon={BadgeCheck}
              label="Pending verifications"
              value={data.pending_verifications}
              tone={data.pending_verifications > 0 ? "warn" : "ok"}
            />
            <StatCard
              to="/admin/consent"
              icon={HeartHandshake}
              label="Consent pending"
              value={data.consent_pending}
              tone={data.consent_pending > 0 ? "warn" : "ok"}
            />
            <StatCard
              to="/admin/consent"
              icon={Snowflake}
              label="Consent fallout to resolve"
              value={data.consent_fallout_open}
              tone={data.consent_fallout_open > 0 ? "warn" : "ok"}
            />
            <StatCard
              to="/admin/users"
              icon={UserX}
              label="Moderated accounts"
              value={data.accounts_moderated}
              tone={data.accounts_moderated > 0 ? "warn" : "ok"}
            />
          </div>

          <div className="mt-5 mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#1A1A1A]/45">
            Money (undisbursed)
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              to="/admin/payments"
              icon={IndianRupee}
              label="Refunds owed"
              value={data.refunds_owed_count}
              money={inr(data.refunds_owed_inr)}
              tone={data.refunds_owed_count > 0 ? "warn" : "ok"}
            />
            <StatCard
              to="/admin/payments"
              icon={Wallet}
              label="Payouts accrued"
              value={data.payouts_accrued_count}
              money={inr(data.payouts_accrued_inr)}
              tone={data.payouts_accrued_count > 0 ? "warn" : "ok"}
            />
          </div>
          <p className="mt-3 text-[11.5px] text-[#1A1A1A]/45">
            Refunds owed and payouts accrued have not been disbursed — the platform has no automated
            refund/payout executor yet.
          </p>
        </>
      )}
    </div>
  );
}

function StatCard({
  to,
  icon: Icon,
  label,
  value,
  money,
  tone,
}: {
  to: string;
  icon: typeof ShieldAlert;
  label: string;
  value: number;
  money?: string;
  tone: "alert" | "warn" | "ok";
}) {
  const ring =
    tone === "alert"
      ? "border-[#b4453b]/30 hover:border-[#b4453b]/50"
      : tone === "warn"
        ? "border-[#c9a227]/35 hover:border-[#c9a227]/60"
        : "border-[#E3E5E9] hover:border-[#1A1A1A]/25";
  const valueColor =
    tone === "alert" ? "text-[#b4453b]" : tone === "warn" ? "text-[#8a6d00]" : "text-[#1A1A1A]/40";
  return (
    <Link to={to} className={`rounded-lg border bg-white p-3.5 transition ${ring}`}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-[#1A1A1A]/45">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className={`mt-1.5 text-[24px] font-semibold leading-none ${valueColor}`}>{value}</div>
      {money && <div className="mt-1 text-[12px] text-[#1A1A1A]/55">{money}</div>}
    </Link>
  );
}
