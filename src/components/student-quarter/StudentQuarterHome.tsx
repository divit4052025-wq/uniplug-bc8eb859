import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { Logo } from "@/components/site/Logo";
import { Mascot } from "@/components/mascots/Mascot";
import { useStudentDashboard } from "@/components/dashboard/DashboardContext";

import { Quarter3DBoundary } from "./Quarter3DBoundary";
import { ZONES, type QuarterState } from "./world/scene";
import type { TimeName } from "./world/kit";
import "./quarter.css";

/**
 * StudentQuarterHome — the student "Quarter" homepage (full-bleed at /dashboard).
 *
 * The 3D world IS the primary navigation; the bottom dock is the conventional /
 * mobile / no-WebGL fallback (it works with no canvas). Mirrors the mentor
 * Headquarters' MentorHqHome, re-skinned LIGHT per the locked Quarter design
 * (Gabarito + Quicksand, paper #FFFCFB, ink #1A1A1A, rose #F4B5AA). The world
 * state is the REAL parental-consent gate (useConsentStatus → ctx.consent):
 * a consent-pending minor sees the gated world (booking locked at the Studio),
 * everyone else the fully-open world. No fabricated data anywhere.
 */

// Building id → landmark route. Every building maps to a real student surface.
const ROUTE_BY_ZONE: Record<string, string> = {
  square: "/dashboard/square",
  switchboard: "/dashboard/switchboard",
  studio: "/dashboard/studio",
  line: "/dashboard/line",
  locker: "/dashboard/locker",
  climb: "/dashboard/climb",
  dorm: "/dashboard/dorm",
};

const LILAC = "#D7C8EE";
const INK = "#1A1A1A";

export function StudentQuarterHome() {
  const { firstName, consent } = useStudentDashboard();
  const navigate = useNavigate();
  const [time, setTime] = useState<TimeName>("dawn");
  const [motion, setMotion] = useState(true);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [founderMsg, setFounderMsg] = useState<string | null>(null);
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dev-only consent override so both world-states are reachable for review /
  // screen-recording. In production the world-state is purely the real gate.
  const [consentOverride, setConsentOverride] = useState<QuarterState | null>(null);

  const realState: QuarterState = consent?.awaiting ? "pending" : "granted";
  const worldState: QuarterState = consentOverride ?? realState;
  const name = firstName || "there";

  useEffect(
    () => () => {
      if (msgTimer.current) clearTimeout(msgTimer.current);
    },
    [],
  );

  const zoneOpen = (z: (typeof ZONES)[number]) =>
    z.always ? true : z.book ? worldState === "granted" : true;

  const onEnter = (zoneId: string) => {
    const to = ROUTE_BY_ZONE[zoneId];
    if (to) navigate({ to });
  };
  const onLocked = (zoneId: string) => {
    const z = ZONES.find((x) => x.id === zoneId);
    setFounderMsg(
      `${z ? z.name : "That door"} opens once a parent approves your account. You’re almost there.`,
    );
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setFounderMsg(null), 3800);
  };

  const founderLine =
    founderMsg ??
    (worldState === "granted"
      ? "You’re all set. The Switchboard’s where you find your next Plug — wander anywhere."
      : `Hey ${name}. Have a proper look around — wander anywhere. The moment a parent says yes, booking opens up.`);

  return (
    <div className="qx-stage">
      <h1 className="sr-only">Your Quarter — UniPlug student dashboard</h1>

      <div className="qx-canvas">
        <Quarter3DBoundary
          fallback={<div className="qx-static-bg" />}
          scene={{ state: worldState, time, motion, onEnter, onLocked }}
        />
      </div>

      <div className="qx-hud">
        {/* top bar */}
        <div className="qx-top">
          <div className="qx-brand">
            {/* LOGO TRAP: light world → wordmark-offwhite (the ink glyph). */}
            <Logo variant="wordmark-offwhite" size={18} />
            <span className="dot" />
          </div>
          <div className="qx-ey">The Quarter · for students</div>
          <div className="qx-spacer" />
          <button
            type="button"
            className="qx-bell"
            title="Notifications"
            aria-label="Notifications"
            onClick={() => navigate({ to: "/dashboard/line" })}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M13.7 21a2 2 0 01-3.4 0"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="qx-chip"
            onClick={() => navigate({ to: "/dashboard/dorm" })}
          >
            <div>
              <div className="nm">{name}</div>
              <div className="rl">Your room</div>
            </div>
            <div className="av">
              <Mascot shape="climber" color={LILAC} size={32} idle={false} decorative />
            </div>
          </button>
        </div>

        {/* consent banner (pending only) */}
        {worldState === "pending" && (
          <div className="qx-consent">
            <div style={{ flex: "none" }}>
              <Mascot shape="founder" color={INK} size={40} idle={false} decorative />
            </div>
            <div style={{ flex: 1 }}>
              <div className="ct">Almost there — one parent approval to go</div>
              <div className="cs">Browse freely now · booking unlocks the moment they say yes</div>
            </div>
            <button
              type="button"
              className="qbtn qbtn-ink qbtn-sm"
              onClick={() => navigate({ to: "/dashboard/dorm" })}
            >
              See status
            </button>
          </div>
        )}

        {/* welcome */}
        <div className="qx-welcome">
          <div className="ey">Plug into your future</div>
          <h1>
            Morning, <em>{name}</em>.
          </h1>
          <div className="sub">
            This is your Quarter. Wander it — each place is somewhere to go.
          </div>
          <div className="qx-hint">
            <span className="k">drag</span> look around · <span className="k">hover</span> peek ·{" "}
            <span className="k">click</span> step inside
          </div>
        </div>

        {/* founder companion */}
        <div className="qx-founder">
          <div className="fm">
            <Mascot shape="founder" color={INK} expression="guiding" size={92} decorative />
          </div>
          <div className="cap">
            <span className="nm">Your guide</span>
            <p>{founderLine}</p>
          </div>
        </div>

        {/* zone dock — full fallback / mobile navigation (works with no WebGL) */}
        <nav className="qx-dock" aria-label="Quarter places">
          {ZONES.map((z) => {
            const open = zoneOpen(z);
            return (
              <button
                key={z.id}
                type="button"
                className={open ? "" : "locked"}
                onClick={() => (open ? onEnter(z.id) : onLocked(z.id))}
                title={open ? z.name : `${z.name} — unlocks with parental consent`}
              >
                {z.name}
                {!open && <span className="lk">▮</span>}
              </button>
            );
          })}
        </nav>
      </div>

      {/* dev-only Tweaks: flex consent state + time of day + motion for review. */}
      {import.meta.env.DEV && !tweaksOpen && (
        <button
          type="button"
          className="qx-gear"
          onClick={() => setTweaksOpen(true)}
          title="Tweaks (dev)"
        >
          ☰
        </button>
      )}
      {import.meta.env.DEV && tweaksOpen && (
        <QuarterTweaks
          state={worldState}
          realState={realState}
          onState={(s) => setConsentOverride(s === realState ? null : s)}
          time={time}
          onTime={setTime}
          motion={motion}
          onMotion={setMotion}
          onClose={() => setTweaksOpen(false)}
        />
      )}
    </div>
  );
}

function Seg<T extends string>({
  value,
  set,
  opts,
}: {
  value: T;
  set: (v: T) => void;
  opts: [T, string][];
}) {
  return (
    <div className="qtw-seg">
      {opts.map(([k, l]) => (
        <button key={k} type="button" className={value === k ? "on" : ""} onClick={() => set(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function QuarterTweaks({
  state,
  onState,
  time,
  onTime,
  motion,
  onMotion,
  onClose,
}: {
  state: QuarterState;
  realState: QuarterState;
  onState: (s: QuarterState) => void;
  time: TimeName;
  onTime: (t: TimeName) => void;
  motion: boolean;
  onMotion: (m: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div className="qtw">
      <div className="qtw-h">
        <b>Tweaks · dev</b>
        <span className="x" role="button" tabIndex={0} onClick={onClose}>
          ✕
        </span>
      </div>
      <div className="qtw-b">
        <div className="qtw-grp">
          <div className="gl">Parental consent (preview)</div>
          <Seg
            value={state}
            set={onState}
            opts={[
              ["pending", "Pending"],
              ["granted", "Granted"],
            ]}
          />
        </div>
        <div className="qtw-grp">
          <div className="gl">Time of day</div>
          <Seg
            value={time}
            set={onTime}
            opts={[
              ["dawn", "Soft dawn"],
              ["midday", "Bright midday"],
            ]}
          />
        </div>
        <div className="qtw-grp">
          <div className="gl">Ambience</div>
          <div className="qtw-row">
            <span className="rl">Quarter motion</span>
            <button
              type="button"
              className={`qtw-tog ${motion ? "on" : ""}`}
              aria-pressed={motion}
              onClick={() => onMotion(!motion)}
            >
              <i />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
