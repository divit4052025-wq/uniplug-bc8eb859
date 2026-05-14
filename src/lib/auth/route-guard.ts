import { redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { resolveUserRole } from "@/lib/auth/role";
import { withRetry } from "@/lib/retry";

const ADMIN_EMAIL = "divitfatehpuria7@gmail.com";

export interface AuthContext {
  userId?: string;
  userMetadata?: { role?: string; full_name?: string };
}

export interface GuardOpts {
  /** Where to send a signed-out user. */
  signedOutTo: "/student-signup" | "/mentor-signup" | "/login";
  /** Required role for this route. "any" = any signed-in user OK. */
  requireRole: "student" | "mentor" | "admin" | "any";
  /** If true, admin users are allowed even when requireRole is non-admin. */
  allowAdmin?: boolean;
}

/**
 * Bug 6.3 routing fix: gate client-side navigation in beforeLoad so the
 * route doesn't mount until auth is resolved. Eliminates the cream-
 * placeholder flash on client-side navigation between protected routes.
 *
 * SSR is intentionally skipped (typeof window check). The browser supabase
 * client uses localStorage for session storage, which is undefined on the
 * server, so supabase.auth.getSession() returns null during SSR. On hard
 * refresh, each route's useEffect fallback handles auth like today.
 * Full server-side cookie auth (no SSR flash) is deferred to a separate
 * PR, likely alongside any CF Workers session handling work.
 *
 * Wraps the auth calls in withRetry so a transient network blip on the
 * conversion-critical auth path doesn't kick the user to the signed-out
 * screen.
 */
export async function clientAuthGuard(opts: GuardOpts): Promise<AuthContext> {
  if (typeof window === "undefined") return {};

  const { data: sessionData, error: sessErr } = await withRetry(() =>
    supabase.auth.getSession(),
  );
  if (sessErr) {
    // All retries exhausted on a transient transport error — fall back to
    // signed-out destination so the user can recover.
    throw redirect({ to: opts.signedOutTo });
  }
  const session = sessionData?.session;
  if (!session) throw redirect({ to: opts.signedOutTo });

  const isAdmin = (session.user.email ?? "").toLowerCase() === ADMIN_EMAIL;
  if (isAdmin) {
    if (opts.requireRole === "admin") {
      return { userId: session.user.id };
    }
    if (!opts.allowAdmin) {
      throw redirect({ to: "/admin" });
    }
  } else if (opts.requireRole === "admin") {
    throw redirect({ to: "/login" });
  }

  const meta = (session.user.user_metadata ?? {}) as { role?: string; full_name?: string };

  if (opts.requireRole === "any" || (isAdmin && opts.allowAdmin)) {
    return { userId: session.user.id, userMetadata: meta };
  }

  const role = await resolveUserRole(session.user.id, session.user.email, meta);
  if (opts.requireRole === "student" && role !== "student") {
    if (role === "mentor") throw redirect({ to: "/mentor-dashboard" });
    throw redirect({ to: opts.signedOutTo });
  }
  if (opts.requireRole === "mentor" && role !== "mentor") {
    if (role === "student") throw redirect({ to: "/dashboard" });
    throw redirect({ to: opts.signedOutTo });
  }
  return { userId: session.user.id, userMetadata: meta };
}
