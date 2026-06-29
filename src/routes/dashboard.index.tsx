import { createFileRoute } from "@tanstack/react-router";

import { StudentQuarterHome } from "@/components/student-quarter/StudentQuarterHome";

// /dashboard (index) — the student "Quarter": a 3D world that IS the dashboard
// home and primary navigation. The old home content (My Plugs / Top picks / My
// Schools / consent notice / finalize nudge) now lives inside The Square
// (/dashboard/square). Every landmark is a child route entered from the world
// or the persistent dock. Auth guard + consent state come from the layout route.
export const Route = createFileRoute("/dashboard/")({
  component: StudentQuarterHome,
});
