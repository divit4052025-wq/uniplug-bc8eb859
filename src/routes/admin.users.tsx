import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, GraduationCap, BookUser } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

/**
 * /admin/users — unified student + mentor directory. Search via admin_search_users
 * (is_admin-gated). Names are shown for operator lookup; raw contact never appears
 * here — it is revealed (and logged) only on the 360 profile.
 */
export const Route = createFileRoute("/admin/users")({
  component: UserDirectory,
});

interface UserRow {
  user_id: string;
  role: string;
  full_name: string | null;
  sub_label: string | null;
  account_state: string;
  created_at: string;
}

const STATE_STYLE: Record<string, string> = {
  suspended: "bg-[#c9a227]/15 text-[#8a6d00]",
  banned: "bg-[#b4453b]/10 text-[#b4453b]",
};
const ROLE_TABS = ["all", "student", "mentor"] as const;

function UserDirectory() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState<(typeof ROLE_TABS)[number]>("all");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "user-search", q, role],
    queryFn: async (): Promise<UserRow[]> => {
      const { data, error } = await supabase.rpc("admin_search_users", {
        _query: q || undefined,
        _role: role === "all" ? undefined : role,
        _limit: 100,
      });
      if (error) throw error;
      return (data ?? []) as UserRow[];
    },
  });

  const rows = data ?? [];

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#1A1A1A]/35" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, email, or id…"
            className="w-full rounded-md border border-[#D7DAE0] bg-white py-1.5 pl-8 pr-3 text-[13px] outline-none focus:border-[#15171C]"
          />
        </div>
        <div className="flex items-center gap-1">
          {ROLE_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setRole(t)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium capitalize transition ${
                role === t
                  ? "bg-[#15171C] text-white"
                  : "text-[#1A1A1A]/55 hover:bg-[#1A1A1A]/[0.05]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-[#E3E5E9] bg-white">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-[#E3E5E9] bg-[#FAFBFC] text-left text-[11px] uppercase tracking-wide text-[#1A1A1A]/45">
              <th className="px-3 py-2 font-semibold">Name</th>
              <th className="px-3 py-2 font-semibold">Role</th>
              <th className="px-3 py-2 font-semibold">Detail</th>
              <th className="px-3 py-2 font-semibold">Account</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EDEFF2]">
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-3 py-10 text-center text-[#1A1A1A]/40">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={4} className="px-3 py-10 text-center text-[13px] text-[#b4453b]">
                  Could not load the directory.
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-10 text-center text-[13px] text-[#1A1A1A]/45">
                  {q ? "No users match." : "No users."}
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const to = { to: "/admin/users/$userId" as const, params: { userId: r.user_id } };
                return (
                  <tr key={r.user_id} className="cursor-pointer hover:bg-[#FAFBFC]">
                    <td className="px-3 py-2 font-medium text-[#1A1A1A]/85">
                      <Link {...to} className="block">
                        {r.full_name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Link {...to} className="inline-flex items-center gap-1.5 text-[#1A1A1A]/60">
                        {r.role === "student" ? (
                          <GraduationCap className="h-3.5 w-3.5" />
                        ) : (
                          <BookUser className="h-3.5 w-3.5" />
                        )}
                        {r.role}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-[#1A1A1A]/60">
                      <Link {...to} className="block">
                        {r.sub_label ?? "—"}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Link {...to}>
                        {r.account_state === "active" ? (
                          <span className="text-[#1A1A1A]/40">active</span>
                        ) : (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATE_STYLE[r.account_state] ?? ""}`}
                          >
                            {r.account_state}
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
