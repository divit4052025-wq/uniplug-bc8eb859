import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LogOut } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/site/Logo";
import { ADMIN_NAV } from "@/components/admin/adminNav";

/**
 * The operator-console shell: a plain, dense, desktop-first frame — the
 * deliberate opposite of the 3D "Quarter"/"HQ" worlds. Left module nav, a thin
 * top bar with the signed-in admin's identity, and an <Outlet/> for the active
 * module. Optimized for information density, not brand delight.
 */
function roleLabel(role: string | null | undefined): string {
  if (!role) return "admin";
  return role.replace(/_/g, " ");
}

async function signOut() {
  await supabase.auth.signOut();
  window.location.href = "/";
}

export function AdminShell() {
  const location = useLocation();
  const pathname = location.pathname;

  // The signed-in admin's identity for the top bar (email + active role).
  const { data: who } = useQuery({
    queryKey: ["admin", "whoami"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const email = sessionData?.session?.user.email ?? null;
      const { data: role } = await supabase.rpc("current_admin_role");
      return { email, role: (role as string | null) ?? null };
    },
  });

  const active =
    [...ADMIN_NAV]
      .filter((n) => (n.to === "/admin" ? pathname === "/admin" : pathname.startsWith(n.to)))
      .sort((a, b) => b.to.length - a.to.length)[0] ?? ADMIN_NAV[0];

  return (
    <div className="flex min-h-screen bg-[#F4F5F7] text-[#1A1A1A]">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="fixed left-0 top-0 z-30 flex h-screen w-[232px] flex-col bg-[#15171C] text-white">
        <Link to="/" className="flex items-center gap-2.5 px-5 pb-5 pt-6" aria-label="UniPlug home">
          <span className="inline-flex items-center rounded-md bg-white p-1.5">
            <Logo className="h-6 w-auto" />
          </span>
          <span className="text-[13px] font-semibold tracking-tight text-white/90">
            Operator Console
          </span>
        </Link>

        <nav className="mt-1 flex flex-1 flex-col gap-0.5 px-2">
          {ADMIN_NAV.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === active.key;
            if (item.status === "soon") {
              return (
                <div
                  key={item.key}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-[13px] text-white/30"
                  title={`${item.label} — not built yet`}
                  aria-disabled="true"
                >
                  <Icon className="h-[17px] w-[17px]" />
                  <span className="flex-1">{item.label}</span>
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/40">
                    soon
                  </span>
                </div>
              );
            }
            return (
              <Link
                key={item.key}
                to={item.to}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition ${
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-white/55 hover:bg-white/5 hover:text-white/90"
                }`}
              >
                <span
                  className={`h-[17px] w-[2.5px] rounded-r ${isActive ? "bg-[#C4907F]" : "bg-transparent"}`}
                  aria-hidden
                />
                <Icon className="h-[17px] w-[17px]" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-3 py-3">
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-white/55 transition hover:bg-white/5 hover:text-white/90"
          >
            <LogOut className="h-[16px] w-[16px]" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div className="ml-[232px] flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-[#E3E5E9] bg-white px-6">
          <h1 className="text-[14px] font-semibold tracking-tight">{active.label}</h1>
          <div className="flex items-center gap-2.5 text-[12px]">
            {who?.role && (
              <span className="rounded bg-[#15171C] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                {roleLabel(who.role)}
              </span>
            )}
            <span className="text-[#1A1A1A]/55">{who?.email ?? "…"}</span>
          </div>
        </header>

        <main className="flex-1 px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
