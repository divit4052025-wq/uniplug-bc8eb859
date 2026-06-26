import { Link } from "@tanstack/react-router";

import { Logo } from "@/components/site/Logo";
import { Hq3DBoundary } from "./Hq3DBoundary";
import { HqStaticHero } from "./HqStaticHero";

/**
 * MentorHqHome — the mentor "Headquarters" homepage (rendered full-bleed at
 * /mentor-dashboard via the layout's index-in-place branch).
 *
 * SLICE 0: establishes the golden-hour world shell + the persistent dock nav and
 * proves the SSR-safe 3D pipeline. It binds NO mentor data yet and shows NO stats
 * (honest — no fabricated 4.9★/156 placeholders). The state-aware Watchtower with
 * real today's-sessions/stats + the full seven-building world + fly-in land in
 * Slice 1; each landmark's redesigned interior lands in its own slice.
 *
 * Layer order: golden backdrop (also the mobile/SSR experience) → transparent 3D
 * canvas (desktop only) → quiet HUD (wordmark-dark on the --brand-night surface)
 * → the dock (the conventional + mobile nav, keyboard-accessible).
 */

type DockItem = { landmark: string; section: string; to?: string };

// Landmark → real destination. The Forum (Sessions) currently points at the
// students roster; the Sessions-vs-roster split is resolved in Slice 2. The
// Laurels (Reviews) has no route yet → honest disabled "coming" pill.
const DOCK: DockItem[] = [
  { landmark: "The Watchtower", section: "Home", to: "/mentor-dashboard" },
  { landmark: "The Forum", section: "Sessions", to: "/mentor-dashboard/students" },
  { landmark: "The Sundial", section: "Availability", to: "/mentor-dashboard/schedule" },
  { landmark: "The Vault", section: "Earnings", to: "/mentor-dashboard/earnings" },
  { landmark: "The Laurels", section: "Reviews" },
  { landmark: "The Forge", section: "Profile", to: "/mentor-dashboard/settings" },
  { landmark: "The Embassy", section: "Support", to: "/messages" },
];

export function MentorHqHome() {
  return (
    <div
      className="hq-shell relative h-dvh w-full overflow-hidden"
      style={{ background: "var(--brand-night)", color: "var(--brand-paper)" }}
    >
      <h1 className="sr-only">Mentor Headquarters</h1>

      {/* golden-hour backdrop (persistent; the full experience on mobile / SSR) */}
      <HqStaticHero />

      {/* live 3D world on capable desktops (transparent → backdrop shows through) */}
      <Hq3DBoundary fallback={null} />

      {/* HUD — non-interactive except the dock, so canvas drag stays unblocked */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
        {/* top bar */}
        <header className="flex items-start justify-between p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <Logo variant="wordmark-dark" size={24} />
            <span
              className="hidden text-[11px] font-medium uppercase tracking-[0.18em] sm:inline"
              style={{ color: "var(--brand-ink-faint)" }}
            >
              Headquarters · For Plugs
            </span>
          </div>
        </header>

        {/* bottom: welcome line + dock */}
        <div className="flex flex-col gap-4 p-5 sm:p-7">
          <div className="pointer-events-none max-w-md">
            <p className="font-display text-2xl font-semibold sm:text-3xl">Your Headquarters</p>
            <p className="mt-1 text-sm" style={{ color: "var(--brand-ink-faint)" }}>
              Drag to look around. Choose a landmark to step inside.
            </p>
          </div>

          <nav aria-label="Headquarters sections" className="pointer-events-auto">
            <ul className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
              {DOCK.map((item) =>
                item.to ? (
                  <li key={item.landmark} className="shrink-0">
                    <Link
                      to={item.to}
                      activeOptions={{ exact: item.to === "/mentor-dashboard" }}
                      activeProps={{ className: "active" }}
                      className="group flex min-h-11 flex-col justify-center rounded-2xl border border-[rgba(250,245,239,0.14)] bg-[rgba(250,245,239,0.06)] px-4 py-2 transition hover:border-[rgba(250,245,239,0.32)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-rose)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--brand-night)] [&.active]:border-[color:var(--brand-rose)] [&.active]:bg-[rgba(244,181,170,0.12)]"
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
                  </li>
                ) : (
                  <li key={item.landmark} className="shrink-0">
                    <span
                      aria-disabled="true"
                      title="The Laurels opens in a later release"
                      className="flex min-h-11 cursor-default flex-col justify-center rounded-2xl border border-dashed px-4 py-2 opacity-50"
                      style={{ borderColor: "rgba(250,245,239,0.14)" }}
                    >
                      <span className="font-display text-sm font-semibold whitespace-nowrap">
                        {item.landmark}
                      </span>
                      <span
                        className="text-[11px] whitespace-nowrap"
                        style={{ color: "var(--brand-ink-faint)" }}
                      >
                        {item.section} · soon
                      </span>
                    </span>
                  </li>
                ),
              )}
            </ul>
          </nav>
        </div>
      </div>
    </div>
  );
}
