import { createMiddleware } from "@tanstack/react-start";

import { supabase } from "./client";

/**
 * Client-side function middleware that attaches the current Supabase access
 * token as `Authorization: Bearer <token>` on outgoing server-function calls.
 *
 * Why this exists: `requireSupabaseAuth` (auth-middleware.ts) is server-only —
 * it reads `request.headers.get("authorization")` but has no `.client()` half,
 * and the app registers no global function middleware. Supabase stores its
 * session in localStorage (not a cookie), so a client-initiated `createServerFn`
 * call carries NO auth header unless we add it here. Chain this BEFORE
 * `requireSupabaseAuth`:
 *
 *   createServerFn({ method: "POST" })
 *     .middleware([attachSupabaseAuthHeader, requireSupabaseAuth])
 *
 * The `.client()` handler only runs in the browser (where `getSession()` reads
 * localStorage); on the server this middleware is a no-op and `requireSupabaseAuth`
 * reads the header we attached. If there is no session, no header is attached and
 * the server middleware correctly responds 401.
 */
export const attachSupabaseAuthHeader = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
