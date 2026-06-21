// Student-signup v2 — the dark cinematic beats that bookend the light form:
//   • ArrivalBeat       — "Plug into your future." + the mascot family running in
//   • AccountCreatedBeat — the "Account created." micro-bloom (no confetti)
//   • YoureInBeat       — the "You're in." payoff + mascot gather (no confetti)
// Motion drives the staggered entrances; the bloom is a CSS keyframe (upBloom).
// All beats carry data-dark so the magnetic cursor flips to the bright on-dark
// rose, and a light (offwhite) wordmark. SSR-safe: Motion renders deterministic
// markup; no window access here.
import { motion, type Variants } from "motion/react";

import { Mascot, type MascotExpression, type MascotShape } from "@/components/mascots/Mascot";
import { MASCOTS } from "@/components/mascots/mascot-data";
import { Logo } from "@/components/site/Logo";

const EASE_OUT: [number, number, number, number] = [0.28, 0.66, 0.32, 1];
const EASE_SPRING: [number, number, number, number] = [0.34, 1.4, 0.5, 1];

function DarkBeat({ children, zClass }: { children: React.ReactNode; zClass: string }) {
  return (
    <div
      data-dark
      className={`absolute inset-0 ${zClass} flex flex-col items-center justify-center overflow-hidden bg-brand-night text-center text-brand-paper`}
    >
      <div className="absolute left-10 top-8">
        {/* `-dark` = the light glyph FOR the dark cinematic beat (suffix = target bg) */}
        <Logo variant="wordmark-dark" size={32} />
      </div>
      {children}
    </div>
  );
}

function beatMascotExpr(shape: MascotShape, mode: "arrival" | "gather"): MascotExpression {
  if (shape === "founder") return mode === "gather" ? "celebrating" : "happy";
  if (shape === "spark") return "excited";
  return mode === "gather" ? "happy" : "default";
}

// ── Arrival (Act 1) ─────────────────────────────────────────────────────────
const CAST: { shape: MascotShape; size?: number }[] = [
  { shape: "leaf" },
  { shape: "lens" },
  { shape: "cocurricular" },
  { shape: "sports" },
  { shape: "grid" },
  { shape: "founder", size: 150 },
  { shape: "quill" },
  { shape: "mentor" },
  { shape: "spark" },
  { shape: "climber" },
  { shape: "sprout" },
];

const castContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.085, delayChildren: 0.15 } },
};
const castItem: Variants = {
  hidden: { x: "-120vw", rotate: -8, opacity: 0 },
  show: { x: 0, rotate: 0, opacity: 1, transition: { duration: 0.85, ease: EASE_OUT } },
};

export function ArrivalBeat({ onBegin }: { onBegin: () => void }) {
  return (
    <DarkBeat zClass="z-[60]">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 1.4 }}
        className="font-sans text-[13px] font-semibold uppercase tracking-[0.22em] text-brand-paper/50"
      >
        Welcome to UniPlug
      </motion.div>
      <motion.h1
        initial={{ y: 26, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1], delay: 0.15 }}
        className="m-0 mt-3.5 max-w-[16ch] text-center font-display text-[clamp(48px,7.2vw,76px)] font-extrabold leading-[0.96] tracking-[-0.03em]"
      >
        Plug into your <span className="text-brand-rose">future</span>.
      </motion.h1>

      <motion.div
        variants={castContainer}
        initial="hidden"
        animate="show"
        className="my-6 flex h-[170px] items-end justify-center gap-1.5"
      >
        {CAST.map((m, i) => (
          <motion.div key={i} variants={castItem} className="flex items-end">
            <Mascot
              shape={m.shape}
              color={MASCOTS[m.shape].color}
              expression={beatMascotExpr(m.shape, "arrival")}
              size={m.size ?? 92}
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
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 2 }}
        className="mt-6 inline-flex cursor-none items-center gap-3 rounded-md bg-primary px-9 py-[18px] font-sans text-[17px] font-bold text-[#1A1A1A]"
      >
        Step inside <span className="text-[19px]">→</span>
      </motion.button>
    </DarkBeat>
  );
}

// ── "Account created." micro-bloom (Act 4 → verify) ──────────────────────────
export function AccountCreatedBeat() {
  return (
    <DarkBeat zClass="z-[75]">
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
    </DarkBeat>
  );
}

// ── "You're in." payoff (Act 5 finish → done) ────────────────────────────────
const GATHER: { shape: MascotShape; size?: number }[] = [
  { shape: "sprout" },
  { shape: "climber" },
  { shape: "spark" },
  { shape: "founder", size: 130 },
  { shape: "mentor" },
  { shape: "quill" },
  { shape: "cocurricular" },
];

const gatherContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const gatherItem: Variants = {
  hidden: { y: 40, scale: 0.5, opacity: 0 },
  show: { y: 0, scale: 1, opacity: 1, transition: { duration: 0.7, ease: EASE_SPRING } },
};

export function YoureInBeat({
  firstName,
  onPrimary,
  onReplay,
}: {
  firstName: string;
  onPrimary: () => void;
  onReplay: () => void;
}) {
  return (
    <DarkBeat zClass="z-[80]">
      <div
        aria-hidden
        className="absolute left-1/2 top-[46%] h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
        style={{ animation: "upBloom 1.5s cubic-bezier(0.32,0.72,0,1) both" }}
      />
      <motion.div
        variants={gatherContainer}
        initial="hidden"
        animate="show"
        className="relative z-[2] flex h-[120px] items-end justify-center gap-1"
      >
        {GATHER.map((m, i) => (
          <motion.div key={i} variants={gatherItem} className="flex items-end">
            <Mascot
              shape={m.shape}
              color={MASCOTS[m.shape].color}
              expression={beatMascotExpr(m.shape, "gather")}
              size={m.size ?? 84}
              decorative
            />
          </motion.div>
        ))}
      </motion.div>
      <motion.h1
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.5 }}
        className="relative z-[2] m-0 mt-6 font-display text-[clamp(56px,9vw,84px)] font-extrabold leading-[0.94] tracking-[-0.03em]"
      >
        You&apos;re in<span className="text-brand-rose">.</span>
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.65 }}
        className="relative z-[2] mt-5 max-w-[36ch] text-[18px] text-brand-paper/70"
      >
        Your profile&apos;s live{firstName ? `, ${firstName}` : ""}. Time to find someone who&apos;s
        already where you&apos;re headed.
      </motion.p>
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.8 }}
        className="relative z-[2] mt-9 flex gap-4"
      >
        <button
          type="button"
          data-mag
          data-hov
          onClick={onPrimary}
          className="inline-flex cursor-none items-center gap-2.5 rounded-md bg-primary px-8 py-[17px] text-[16px] font-bold text-[#1A1A1A]"
        >
          Find your Plug <span className="text-[18px]">→</span>
        </button>
        <button
          type="button"
          data-hov
          onClick={onReplay}
          className="inline-flex cursor-none items-center rounded-md px-[22px] py-[17px] text-[16px] font-bold text-brand-paper shadow-[inset_0_0_0_1.5px_rgba(255,252,251,0.3)]"
        >
          Replay
        </button>
      </motion.div>
    </DarkBeat>
  );
}
