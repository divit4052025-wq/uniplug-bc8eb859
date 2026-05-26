/**
 * Per-(user, feature) rate limit for the V1 AI features.
 *
 * Phase D0 (2026-05-23). Backed by public.ai_rate_limit_events (one row
 * per successful Anthropic call). The server-fns check assertWithinLimit
 * BEFORE the Anthropic POST; on success they recordEvent.
 *
 * Per-feature caps (per Phase D amendment D1, plan-line):
 *
 *   matching        — 5/day:   highest cost per call (largest context +
 *                              biggest output), users rarely need it more
 *                              than a handful of times.
 *   prep_questions  — 20/day:  cheap and high-utility — students may want
 *                              to regenerate when their goal evolves or
 *                              to try a different angle on the same
 *                              mentor.
 *   note_expansion  — 15/day:  mid-range. Mentors write notes per session;
 *                              15 covers a heavy mentoring day with
 *                              retries.
 *
 * The numbers are intentionally per-day-rolling (last 24h, not calendar
 * day) so a burst of usage right after midnight doesn't get a "free"
 * second 20-question budget. Calendar-day windows are easier for users
 * to reason about but enable burst-then-burst abuse.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AiFeature = "matching" | "prep_questions" | "note_expansion";

const CAPS_PER_24H: Record<AiFeature, number> = {
  matching: 5,
  prep_questions: 20,
  note_expansion: 15,
};

export class RateLimitExceeded extends Error {
  constructor(
    public readonly feature: AiFeature,
    public readonly cap: number,
    public readonly windowHours: number = 24,
  ) {
    super(`Rate limit exceeded: ${feature} (${cap}/${windowHours}h)`);
    this.name = "RateLimitExceeded";
  }
}

export async function assertWithinLimit(userId: string, feature: AiFeature): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabaseAdmin
    .from("ai_rate_limit_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("feature", feature)
    .gte("created_at", since);
  if (error) {
    // Fail open on the rate-limit table being unreachable would be wrong —
    // it'd let an attacker drain quota by killing the table. Fail closed.
    throw new Error(`rate-limit check failed: ${error.message}`);
  }
  const cap = CAPS_PER_24H[feature];
  if ((count ?? 0) >= cap) {
    throw new RateLimitExceeded(feature, cap, 24);
  }
}

export async function recordEvent(userId: string, feature: AiFeature): Promise<void> {
  const { error } = await supabaseAdmin
    .from("ai_rate_limit_events")
    .insert({ user_id: userId, feature });
  if (error) {
    // Log but do not throw — the AI call already succeeded, this is
    // accounting. Phase H3 / Sentry will surface persistent failures.
    console.error("[ai-rate-limit] failed to record event", { userId, feature, error });
  }
}
