// The mentor specialty ↔ mascot vocabulary, co-located with the mascot engine.
//
// The DB (ref_specialties) stores STABLE specialty keys; mascot_key there is a
// placeholder equal to the key. The CLIENT owns the mascot-shape vocabulary —
// this map turns a specialty key into a MascotShape. Imported by both the mentor
// signup M4 picker and the browse page so they never drift.
//
// ref_specialties is authenticated-SELECT only, so the pre-auth mentor wizard
// can't fetch the list; SPECIALTIES carries the key + label client-side (labels
// mirror ref_specialties.label). The wizard submits the specialty KEY in the
// signUp metadata; handle_new_user resolves it to specialty_id.
import type { MascotShape } from "./Mascot";

export type SpecialtyKey =
  | "general"
  | "essays"
  | "sports"
  | "cocurriculars"
  | "projects"
  | "competitive_exam_prep";

export const SPECIALTY_MASCOT: Record<SpecialtyKey, MascotShape> = {
  general: "mentor",
  essays: "quill",
  sports: "sports",
  cocurriculars: "cocurricular",
  projects: "lens",
  competitive_exam_prep: "grid",
};

/** MascotShape for a specialty key (defaults to the general "mentor" mascot for
 *  an unknown/absent key). Safe for the DB's mascot_key placeholder. */
export function mascotForSpecialty(key: string | null | undefined): MascotShape {
  return (key && SPECIALTY_MASCOT[key as SpecialtyKey]) || "mentor";
}

/** The six fixed specialties (key + label + a one-liner), in canonical order.
 *  Labels mirror ref_specialties.label; General is the default/most common. */
export const SPECIALTIES: { key: SpecialtyKey; label: string; blurb: string }[] = [
  { key: "general", label: "General", blurb: "All-round admissions guidance" },
  { key: "essays", label: "Essays", blurb: "Personal statements & supplements" },
  { key: "sports", label: "Sports", blurb: "Athletics & recruitment" },
  { key: "cocurriculars", label: "Co-curriculars", blurb: "Arts, clubs, debate, music" },
  { key: "projects", label: "Projects", blurb: "Research & academic projects" },
  {
    key: "competitive_exam_prep",
    label: "Competitive-exam prep",
    blurb: "Entrance exams & test prep",
  },
];
