// P7 — device-local stash for the rich-profile selections, written at "create
// account" (pre-auth) and replayed in the authenticated finalize step. Delegates
// to the shared generic draft store; keeps a ProfileDraft-typed API.
import { readDraft, removeDraft, writeDraft } from "@/components/signup/draft";
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
  writeDraft(DRAFT_STORAGE_KEY, {
    ...draft,
    savedAt: new Date().toISOString(),
  } satisfies ProfileDraft);
}

export function loadProfileDraft(): ProfileDraft | null {
  const parsed = readDraft<Partial<ProfileDraft>>(DRAFT_STORAGE_KEY);
  if (!parsed) return null;
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
}

export function clearProfileDraft(): void {
  removeDraft(DRAFT_STORAGE_KEY);
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
