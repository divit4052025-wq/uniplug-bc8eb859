// Per-role configuration for the two waitlist pages (CD screens C & D). Keeps
// WaitlistRolePage generic; all the copy, mascots, worlds, colours and mirrored
// layout live here.

import type { RoleConfig } from "./WaitlistRolePage";

const MENTEE_SCRIM =
  "linear-gradient(180deg, rgba(23,21,19,.34) 0%, transparent 22%, transparent 52%, rgba(23,21,19,.55) 84%, rgba(23,21,19,.8) 100%)";
const MENTOR_SCRIM =
  "linear-gradient(180deg, rgba(23,21,19,.36) 0%, transparent 22%, transparent 52%, rgba(23,21,19,.56) 84%, rgba(23,21,19,.82) 100%)";

export const MENTEE_CONFIG: RoleConfig = {
  kind: "school",
  tone: "mentee",
  world: "quarter",
  sectionBg: "var(--paper)",
  contentBg: "var(--paper)",
  worldOrder: 1,
  contentOrder: 2,
  scrim: MENTEE_SCRIM,
  worldMascots: [
    { shape: "sprout", expression: "happy", size: 62, label: "Sprout" },
    { shape: "climber", expression: "thinking", size: 66, label: "Climber" },
    { shape: "spark", expression: "focused", size: 62, label: "Spark" },
  ],
  worldMascotGap: 6,
  worldKicker: "The Quarter · for school students",
  worldKickerColor: "var(--rose)",
  worldHeadline: "Wherever you are, there’s a Plug a step ahead.",
  worldHeadlineMaxCh: 15,
  formHeadline: "Get in before the doors open.",
  benefits: [
    {
      shape: "sprout",
      expression: "happy",
      strong: "1:1 video sessions",
      rest: "with a verified mentor who recently sat exactly where you’re sitting.",
    },
    {
      shape: "climber",
      expression: "thinking",
      strong: "Matched to your stage.",
      rest: "From figuring it out in Grade 9 to the final stretch in Grade 12.",
    },
    {
      shape: "spark",
      expression: "focused",
      strong: "First in line.",
      rest: "Founding members get in the moment booking opens.",
    },
  ],
  meterOrder: "school-first",
  emailPlaceholder: "you@example.com",
  successMascot: { shape: "sprout", size: 132 },
  successGlow: "radial-gradient(circle, rgba(244,181,170,.5), transparent 68%)",
  successBody:
    "We’ll email you the moment booking opens. Keep an eye on your inbox, your Plug is on the way.",
  successBadgeDot: "var(--rose)",
  successBadgeShadow: "0 0 0 4px rgba(244,181,170,.24)",
  successBadgeLabel: "Founding student",
  successAltLabel: "Know someone who mentors?",
  successAltTo: "/waitlist/mentor",
};

export const MENTOR_CONFIG: RoleConfig = {
  kind: "college",
  tone: "mentor",
  world: "headquarters",
  sectionBg: "var(--blush)",
  contentBg: "var(--blush)",
  worldOrder: 2,
  contentOrder: 1,
  scrim: MENTOR_SCRIM,
  worldMascots: [
    { shape: "mentor", expression: "guiding", size: 76, label: "The Mentor" },
    { shape: "founder", expression: "happy", size: 64, label: "The Founder" },
  ],
  worldMascotGap: 10,
  worldKicker: "Headquarters · for college students",
  worldKickerColor: "var(--sand)",
  worldHeadline: "Become the Plug you needed.",
  worldHeadlineMaxCh: 14,
  formHeadline: "Be first to open your doors.",
  benefits: [
    {
      shape: "sports",
      expression: "excited",
      strong: "Earn on your terms.",
      rest: "Keep 75% of every session. UniPlug sets pricing and handles payments.",
    },
    {
      shape: "quill",
      expression: "guiding",
      strong: "We handle everything but the talking.",
      rest: "Scheduling, payments and safety are on us.",
    },
    {
      shape: "leaf",
      expression: "happy",
      strong: "Reach the juniors who need your road.",
      rest: "The ones a step behind, looking for exactly you.",
    },
  ],
  meterOrder: "college-first",
  emailPlaceholder: "you@college.edu",
  successMascot: { shape: "mentor", size: 140 },
  successGlow: "radial-gradient(circle, rgba(215,162,72,.5), transparent 68%)",
  successBody:
    "We’ll email you the moment mentor applications open, so you can set up and start guiding from day one.",
  successBadgeDot: "var(--sand)",
  successBadgeShadow: "0 0 0 4px rgba(242,208,152,.24)",
  successBadgeLabel: "Founding mentor",
  successAltLabel: "Looking for a mentor instead?",
  successAltTo: "/waitlist/student",
};
