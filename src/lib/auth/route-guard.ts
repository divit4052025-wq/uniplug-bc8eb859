import { redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { resolveUserRole } from "@/lib/auth/role";
import { withRetry } from "@/lib/retry";

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

  const { data: sessionData, error: sessErr } = await withRetry(() => supabase.auth.getSession());
  if (sessErr) {
    // All retries exhausted on a transient transport error — fall back to
    // signed-out destination so the user can recover.
    throw redirect({ to: opts.signedOutTo });
  }
  const session = sessionData?.session;
  if (!session) throw redirect({ to: opts.signedOutTo });

  const meta = (session.user.user_metadata ?? {}) as { role?: string; full_name?: string };

  // Cheap fast-path ONLY for an "any" route that explicitly permits admins: any
  // signed-in user is fine, no role resolution needed. For "any" WITHOUT
  // allowAdmin (or allowAdmin:false), we still resolve role below so an admin is
  // trapped on /admin — this preserves the pre-rewrite behaviour and honours the
  // deliberate allowAdmin:false on the 1:1 messaging routes (admins excluded).
  if (opts.requireRole === "any" && opts.allowAdmin === true) {
    return { userId: session.user.id, userMetadata: meta };
  }

  // Admin-ness is data-driven now (the role system), resolved via resolveUserRole
  // — no hardcoded email. resolveUserRole returns "admin" for any active admin role.
  const role = await resolveUserRole(session.user.id, session.user.email, meta);
  const isAdmin = role === "admin";

  if (isAdmin) {
    if (opts.requireRole === "admin") {
      return { userId: session.user.id };
    }
    if (!opts.allowAdmin) {
      throw redirect({ to: "/admin" });
    }
    return { userId: session.user.id, userMetadata: meta };
  }
  if (opts.requireRole === "admin") {
    throw redirect({ to: "/login" });
  }

  // Non-admin on an "any" route is always fine.
  if (opts.requireRole === "any") {
    return { userId: session.user.id, userMetadata: meta };
  }

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
