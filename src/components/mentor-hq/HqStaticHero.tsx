/**
 * HqStaticHero — the static golden-hour backdrop.
 *
 * Three jobs, one component:
 *  1. SSR-safe placeholder (identical markup server + first client paint → no
 *     hydration mismatch, mirroring the SignupCursor discipline).
 *  2. Suspense fallback while the heavy 3D scene lazy-loads on desktop.
 *  3. The full mobile experience (no WebGL) — the live scene is dropped on small
 *     / coarse-pointer devices and this golden-hour skyline takes its place.
 *
 * Pure CSS, zero browser APIs. The dark base is --brand-night; the sky is a
 * warm golden-hour gradient with a low sun glow and a low-poly campus silhouette.
 * Decorative only — the navigable HUD/dock is overlaid by MentorHqHome, so this
 * stays aria-hidden.
 */
export function HqStaticHero() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden"
      style={{ background: "var(--brand-night)" }}
    >
      {/* golden-hour sky */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, #1f2742 0%, #5b4f6b 34%, #b3754f 62%, #e7b06f 80%, #f3d7a8 100%)",
        }}
      />
      {/* low sun glow near the horizon */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(38% 42% at 72% 78%, rgba(255,213,150,0.85) 0%, rgba(255,213,150,0.0) 70%)",
        }}
      />
      {/* low-poly campus silhouette sitting on the horizon */}
      <div className="absolute inset-x-0 bottom-0 h-[42%]">
        {/* the ground band */}
        <div
          className="absolute inset-x-0 bottom-0 h-1/2"
          style={{ background: "linear-gradient(to bottom, #4a3a2a 0%, #2a2118 100%)" }}
        />
        {/* a small skyline of warm silhouettes (tower · arch · castle) */}
        <div
          className="absolute bottom-[48%] left-[12%] h-24 w-16"
          style={{
            background: "#3a2c1f",
            clipPath: "polygon(20% 100%, 20% 30%, 50% 0, 80% 30%, 80% 100%)",
          }}
        />
        <div
          className="absolute bottom-[48%] left-[44%] h-16 w-24"
          style={{
            background: "#332618",
            clipPath:
              "polygon(0 100%, 0 40%, 25% 40%, 25% 10%, 75% 10%, 75% 40%, 100% 40%, 100% 100%)",
          }}
        />
        <div
          className="absolute bottom-[48%] right-[14%] h-20 w-20"
          style={{
            background: "#3a2c1f",
            clipPath: "polygon(0 100%, 0 35%, 50% 0, 100% 35%, 100% 100%)",
          }}
        />
      </div>
      {/* a soft vignette to seat the HUD chrome */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, rgba(0,0,0,0.0) 55%, rgba(23,21,19,0.55) 100%)",
        }}
      />
    </div>
  );
}
