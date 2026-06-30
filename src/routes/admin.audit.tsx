import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

/**
 * /admin/audit — the immutable audit log. Reads via admin_list_audit_log()
 * (is_admin()-gated, SECURITY DEFINER), so a non-admin who somehow reached this
 * route still gets nothing. Read-only by construction: the log has no client
 * write/update/delete path.
 */
export const Route = createFileRoute("/admin/audit")({
  component: AuditLogPage,
});

const PAGE = 50;

interface AuditRow {
  id: string;
  actor_id: string;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  justification: string | null;
  created_at: string;
}

function fmt(ts: string): string {
  const d = new Date(ts);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

function AuditLogPage() {
  const [page, setPage] = useState(0);

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["admin", "audit-log", page],
    queryFn: async (): Promise<AuditRow[]> => {
      const { data, error } = await supabase.rpc("admin_list_audit_log", {
        _limit: PAGE,
        _offset: page * PAGE,
      });
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  const rows = data ?? [];

  return (
    <div>
      <p className="mb-4 text-[12px] text-[#1A1A1A]/55">
        Append-only, immutable record of admin actions. Today it captures role grants/revocations
        and the founder bootstrap; each console module wires its own sensitive actions here as it
        ships.
      </p>

      <div className="overflow-hidden rounded-lg border border-[#E3E5E9] bg-white">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-[#E3E5E9] bg-[#FAFBFC] text-left text-[11px] uppercase tracking-wide text-[#1A1A1A]/45">
              <th className="px-3 py-2 font-semibold">Time</th>
              <th className="px-3 py-2 font-semibold">Actor</th>
              <th className="px-3 py-2 font-semibold">Action</th>
              <th className="px-3 py-2 font-semibold">Target</th>
              <th className="px-3 py-2 font-semibold">Justification</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EDEFF2]">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-[#1A1A1A]/40">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-[13px] text-[#b4453b]">
                  Could not load the audit log.
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-[13px] text-[#1A1A1A]/45">
                  {page === 0 ? "No admin actions recorded yet." : "No more entries."}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="align-top hover:bg-[#FAFBFC]">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11.5px] text-[#1A1A1A]/70">
                    {fmt(r.created_at)}
                  </td>
                  <td className="px-3 py-2 text-[#1A1A1A]/80">{r.actor_email ?? r.actor_id}</td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-[#1A1A1A]/[0.06] px-1.5 py-0.5 font-mono text-[11.5px] font-medium">
                      {r.action}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[#1A1A1A]/70">
                    {r.target_label ?? r.target_type ?? "—"}
                    {r.target_id && (
                      <span className="ml-1 font-mono text-[10.5px] text-[#1A1A1A]/40">
                        {r.target_id.slice(0, 8)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[#1A1A1A]/60">{r.justification ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-[12px] text-[#1A1A1A]/55">
        <span>{isFetching ? "Loading…" : `Page ${page + 1}`}</span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || isFetching}
            className="rounded border border-[#D7DAE0] px-2.5 py-1 font-medium disabled:opacity-40"
          >
            Prev
          </button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={rows.length < PAGE || isFetching}
            className="rounded border border-[#D7DAE0] px-2.5 py-1 font-medium disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
