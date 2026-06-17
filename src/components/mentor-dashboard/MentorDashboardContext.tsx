// Shared context for the mentor dashboard nested routes. The layout route
// (mentor-dashboard.tsx) resolves the authenticated mentorId (guard context or
// the SSR/hard-refresh getSession fallback) and only mounts the <Outlet/> once
// the mentor is ready AND approved. Child routes read mentorId here and pass it
// to their (unchanged) section components.
import { createContext, useContext } from "react";

export interface MentorDashboardCtx {
  mentorId: string;
}

const Ctx = createContext<MentorDashboardCtx | null>(null);

export const MentorDashboardProvider = Ctx.Provider;

export function useMentorDashboard(): MentorDashboardCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMentorDashboard must be used within the mentor dashboard layout");
  return v;
}
