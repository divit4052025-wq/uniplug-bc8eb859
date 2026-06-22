// Shared signup constants used by both the student and mentor wizards.

// The legal docs are at Version 1.0 (legal-source/*.md). Recorded into
// legal_acceptances via the terms_version / privacy_version (+ mentor_agreement_version)
// signup metadata that handle_new_user reads.
export const LEGAL_VERSION = "1.0";

// Code of Conduct acceptance version, recorded into legal_acceptances
// (doc_type='code_of_conduct') from the code_of_conduct_version signup metadata
// that handle_new_user reads. Kept separate from LEGAL_VERSION so legal can bump
// the CoC document independently — change this one line when the real CoC ships.
export const CODE_OF_CONDUCT_VERSION = "1.0";

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
