// UniPlug Mascot System v3 — canonical data, ported to typed records.
// Source of truth: ~/Downloads "UniPlug App Mascots (Remix).zip" → mascot-data-v3.js.
// 11 mascots, ONE shared face; identity is carried by shape + colour (see Mascot.tsx).
// Colours below are the canonical cfg values from the v3 data file. Climber is
// stone-grey #D2CECB (canonical) — NOT the unrelated lilac palette swatch #D7C8EE.

import type { MascotExpression, MascotShape } from "./Mascot";

export type MascotGroup = "Brand" | "Students" | "Mentors";

export interface MascotRecord {
  id: string;
  shape: MascotShape;
  archetype: string;
  role: string;
  group: MascotGroup;
  /** Canonical identity fill. */
  color: string;
  /** Default resting expression for this mascot. */
  expression: MascotExpression;
  tagline: string;
  summary: string;
  /** Plain-language label used on the public marketing page. */
  category: string;
}

export const MASCOTS: Record<MascotShape, MascotRecord> = {
  founder: {
    id: "founder",
    shape: "founder",
    archetype: "The Founder",
    role: "The voice of UniPlug",
    group: "Brand",
    color: "#1A1A1A",
    expression: "default",
    tagline: "Your plug knows.",
    summary:
      "The face of the brand and the voice behind every screen — a speech bubble, because the Founder talks and you listen. The only mascot in pure ink, the only one with a chat-tail.",
    category: "Brand voice",
  },
  sprout: {
    id: "sprout",
    shape: "sprout",
    archetype: "Sprout",
    role: "Grade 9–10",
    group: "Students",
    color: "#F4B5AA",
    expression: "confused",
    tagline: "Just figuring it out, one question at a time.",
    summary: "Just starting out — curious, open, no plan yet. The smallest of the family.",
    category: "Starting out",
  },
  climber: {
    id: "climber",
    shape: "climber",
    archetype: "Climber",
    role: "Grade 11",
    group: "Students",
    color: "#D2CECB",
    expression: "thinking",
    tagline: "Has a plan. Working the plan.",
    summary: "Strategic mode — solid, locked in, eyes on the peak.",
    category: "Building the plan",
  },
  spark: {
    id: "spark",
    shape: "spark",
    archetype: "Spark",
    role: "Grade 12",
    group: "Students",
    color: "#ED7E4A",
    expression: "focused",
    tagline: "Three deadlines, two essays, one offer to chase.",
    summary: "The final stretch — intense, urgent, burning through deadlines.",
    category: "Final stretch",
  },
  mentor: {
    id: "mentor",
    shape: "mentor",
    archetype: "The Mentor",
    role: "General mentorship",
    group: "Mentors",
    color: "#F8E8DD",
    expression: "guiding",
    tagline: "Been there, applied to that.",
    summary:
      "The trusted senior — a calmer relative of the Founder, with a halo and two chat-tails: they talk, and they listen.",
    category: "General mentorship",
  },
  quill: {
    id: "quill",
    shape: "quill",
    archetype: "Quill",
    role: "Essay mentor",
    group: "Mentors",
    color: "#FAEFE3",
    expression: "guiding",
    tagline: "Find the line that opens your story.",
    summary: "A sheet of paper and a fountain pen — the personal-statement editor.",
    category: "Essays & personal statements",
  },
  grid: {
    id: "grid",
    shape: "grid",
    archetype: "Grid",
    role: "Entrance-exam mentor",
    group: "Mentors",
    color: "#C2D9EA",
    expression: "focused",
    tagline: "The test is a pattern. We'll find the pattern.",
    summary: "Analytical without being cold — test prep and pattern-finding.",
    category: "Entrance exams & test prep",
  },
  sports: {
    id: "sports",
    shape: "sports",
    archetype: "Sports",
    role: "Athletics mentor",
    group: "Mentors",
    color: "#F2D098",
    expression: "excited",
    tagline: "Captain a team, win a match — then we write about it.",
    summary: "Pure kinetic energy — sport, recruitment and athletics.",
    category: "Sports & athletics",
  },
  cocurricular: {
    id: "cocurricular",
    shape: "cocurricular",
    archetype: "Encore",
    role: "Co-curricular & arts mentor",
    group: "Mentors",
    color: "#9AD6C6",
    expression: "happy",
    tagline: "Lead a club, win a stage, make a thing worth applauding.",
    summary: "The spotlight — arts, music, debate and clubs.",
    category: "Arts & co-curriculars",
  },
  lens: {
    id: "lens",
    shape: "lens",
    archetype: "Lens",
    role: "Research mentor",
    group: "Mentors",
    color: "#B5A0D4",
    expression: "thinking",
    tagline: "Not every applicant needs a paper. Yours probably should.",
    summary: "The academic of the family — research, Olympiads and projects.",
    category: "Research & academic projects",
  },
  leaf: {
    id: "leaf",
    shape: "leaf",
    archetype: "Leaf",
    role: "Social-service mentor",
    group: "Mentors",
    color: "#C5D9B0",
    expression: "happy",
    tagline: "Volunteer once for real. The resume writes itself.",
    summary: "Grounded and sincere — service, NGOs and sustainability.",
    category: "Social service & sustainability",
  },
};

/** The three-stage student journey, in canonical order. */
export const STUDENT_JOURNEY: MascotShape[] = ["sprout", "climber", "spark"];

/** The seven mentor categories, shown as a showcase grid (never as real people). */
export const MENTOR_CATEGORIES: MascotShape[] = [
  "mentor",
  "quill",
  "grid",
  "sports",
  "cocurricular",
  "lens",
  "leaf",
];
