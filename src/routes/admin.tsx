import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin/AdminShell";
import { clientAuthGuard, type AuthContext } from "@/lib/auth/route-guard";
import { isAdminUser } from "@/lib/auth/role";
import { withRetry } from "@/lib/retry";

/**
 * /admin — the operator console LAYOUT route. Guards the whole /admin/* subtree
 * with the server-side role system (clientAuthGuard requireRole:"admin", which
 * now resolves admin-ness via current_admin_role(), no hardcoded email) and
 * renders the dense sidebar shell + <Outlet/>. Child module routes (Overview,
 * Audit Log, and the per-phase surfaces) render into the shell.
 */
export const Route = createFileRoute("/admin")({
  beforeLoad: () => clientAuthGuard({ signedOutTo: "/login", requireRole: "admin" }),
  head: () => ({ meta: [{ title: "Operator Console — UniPlug" }] }),
  component: AdminLayout,
});

function AdminLayout() {
  const ctx = Route.useRouteContext() as AuthContext;
  const navigate = useNavigate();
  const [ready, setReady] = useState(!!ctx.userId);

  // SSR / hard-refresh fallback: clientAuthGuard short-circuits during SSR (no
  // window), so on a hard refresh we re-verify admin-ness here — via the role
  // system (isAdminUser → current_admin_role RPC), not an email literal.
  useEffect(() => {
    if (ctx.userId) return;
    let cancelled = false;
    void (async () => {
      const { data: sessionData, error: sessErr } = await withRetry(() =>
        supabase.auth.getSession(),
      );
      if (cancelled) return;
      if (sessErr || !sessionData?.session) {
        navigate({ to: "/login" });
        return;
      }
      const admin = await isAdminUser();
      if (cancelled) return;
      if (!admin) {
        navigate({ to: "/login" });
        return;
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, ctx.userId]);

  if (!ready) return <div className="min-h-screen bg-[#F4F5F7]" />;
  return <AdminShell />;
}
