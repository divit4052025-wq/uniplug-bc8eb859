// P9 — data layer for the in-dashboard student profile editor (ProfileSection).
//
// Two hard rules enforced here, both invisible to tsc/build (they fail only at
// request time), so they live in one audited place:
//
//   1. consent_column_lock (migration 20260604000060) REVOKEd table-wide
//      SELECT/UPDATE on public.students and re-granted an explicit allowlist.
//      Every students read/write below names ONLY allowlisted columns — never
//      select(*) (parental_consent_token is unreadable and 42501s).
//      Editable here: full_name, phone, school, countries, board, bio, photo_url.
//      Deliberately NOT touched: grade + parental_consent_email (child-safety /
//      Tracker #1 self-consent gap), email + parent_phone, and date_of_birth
//      (allowlisted but frozen by the students_dob_immutable trigger once set).
//
//   2. The interest join-tables + student_schools are edited by row-level
//      INSERT / DELETE only (owner-RLS: auth.uid() = student_id). We never UPDATE
//      a join row (student_schools' UPDATE policy lacks a WITH CHECK), so a
//      change is delete-the-row + insert-the-row — the "DELETE/INSERT" contract.
//
// Concrete per-axis column names (no dynamic keys) keep the generated Database
// types precise — same convention as student-signup/profileWrite.ts.
import { supabase } from "@/integrations/supabase/client";
import { createRefAddRequest } from "@/components/signup/refClient";
import type { RefKind } from "@/components/signup/types";

const PHOTO_BUCKET = "student-photos";

// ─────────────────────────────────────────────────────────────────────────────
// Scalar profile (public.students, allowlisted columns only)
// ─────────────────────────────────────────────────────────────────────────────

// phone + school are NOT NULL in public.students (set at signup); the rest are
// nullable. Typed to match so an edit can't try to null a NOT NULL column.
export type StudentScalarProfile = {
  full_name: string;
  phone: string;
  school: string;
  countries: string[];
  board: string | null;
  bio: string | null;
  photo_url: string | null;
  date_of_birth: string | null;
};

export type ScalarEdits = {
  full_name: string;
  phone: string;
  school: string;
  countries: string[];
  board: string | null;
  bio: string | null;
};

export async function loadScalarProfile(userId: string): Promise<StudentScalarProfile> {
  const { data, error } = await supabase
    .from("students")
    // SELECT-allowlisted columns ONLY (consent_column_lock). NEVER select(*).
    .select("full_name, phone, school, countries, board, bio, photo_url, date_of_birth")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Profile not found");
  return {
    full_name: data.full_name ?? "",
    phone: data.phone,
    school: data.school,
    countries: data.countries ?? [],
    board: data.board,
    bio: data.bio,
    photo_url: data.photo_url,
    date_of_birth: data.date_of_birth,
  };
}

export async function saveScalarProfile(userId: string, edits: ScalarEdits): Promise<void> {
  const { error } = await supabase
    .from("students")
    // UPDATE-allowlisted columns ONLY. date_of_birth, grade,
    // parental_consent_email, email, parent_phone are intentionally absent.
    .update({
      full_name: edits.full_name,
      phone: edits.phone,
      school: edits.school,
      countries: edits.countries,
      board: edits.board,
      bio: edits.bio,
    })
    .eq("id", userId);
  if (error) throw error;
}

/** Owner-readable signed URL for the private student-photos object (or null). */
export async function signedPhotoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/**
 * Re-upload = DELETE + INSERT: upload the new image under a fresh owner-prefixed
 * key, repoint students.photo_url (UPDATE-allowlisted), then best-effort delete
 * the previous object so it doesn't orphan. Never mutates a storage object
 * in place.
 */
export async function replaceProfilePhoto(
  userId: string,
  file: File,
  oldPath: string | null,
): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${userId}/${Date.now()}.${ext}`; // owner-prefix RLS on student-photos
  const { error: upErr } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;
  const { error: dbErr } = await supabase
    .from("students")
    .update({ photo_url: path })
    .eq("id", userId);
  if (dbErr) {
    // Roll back the orphaned upload so a failed DB write leaves no dangling object.
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    throw dbErr;
  }
  if (oldPath && oldPath !== path) {
    await supabase.storage.from(PHOTO_BUCKET).remove([oldPath]); // best-effort
  }
  return path;
}

// ─────────────────────────────────────────────────────────────────────────────
// Interest axes — row-level INSERT / DELETE on the owner-RLS join tables
// ─────────────────────────────────────────────────────────────────────────────

/** A persisted join-table selection: rowId = the join row's PK (delete target),
 *  refId = the ref_* taxonomy id (dedupe key), name = display label. */
export type AxisItem = { rowId: string; refId: string; name: string };

export type AxisConfig = {
  label: string;
  kind: RefKind;
  load: (userId: string) => Promise<AxisItem[]>;
  insert: (userId: string, refId: string, name: string) => Promise<AxisItem>;
  remove: (rowId: string) => Promise<void>;
};

// The four simple axes (one ref FK each). Concrete columns per axis.
export const SIMPLE_AXES: AxisConfig[] = [
  {
    label: "Subjects",
    kind: "subject",
    load: async (userId) => {
      const { data, error } = await supabase
        .from("student_subjects")
        .select("id, subject_id, ref_subjects(name)")
        .eq("student_id", userId)
        .order("created_at", { ascending: true })
        .returns<
          Array<{ id: string; subject_id: string; ref_subjects: { name: string } | null }>
        >();
      if (error) throw error;
      return (data ?? []).map((r) => ({
        rowId: r.id,
        refId: r.subject_id,
        name: r.ref_subjects?.name ?? "—",
      }));
    },
    insert: async (userId, refId, name) => {
      const { data, error } = await supabase
        .from("student_subjects")
        .insert({ student_id: userId, subject_id: refId })
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("Insert failed");
      return { rowId: data.id, refId, name };
    },
    remove: async (rowId) => {
      const { error } = await supabase.from("student_subjects").delete().eq("id", rowId);
      if (error) throw error;
    },
  },
  {
    label: "Courses / fields of study",
    kind: "course",
    load: async (userId) => {
      const { data, error } = await supabase
        .from("student_courses")
        .select("id, course_id, ref_courses(name)")
        .eq("student_id", userId)
        .order("created_at", { ascending: true })
        .returns<Array<{ id: string; course_id: string; ref_courses: { name: string } | null }>>();
      if (error) throw error;
      return (data ?? []).map((r) => ({
        rowId: r.id,
        refId: r.course_id,
        name: r.ref_courses?.name ?? "—",
      }));
    },
    insert: async (userId, refId, name) => {
      const { data, error } = await supabase
        .from("student_courses")
        .insert({ student_id: userId, course_id: refId })
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("Insert failed");
      return { rowId: data.id, refId, name };
    },
    remove: async (rowId) => {
      const { error } = await supabase.from("student_courses").delete().eq("id", rowId);
      if (error) throw error;
    },
  },
  {
    label: "Sports",
    kind: "sport",
    load: async (userId) => {
      const { data, error } = await supabase
        .from("student_sports")
        .select("id, sport_id, ref_sports(name)")
        .eq("student_id", userId)
        .order("created_at", { ascending: true })
        .returns<Array<{ id: string; sport_id: string; ref_sports: { name: string } | null }>>();
      if (error) throw error;
      return (data ?? []).map((r) => ({
        rowId: r.id,
        refId: r.sport_id,
        name: r.ref_sports?.name ?? "—",
      }));
    },
    insert: async (userId, refId, name) => {
      const { data, error } = await supabase
        .from("student_sports")
        .insert({ student_id: userId, sport_id: refId })
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("Insert failed");
      return { rowId: data.id, refId, name };
    },
    remove: async (rowId) => {
      const { error } = await supabase.from("student_sports").delete().eq("id", rowId);
      if (error) throw error;
    },
  },
  {
    label: "Co-curriculars",
    kind: "cocurricular",
    load: async (userId) => {
      const { data, error } = await supabase
        .from("student_cocurriculars")
        .select("id, cocurricular_id, ref_cocurriculars(name)")
        .eq("student_id", userId)
        .order("created_at", { ascending: true })
        .returns<
          Array<{ id: string; cocurricular_id: string; ref_cocurriculars: { name: string } | null }>
        >();
      if (error) throw error;
      return (data ?? []).map((r) => ({
        rowId: r.id,
        refId: r.cocurricular_id,
        name: r.ref_cocurriculars?.name ?? "—",
      }));
    },
    insert: async (userId, refId, name) => {
      const { data, error } = await supabase
        .from("student_cocurriculars")
        .insert({ student_id: userId, cocurricular_id: refId })
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("Insert failed");
      return { rowId: data.id, refId, name };
    },
    remove: async (rowId) => {
      const { error } = await supabase.from("student_cocurriculars").delete().eq("id", rowId);
      if (error) throw error;
    },
  },
];

// Target universities live in student_schools (category='target'); the name is
// stored directly, with an optional canonical ref_university_id link.
export const TARGET_UNI_AXIS: AxisConfig = {
  label: "Target universities",
  kind: "university",
  load: async (userId) => {
    const { data, error } = await supabase
      .from("student_schools")
      .select("id, name, ref_university_id")
      .eq("student_id", userId)
      .eq("category", "target")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      rowId: r.id,
      // Dedupe by canonical id when present, else by name (request-to-add unis).
      refId: r.ref_university_id ?? `name:${r.name}`,
      name: r.name,
    }));
  },
  insert: async (userId, refId, name) => {
    const { data, error } = await supabase
      .from("student_schools")
      .insert({
        student_id: userId,
        name,
        category: "target",
        ref_university_id: refId.startsWith("name:") ? null : refId,
      })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("Insert failed");
    return { rowId: data.id, refId, name };
  },
  remove: async (rowId) => {
    const { error } = await supabase.from("student_schools").delete().eq("id", rowId);
    if (error) throw error;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Projects — student_project_categories(project_category_id, detail)
// ─────────────────────────────────────────────────────────────────────────────

export type ProjectItem = {
  rowId: string;
  categoryId: string;
  categoryName: string;
  detail: string;
};

export async function loadProjects(userId: string): Promise<ProjectItem[]> {
  const { data, error } = await supabase
    .from("student_project_categories")
    .select("id, project_category_id, detail, ref_project_categories(name)")
    .eq("student_id", userId)
    .order("created_at", { ascending: true })
    .returns<
      Array<{
        id: string;
        project_category_id: string;
        detail: string | null;
        ref_project_categories: { name: string } | null;
      }>
    >();
  if (error) throw error;
  return (data ?? []).map((r) => ({
    rowId: r.id,
    categoryId: r.project_category_id,
    categoryName: r.ref_project_categories?.name ?? "—",
    detail: r.detail ?? "",
  }));
}

export async function insertProject(
  userId: string,
  categoryId: string,
  detail: string,
): Promise<void> {
  const { error } = await supabase
    .from("student_project_categories")
    .insert({ student_id: userId, project_category_id: categoryId, detail: detail || null });
  if (error) throw error;
}

export async function removeProject(rowId: string): Promise<void> {
  const { error } = await supabase.from("student_project_categories").delete().eq("id", rowId);
  if (error) throw error;
}

/** Best-effort "request to add" for a taxonomy item with no canonical row yet.
 *  Mirrors signup behaviour — a failed request must never block the editor. */
export async function fileRefAddRequest(kind: RefKind, name: string): Promise<void> {
  await createRefAddRequest(kind, name);
}
