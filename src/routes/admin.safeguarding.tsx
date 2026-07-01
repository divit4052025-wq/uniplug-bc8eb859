import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ShieldAlert, MessageSquareWarning } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

/**
 * /admin/safeguarding — the unified reports queue (message_reports + HQ
 * safety_reports) with triage state. Read via admin_list_safeguarding_queue
 * (is_admin-gated, SECURITY DEFINER); party names are PII-MASKED here by default —
 * raw contact is only ever revealed on the case screen via a logged action.
 */
export const Route = createFileRoute("/admin/safeguarding")({
  component: SafeguardingQueue,
});

interface QueueRow {
  source: string;
  report_id: string;
  created_at: string;
  category: string;
  reporter_label: string | null;
  subject_label: string | null;
  status: string;
  severity: string | null;
}

const STATUS_TABS = ["all", "new", "in_review", "actioned", "closed"] as const;

const SEV_COLOR: Record<string, string> = {
  critical: "bg-[#b4453b]",
  high: "bg-[#d08770]",
  medium: "bg-[#c9a227]",
  low: "bg-[#9aa0a6]",
};
const STATUS_STYLE: Record<string, string> = {
  new: "bg-[#b4453b]/10 text-[#b4453b]",
  in_review: "bg-[#c9a227]/15 text-[#8a6d00]",
  actioned: "bg-[#1f7a4d]/10 text-[#1f7a4d]",
  closed: "bg-[#1A1A1A]/[0.06] text-[#1A1A1A]/45",
};

function age(ts: string): string {
  const ms = Date.now() - new Date(ts).getTime();
  const h = Math.floor(ms / 3.6e6);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function SafeguardingQueue() {
  const [tab, setTab] = useState<(typeof STATUS_TABS)[number]>("all");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "safeguarding-queue", tab],
    queryFn: async (): Promise<QueueRow[]> => {
      const { data, error } = await supabase.rpc("admin_list_safeguarding_queue", {
        _status: tab === "all" ? undefined : tab,
        _limit: 200,
      });
      if (error) throw error;
      return (data ?? []) as QueueRow[];
    },
  });

  const rows = data ?? [];

  return (
    <div>
      <div className="mb-4 flex items-center gap-1">
        {STATUS_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-2.5 py-1 text-[12px] font-medium capitalize transition ${
              tab === t ? "bg-[#15171C] text-white" : "text-[#1A1A1A]/55 hover:bg-[#1A1A1A]/[0.05]"
            }`}
          >
            {t.replace("_", " ")}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-[#E3E5E9] bg-white">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-[#E3E5E9] bg-[#FAFBFC] text-left text-[11px] uppercase tracking-wide text-[#1A1A1A]/45">
              <th className="px-3 py-2 font-semibold">Sev</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Kind</th>
              <th className="px-3 py-2 font-semibold">Reporter → Subject</th>
              <th className="px-3 py-2 font-semibold">Age</th>
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
                  Could not load the queue.
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-[13px] text-[#1A1A1A]/45">
                  No reports in this view.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={`${r.source}:${r.report_id}`}
                  className="cursor-pointer hover:bg-[#FAFBFC]"
                >
                  <td className="px-3 py-2">
                    <Link
                      to="/admin/safeguarding/$source/$reportId"
                      params={{ source: r.source, reportId: r.report_id }}
                      className="block"
                    >
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${r.severity ? SEV_COLOR[r.severity] : "bg-[#1A1A1A]/15"}`}
                        title={r.severity ?? "unset"}
                      />
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      to="/admin/safeguarding/$source/$reportId"
                      params={{ source: r.source, reportId: r.report_id }}
                    >
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[r.status] ?? ""}`}
                      >
                        {r.status.replace("_", " ")}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      to="/admin/safeguarding/$source/$reportId"
                      params={{ source: r.source, reportId: r.report_id }}
                      className="flex items-center gap-1.5 text-[#1A1A1A]/70"
                    >
                      {r.source === "message" ? (
                        <MessageSquareWarning className="h-3.5 w-3.5" />
                      ) : (
                        <ShieldAlert className="h-3.5 w-3.5" />
                      )}
                      {r.category.replace(/_/g, " ")}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-[#1A1A1A]/75">
                    <Link
                      to="/admin/safeguarding/$source/$reportId"
                      params={{ source: r.source, reportId: r.report_id }}
                      className="font-mono text-[11.5px]"
                    >
                      {r.reporter_label ?? "?"} <span className="text-[#1A1A1A]/35">→</span>{" "}
                      {r.subject_label ?? "?"}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-[#1A1A1A]/50">
                    <Link
                      to="/admin/safeguarding/$source/$reportId"
                      params={{ source: r.source, reportId: r.report_id }}
                      className="block"
                    >
                      {age(r.created_at)}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
