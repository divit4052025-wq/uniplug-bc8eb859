// Client-side helpers for the waitlist endpoints. Thin fetch wrappers used by
// the meter and the form. All numbers come straight from D1 via these calls —
// the UI never invents a count or a position.

import type { WaitlistKind } from "./validate";

export interface WaitlistCounts {
  school: number;
  college: number;
}

export async function fetchWaitlistCounts(signal?: AbortSignal): Promise<WaitlistCounts> {
  const res = await fetch("/api/public/waitlist/counts", {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("counts_unavailable");
  const data = (await res.json()) as { school?: number; college?: number };
  return { school: Number(data.school) || 0, college: Number(data.college) || 0 };
}

export interface WaitlistJoinResult {
  position: number;
  kind: WaitlistKind;
}

/** Submit to the real endpoint. Throws Error(message) on validation/other error. */
export async function submitWaitlist(input: {
  name: string;
  email: string;
  kind: WaitlistKind;
}): Promise<WaitlistJoinResult> {
  const res = await fetch("/api/public/waitlist/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => null)) as {
    ok?: boolean;
    position?: number;
    kind?: WaitlistKind;
    error?: string;
  } | null;
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "That didn’t go through.");
  }
  return { position: Number(data.position) || 0, kind: (data.kind as WaitlistKind) ?? input.kind };
}

/** Honest position label, e.g. 7 → "No. 007". Matches the design prototype. */
export function positionLabel(n: number): string {
  return "No. " + String(Math.max(0, n) || 0).padStart(3, "0");
}
