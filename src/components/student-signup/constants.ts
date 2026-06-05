// P7 student-specific constants + the consent rule. LEGAL_VERSION / COUNTRIES /
// isUnder18 are shared (re-exported from the signup module).
export { LEGAL_VERSION, COUNTRIES, isUnder18 } from "@/components/signup/constants";

import { isUnder18 } from "@/components/signup/constants";

// UniPlug is Grade 9+. (The DB grade column also lists Grade 8 historically, but
// the product does not onboard Grade 8 — see the mascot grade picker.)
export const GRADES = ["Grade 9", "Grade 10", "Grade 11", "Grade 12"] as const;

export const GATED_GRADES = ["Grade 9", "Grade 10", "Grade 11"];

export const BOARDS = ["CBSE", "ICSE", "IB", "IGCSE / Cambridge", "State Board", "NIOS", "Other"];

/** The consent trigger — under-18 OR a gated grade. Mirrors the DB rule
 *  (requires_consent_base used by handle_new_user / prevent_booking_minor_no_consent). */
export function consentRequired(dobISO: string, grade: string): boolean {
  return isUnder18(dobISO) || GATED_GRADES.includes(grade);
}
