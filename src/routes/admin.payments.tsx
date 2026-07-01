import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Info } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

/**
 * /admin/payments — READ-ONLY money view. Reconciliation summary + the payment_ledger
 * feed, refund_intents (owed) and mentor_payouts (accrued). No refund/payout is issued
 * here (app-layer + adversarial-review). HONEST: the platform does not yet auto-disburse
 * — pending refunds are OWED and scheduled payouts are ACCRUED (money has not left).
 */
export const Route = createFileRoute("/admin/payments")({
  component: PaymentsView,
});

const inr = (n: number | null | undefined) => `₹${(n ?? 0).toLocaleString("en-IN")}`;

interface Summary {
  gross_captured_inr: number;
  mentor_share_accrued_inr: number;
  platform_fee_inr: number;
  captured_count: number;
  total_refunded_inr: number;
  clawback_owed_inr: number;
  refund_owed_inr: number;
  refund_owed_count: number;
  payout_scheduled_inr: number;
  payout_scheduled_count: number;
  payout_paid_inr: number;
  payout_paid_count: number;
}

const TABS = ["ledger", "refunds", "payouts"] as const;
const EVENT_TYPES = [
  "order_created",
  "order_create_failed",
  "payment_captured",
  "payment_failed",
  "refund_created",
  "refund_processed",
  "clawback_owed",
] as const;
const STATUS_PILL: Record<string, string> = {
  pending: "bg-[#c9a227]/15 text-[#8a6d00]",
  scheduled: "bg-[#c9a227]/15 text-[#8a6d00]",
  processed: "bg-[#1f7a4d]/10 text-[#1f7a4d]",
  paid: "bg-[#1f7a4d]/10 text-[#1f7a4d]",
  failed: "bg-[#b4453b]/10 text-[#b4453b]",
};

function PaymentsView() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("ledger");

  const summary = useQuery({
    queryKey: ["admin", "payments", "summary"],
    queryFn: async (): Promise<Summary | null> => {
      const { data, error } = await supabase.rpc("admin_payments_summary");
      if (error) throw error;
      return ((data ?? [])[0] as Summary) ?? null;
    },
  });
  const s = summary.data;

  return (
    <div className="space-y-5">
      {/* summary cards */}
      <div className="grid grid-cols-5 gap-3">
        <Card
          label="Gross captured"
          value={inr(s?.gross_captured_inr)}
          sub={`${s?.captured_count ?? 0} payments`}
        />
        <Card label="Platform fee (20%)" value={inr(s?.platform_fee_inr)} />
        <Card
          label="Mentor share (gross)"
          value={inr(s?.mentor_share_accrued_inr)}
          sub="at capture, pre-refund"
        />
        <Card
          label="Refunds owed"
          value={inr(s?.refund_owed_inr)}
          sub={`${s?.refund_owed_count ?? 0} pending`}
          tone="warn"
        />
        <Card
          label="Payouts accrued"
          value={inr(s?.payout_scheduled_inr)}
          sub={`${s?.payout_scheduled_count ?? 0} scheduled`}
          tone="warn"
        />
      </div>
      <div className="flex items-start gap-1.5 rounded-md border border-[#c9a227]/25 bg-[#c9a227]/[0.06] px-3 py-2 text-[11.5px] text-[#8a6d00]">
        <Info className="mt-px h-3.5 w-3.5 shrink-0" />
        Refunds owed and payouts accrued have{" "}
        <strong className="mx-1 font-semibold">not been disbursed</strong> — the platform has no
        automated refund/payout executor yet. Total refunded to date (Razorpay):{" "}
        {inr(s?.total_refunded_inr)}.
      </div>

      {/* tabs */}
      <div>
        <div className="mb-3 flex items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium capitalize transition ${
                tab === t
                  ? "bg-[#15171C] text-white"
                  : "text-[#1A1A1A]/55 hover:bg-[#1A1A1A]/[0.05]"
              }`}
            >
              {t === "refunds" ? "Refunds owed" : t === "payouts" ? "Payouts" : "Ledger"}
            </button>
          ))}
        </div>
        {tab === "ledger" && <LedgerTab />}
        {tab === "refunds" && <RefundsTab />}
        {tab === "payouts" && <PayoutsTab />}
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "warn";
}) {
  return (
    <div
      className={`rounded-lg border bg-white p-3 ${tone === "warn" ? "border-[#c9a227]/30" : "border-[#E3E5E9]"}`}
    >
      <div className="text-[10.5px] uppercase tracking-wide text-[#1A1A1A]/45">{label}</div>
      <div className="mt-1 text-[18px] font-semibold text-[#1A1A1A]/85">{value}</div>
      {sub && <div className="text-[11px] text-[#1A1A1A]/45">{sub}</div>}
    </div>
  );
}

function TableShell({
  head,
  loading,
  empty,
  rows,
}: {
  head: string[];
  loading: boolean;
  empty: boolean;
  rows: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-[#E3E5E9] bg-white">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-[#E3E5E9] bg-[#FAFBFC] text-left text-[11px] uppercase tracking-wide text-[#1A1A1A]/45">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EDEFF2]">
          {loading ? (
            <tr>
              <td colSpan={head.length} className="px-3 py-10 text-center text-[#1A1A1A]/40">
                <Loader2 className="mx-auto h-4 w-4 animate-spin" />
              </td>
            </tr>
          ) : empty ? (
            <tr>
              <td
                colSpan={head.length}
                className="px-3 py-10 text-center text-[13px] text-[#1A1A1A]/45"
              >
                Nothing here.
              </td>
            </tr>
          ) : (
            rows
          )}
        </tbody>
      </table>
    </div>
  );
}

function LedgerTab() {
  const [eventType, setEventType] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "payments", "ledger", eventType],
    queryFn: async () =>
      (
        await supabase.rpc("admin_list_payment_ledger", {
          _event_type: eventType || undefined,
          _limit: 300,
        })
      ).data ?? [],
  });
  const rows = data ?? [];
  return (
    <div className="space-y-2">
      <select
        value={eventType}
        onChange={(e) => setEventType(e.target.value)}
        className="rounded-md border border-[#D7DAE0] bg-white px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#15171C]"
      >
        <option value="">All events</option>
        {EVENT_TYPES.map((t) => (
          <option key={t} value={t}>
            {t.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      <TableShell
        head={["When", "Event", "Student", "Mentor", "Amount", "Mentor / fee", "Razorpay ref"]}
        loading={isLoading}
        empty={rows.length === 0}
        rows={rows.map(
          (r: {
            id: string;
            created_at: string;
            event_type: string;
            student_label: string | null;
            mentor_label: string | null;
            amount_inr: number | null;
            mentor_share_inr: number | null;
            platform_fee_inr: number | null;
            razorpay_payment_id: string | null;
            razorpay_refund_id: string | null;
          }) => (
            <tr key={r.id} className="hover:bg-[#FAFBFC]">
              <td className="px-3 py-2 font-mono text-[11px] text-[#1A1A1A]/60">
                {new Date(r.created_at).toLocaleDateString()}
              </td>
              <td className="px-3 py-2 text-[#1A1A1A]/75">{r.event_type.replace(/_/g, " ")}</td>
              <td className="px-3 py-2 text-[#1A1A1A]/60">{r.student_label ?? "—"}</td>
              <td className="px-3 py-2 text-[#1A1A1A]/60">{r.mentor_label ?? "—"}</td>
              <td className="px-3 py-2 font-mono text-[11.5px]">
                {r.amount_inr != null ? inr(r.amount_inr) : "—"}
              </td>
              <td className="px-3 py-2 font-mono text-[11px] text-[#1A1A1A]/55">
                {r.mentor_share_inr != null
                  ? `${inr(r.mentor_share_inr)} / ${inr(r.platform_fee_inr)}`
                  : "—"}
              </td>
              <td className="px-3 py-2 font-mono text-[10.5px] text-[#1A1A1A]/45">
                {r.razorpay_payment_id ?? r.razorpay_refund_id ?? "—"}
              </td>
            </tr>
          ),
        )}
      />
    </div>
  );
}

function RefundsTab() {
  const [status, setStatus] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "payments", "refunds", status],
    queryFn: async () =>
      (
        await supabase.rpc("admin_list_refund_intents", {
          _status: status || undefined,
          _limit: 300,
        })
      ).data ?? [],
  });
  const rows = data ?? [];
  return (
    <div className="space-y-2">
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="rounded-md border border-[#D7DAE0] bg-white px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#15171C]"
      >
        <option value="">All</option>
        <option value="pending">pending (owed)</option>
        <option value="processed">processed</option>
        <option value="failed">failed</option>
      </select>
      <TableShell
        head={["Student", "Mentor", "Amount", "Tier", "Reason", "Status", "Raised"]}
        loading={isLoading}
        empty={rows.length === 0}
        rows={rows.map(
          (r: {
            id: string;
            student_label: string | null;
            mentor_label: string | null;
            amount_inr: number;
            tier: string | null;
            reason: string | null;
            source: string | null;
            status: string;
            created_at: string;
          }) => (
            <tr key={r.id} className="hover:bg-[#FAFBFC]">
              <td className="px-3 py-2 text-[#1A1A1A]/60">{r.student_label ?? "—"}</td>
              <td className="px-3 py-2 text-[#1A1A1A]/60">{r.mentor_label ?? "—"}</td>
              <td className="px-3 py-2 font-mono text-[11.5px]">{inr(r.amount_inr)}</td>
              <td className="px-3 py-2 text-[#1A1A1A]/55">{r.tier ?? "—"}</td>
              <td className="px-3 py-2 text-[#1A1A1A]/55">{r.reason ?? r.source ?? "—"}</td>
              <td className="px-3 py-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_PILL[r.status] ?? ""}`}
                >
                  {r.status === "pending" ? "owed" : r.status}
                </span>
              </td>
              <td className="px-3 py-2 font-mono text-[11px] text-[#1A1A1A]/45">
                {new Date(r.created_at).toLocaleDateString()}
              </td>
            </tr>
          ),
        )}
      />
    </div>
  );
}

function PayoutsTab() {
  const [status, setStatus] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "payments", "payouts", status],
    queryFn: async () =>
      (
        await supabase.rpc("admin_list_mentor_payouts", {
          _status: status || undefined,
          _limit: 300,
        })
      ).data ?? [],
  });
  const rows = data ?? [];
  return (
    <div className="space-y-2">
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="rounded-md border border-[#D7DAE0] bg-white px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#15171C]"
      >
        <option value="">All</option>
        <option value="scheduled">scheduled (accrued)</option>
        <option value="paid">paid</option>
        <option value="failed">failed</option>
      </select>
      <TableShell
        head={["Mentor", "Amount", "Period end", "Status", "Created"]}
        loading={isLoading}
        empty={rows.length === 0}
        rows={rows.map(
          (r: {
            id: string;
            mentor_label: string | null;
            amount_inr: number;
            period_end: string | null;
            status: string;
            created_at: string;
          }) => (
            <tr key={r.id} className="hover:bg-[#FAFBFC]">
              <td className="px-3 py-2 text-[#1A1A1A]/70">{r.mentor_label ?? "—"}</td>
              <td className="px-3 py-2 font-mono text-[11.5px]">{inr(r.amount_inr)}</td>
              <td className="px-3 py-2 font-mono text-[11px] text-[#1A1A1A]/55">
                {r.period_end ? new Date(r.period_end).toLocaleDateString() : "—"}
              </td>
              <td className="px-3 py-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_PILL[r.status] ?? ""}`}
                >
                  {r.status === "scheduled" ? "accrued" : r.status}
                </span>
              </td>
              <td className="px-3 py-2 font-mono text-[11px] text-[#1A1A1A]/45">
                {new Date(r.created_at).toLocaleDateString()}
              </td>
            </tr>
          ),
        )}
      />
    </div>
  );
}
