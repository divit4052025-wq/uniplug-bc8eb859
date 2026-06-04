// P7 — shared signup constants + the consent rule (mirrors the DB
// requires_consent_base used by handle_new_user / prevent_booking_minor_no_consent:
// consent required when under-18 OR in a gated grade 9/10/11).

// UniPlug is Grade 9+. (The DB grade column also lists Grade 8 historically, but
// the product does not onboard Grade 8 — see the mascot grade picker.)
export const GRADES = ["Grade 9", "Grade 10", "Grade 11", "Grade 12"] as const;

export const GATED_GRADES = ["Grade 9", "Grade 10", "Grade 11"];

export const BOARDS = ["CBSE", "ICSE", "IB", "IGCSE / Cambridge", "State Board", "NIOS", "Other"];

export const COUNTRIES = [
  "India",
  "United Kingdom",
  "United States",
  "Singapore",
  "Canada",
  "Australia",
  "Germany",
  "Netherlands",
  "Hong Kong",
];

// The legal docs are at Version 1.0 (legal-source/*.md). Recorded into
// legal_acceptances via the terms_version / privacy_version signup metadata.
export const LEGAL_VERSION = "1.0";

/** True if the ISO date (YYYY-MM-DD) is a valid past date making the person under 18. */
export function isUnder18(dobISO: string): boolean {
  if (!dobISO) return false;
  const dob = new Date(`${dobISO}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age < 18;
}

/** The consent trigger — under-18 OR a gated grade. Mirrors the DB rule. */
export function consentRequired(dobISO: string, grade: string): boolean {
  return isUnder18(dobISO) || GATED_GRADES.includes(grade);
}
