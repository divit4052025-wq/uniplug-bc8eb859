/* ============================================================
   UniPlug · The Quarter — zone data + world-state types.
   THREE-FREE on purpose: this module must NOT import three (or
   anything that does), so eager surfaces (StudentQuarterHome, the
   dock) can read ZONES/types without pulling the WebGL engine into
   the Cloudflare Worker SSR bundle or the initial /dashboard chunk.
   The heavy engine (scene.ts) imports these back.
   ============================================================ */

export type QuarterState = "pending" | "granted";
export type ZoneOverride = "auto" | "lit" | "locked";

export interface Zone {
  id: string;
  name: string;
  kind: string;
  pos: [number, number];
  always?: boolean;
  book?: boolean;
  blurb: string;
  stat: string;
  sub: string;
}

export const ZONES: Zone[] = [
  {
    id: "square",
    name: "The Square",
    kind: "Home",
    pos: [0, 24],
    always: true,
    blurb: "Where you land. Your Plugs, your matches, your school list — and what’s next.",
    stat: "Your home base",
    sub: "start here",
  },
  {
    id: "switchboard",
    name: "The Switchboard",
    kind: "Find your Plug",
    pos: [11, -20],
    always: true,
    blurb: "Search and filter mentors who’ve been exactly where you want to go, then book.",
    stat: "Browse mentors",
    sub: "search · filter · book",
  },
  {
    id: "studio",
    name: "The Studio",
    kind: "Your sessions",
    pos: [-24, -5],
    book: true,
    blurb: "Your 1:1 sessions — join, reschedule, review, and read your mentor’s notes.",
    stat: "Sessions & notes",
    sub: "join · reschedule",
  },
  {
    id: "line",
    name: "The Line",
    kind: "Messages",
    pos: [24, -5],
    always: true,
    blurb: "Your direct line to your Plugs — every conversation, in one place.",
    stat: "Messages",
    sub: "chat with your Plugs",
  },
  {
    id: "locker",
    name: "The Locker",
    kind: "Documents",
    pos: [-20, 14],
    always: true,
    blurb: "Your essays, lists and materials — shared with the Plugs you work with.",
    stat: "Your documents",
    sub: "upload · share",
  },
  {
    id: "climb",
    name: "The Climb",
    kind: "Progress",
    pos: [20, 14],
    always: true,
    blurb: "How far you’ve come — your session notes, action points, and what’s done.",
    stat: "Your progress",
    sub: "notes · action points",
  },
  {
    id: "dorm",
    name: "The Dorm",
    kind: "Profile & settings",
    pos: [-13, -20],
    always: true,
    blurb: "Your room — profile, targets, settings, and your parent’s consent.",
    stat: "Profile & settings",
    sub: "consent lives here",
  },
];

/** The single source of truth for whether a zone is open, given world-state +
 *  optional per-zone overrides. Shared by the engine and the dock so they can
 *  never drift. */
export function zoneOpen(
  z: Zone,
  worldState: QuarterState,
  overrides: Record<string, "lit" | "locked"> = {},
): boolean {
  const ov = overrides[z.id];
  if (ov === "lit") return true;
  if (ov === "locked") return false;
  if (z.always) return true;
  if (z.book) return worldState === "granted";
  return true;
}
