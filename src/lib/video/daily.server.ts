/**
 * Thin Daily.co REST client for V1 1:1 video calls. Server-side ONLY — the
 * `.server.ts` suffix keeps it out of the client bundle (matches
 * anthropic.server.ts / client.server.ts). DAILY_API_KEY is a Cloudflare
 * Worker RUNTIME secret (`wrangler secret put DAILY_API_KEY`); see ENV.md.
 * It is read here via process.env and NEVER reaches the browser.
 *
 * ── NO CAPTURE (load-bearing) ──────────────────────────────────────────────
 * These are 1:1 calls involving minors. Recording / transcription / AI capture
 * of call content is legally gated to a separate, deferred stage. This client
 * therefore:
 *   - OMITS `enable_recording` on both rooms and tokens. Daily's
 *     `enable_recording` is a string enum ("cloud" | "local" | ...); OMITTING it
 *     is what disables recording (there is no `false` value).
 *   - mints NON-owner tokens (`is_owner: false`) — only owners can start a
 *     recording from the call UI, so participants cannot initiate one.
 *   - never calls Daily's recording or transcription endpoints.
 * Do not add any recording/transcription option here without the separate
 * dual-consent + legal sign-off.
 */

const DAILY_API = "https://api.daily.co/v1";

function dailyKey(): string {
  const key = process.env.DAILY_API_KEY;
  if (!key) {
    throw new Error("DAILY_API_KEY is not set in Worker env");
  }
  return key;
}

export type DailyRoom = { name: string; url: string };

/**
 * Create (or fetch, if it already exists) a PRIVATE Daily room. Private rooms
 * require a meeting token to join, so a guessed URL alone is useless. The room
 * auto-expires at `expUnix` (and ejects participants), so rooms self-clean —
 * no cleanup cron. Idempotent: if the name already exists (re-join, or a race
 * between the two participants' first joins), we GET and reuse it.
 */
export async function ensureRoom(name: string, expUnix: number): Promise<DailyRoom> {
  const key = dailyKey();

  const res = await fetch(`${DAILY_API}/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      name,
      privacy: "private",
      properties: {
        exp: expUnix,
        eject_at_room_exp: true,
        enable_prejoin_ui: true,
        max_participants: 2,
        // enable_recording intentionally OMITTED → recording disabled. See header.
      },
    }),
  });

  if (res.ok) {
    const room = (await res.json()) as { name: string; url: string };
    return { name: room.name, url: room.url };
  }

  // Non-OK: most likely the room already exists. Try to fetch it and reuse.
  const existing = await fetch(`${DAILY_API}/rooms/${encodeURIComponent(name)}`, {
    headers: { authorization: `Bearer ${key}` },
  });
  if (existing.ok) {
    const room = (await existing.json()) as { name: string; url: string };
    return { name: room.name, url: room.url };
  }

  const body = await res.text().catch(() => "");
  throw new Error(`Daily create-room ${res.status}: ${body.slice(0, 300)}`);
}

/**
 * Mint a short-lived meeting token scoped to ONE room + this participant. The
 * token (not the URL) is what actually authorizes joining the private room.
 * `exp` bounds the token to the booking's join window; `eject_at_token_exp`
 * removes the user when it lapses. Non-owner — no elevated capabilities.
 */
export async function mintToken(
  roomName: string,
  userName: string,
  expUnix: number,
): Promise<string> {
  const key = dailyKey();

  const res = await fetch(`${DAILY_API}/meeting-tokens`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        user_name: userName,
        is_owner: false,
        exp: expUnix,
        eject_at_token_exp: true,
        // enable_recording intentionally OMITTED → cannot record. See header.
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Daily mint-token ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as { token: string };
  return json.token;
}
