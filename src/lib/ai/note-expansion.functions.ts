import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callClaude } from "./anthropic.server";
import { assertWithinLimit, recordEvent, RateLimitExceeded } from "./rate-limit.server";

/**
 * Phase D2 (2026-05-23): expand mentor's bullet-point session notes into
 * a 2-3 paragraph student-facing note. Mentor reviews + edits before
 * persisting — this fn returns the draft, does NOT save it. Mentor's
 * existing PostSessionNotesSection.tsx handles the save via the
 * `session_notes` table.
 */

const SYSTEM_PROMPT = `You expand bullet-point session notes into a 2 to 3 paragraph student-facing note. Preserve the mentor's voice — keep their phrasing, technical depth, and any specific resources they mentioned. Do not add new facts. Do not hallucinate resource links. Do not add motivational filler. Do not encourage off-platform contact. Output the prose only, no headings, no preamble.`;

export const expandSessionNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { bullets: string[]; sessionTopic?: string }) => input)
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const bullets = (data.bullets ?? []).map((b) => b.trim()).filter(Boolean);
    if (bullets.length === 0) {
      return { ok: false as const, reason: "no_bullets" };
    }
    if (bullets.join("\n").length > 3000) {
      return { ok: false as const, reason: "input_too_long" };
    }

    // Verify caller is a mentor (the only role this feature is for).
    const { data: mentor } = await supabaseAdmin
      .from("mentors")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (!mentor) {
      return { ok: false as const, reason: "mentor_only" };
    }

    try {
      await assertWithinLimit(userId, "note_expansion");
    } catch (err) {
      if (err instanceof RateLimitExceeded) {
        return { ok: false as const, reason: "rate_limit_exceeded", cap: err.cap };
      }
      throw err;
    }

    const userPrompt = [
      `Mentor's bullets:`,
      bullets.map((b) => `- ${b}`).join("\n"),
      ``,
      data.sessionTopic ? `Session topic: ${data.sessionTopic}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    let result;
    try {
      result = await callClaude({ system: SYSTEM_PROMPT, user: userPrompt, maxTokens: 800 });
    } catch (err) {
      console.error("[note-expansion] anthropic call failed", err);
      return { ok: false as const, reason: "ai_call_failed" };
    }

    if (!result.text || result.text.trim().length === 0) {
      return { ok: false as const, reason: "empty_response" };
    }

    await recordEvent(userId, "note_expansion");
    return { ok: true as const, expanded: result.text.trim() };
  });
