/**
 * V1 1:1 video calls — server-side join endpoint. Server-only (createServerFn);
 * DAILY_API_KEY never reaches the client.
 *
 * Flow (all server-side, trusts NOTHING from the client but the bookingId):
 *   1. authorize_video_join(bookingId) — the SECURITY DEFINER gate re-derives
 *      the caller's role from auth.uid() + the bookings row, requires status
 *      'confirmed' and now() within the IST join window, else RAISEs. Called via
 *      the user-JWT client (context.supabase) so auth.uid() is the real caller.
 *   2. resolve the caller's own display name (shown to the other participant).
 *   3. get-or-create the private Daily room for the booking (lazy; persisted in
 *      video_rooms; race-safe via the booking_id PK).
 *   4. mint a short-lived, room+identity-scoped, NON-owner meeting token.
 *   5. append an immutable video_join_audit row (token_exp = the gate's window_end).
 *
 * The two middlewares: attachSupabaseAuthHeader (client) attaches the caller's
 * bearer token to the outgoing call; requireSupabaseAuth (server) validates it
 * and yields context.userId. An unauthenticated call 401s in the middleware.
 */

import { createServerFn } from "@tanstack/react-start";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuthHeader } from "@/integrations/supabase/attach-auth-header";
import { log } from "@/lib/log";

import { ensureRoom, mintToken } from "./daily.server";

export type VideoCallDenyReason =
  | "booking_not_found"
  | "not_a_participant"
  | "not_joinable_status"
  | "outside_window"
  | "unauthenticated"
  | "server_error";

export type VideoCallAccess =
  | { ok: true; roomUrl: string; token: string }
  | { ok: false; reason: VideoCallDenyReason };

/** Map a Postgres RAISE message from authorize_video_join to a stable reason. */
function mapRpcError(message: string | undefined): VideoCallDenyReason {
  const m = (message ?? "").toLowerCase();
  if (m.includes("not_a_participant")) return "not_a_participant";
  if (m.includes("booking_not_found")) return "booking_not_found";
  if (m.includes("not_joinable_status")) return "not_joinable_status";
  if (m.includes("outside_window")) return "outside_window";
  if (m.includes("authentication required")) return "unauthenticated";
  return "server_error";
}

/** Non-guessable Daily room name: prefix + compact booking id + random suffix. */
function roomNameFor(bookingId: string): string {
  const compact = bookingId.replace(/-/g, "");
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `uniplug-${compact}-${rand}`;
}

export const getVideoCallAccess = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuthHeader, requireSupabaseAuth])
  .inputValidator((input: { bookingId: string }) => input)
  .handler(async ({ data, context }): Promise<VideoCallAccess> => {
    const userId = context.userId;
    const bookingId = data.bookingId;

    // 1. AUTHORIZE — the gate is the single source of truth. It RAISEs on any
    //    failure; supabase-js surfaces that as `error` (no throw).
    const { data: auth, error: authErr } = await context.supabase
      .rpc("authorize_video_join", { _booking_id: bookingId })
      .maybeSingle();

    if (authErr || !auth) {
      const reason = mapRpcError(authErr?.message);
      log.warn({
        surface: "worker",
        event: "video_join_denied",
        booking_id: bookingId,
        user_id: userId,
        reason,
      });
      return { ok: false, reason };
    }

    const role = auth.role as "student" | "mentor";
    const windowEnd = new Date(auth.window_end as string);
    const expUnix = Math.floor(windowEnd.getTime() / 1000);

    try {
      // 2. Caller's OWN display name (what the other participant sees).
      const { data: profile } =
        role === "student"
          ? await supabaseAdmin.from("students").select("full_name").eq("id", userId).maybeSingle()
          : await supabaseAdmin.from("mentors").select("full_name").eq("id", userId).maybeSingle();
      const displayName = profile?.full_name ?? (role === "student" ? "Student" : "Mentor");

      // 3. Get-or-create the private Daily room (lazy, persisted, race-safe).
      let roomName: string;
      let roomUrl: string;

      const { data: existing } = await supabaseAdmin
        .from("video_rooms")
        .select("daily_room_name, daily_room_url")
        .eq("booking_id", bookingId)
        .maybeSingle();

      if (existing) {
        roomName = existing.daily_room_name;
        roomUrl = existing.daily_room_url;
        // Self-heal: ensure the Daily room still exists (idempotent / no-op).
        await ensureRoom(roomName, expUnix);
      } else {
        const candidate = roomNameFor(bookingId);
        const room = await ensureRoom(candidate, expUnix);
        const { error: insErr } = await supabaseAdmin.from("video_rooms").insert({
          booking_id: bookingId,
          daily_room_name: room.name,
          daily_room_url: room.url,
          created_by: userId,
        });
        if (insErr) {
          // PK conflict → the other participant's first join won the race.
          // Re-read and use the winning row so both join the SAME room.
          const { data: winner } = await supabaseAdmin
            .from("video_rooms")
            .select("daily_room_name, daily_room_url")
            .eq("booking_id", bookingId)
            .maybeSingle();
          roomName = winner?.daily_room_name ?? room.name;
          roomUrl = winner?.daily_room_url ?? room.url;
        } else {
          roomName = room.name;
          roomUrl = room.url;
        }
      }

      // 4. Mint the short-lived, room+identity-scoped, non-owner token.
      const token = await mintToken(roomName, displayName, expUnix);

      // 5. Immutable audit row (token_exp = the gate's authoritative window_end).
      await supabaseAdmin.from("video_join_audit").insert({
        booking_id: bookingId,
        user_id: userId,
        role,
        token_exp: windowEnd.toISOString(),
      });

      log.info({
        surface: "worker",
        event: "video_token_minted",
        booking_id: bookingId,
        user_id: userId,
        role,
      });
      return { ok: true, roomUrl, token };
    } catch (err) {
      log.error({
        surface: "worker",
        event: "video_token_mint_failed",
        alert: true,
        booking_id: bookingId,
        user_id: userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return { ok: false, reason: "server_error" };
    }
  });
