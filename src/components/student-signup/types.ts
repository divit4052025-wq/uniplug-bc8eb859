// P7 student signup wizard — shared types.
//
// The wizard is PRE-AUTH: it can read the anon-callable typeahead RPCs
// (search_reference / search_schools) but cannot write the six owner-RLS join
// tables (no session yet). So the rich selections below are STASHED on the
// device at "create account" and replayed in the authenticated finalize step.
// Scalars (name/phone/school/grade/dob/board/bio/parent/countries + the legal
// version keys) instead ride along in the auth.signUp metadata that
// handle_new_user reads.

/** A reference-data selection. id === null means "couldn't find it → request to
 *  add": it can't be linked to a join table yet (no canonical ref row), so at
 *  finalize we file a create_ref_add_request for it instead of inserting a row. */
export interface RefItem {
  id: string | null;
  name: string;
}

/** Strict ref kinds accepted by search_reference / create_ref_add_request. */
export type RefKind =
  | "university"
  | "course"
  | "subject"
  | "sport"
  | "cocurricular"
  | "project_category";

/** An academic/science project entry (multi-add). Stored into
 *  student_project_categories(project_category_id, detail) — the table carries a
 *  single free-text `detail`, so title + description are combined there. */
export interface ProjectDraft {
  category: RefItem;
  title: string;
  description: string;
}

/** The rich-profile payload that is stashed pre-auth and replayed at finalize.
 *  Every field here maps to an owner-RLS join table written client-side. */
export interface ProfileDraft {
  subjects: RefItem[];
  targetUniversities: RefItem[];
  courses: RefItem[];
  sports: RefItem[];
  cocurriculars: RefItem[];
  projects: ProjectDraft[];
  savedAt: string;
}

export const DRAFT_STORAGE_KEY = "uniplug:student-profile-draft:v1";
