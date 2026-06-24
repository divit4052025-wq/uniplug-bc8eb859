// Per-login session persistence for the login page's "Keep me logged in" control.
//
// The generated Supabase client (src/integrations/supabase/client.ts) persists the
// session to localStorage globally (persistSession: true), and supabase-js v2 has
// no per-call persistence option — so persistence cannot be made per-login by
// configuring the client, and the generated client is intentionally left untouched.
//
// Instead, when the user does NOT opt into staying logged in, we mark the session
// "ephemeral" and sign it out on the next COLD browser start — approximating a
// session-only login (the copy says "you'll be signed out when you close your
// browser"). Default (unchecked) is the safer path for a minors-heavy platform on
// shared devices.
//
// Cold-start detection is cross-tab safe. A freshly-opened tab and a genuine cold
// start both see an empty sessionStorage, so before signing out we ask sibling tabs
// over a BroadcastChannel whether any are still alive: if one answers, this is just
// a new tab in an ongoing session and we stay signed in; only when nothing answers
// (a true cold start) do we sign out. Without this, opening a second tab would
// spuriously sign the user out mid-session — harmful with live /call video sessions.
// If BroadcastChannel is unavailable we err toward signing out (the safer direction).

import { supabase } from "@/integrations/supabase/client";

const EPHEMERAL_KEY = "up.session.ephemeral"; // localStorage: "1" when the last login was session-only
const ALIVE_KEY = "up.session.alive"; // sessionStorage: "1" once this context is an active session
const CHANNEL = "up-session";
const PING = "ping";
const PONG = "pong";
const PROBE_MS = 250;

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Record the persistence choice at login time. Call AFTER a successful sign-in.
 * - keepLoggedIn === true  → persistent (default localStorage behaviour; clears the marker).
 * - keepLoggedIn === false → session-only (marks ephemeral; signed out on the next cold start).
 */
export function markSession(keepLoggedIn: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (keepLoggedIn) {
      localStorage.removeItem(EPHEMERAL_KEY);
    } else {
      localStorage.setItem(EPHEMERAL_KEY, "1");
      sessionStorage.setItem(ALIVE_KEY, "1");
    }
  } catch {
    /* storage blocked (private mode etc.) — nothing to persist */
  }
}

/**
 * Enforce session-only logins on a cold browser start. Call once on client mount
 * (from the root component, inside a client-only effect). SSR-safe and idempotent.
 */
export function enforceEphemeralOnColdStart(): void {
  if (typeof window === "undefined") return;

  let channel: BroadcastChannel | null = null;
  try {
    channel = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL) : null;
  } catch {
    channel = null;
  }

  const isEphemeral = () => readLocal(EPHEMERAL_KEY) === "1";
  const isAliveHere = () => {
    try {
      return sessionStorage.getItem(ALIVE_KEY) === "1";
    } catch {
      return false;
    }
  };
  const markAlive = () => {
    try {
      sessionStorage.setItem(ALIVE_KEY, "1");
    } catch {
      /* ignore */
    }
  };
  // This context can vouch for an ongoing session if it is itself alive, or if the
  // session is persistent (in which case there is nothing to enforce).
  const canVouch = () => isAliveHere() || !isEphemeral();

  // Answer sibling pings for this context's lifetime so a freshly-opened tab can
  // detect us. Persistent / already-alive contexts return early but keep answering.
  if (channel) {
    channel.onmessage = (e: MessageEvent) => {
      if (e.data === PING && canVouch()) channel!.postMessage(PONG);
    };
  }

  if (!isEphemeral()) return; // persistent session → nothing to enforce
  if (isAliveHere()) return; // already an established session here (e.g. a reload) → stay

  // Either a cold start or a new tab in an ongoing session — both have empty
  // sessionStorage. Probe siblings to tell them apart.
  let settled = false;
  if (channel) {
    channel.onmessage = (e: MessageEvent) => {
      if (e.data === PONG && !settled) {
        settled = true; // a sibling is alive → new tab in an ongoing session, not a cold start
        markAlive();
      } else if (e.data === PING && canVouch()) {
        channel!.postMessage(PONG);
      }
    };
    channel.postMessage(PING);
  }

  window.setTimeout(() => {
    if (settled || isAliveHere()) return; // a sibling vouched → stay signed in
    // True cold start with a session-only login → sign out and clear the marker.
    void supabase.auth.signOut();
    try {
      localStorage.removeItem(EPHEMERAL_KEY);
    } catch {
      /* ignore */
    }
  }, PROBE_MS);
}
