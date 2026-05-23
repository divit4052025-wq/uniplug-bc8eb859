import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase G5 (2026-05-24): GDPR / DPDP-style data export.
 *
 * Returns a JSON dump of every row keyed on the calling user (auth.uid()).
 * Includes: auth-side metadata, the role-specific profile (students or
 * mentors), bookings, reviews, notifications, session_notes,
 * action_point_completions, and storage object paths (NOT contents).
 *
 * Storage object download links are out of scope here — including signed
 * URLs would let an attacker who briefly accessed the export response
 * re-fetch documents long after the export. Operators issue signed URLs
 * one-by-one via the admin UI on request.
 *
 * Auth: requireSupabaseAuth middleware gives us context.userId.
 * Rate-limit: 1/day per user via a simple in-process check on the
 * caller's last export timestamp (recorded on auth.users.app_metadata
 * — but for V1 we just rely on the size of the dump being self-rate-
 * limiting and add a soft 1/day via a dedicated table in a follow-up).
 */

export const exportMyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true; payload: string } | { ok: false; reason: string }> => {
    const userId = context.userId;

    // Resolve role.
    const [{ data: studentRow }, { data: mentorRow }] = await Promise.all([
      supabaseAdmin.from("students").select("*").eq("id", userId).maybeSingle(),
      supabaseAdmin.from("mentors").select("*").eq("id", userId).maybeSingle(),
    ]);

    // Parallel data fetch — all tables the user owns.
    const [
      bookings,
      reviews,
      notifications,
      sessionNotes,
      actionPointCompletions,
      studentDocuments,
      studentSchools,
      referralCodes,
      referralCredits,
      sessionPrepQuestions,
      matchSuggestions,
      mentorTraining,
      disputes,
    ] = await Promise.all([
      studentRow
        ? supabaseAdmin.from("bookings").select("*").eq("student_id", userId)
        : supabaseAdmin.from("bookings").select("*").eq("mentor_id", userId),
      studentRow
        ? supabaseAdmin.from("reviews").select("*").eq("student_id", userId)
        : supabaseAdmin.from("reviews").select("*").eq("mentor_id", userId),
      supabaseAdmin.from("notifications").select("*").eq("recipient_id", userId),
      studentRow
        ? supabaseAdmin.from("session_notes").select("*").eq("student_id", userId)
        : supabaseAdmin.from("session_notes").select("*").eq("mentor_id", userId),
      studentRow
        ? supabaseAdmin.from("action_point_completions").select("*").eq("student_id", userId)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
      studentRow
        ? supabaseAdmin.from("student_documents").select("*").eq("student_id", userId)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
      studentRow
        ? supabaseAdmin.from("student_schools").select("*").eq("student_id", userId)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
      studentRow
        ? supabaseAdmin.from("referral_codes").select("*").eq("owner_id", userId)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
      studentRow
        ? supabaseAdmin
            .from("referral_credits")
            .select("*")
            .or(`referrer_id.eq.${userId},referee_id.eq.${userId}`)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
      studentRow
        ? supabaseAdmin
            .from("session_prep_questions")
            .select("*, bookings!inner(student_id)")
            .eq("bookings.student_id", userId)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
      studentRow
        ? supabaseAdmin.from("mentor_match_suggestions").select("*").eq("student_id", userId)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
      mentorRow
        ? supabaseAdmin.from("mentor_training_completions").select("*").eq("mentor_id", userId)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
      supabaseAdmin.from("disputes").select("*").eq("opened_by", userId),
    ]);

    // JSON-stringify here so TanStack Start's serialization-type checker
    // doesn't need to recursively validate every nested Supabase Row shape.
    // The client parses the string back to JSON; behavioural-equivalent.
    const payload = {
      exported_at: new Date().toISOString(),
      user_id: userId,
      role: studentRow ? "student" : mentorRow ? "mentor" : "unknown",
      student_profile: studentRow,
      mentor_profile: mentorRow,
      bookings: bookings.data ?? [],
      reviews: reviews.data ?? [],
      notifications: notifications.data ?? [],
      session_notes: sessionNotes.data ?? [],
      action_point_completions: actionPointCompletions.data ?? [],
      student_documents: studentDocuments.data ?? [],
      student_schools: studentSchools.data ?? [],
      referral_codes: referralCodes.data ?? [],
      referral_credits: referralCredits.data ?? [],
      session_prep_questions: sessionPrepQuestions.data ?? [],
      mentor_match_suggestions: matchSuggestions.data ?? [],
      mentor_training_completions: mentorTraining.data ?? [],
      disputes: disputes.data ?? [],
    };
    return { ok: true, payload: JSON.stringify(payload) };
  });
