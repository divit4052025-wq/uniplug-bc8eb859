// P10e — data layer for the mentor profile editor (the HQ ForgePage), mirroring
// the student-side profileEdit.ts allowlist discipline.
//
// THE RULE: the `mentors` table has 29 columns, most of which are
// verification-/money-/identity-sensitive and MUST NOT be self-editable —
// status, tier, price_inr, verified_*, verification_notes, college_email,
// application_submitted_at, re_review_pending, ref_university_id/ref_course_id,
// max_active_mentees, date_of_birth, id/enrollment document paths, university,
// course, year, full_name, countries. Two DB triggers enforce this at the data
// layer (not just here): prevent_mentor_self_approval locks the 8 admin/
// verification columns; prevent_mentor_identity_tamper (P10e, migration
// 20260611000003) locks the verified-identity + capacity columns and freezes
// the document paths after approval. This file keeps the editor to the safe
// allowlist so a save never trips those triggers; the triggers are the real
// boundary if a client is ever crafted to bypass this file.
//
// EDITABLE (self-presentation + contact only): bio, topics, photo_url, phone.
//   - university/course/year/countries/specialty_id are the VERIFIED identity
//     (vetted at signup, tied to the email-tier classification) → NOT editable
//     here (changing them is a separate, careful re-verification task).
//   - topics is a NATIVE text[] array → a save is a wholesale array replace
//     (the set-replacement contract; there is no join table, so no row-level
//     DELETE/INSERT applies).
import { supabase } from "@/integrations/supabase/client";

export type MentorScalarProfile = {
  bio: string;
  topics: string[];
  photo_url: string | null;
  phone: string | null;
};

export type MentorScalarEdits = {
  bio: string | null;
  topics: string[];
  photo_url: string | null;
  phone: string | null;
};

export async function loadMentorProfile(mentorId: string): Promise<MentorScalarProfile> {
  const { data, error } = await supabase
    .from("mentors")
    // SELECT-allowlisted columns ONLY. NEVER select(*) — the row carries
    // verification / tier / college_email fields that must not reach the editor.
    .select("bio, topics, photo_url, phone")
    .eq("id", mentorId)
    .maybeSingle();
  if (error) throw error;
  return {
    bio: data?.bio ?? "",
    topics: Array.isArray(data?.topics) ? (data.topics as string[]) : [],
    photo_url: data?.photo_url ?? null,
    phone: data?.phone ?? null,
  };
}

export async function saveMentorProfile(mentorId: string, edits: MentorScalarEdits): Promise<void> {
  const { error } = await supabase
    .from("mentors")
    // UPDATE-allowlisted columns ONLY. status, tier, price_inr, verified_*,
    // college_email, ref_*, max_active_mentees, date_of_birth are intentionally
    // absent — the self-approval trigger would reject the whole UPDATE otherwise.
    .update({
      bio: edits.bio,
      topics: edits.topics, // native text[] → wholesale replace (set-replacement)
      photo_url: edits.photo_url,
      phone: edits.phone,
    })
    .eq("id", mentorId);
  if (error) throw error;
}
