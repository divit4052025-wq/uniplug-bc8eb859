// Mentor-signup v2 — the cinematic beats that bookend the dark mentor form.
// A deliberate dark inverted sibling of the student beats:
//   • MentorArrivalBeat        — the inverted LIGHT arrival: "Become the Plug you
//     needed." + the mentor mascot family assembling center-out.
//   • MentorAccountCreatedBeat — the dark "Account created." micro-bloom shown
//     after the wizard creates the account, before the email-confirm gate.
// The mentor cast EXCLUDES the student-journey mascots (sprout/spark/climber).
// Logo variants follow the real convention (suffix = TARGET background, NOT the
// glyph colour): wordmark-offwhite (ink glyph) on the light arrival; wordmark-dark
// (light glyph) on the dark beat. SSR-safe: Motion renders deterministic markup.
import { motion, type Variants } from "motion/react";

import { Mascot, type MascotShape } from "@/components/mascots/Mascot";
import { MASCOTS } from "@/components/mascots/mascot-data";
import { Logo } from "@/components/site/Logo";

const EASE_OUT: [number, number, number, number] = [0.32, 0.72, 0, 1];
const EASE_SPRING: [number, number, number, number] = [0.34, 1.3, 0.5, 1];

// Inverted light arrival surface (a warm off-white, distinct from --brand-paper).
const ARRIVAL_BG = "#F2DDD4";
const ARRIVAL_MUTED = "#9A7C68"; // eyebrow + sub-copy warm brown on the light base
const PLUG_TINT = "#C4907F"; // the "Plug" word + interstitial accent (rose-deep)

// Arrival family — 8 mascots, center-out. EXCLUDES sprout / spark / climber.
const ARRIVAL_CAST: { shape: MascotShape; size?: number }[] = [
  { shape: "lens" },
  { shape: "leaf" },
  { shape: "cocurricular" },
  { shape: "founder", size: 140 },
  { shape: "mentor" },
  { shape: "grid" },
  { shape: "sports" },
  { shape: "quill" },
];
const CAST_CENTER = (ARRIVAL_CAST.length - 1) / 2;

const castContainer: Variants = { hidden: {}, show: {} };
const castItem: Variants = {
  hidden: { y: 120, scale: 0.45, opacity: 0 },
  show: (i: number) => ({
    y: 0,
    scale: 1,
    opacity: 1,
    transition: {
      duration: 0.8,
      ease: EASE_SPRING,
      // center-out: the middle mascots land first, the ends last.
      delay: Math.abs(i - CAST_CENTER) * 0.08 + 0.1,
    },
  }),
};

export function MentorArrivalBeat({ onBegin }: { onBegin: () => void }) {
  return (
    <div
      className="absolute inset-0 z-[130] flex flex-col items-center justify-center overflow-hidden text-center"
      style={{ background: ARRIVAL_BG, color: "#1A1A1A" }}
    >
      {/* `-offwhite` = the ink glyph FOR off-white/light backgrounds (suffix is the
          target bg, not the glyph colour). Wrapped in a positioned div so the Logo's
          own `relative` wrapper can't win over the absolute placement. */}
      <div className="absolute left-10 top-8">
        <Logo variant="wordmark-offwhite" size={34} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 1.2 }}
        className="font-sans text-[13px] font-semibold uppercase tracking-[0.22em]"
        style={{ color: ARRIVAL_MUTED }}
      >
        For UniPlug mentors
      </motion.div>

      <motion.h1
        initial={{ y: 26, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: EASE_OUT, delay: 0.15 }}
        className="m-0 mt-3.5 max-w-[15ch] text-center font-display text-[clamp(44px,7vw,72px)] font-extrabold leading-[0.98] tracking-[-0.03em]"
      >
        Become the <span style={{ color: PLUG_TINT }}>Plug</span>
        <br />
        you needed.
      </motion.h1>

      <motion.div
        variants={castContainer}
        initial="hidden"
        animate="show"
        className="my-8 flex h-[160px] items-end justify-center gap-2"
      >
        {ARRIVAL_CAST.map((m, i) => (
          <motion.div key={i} custom={i} variants={castItem} className="flex items-end">
            {/* founder keeps its canonical ink fill — correct on the LIGHT arrival */}
            <Mascot
              shape={m.shape}
              color={MASCOTS[m.shape].color}
              expression={m.shape === "founder" ? "happy" : "default"}
              size={m.size ?? 86}
              decorative
            />
          </motion.div>
        ))}
      </motion.div>

      <motion.button
        type="button"
        data-mag
        data-hov
        onClick={onBegin}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 1.7 }}
        className="mt-2 inline-flex cursor-none items-center gap-3 rounded-md px-9 py-[18px] font-sans text-[17px] font-bold"
        style={{ background: "#1A1A1A", color: "#FAF5EF" }}
      >
        Step inside <span className="text-[19px]">→</span>
      </motion.button>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 1.85 }}
        className="mt-[18px] text-[13px]"
        style={{ color: ARRIVAL_MUTED }}
      >
        Every mentor is a verified college student. It takes about 5 minutes.
      </motion.div>
    </div>
  );
}

// Dark "Account created." micro-bloom (wizard submit → email-confirm gate).
// Founder is forced to the bright rose so it never renders ink-on-dark.
export function MentorAccountCreatedBeat() {
  return (
    <div
      data-dark
      className="absolute inset-0 z-[135] flex flex-col items-center justify-center overflow-hidden bg-brand-night text-center text-brand-paper"
    >
      <div className="absolute left-10 top-8">
        {/* `-dark` = the light glyph FOR the dark beat (suffix = target bg) */}
        <Logo variant="wordmark-dark" size={32} />
      </div>
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-rose"
        style={{ animation: "upBloom 1.1s cubic-bezier(0.32,0.72,0,1) both" }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: EASE_SPRING }}
        className="relative z-[2]"
      >
        <Mascot shape="founder" color="#F4B5AA" expression="celebrating" size={130} decorative />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.25 }}
        className="relative z-[2] mt-4 font-display text-[38px] font-extrabold"
      >
        Account created.
      </motion.div>
    </div>
  );
}
