// P7 — device-local stash for the rich-profile selections, written at "create
// account" (pre-auth) and replayed in the authenticated finalize step. If the
// stash is missing at finalize (different device / cleared storage) the finalize
// screen collects those fields fresh instead — the data is never lost silently.
import { DRAFT_STORAGE_KEY, type ProfileDraft } from "./types";

const EMPTY: Omit<ProfileDraft, "savedAt"> = {
  subjects: [],
  targetUniversities: [],
  courses: [],
  sports: [],
  cocurriculars: [],
  projects: [],
};

export function saveProfileDraft(draft: Omit<ProfileDraft, "savedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const payload: ProfileDraft = { ...draft, savedAt: new Date().toISOString() };
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage full / disabled — finalize will fall back to fresh collection.
  }
}

export function loadProfileDraft(): ProfileDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProfileDraft>;
    // Defensive normalisation — a malformed stash must not crash finalize.
    return {
      ...EMPTY,
      ...parsed,
      subjects: parsed.subjects ?? [],
      targetUniversities: parsed.targetUniversities ?? [],
      courses: parsed.courses ?? [],
      sports: parsed.sports ?? [],
      cocurriculars: parsed.cocurriculars ?? [],
      projects: parsed.projects ?? [],
      savedAt: parsed.savedAt ?? "",
    };
  } catch {
    return null;
  }
}

export function clearProfileDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    /* no-op */
  }
}

/** True when a draft carries at least one selection worth replaying. */
export function draftHasData(draft: ProfileDraft | null): boolean {
  if (!draft) return false;
  return (
    draft.subjects.length > 0 ||
    draft.targetUniversities.length > 0 ||
    draft.courses.length > 0 ||
    draft.sports.length > 0 ||
    draft.cocurriculars.length > 0 ||
    draft.projects.length > 0
  );
}
