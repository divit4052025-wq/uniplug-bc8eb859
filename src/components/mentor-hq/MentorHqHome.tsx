import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Moon, Sun } from "lucide-react";

import { Logo } from "@/components/site/Logo";
import { VerifiedBadge } from "@/components/site/VerifiedBadge";
import {
  useMentorDashboard,
  worldStateFromStatus,
  zoneUnlocked,
} from "@/components/mentor-dashboard/MentorDashboardContext";
import type { TimeName } from "./world/hqKit";
import { Hq3DBoundary } from "./Hq3DBoundary";
import { HqStaticHero } from "./HqStaticHero";
import { Beacon } from "./beacon/Beacon";

/**
 * MentorHqHome — the mentor "Headquarters" homepage (full-bleed at
 * /mentor-dashboard). The 3D world IS the primary navigation; the dock is the
 * conventional / mobile fallback. The whole surface is state-aware: a pending
 * mentor sees the under-construction world, a rejected mentor the stalled one,
 * an approved mentor the living campus — driven by the real mentor status from
 * context. No fabricated data anywhere.
 */

type DockItem = { id: string; landmark: string; section: string; to: string; alwaysOpen?: boolean };

// Landmark → real route. Watchtower (Home) + Forge (Profile/verification) are
// always open; the rest unlock on approval.
const DOCK: DockItem[] = [
  {
    id: "watchtower",
    landmark: "The Watchtower",
    section: "Home",
    to: "/mentor-dashboard/watchtower",
    alwaysOpen: true,
  },
  { id: "forum", landmark: "The Forum", section: "Sessions", to: "/mentor-dashboard/forum" },
  {
    id: "sundial",
    landmark: "The Sundial",
    section: "Availability",
    to: "/mentor-dashboard/sundial",
  },
  { id: "vault", landmark: "The Vault", section: "Earnings", to: "/mentor-dashboard/vault" },
  {
    id: "laurels",
    landmark: "The Laurels",
    section: "Reputation",
    to: "/mentor-dashboard/laurels",
  },
  {
    id: "forge",
    landmark: "The Forge",
    section: "Profile",
    to: "/mentor-dashboard/forge",
    alwaysOpen: true,
  },
  { id: "embassy", landmark: "The Embassy", section: "Support", to: "/mentor-dashboard/embassy" },
];

const ROUTE_BY_ZONE: Record<string, string> = Object.fromEntries(DOCK.map((d) => [d.id, d.to]));

export function MentorHqHome() {
  const { mentorId, status, firstName } = useMentorDashboard();
  const navigate = useNavigate();
  const [time, setTime] = useState<TimeName>("golden");
  const worldState = worldStateFromStatus(status);

  const onEnter = (zoneId: string) => {
    const to = ROUTE_BY_ZONE[zoneId];
    if (to) navigate({ to });
  };

  return (
    <div
      className="hq-shell relative h-dvh w-full overflow-hidden"
      style={{ background: "var(--brand-night)", color: "var(--brand-paper)" }}
    >
      <h1 className="sr-only">Mentor Headquarters</h1>

      {/* golden-hour backdrop (persistent; the full experience on mobile / SSR) */}
      <HqStaticHero />

      {/* live 3D world on capable desktops (transparent → backdrop shows through) */}
      <Hq3DBoundary fallback={null} scene={{ state: worldState, time, onEnter }} />

      {/* HUD — non-interactive except the controls, so canvas drag stays unblocked */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
        {/* top bar */}
        <header className="flex items-start justify-between gap-3 p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <Logo variant="wordmark-dark" size={24} />
            <span
              className="hidden text-[11px] font-medium uppercase tracking-[0.18em] sm:inline"
              style={{ color: "var(--brand-ink-faint)" }}
            >
              Headquarters · For Plugs
            </span>
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            <StatusPill worldState={worldState} />
            <Beacon userId={mentorId} />
            <button
              type="button"
              onClick={() => setTime((t) => (t === "golden" ? "dusk" : "golden"))}
              aria-label={time === "golden" ? "Switch to dusk" : "Switch to golden hour"}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(250,245,239,0.16)] bg-[rgba(250,245,239,0.06)] transition hover:border-[rgba(250,245,239,0.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-rose)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--brand-night)]"
            >
              {time === "golden" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
          </div>
        </header>

        {/* bottom: welcome line + dock */}
        <div className="flex flex-col gap-4 p-5 sm:p-7">
          <div className="pointer-events-none max-w-md">
            <p className="font-display text-2xl font-semibold sm:text-3xl">
              {firstName ? `Welcome back, ${firstName}` : "Your Headquarters"}
            </p>
            <p className="mt-1 text-sm" style={{ color: "var(--brand-ink-faint)" }}>
              {worldState === "approved"
                ? "Drag to look around. Choose a landmark to step inside."
                : worldState === "rejected"
                  ? "Your campus is stalled — head to The Forge to fix your verification."
                  : "Your campus is under construction while we review you. The Watchtower and The Forge are open."}
            </p>
          </div>

          <nav aria-label="Headquarters sections" className="pointer-events-auto">
            <ul className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
              {DOCK.map((item) => {
                const open = zoneUnlocked(status, !!item.alwaysOpen);
                return (
                  <li key={item.id} className="shrink-0">
                    {open ? (
                      <Link
                        to={item.to}
                        className="group flex min-h-11 flex-col justify-center rounded-2xl border border-[rgba(250,245,239,0.14)] bg-[rgba(250,245,239,0.06)] px-4 py-2 transition hover:border-[rgba(250,245,239,0.32)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-rose)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--brand-night)]"
                      >
                        <span className="font-display text-sm font-semibold whitespace-nowrap">
                          {item.landmark}
                        </span>
                        <span
                          className="text-[11px] whitespace-nowrap"
                          style={{ color: "var(--brand-ink-faint)" }}
                        >
                          {item.section}
                        </span>
                      </Link>
                    ) : (
                      <span
                        aria-disabled="true"
                        title={`${item.landmark} opens once you're approved`}
                        className="flex min-h-11 cursor-default flex-col justify-center rounded-2xl border border-[rgba(250,245,239,0.12)] px-4 py-2 opacity-45"
                      >
                        <span className="font-display text-sm font-semibold whitespace-nowrap">
                          {item.landmark}
                        </span>
                        <span
                          className="text-[11px] whitespace-nowrap"
                          style={{ color: "var(--brand-ink-faint)" }}
                        >
                          {item.section} · locked
                        </span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ worldState }: { worldState: "pending" | "approved" | "rejected" }) {
  if (worldState === "approved") return <VerifiedBadge />;
  const isRejected = worldState === "rejected";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{
        background: isRejected ? "rgba(216,67,42,0.16)" : "rgba(244,181,170,0.14)",
        color: isRejected ? "#F4B5AA" : "var(--brand-rose)",
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: isRejected ? "#D8432A" : "var(--brand-rose)" }}
      />
      {isRejected ? "Needs changes" : "Under review"}
    </span>
  );
}
