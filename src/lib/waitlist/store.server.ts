// Waitlist store — the ONLY module that talks to the Cloudflare D1 binding.
//
// SEPARATE from Supabase: it never imports the Supabase client and never touches
// the hosted Supabase project.
//
// Binding access is environment-aware because this repo's Cloudflare vite plugin
// is build-only (see vite.config.ts):
//   • production (workerd)  → the real binding via `cloudflare:workers` env.
//   • local `vite dev` (Node SSR, no worker runtime) → wrangler's getPlatformProxy,
//     which exposes the SAME local D1 (miniflare SQLite under .wrangler/state)
//     the migrations were applied to with `--local`.
// The dev branch is guarded by import.meta.env.DEV so wrangler is dead-code
// eliminated from the production worker bundle.
//
// Honesty: counts and positions are read straight from D1. Nothing is seeded,
// padded, or faked. A zero row count returns zero.

import { parseWaitlistInput, type WaitlistKind } from "./validate";
import type { D1Database } from "./d1-types";

let devDbPromise: Promise<D1Database> | null = null;

async function getDB(): Promise<D1Database> {
  if (import.meta.env.DEV) {
    // Cached for the dev process — getPlatformProxy spins up a local miniflare.
    if (!devDbPromise) {
      devDbPromise = (async () => {
        const { getPlatformProxy } = await import("wrangler");
        const proxy = await getPlatformProxy<{ DB: D1Database }>();
        return proxy.env.DB;
      })();
    }
    return devDbPromise;
  }
  const { env } = await import("cloudflare:workers");
  return env.DB;
}

export interface JoinResult {
  /** The person's REAL, stable position among their side (1-based). */
  position: number;
  kind: WaitlistKind;
}

export interface WaitlistCounts {
  school: number;
  college: number;
}

/**
 * UPSERT by email, then compute the real position.
 *
 * - Email is lowercased+trimmed by parseWaitlistInput, and `email` is UNIQUE, so
 *   the same person joining again UPDATEs their single row — the count never
 *   inflates. RETURNING gives the row's stable ascending `id`.
 * - Position = how many rows of this side were created at or before this row's
 *   id. It does not change as later people join, and is identical on re-submit.
 */
export async function joinWaitlist(raw: {
  name?: unknown;
  email?: unknown;
  kind?: unknown;
}): Promise<JoinResult> {
  const { name, email, kind } = parseWaitlistInput(raw); // throws on invalid input
  const db = await getDB();

  const upserted = await db
    .prepare(
      `INSERT INTO waitlist (name, email, kind)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(email) DO UPDATE SET name = excluded.name, kind = excluded.kind
       RETURNING id`,
    )
    .bind(name, email, kind)
    .first<{ id: number }>();

  if (!upserted) throw new Error("waitlist upsert returned no row");

  const pos = await db
    .prepare(`SELECT COUNT(*) AS pos FROM waitlist WHERE kind = ?1 AND id <= ?2`)
    .bind(kind, upserted.id)
    .first<{ pos: number }>();

  return { position: Number(pos?.pos ?? 0), kind };
}

/** Real school/college counts, grouped. Missing side → honest 0. */
export async function getWaitlistCounts(): Promise<WaitlistCounts> {
  const db = await getDB();
  const res = await db
    .prepare(`SELECT kind, COUNT(*) AS n FROM waitlist GROUP BY kind`)
    .all<{ kind: string; n: number }>();

  const counts: WaitlistCounts = { school: 0, college: 0 };
  for (const row of res.results ?? []) {
    if (row.kind === "school" || row.kind === "college") {
      counts[row.kind] = Number(row.n) || 0;
    }
  }
  return counts;
}
