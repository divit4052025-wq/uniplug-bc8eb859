import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callClaude } from "./anthropic.server";
import { assertWithinLimit, recordEvent, RateLimitExceeded } from "./rate-limit.server";

/**
 * Phase D3 (2026-05-23): suggest top-3 mentors for a student based on
 * profile + onboarding fields. Cached per (student_id, generated_on IST
 * date) so the daily refresh button + dashboard renders share one
 * Anthropic call.
 */

const SYSTEM_PROMPT = `You rank candidate mentors for a student on the Uniplug platform. The student is a school student in India applying to global universities. The mentors are current undergraduates at top universities.

Output exactly 3 mentor IDs in priority order, each with a one-sentence reason. Output strictly as JSON:
{"ranked":[{"mentor_id":"<id>","reason":"<one sentence>"},{"mentor_id":"<id>","reason":"<one sentence>"},{"mentor_id":"<id>","reason":"<one sentence>"}]}

Do not invent mentor IDs. Only output IDs that appear in the candidate list. No prose outside the JSON. No off-platform contact suggestions.`;

type Suggestion = { mentor_id: string; reason: string };

function safeParseRanked(raw: string, validIds: Set<string>): Suggestion[] | null {
  const tryParse = (s: string): Suggestion[] | null => {
    try {
      const parsed = JSON.parse(s) as { ranked?: Suggestion[] };
      if (!parsed.ranked || !Array.isArray(parsed.ranked)) return null;
      const out = parsed.ranked
        .filter(
          (s) =>
            s && typeof s.mentor_id === "string" && typeof s.reason === "string" && validIds.has(s.mentor_id),
        )
        .slice(0, 3);
      return out.length > 0 ? out : null;
    } catch {
      return null;
    }
  };
  return tryParse(raw) ?? tryParse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "") ?? null;
}

export const generateMatchSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { force?: boolean } = {}) => input)
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const force = data?.force ?? false;

    // Verify caller is a student.
    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id, full_name, grade, school, countries")
      .eq("id", userId)
      .maybeSingle();
    if (!student) {
      return { ok: false as const, reason: "student_only" };
    }

    // Today's IST date.
    const istToday = new Date(Date.now() + 5.5 * 60 * 60_000).toISOString().slice(0, 10);

    if (!force) {
      const { data: cached } = await supabaseAdmin
        .from("mentor_match_suggestions")
        .select("suggestions, generated_at")
        .eq("student_id", userId)
        .eq("generated_on", istToday)
        .maybeSingle();
      if (cached && Array.isArray(cached.suggestions)) {
        return {
          ok: true as const,
          suggestions: cached.suggestions as Suggestion[],
          cached: true,
        };
      }
    }

    try {
      await assertWithinLimit(userId, "matching");
    } catch (err) {
      if (err instanceof RateLimitExceeded) {
        return { ok: false as const, reason: "rate_limit_exceeded", cap: err.cap };
      }
      throw err;
    }

    // Approved mentor candidates via the existing SECURITY DEFINER RPC.
    const { data: candidates, error: cErr } = await supabaseAdmin.rpc(
      "list_approved_mentor_profiles",
    );
    if (cErr || !candidates || candidates.length === 0) {
      return { ok: false as const, reason: "no_candidates" };
    }

    // Pass a trimmed candidate set to keep the prompt small. Cap at 25
    // candidates ordered by anything stable; for V1 we pass all approved
    // up to a ceiling.
    const cap = 25;
    const trimmedCandidates = candidates.slice(0, cap);
    const validIds = new Set(trimmedCandidates.map((m) => m.id));

    const candidateBlob = trimmedCandidates
      .map(
        (m) =>
          `id: ${m.id}\nuniversity: ${m.university}\ncourse: ${m.course} (${m.year})\ncountries: ${(m.countries ?? []).join(", ") || "—"}`,
      )
      .join("\n---\n");

    const userPrompt = [
      `Student profile:`,
      `grade: ${student.grade}`,
      `school: ${student.school}`,
      `target countries: ${(student.countries ?? []).join(", ") || "—"}`,
      ``,
      `Candidate mentors:`,
      candidateBlob,
    ].join("\n");

    let result;
    try {
      result = await callClaude({ system: SYSTEM_PROMPT, user: userPrompt, maxTokens: 700 });
    } catch (err) {
      console.error("[match] anthropic call failed", err);
      return { ok: false as const, reason: "ai_call_failed" };
    }

    const suggestions = safeParseRanked(result.text, validIds);
    if (!suggestions || suggestions.length === 0) {
      console.warn("[match] parse failed", { raw: result.text.slice(0, 200) });
      return { ok: false as const, reason: "parse_failed" };
    }

    // Cache + record. ON CONFLICT (student_id, generated_on) updates so
    // a force-regenerate replaces today's row. Cast to Json because the
    // generated Insert type uses the Json union.
    await supabaseAdmin.from("mentor_match_suggestions").upsert(
      {
        student_id: userId,
        generated_on: istToday,
        suggestions: JSON.parse(JSON.stringify(suggestions)),
        generated_at: new Date().toISOString(),
      },
      { onConflict: "student_id,generated_on" },
    );
    await recordEvent(userId, "matching");

    return { ok: true as const, suggestions, cached: false };
  });
