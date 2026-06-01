import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "./client";
import type { Database } from "./types";

export const requireSupabaseAuth = createMiddleware({ type: "function" })
  // CLIENT PHASE (browser, before the request is sent): attach the logged-in
  // user's Supabase access token as `Authorization: Bearer <token>` so the
  // server phase below can validate it and the server fn runs with the correct
  // auth.uid(). Without this, the browser called requireSupabaseAuth-gated
  // server fns (createBookingOrder, the AI fns, …) with NO Authorization header,
  // so the server gate 401'd BEFORE the fn ran — book_session never executed and
  // the UI surfaced a generic "Could not start payment." If there is no session
  // (SSR or logged-out), we send no header and let the server gate 401 as
  // designed. This fixes the client to SEND the token; it does not weaken the
  // server-side requirement.
  .client(async ({ next }) => {
    let headers: HeadersInit | undefined;
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) {
        headers = { Authorization: `Bearer ${token}` };
      }
    } catch {
      // No session available (SSR / logged-out) — omit the header gracefully
      // rather than crash; genuinely-unauthenticated calls still 401 server-side.
    }
    return next(headers ? { headers } : undefined);
  })
  .server(async ({ next }) => {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Response(
        "Missing Supabase environment variables. Ensure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are set.",
        { status: 500 },
      );
    }

    const request = getRequest();

    if (!request?.headers) {
      throw new Response("Unauthorized: No request headers available", { status: 401 });
    }

    const authHeader = request.headers.get("authorization");

    if (!authHeader) {
      throw new Response("Unauthorized: No authorization header provided", { status: 401 });
    }

    if (!authHeader.startsWith("Bearer ")) {
      throw new Response("Unauthorized: Only Bearer tokens are supported", { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      throw new Response("Unauthorized: No token provided", { status: 401 });
    }

    const supabase = createClient<Database>(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims) {
      throw new Response("Unauthorized: Invalid token", { status: 401 });
    }

    if (!data.claims.sub) {
      throw new Response("Unauthorized: No user ID found in token", { status: 401 });
    }

    return next({
      context: {
        supabase,
        userId: data.claims.sub,
        claims: data.claims,
      },
    });
  });
