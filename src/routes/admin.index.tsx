import { createFileRoute } from "@tanstack/react-router";

import { ADMIN_NAV } from "@/components/admin/adminNav";

/**
 * /admin (index) — Overview. Honest placeholder for Phase 0: it does NOT invent
 * operational metrics. Real metrics (open reports, pending verifications, queue
 * health) are wired in Phase 7 against live data. For now it states what the
 * console is and which modules are live vs. still being built.
 */
export const Route = createFileRoute("/admin/")({
  component: AdminOverview,
});

function AdminOverview() {
  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-[13px] leading-relaxed text-[#1A1A1A]/70">
        The safeguarding &amp; operations control room. One side of every transaction is a minor, so
        this console is a safeguarding tool first and an ops tool second. Admin access is enforced
        server-side by a role system; as each module below ships, its sensitive actions are wired to
        the immutable audit log.
      </p>

      <div className="mt-6 rounded-lg border border-[#E3E5E9] bg-white">
        <div className="border-b border-[#E3E5E9] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#1A1A1A]/50">
          Console modules
        </div>
        <ul className="divide-y divide-[#EDEFF2]">
          {ADMIN_NAV.filter((m) => m.key !== "overview").map((m) => {
            const Icon = m.icon;
            return (
              <li key={m.key} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <Icon className="h-[16px] w-[16px] text-[#1A1A1A]/40" />
                <span className="flex-1 font-medium">{m.label}</span>
                {m.status === "active" ? (
                  <span className="rounded bg-[#1f7a4d]/10 px-2 py-0.5 text-[11px] font-semibold text-[#1f7a4d]">
                    live
                  </span>
                ) : (
                  <span className="rounded bg-[#1A1A1A]/[0.06] px-2 py-0.5 text-[11px] font-medium text-[#1A1A1A]/45">
                    being built
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <p className="mt-4 text-[12px] leading-relaxed text-[#1A1A1A]/45">
        Operational metrics are intentionally absent here until they can be shown from real data
        (Phase 7). No placeholder numbers.
      </p>
    </div>
  );
}
