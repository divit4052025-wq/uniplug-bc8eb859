// P7 student wizard types. The role-agnostic RefItem/RefKind now live in the
// shared signup module and are re-exported here so existing imports keep working.
export type { RefItem, RefKind } from "@/components/signup/types";

import type { RefItem } from "@/components/signup/types";

/** An academic/science project entry (multi-add). Stored into
 *  student_project_categories(project_category_id, detail) — the table carries a
 *  single free-text `detail`, so title + description are combined there. */
export interface ProjectDraft {
  category: RefItem;
  title: string;
  description: string;
}

/** The rich-profile payload stashed pre-auth and replayed at finalize. Every
 *  field maps to an owner-RLS join table written client-side. */
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
