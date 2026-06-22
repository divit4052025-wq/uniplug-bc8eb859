// P7 student wizard types. The role-agnostic RefItem/RefKind now live in the
// shared signup module and are re-exported here so existing imports keep working.
export type { RefItem, RefKind } from "@/components/signup/types";

import type { RefItem } from "@/components/signup/types";

/** University tier — maps directly to student_schools.category
 *  (CHECK IN ('dream','target','safety')). The v1 wizard hardcoded 'target';
 *  v2 exposes the tier and writes the chosen value through. */
export type UniTier = "dream" | "target" | "safety";

/** A target-university pick = a ref selection plus its tier. Extends RefItem so
 *  it stays compatible with the ref-data helpers (id may be null for a
 *  request-to-add; name is the durable label written to student_schools). */
export interface UniPick extends RefItem {
  tier: UniTier;
}

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
  targetUniversities: UniPick[];
  courses: RefItem[];
  sports: RefItem[];
  cocurriculars: RefItem[];
  projects: ProjectDraft[];
  savedAt: string;
}

export const DRAFT_STORAGE_KEY = "uniplug:student-profile-draft:v1";
