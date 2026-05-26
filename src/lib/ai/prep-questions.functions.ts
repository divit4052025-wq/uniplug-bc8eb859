import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callClaude } from "./anthropic.server";
import { assertWithinLimit, recordEvent, RateLimitExceeded } from "./rate-limit.server";

/**
 * Phase D1 (2026-05-23): generate or fetch AI-prepared session questions
 * for a booking. Lazy + cached: first call generates and persists; later
 * calls return the cached row. Regenerate is a separate code path (TODO
 * — surface a "regenerate" button that calls this fn with force=true).
 */

const SYSTEM_PROMPT = `You generate session-prep questions for a peer-mentorship session on the Uniplug platform. The mentee is a school student in India applying to global universities. The mentor is a current undergraduate at a top university.

Generate 3 to 5 questions. Each question should:
- Be specific to the mentor's expertise and the mentee's stated profile
- Be answerable in roughly 2 minutes of conversation
- Avoid yes/no questions
- Avoid asking the mentor to share personal contact info or anything off-platform
- Not encourage off-platform contact (no "DM on Instagram" or similar)

Output strictly a JSON array of strings, no prose, no preamble. Example: ["Question 1", "Question 2", "Question 3"]`;

function buildUserPrompt(input: {
  mentorBio: string | null;
  mentorTopics: string[];
  mentorUniversity: string;
  mentorCourse: string;
  studentGrade: string;
  studentSchool: string;
  studentCountries: string[];
}): string {
  return [
    `Mentor university: ${input.mentorUniversity}`,
    `Mentor course: ${input.mentorCourse}`,
    `Mentor topics: ${input.mentorTopics.join(", ") || "—"}`,
    `Mentor bio: ${input.mentorBio ?? "—"}`,
    ``,
    `Mentee grade: ${input.studentGrade}`,
    `Mentee school: ${input.studentSchool}`,
    `Mentee target countries: ${input.studentCountries.join(", ") || "—"}`,
  ].join("\n");
}

function safeParseQuestions(raw: string): string[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((q) => typeof q === "string" && q.length > 0)) {
      return parsed.slice(0, 5);
    }
  } catch {
    // Fallback: try to find a JSON array inside surrounding prose.
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed) && parsed.every((q) => typeof q === "string")) {
          return parsed.slice(0, 5);
        }
      } catch {
        /* fall through */
      }
    }
  }
  return null;
}

export const generatePrepQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { bookingId: string; force?: boolean }) => input)
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { bookingId, force } = data;

    // Verify booking ownership BEFORE any AI call.
    const { data: booking, error: bErr } = await supabaseAdmin
      .from("bookings")
      .select("id, mentor_id, student_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (bErr || !booking) {
      return { ok: false as const, reason: "booking_not_found" };
    }
    if (booking.student_id !== userId) {
      return { ok: false as const, reason: "not_your_booking" };
    }

    // Cache hit?
    if (!force) {
      const { data: cached } = await supabaseAdmin
        .from("session_prep_questions")
        .select("questions, generated_at")
        .eq("booking_id", bookingId)
        .maybeSingle();
      if (cached && Array.isArray(cached.questions)) {
        return {
          ok: true as const,
          questions: cached.questions as string[],
          cached: true,
        };
      }
    }

    // Cap check.
    try {
      await assertWithinLimit(userId, "prep_questions");
    } catch (err) {
      if (err instanceof RateLimitExceeded) {
        return { ok: false as const, reason: "rate_limit_exceeded", cap: err.cap };
      }
      throw err;
    }

    // Load mentor + student profiles for the prompt.
    const [{ data: mentor }, { data: student }] = await Promise.all([
      supabaseAdmin
        .from("mentors")
        .select("bio, topics, university, course")
        .eq("id", booking.mentor_id!)
        .maybeSingle(),
      supabaseAdmin
        .from("students")
        .select("grade, school, countries")
        .eq("id", booking.student_id!)
        .maybeSingle(),
    ]);
    if (!mentor || !student) {
      return { ok: false as const, reason: "profile_not_found" };
    }

    const userPrompt = buildUserPrompt({
      mentorBio: mentor.bio,
      mentorTopics: mentor.topics ?? [],
      mentorUniversity: mentor.university,
      mentorCourse: mentor.course,
      studentGrade: student.grade,
      studentSchool: student.school,
      studentCountries: student.countries ?? [],
    });

    let result;
    try {
      result = await callClaude({ system: SYSTEM_PROMPT, user: userPrompt, maxTokens: 800 });
    } catch (err) {
      console.error("[prep-questions] anthropic call failed", err);
      return { ok: false as const, reason: "ai_call_failed" };
    }

    const questions = safeParseQuestions(result.text);
    if (!questions || questions.length === 0) {
      console.warn("[prep-questions] parse failed", { raw: result.text.slice(0, 200) });
      return { ok: false as const, reason: "parse_failed" };
    }

    // Persist + record. ON CONFLICT updates (regenerate path).
    await supabaseAdmin
      .from("session_prep_questions")
      .upsert(
        { booking_id: bookingId, questions, source: "ai", generated_at: new Date().toISOString() },
        { onConflict: "booking_id" },
      );
    await recordEvent(userId, "prep_questions");

    return { ok: true as const, questions, cached: false };
  });
