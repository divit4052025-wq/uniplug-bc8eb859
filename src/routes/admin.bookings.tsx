import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Snowflake, IndianRupee } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

/**
 * /admin/bookings — filterable operational ledger of bookings ("sessions" are
 * bookings). Parties are MASKED (identity lives on the user 360). Money is a light
 * read-only summary (paid proxy = confirmed/completed; frozen; refund pending) —
 * the full payments view is Phase 6.
 */
export const Route = createFileRoute("/admin/bookings")({
  component: BookingsLedger,
});

interface LedgerRow {
  id: string;
  student_label: string | null;
  mentor_label: string | null;
  date: string;
  time_slot: string;
  duration: number;
  status: string;
  price: number;
  paid: boolean;
  frozen: boolean;
  refund_pending: boolean;
}

const STATUSES = [
  "reserved",
  "pending_payment",
  "confirmed",
  "completed",
  "cancelled",
  "payment_failed",
  "expired",
] as const;
const STATUS_STYLE: Record<string, string> = {
  confirmed: "bg-[#1f7a4d]/10 text-[#1f7a4d]",
  completed: "bg-[#1A1A1A]/[0.06] text-[#1A1A1A]/60",
  pending_payment: "bg-[#c9a227]/15 text-[#8a6d00]",
  reserved: "bg-[#c9a227]/15 text-[#8a6d00]",
  cancelled: "bg-[#b4453b]/10 text-[#b4453b]",
  payment_failed: "bg-[#b4453b]/10 text-[#b4453b]",
  expired: "bg-[#1A1A1A]/[0.06] text-[#1A1A1A]/45",
};

function BookingsLedger() {
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [frozenOnly, setFrozenOnly] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "bookings", "ledger", status, from, to, frozenOnly],
    queryFn: async (): Promise<LedgerRow[]> => {
      const { data, error } = await supabase.rpc("admin_list_bookings_ledger", {
        _status: status || undefined,
        _from: from || undefined,
        _to: to || undefined,
        _frozen_only: frozenOnly,
        _limit: 300,
      });
      if (error) throw error;
      return (data ?? []) as LedgerRow[];
    },
  });

  const rows = data ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-[#D7DAE0] bg-white px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#15171C]"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-[12px] text-[#1A1A1A]/55">
          from
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-[#D7DAE0] bg-white px-2 py-1 text-[12px]"
          />
        </label>
        <label className="flex items-center gap-1 text-[12px] text-[#1A1A1A]/55">
          to
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-[#D7DAE0] bg-white px-2 py-1 text-[12px]"
          />
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-[#1A1A1A]/60">
          <input
            type="checkbox"
            checked={frozenOnly}
            onChange={(e) => setFrozenOnly(e.target.checked)}
          />
          frozen only
        </label>
        {rows.length > 0 && (
          <span className="ml-auto text-[11.5px] text-[#1A1A1A]/40">{rows.length} bookings</span>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-[#E3E5E9] bg-white">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-[#E3E5E9] bg-[#FAFBFC] text-left text-[11px] uppercase tracking-wide text-[#1A1A1A]/45">
              <th className="px-3 py-2 font-semibold">When</th>
              <th className="px-3 py-2 font-semibold">Student</th>
              <th className="px-3 py-2 font-semibold">Mentor</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 text-right font-semibold">Price</th>
              <th className="px-3 py-2 font-semibold">Flags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EDEFF2]">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-[#1A1A1A]/40">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-[13px] text-[#b4453b]">
                  Could not load the ledger.
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-[13px] text-[#1A1A1A]/45">
                  No bookings match.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const to = {
                  to: "/admin/bookings/$bookingId" as const,
                  params: { bookingId: r.id },
                };
                return (
                  <tr key={r.id} className="cursor-pointer hover:bg-[#FAFBFC]">
                    <td className="px-3 py-2">
                      <Link {...to} className="block">
                        <span className="font-mono text-[11.5px] text-[#1A1A1A]/70">{r.date}</span>{" "}
                        <span className="text-[#1A1A1A]/45">{r.time_slot}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-[#1A1A1A]/70">
                      <Link {...to} className="block">
                        {r.student_label}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-[#1A1A1A]/70">
                      <Link {...to} className="block">
                        {r.mentor_label}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Link {...to}>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[r.status] ?? ""}`}
                        >
                          {r.status.replace("_", " ")}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11.5px] text-[#1A1A1A]/70">
                      <Link {...to} className="inline-flex items-center justify-end gap-0.5">
                        <IndianRupee className="h-3 w-3 opacity-50" />
                        {r.price}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Link {...to} className="flex items-center gap-1.5">
                        {r.frozen && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-[#3b6bb4]/10 px-1.5 py-0.5 text-[10.5px] font-medium text-[#3b6bb4]">
                            <Snowflake className="h-2.5 w-2.5" /> frozen
                          </span>
                        )}
                        {r.refund_pending && (
                          <span className="rounded bg-[#c9a227]/15 px-1.5 py-0.5 text-[10.5px] font-medium text-[#8a6d00]">
                            refund pending
                          </span>
                        )}
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
