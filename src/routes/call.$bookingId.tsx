import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import DailyIframe from "@daily-co/daily-js";
import type { DailyCall } from "@daily-co/daily-js";

import { clientAuthGuard } from "@/lib/auth/route-guard";
import { getVideoCallAccess, type VideoCallDenyReason } from "@/lib/video/access.functions";
import { LoadingSkeleton } from "@/components/ui/state-views";

/**
 * V1 1:1 video call (Daily.co Prebuilt). Semi-throwaway V1 surface — a fully
 * on-brand call UI is a later rebuild on the Daily call object. This route
 * auth-gates, calls the server-side token endpoint (which independently
 * verifies participation + window), and embeds the private room via Prebuilt.
 * All authorization is server-side; this screen only renders the result.
 */
export const Route = createFileRoute("/call/$bookingId")({
  beforeLoad: () =>
    clientAuthGuard({ signedOutTo: "/login", requireRole: "any", allowAdmin: true }),
  head: () => ({
    meta: [{ title: "Session Call — UniPlug" }],
  }),
  component: CallPage,
});

type CallState = "loading" | "joined" | { error: VideoCallDenyReason };

const DENY_COPY: Record<VideoCallDenyReason, { title: string; body: string }> = {
  outside_window: {
    title: "This call isn't open right now",
    body: "You can join from 10 minutes before the start time until shortly after it ends. Check your session time and try again.",
  },
  not_joinable_status: {
    title: "This session isn't active",
    body: "This booking has been cancelled or already completed, so its call isn't available.",
  },
  not_a_participant: {
    title: "You don't have access to this call",
    body: "Only the booked student and their matched mentor can join this session.",
  },
  booking_not_found: {
    title: "Session not found",
    body: "We couldn't find this session. It may have been removed.",
  },
  unauthenticated: {
    title: "Please sign in",
    body: "Your session has expired. Sign in again to join the call.",
  },
  server_error: {
    title: "Couldn't start the call",
    body: "Something went wrong setting up your call. Please go back and try again in a moment.",
  },
};

function CallPage() {
  const { bookingId } = Route.useParams();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<DailyCall | null>(null);
  const [state, setState] = useState<CallState>("loading");

  const leave = () => {
    if (router.history.canGoBack()) router.history.back();
    else void router.navigate({ to: "/dashboard" });
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      let result: Awaited<ReturnType<typeof getVideoCallAccess>>;
      try {
        result = await getVideoCallAccess({ data: { bookingId } });
      } catch {
        if (!cancelled) setState({ error: "server_error" });
        return;
      }
      if (cancelled) return;
      if (!result.ok) {
        setState({ error: result.reason });
        return;
      }
      if (!containerRef.current) return;

      try {
        const frame = DailyIframe.createFrame(containerRef.current, {
          showLeaveButton: true,
          iframeStyle: { width: "100%", height: "100%", border: "0" },
        });
        frameRef.current = frame;
        frame.on("left-meeting", leave);
        await frame.join({ url: result.roomUrl, token: result.token });
        if (!cancelled) setState("joined");
      } catch {
        if (!cancelled) setState({ error: "server_error" });
      }
    })();

    return () => {
      cancelled = true;
      frameRef.current?.destroy();
      frameRef.current = null;
    };
    // bookingId is the only real input; leave/router are stable enough here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const isError = typeof state === "object";

  return (
    <div className="relative min-h-screen bg-[#1A1A1A]">
      {/* Daily Prebuilt mounts its iframe into this container. */}
      <div ref={containerRef} className="h-screen w-full" aria-hidden={state !== "joined"} />

      {state === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#1A1A1A] px-4">
          <div className="w-full max-w-sm text-center">
            <p className="mb-4 font-display text-[18px] font-semibold text-white">
              Connecting to your session…
            </p>
            <LoadingSkeleton rows={2} ariaLabel="Connecting to your session" />
          </div>
        </div>
      )}

      {isError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#1A1A1A] px-4">
          <div className="w-full max-w-md rounded-2xl border border-[#EDE0DB]/20 bg-[#FFFCFB] p-8 text-center">
            <h1 className="font-display text-[22px] font-semibold text-[#1A1A1A]">
              {DENY_COPY[state.error].title}
            </h1>
            <p className="mt-3 text-[14px] font-light text-[#1A1A1A]/70">
              {DENY_COPY[state.error].body}
            </p>
            <button
              type="button"
              onClick={leave}
              className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-[#C4907F] px-6 text-[13px] font-medium text-white transition hover:opacity-90"
            >
              Back to dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
