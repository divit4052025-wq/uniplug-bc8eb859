// Shared context for the student dashboard nested routes. The layout route
// (dashboard.tsx) resolves the authenticated userId — from the beforeLoad guard
// context on client navigation, or from a client-only getSession() fallback on
// SSR/hard-refresh — and only mounts the <Outlet/> once that id is ready. Child
// routes read the id (guaranteed non-null) + the home-banner state from here, so
// no child re-implements the guard. Sections keep their existing {studentId}
// prop API; the child route reads userId from this context and passes it down.
import { createContext, useContext } from "react";

import type { ConsentStatus } from "@/lib/consent/useConsentStatus";

export interface StudentDashboardCtx {
  userId: string;
  firstName: string;
  /** P7 finalize gate: profile not completed → the home page shows a soft nudge. */
  profileIncomplete: boolean;
  consent: ConsentStatus | undefined;
}

const Ctx = createContext<StudentDashboardCtx | null>(null);

export const StudentDashboardProvider = Ctx.Provider;

export function useStudentDashboard(): StudentDashboardCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStudentDashboard must be used within the dashboard layout route");
  return v;
}
