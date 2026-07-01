import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ShieldCheck, ShieldAlert } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

/**
 * /admin/verification — mentor applications queue. Read via
 * admin_list_mentor_applications (is_admin-gated) which surfaces the SERVER-SIDE
 * mentor_is_adult() 18+ result and doc-presence flags. Raw ID documents are NOT
 * here — they are super-admin-only + logged, viewed on the case screen.
 */
export const Route = createFileRoute("/admin/verification")({
  component: VerificationQueue,
});

interface AppRow {
  id: string;
  full_name: string | null;
  university: string | null;
  course: string | null;
  status: string;
  tier: string;
  is_adult: boolean;
  has_id_doc: boolean;
  application_submitted_at: string | null;
  created_at: string;
}

const STATUS_TABS = ["pending", "approved", "rejected", "all"] as const;
const STATUS_STYLE: Record<string, string> = {
  pending: "bg-[#c9a227]/15 text-[#8a6d00]",
  approved: "bg-[#1f7a4d]/10 text-[#1f7a4d]",
  rejected: "bg-[#b4453b]/10 text-[#b4453b]",
};

function age(ts: string): string {
  const ms = Date.now() - new Date(ts).getTime();
  const h = Math.floor(ms / 3.6e6);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function VerificationQueue() {
  const [tab, setTab] = useState<(typeof STATUS_TABS)[number]>("pending");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "mentor-applications", tab],
    queryFn: async (): Promise<AppRow[]> => {
      const { data, error } = await supabase.rpc("admin_list_mentor_applications", {
        _status: tab === "all" ? undefined : tab,
      });
      if (error) throw error;
      return (data ?? []) as AppRow[];
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
            {t}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-[#E3E5E9] bg-white">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-[#E3E5E9] bg-[#FAFBFC] text-left text-[11px] uppercase tracking-wide text-[#1A1A1A]/45">
              <th className="px-3 py-2 font-semibold">Mentor</th>
              <th className="px-3 py-2 font-semibold">College</th>
              <th className="px-3 py-2 font-semibold">Tier</th>
              <th className="px-3 py-2 font-semibold">18+</th>
              <th className="px-3 py-2 font-semibold">ID doc</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Applied</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EDEFF2]">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-[#1A1A1A]/40">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-[13px] text-[#b4453b]">
                  Could not load applications.
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-[13px] text-[#1A1A1A]/45">
                  No mentors in this view.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const to = {
                  to: "/admin/verification/$mentorId" as const,
                  params: { mentorId: r.id },
                };
                return (
                  <tr key={r.id} className="cursor-pointer hover:bg-[#FAFBFC]">
                    <td className="px-3 py-2 font-medium text-[#1A1A1A]/85">
                      <Link {...to} className="block">
                        {r.full_name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-[#1A1A1A]/70">
                      <Link {...to} className="block">
                        {[r.university, r.course].filter(Boolean).join(" · ") || "—"}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Link {...to}>
                        {r.tier === "enhanced" ? (
                          <span className="rounded bg-[#7b5ea7]/12 px-1.5 py-0.5 text-[11px] font-medium text-[#5b4585]">
                            enhanced
                          </span>
                        ) : (
                          <span className="text-[#1A1A1A]/45">standard</span>
                        )}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Link {...to}>
                        {r.is_adult ? (
                          <ShieldCheck className="h-4 w-4 text-[#1f7a4d]" />
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#b4453b]">
                            <ShieldAlert className="h-3.5 w-3.5" />
                            not 18+
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Link {...to}>
                        {r.has_id_doc ? (
                          <span className="text-[#1f7a4d]">✓</span>
                        ) : (
                          <span className="text-[#1A1A1A]/30">—</span>
                        )}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Link {...to}>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[r.status] ?? ""}`}
                        >
                          {r.status}
                        </span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-[#1A1A1A]/50">
                      <Link {...to} className="block">
                        {r.application_submitted_at ? (
                          age(r.application_submitted_at)
                        ) : (
                          <span className="italic text-[#1A1A1A]/35">not submitted</span>
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
