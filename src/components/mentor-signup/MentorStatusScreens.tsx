// P8 — the non-approved mentor states shown in the mentor dashboard, re-skinned
// to the dark cinematic mentor aesthetic and driven by the REAL mentors.status:
//   - UnderReviewScreen: pending + submitted → "Hang tight." + the gathered cast
//     + "Application submitted · Under review".
//   - RejectedScreen: rejected → "Nearly there." + the admin's REAL reason
//     (verification_notes) + (optional) college-ID re-upload + Resubmit.
// Founder is forced to the bright rose (#F4B5AA) so it never renders ink-on-dark.
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion, type Variants } from "motion/react";

import { Mascot, type MascotShape } from "@/components/mascots/Mascot";
import { MASCOTS } from "@/components/mascots/mascot-data";
import { Logo } from "@/components/site/Logo";
import { supabase } from "@/integrations/supabase/client";
import { log } from "@/lib/log";
import { SignupCursor } from "@/components/student-signup/v2/SignupCursor";
import {
  resubmitMentorApplication,
  setMentorIdDocument,
  uploadMentorDocument,
} from "./mentorWrite";

function StatusShell({ children }: { children: React.ReactNode }) {
  return (
    <main
      data-dark
      className="signup-wizard relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-night px-6 text-brand-paper"
    >
      <SignupCursor />
      <div className="absolute left-10 top-8 z-[5]">
        <Logo variant="wordmark-dark" size={32} />
      </div>
      <div className="relative z-[2] w-full max-w-xl text-center">{children}</div>
    </main>
  );
}

function SignOutButton() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      data-hov
      onClick={async () => {
        await supabase.auth.signOut();
        navigate({ to: "/" });
      }}
      className="mt-9 cursor-none rounded-md px-6 py-2.5 text-[15px] font-bold text-brand-paper shadow-[inset_0_0_0_1.5px_rgba(255,252,251,0.28)] transition"
    >
      Sign out
    </button>
  );
}

// The gathered cast for the pending payoff — founder centered + forced rose.
const GATHER: { shape: MascotShape; size?: number }[] = [
  { shape: "lens" },
  { shape: "cocurricular" },
  { shape: "founder", size: 128 },
  { shape: "mentor" },
  { shape: "grid" },
];
const gatherContainer: Variants = { hidden: {}, show: {} };
const gatherItem: Variants = {
  hidden: { y: 40, scale: 0.5, opacity: 0 },
  show: (i: number) => ({
    y: 0,
    scale: 1,
    opacity: 1,
    transition: { duration: 0.7, ease: [0.34, 1.4, 0.5, 1], delay: i * 0.08 },
  }),
};

export function UnderReviewScreen({
  firstName,
  collegeEmail,
}: {
  firstName?: string;
  collegeEmail?: string | null;
}) {
  return (
    <StatusShell>
      <div
        aria-hidden
        className="absolute left-1/2 top-[42%] h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
        style={{ animation: "upBloom 2s cubic-bezier(0.32,0.72,0,1) both" }}
      />
      <motion.div
        variants={gatherContainer}
        initial="hidden"
        animate="show"
        className="relative z-[2] flex h-[118px] items-end justify-center gap-1"
      >
        {GATHER.map((m, i) => (
          <motion.div key={i} custom={i} variants={gatherItem} className="flex items-end">
            <Mascot
              shape={m.shape}
              color={m.shape === "founder" ? "#F4B5AA" : MASCOTS[m.shape].color}
              expression="happy"
              size={m.size ?? 78}
              decorative
            />
          </motion.div>
        ))}
      </motion.div>

      <h1 className="relative z-[2] mt-6 font-display text-[clamp(44px,7vw,72px)] font-extrabold leading-[0.96] tracking-[-0.03em]">
        Hang tight{firstName ? `, ${firstName}` : ""}.
      </h1>
      <p className="relative z-[2] mx-auto mt-[18px] max-w-[46ch] text-[17px] leading-relaxed text-[rgba(255,252,251,0.68)]">
        We’ve got your application and your documents. Every UniPlug mentor is verified by a real
        person on our team — we’ll email{" "}
        <b className="text-brand-paper">{collegeEmail || "your college email"}</b> the moment you’re
        approved. Usually within 2–3 days.
      </p>
      <div className="relative z-[2] mt-7 inline-flex items-center gap-2.5 rounded-full bg-[rgba(255,252,251,0.06)] px-[18px] py-2.5">
        <span
          className="h-[9px] w-[9px] rounded-full bg-[#F2D098]"
          style={{ animation: "upCue 1.8s ease-in-out infinite" }}
        />
        <span className="text-[13px] font-semibold tracking-[0.04em] text-[rgba(255,252,251,0.8)]">
          Application submitted · Under review
        </span>
      </div>
      <div>
        <SignOutButton />
      </div>
    </StatusShell>
  );
}

export function RejectedScreen({
  mentorId,
  reason,
  onResubmitted,
  firstName,
}: {
  mentorId: string;
  reason: string | null;
  onResubmitted: () => void;
  firstName?: string;
}) {
  const [idPhoto, setIdPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resubmit() {
    setError(null);
    setBusy(true);
    try {
      if (idPhoto) {
        const path = await uploadMentorDocument(mentorId, idPhoto, "college-id");
        await setMentorIdDocument(mentorId, path);
      }
      await resubmitMentorApplication();
      onResubmitted();
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Something went wrong";
      log.error({
        surface: "web",
        event: "mentor_resubmit_failed",
        kind: "mentor_resubmit",
        error: raw,
      });
      setError("We couldn’t resubmit your application. Please try again.");
      setBusy(false);
    }
  }

  return (
    <StatusShell>
      <div className="mx-auto w-[108px]">
        <Mascot shape="founder" color="#F4B5AA" expression="guiding" size={108} decorative />
      </div>
      <h1 className="mt-5 font-display text-[clamp(38px,6vw,60px)] font-extrabold leading-[0.98] tracking-[-0.03em]">
        Nearly there{firstName ? `, ${firstName}` : ""}.
      </h1>
      {reason ? (
        <div className="mx-auto mt-5 max-w-[44ch] rounded-lg border-l-[3px] border-brand-rose bg-[rgba(255,252,251,0.04)] px-5 py-4 text-left">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-[rgba(255,252,251,0.5)]">
            What our team said
          </p>
          <p className="mt-1 text-[15px] text-brand-paper">{reason}</p>
        </div>
      ) : (
        <p className="mx-auto mt-4 max-w-[44ch] text-[15px] text-[rgba(255,252,251,0.68)]">
          Please review your documents and resubmit your application.
        </p>
      )}

      <div className="mt-6 flex flex-col items-center gap-3">
        <label className="cursor-none rounded-md border border-[rgba(255,252,251,0.18)] bg-[rgba(255,252,251,0.05)] px-4 py-2 text-[14px] font-semibold text-brand-paper">
          {idPhoto ? "✓ College ID replaced" : "Replace college ID (optional)"}
          <input
            type="file"
            accept="image/*,application/pdf"
            aria-label="Replace your college ID photo (optional)"
            className="sr-only"
            onChange={(e) => setIdPhoto(e.target.files?.[0] ?? null)}
          />
        </label>
        {error && (
          <p role="alert" className="text-[13px] text-[#E5765B]">
            {error}
          </p>
        )}
        <button
          type="button"
          data-mag
          data-hov
          onClick={resubmit}
          disabled={busy}
          className="inline-flex cursor-none items-center gap-2.5 rounded-md bg-brand-paper px-[30px] py-3.5 text-[16px] font-bold text-[#1A1A1A] transition disabled:opacity-60"
        >
          {busy ? "Resubmitting…" : "Resubmit application"} <span className="text-[18px]">→</span>
        </button>
      </div>
      <SignOutButton />
    </StatusShell>
  );
}
