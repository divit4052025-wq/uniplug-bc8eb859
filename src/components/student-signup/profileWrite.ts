// P7 — write the rich profile (the six owner-RLS join tables) for an
// authenticated student, then stamp completion. Used by the finalize step for
// BOTH the stash replay and the fresh-collection fallback.
//
// Rules:
//   - Resolved items (id !== null) are inserted into their join table. The four
//     simple axes upsert with ignoreDuplicates so a replay is idempotent.
//   - Target universities go to student_schools (lenient: name + optional
//     ref_university_id), so even an unresolved (requested) university is saved
//     by name.
//   - Unresolved items (id === null) on the strict axes can't satisfy the NOT
//     NULL FK, so we file a create_ref_add_request instead (best-effort).
//
// Concrete per-axis inserts (no dynamic column keys) keep the generated
// Database types precise.
import { supabase } from "@/integrations/supabase/client";
import { createRefAddRequest } from "@/components/signup/refClient";
import type { ProfileDraft, RefItem, RefKind } from "./types";

/** File "request to add" for items with no canonical ref row yet (best-effort). */
async function fileUnresolved(kind: RefKind, items: RefItem[]): Promise<void> {
  for (const i of items.filter((x) => x.id === null)) {
    await createRefAddRequest(kind, i.name);
  }
}

/** Write all rich-profile selections for the authenticated student. */
export async function writeRichProfile(userId: string, draft: ProfileDraft): Promise<void> {
  // ── Four simple axes (idempotent upsert on the unique key) ──
  const subjects = draft.subjects.filter((i) => i.id !== null);
  if (subjects.length > 0) {
    await supabase.from("student_subjects").upsert(
      subjects.map((i) => ({ student_id: userId, subject_id: i.id as string })),
      { onConflict: "student_id,subject_id", ignoreDuplicates: true },
    );
  }
  const courses = draft.courses.filter((i) => i.id !== null);
  if (courses.length > 0) {
    await supabase.from("student_courses").upsert(
      courses.map((i) => ({ student_id: userId, course_id: i.id as string })),
      { onConflict: "student_id,course_id", ignoreDuplicates: true },
    );
  }
  const sports = draft.sports.filter((i) => i.id !== null);
  if (sports.length > 0) {
    await supabase.from("student_sports").upsert(
      sports.map((i) => ({ student_id: userId, sport_id: i.id as string })),
      { onConflict: "student_id,sport_id", ignoreDuplicates: true },
    );
  }
  const cocurriculars = draft.cocurriculars.filter((i) => i.id !== null);
  if (cocurriculars.length > 0) {
    await supabase.from("student_cocurriculars").upsert(
      cocurriculars.map((i) => ({ student_id: userId, cocurricular_id: i.id as string })),
      { onConflict: "student_id,cocurricular_id", ignoreDuplicates: true },
    );
  }
  await Promise.all([
    fileUnresolved("subject", draft.subjects),
    fileUnresolved("course", draft.courses),
    fileUnresolved("sport", draft.sports),
    fileUnresolved("cocurricular", draft.cocurriculars),
  ]);

  // ── Target universities → student_schools (name + optional canonical link) ──
  if (draft.targetUniversities.length > 0) {
    await supabase.from("student_schools").insert(
      draft.targetUniversities.map((u) => ({
        student_id: userId,
        name: u.name,
        category: "target",
        ref_university_id: u.id,
      })),
    );
    await fileUnresolved("university", draft.targetUniversities);
  }

  // ── Projects → student_project_categories (project_category_id, detail) ──
  // The table has one detail column, so title + description are combined. A
  // project whose category is unresolved can't be linked (NOT NULL FK).
  const linkable = draft.projects.filter((p) => p.category.id !== null);
  if (linkable.length > 0) {
    await supabase.from("student_project_categories").insert(
      linkable.map((p) => ({
        student_id: userId,
        project_category_id: p.category.id as string,
        detail: p.description ? `${p.title} — ${p.description}` : p.title,
      })),
    );
  }
  await fileUnresolved(
    "project_category",
    draft.projects.filter((p) => p.category.id === null).map((p) => p.category),
  );
}

/** Stamp profile_completed_at via the idempotent finalize RPC. */
export async function stampProfileComplete(): Promise<void> {
  const { error } = await supabase.rpc("finalize_student_profile");
  if (error) throw error;
}
