// Shared context for the mentor "Headquarters". The layout route
// (mentor-dashboard.tsx) resolves the authenticated mentorId + the mentor's
// verification status (guard context or the SSR/hard-refresh getSession
// fallback) and renders the full-bleed HQ once the mentor is ready and has
// submitted their application. Child routes (the 3D world + the seven landmark
// pages) read this to drive the three verification world-states and to gate
// the approval-only landmarks.
import { createContext, useContext } from "react";

export type MentorStatus = "pending" | "approved" | "rejected";
export type WorldState = "pending" | "approved" | "rejected";

export interface MentorDashboardCtx {
  mentorId: string;
  status: MentorStatus | null;
  firstName: string;
  verificationNotes: string | null;
  collegeEmail: string | null;
  /** Honest verification signal — VerifiedBadge renders only when this is set. */
  verifiedAt: string | null;
}

const Ctx = createContext<MentorDashboardCtx | null>(null);

export const MentorDashboardProvider = Ctx.Provider;

export function useMentorDashboard(): MentorDashboardCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMentorDashboard must be used within the mentor dashboard layout");
  return v;
}

/** The HQ world-state derived from the mentor's verification status. */
export function worldStateFromStatus(status: MentorStatus | null): WorldState {
  return status === "approved" ? "approved" : status === "rejected" ? "rejected" : "pending";
}

/** Whether an approval-only landmark is reachable for this status. */
export function zoneUnlocked(status: MentorStatus | null, alwaysOpen: boolean): boolean {
  return status === "approved" || alwaysOpen;
}
