// P8 — device-local stash for the mentor application's selections that need an
// authenticated session to persist (the admits → mentor_admits owner-RLS rows).
// Written at "create account" (pre-auth), replayed in the finalize step. Scalars
// (name/dob/college_email/phone/university/year/course/specialty/bio) ride in the
// auth.signUp metadata instead. Delegates to the shared generic draft store.
import { readDraft, removeDraft, writeDraft } from "@/components/signup/draft";
import type { RefItem } from "@/components/signup/types";
import type { SpecialtyKey } from "@/components/mascots/specialty";

export interface MentorDraft {
  /** Universities the mentor was admitted to (the matching anchor). */
  admits: RefItem[];
  specialty: SpecialtyKey;
  /** Free-form "extra skills" chips, replayed into mentors.topics at finalize. */
  skills: string[];
  savedAt: string;
}

const KEY = "uniplug:mentor-application-draft:v1";

export function saveMentorDraft(draft: Omit<MentorDraft, "savedAt">): void {
  writeDraft(KEY, { ...draft, savedAt: new Date().toISOString() } satisfies MentorDraft);
}

export function loadMentorDraft(): MentorDraft | null {
  const parsed = readDraft<Partial<MentorDraft>>(KEY);
  if (!parsed) return null;
  return {
    admits: parsed.admits ?? [],
    specialty: (parsed.specialty ?? "general") as SpecialtyKey,
    skills: parsed.skills ?? [],
    savedAt: parsed.savedAt ?? "",
  };
}

export function clearMentorDraft(): void {
  removeDraft(KEY);
}

/** True when the stash carries admits worth replaying (the finalize anchor). */
export function mentorDraftHasAdmits(draft: MentorDraft | null): boolean {
  return !!draft && draft.admits.length > 0;
}
