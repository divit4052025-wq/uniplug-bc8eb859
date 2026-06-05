// P8 — the non-approved mentor states shown in the mentor dashboard:
//   - UnderReviewScreen: pending + submitted → "we're reviewing your documents".
//   - RejectedScreen: rejected → the admin's reason + (optional) re-upload of the
//     college ID + a Resubmit button (resubmit_mentor_application: rejected→pending).
// Wrapped in .signup-wizard so they inherit the scoped brand fonts the mentor
// just used; design tokens throughout (no raw hex).
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { log } from "@/lib/log";
import {
  resubmitMentorApplication,
  setMentorIdDocument,
  uploadMentorDocument,
} from "./mentorWrite";

function StatusShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="signup-wizard flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-xl text-center">{children}</div>
    </main>
  );
}

function SignOutButton() {
  const navigate = useNavigate();
  return (
    <button
      onClick={async () => {
        await supabase.auth.signOut();
        navigate({ to: "/" });
      }}
      className="mt-8 rounded-full border border-foreground px-6 py-2 text-sm font-medium text-foreground transition hover:bg-foreground hover:text-background"
    >
      Sign out
    </button>
  );
}

export function UnderReviewScreen() {
  return (
    <StatusShell>
      <p className="font-display text-3xl text-foreground sm:text-4xl">
        Your application is under review
      </p>
      <p className="mt-4 text-[15px] text-muted-foreground">
        We're reviewing your documents. You're not live yet — you can't take bookings until you're
        approved. We'll email you as soon as a decision is made (usually within 48 hours).
      </p>
      <SignOutButton />
    </StatusShell>
  );
}

export function RejectedScreen({
  mentorId,
  reason,
  onResubmitted,
}: {
  mentorId: string;
  reason: string | null;
  onResubmitted: () => void;
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
      setError("We couldn't resubmit your application. Please try again.");
      setBusy(false);
    }
  }

  return (
    <StatusShell>
      <p className="font-display text-3xl text-foreground sm:text-4xl">
        Your application needs changes
      </p>
      {reason ? (
        <div className="mt-5 rounded-2xl border-l-4 border-primary bg-secondary/40 px-5 py-4 text-left">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            What our team said
          </p>
          <p className="mt-1 text-[15px] text-foreground">{reason}</p>
        </div>
      ) : (
        <p className="mt-4 text-[15px] text-muted-foreground">
          Please review your documents and resubmit your application.
        </p>
      )}

      <div className="mt-6 flex flex-col items-center gap-3">
        <label className="cursor-pointer rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-primary/60 focus-within:ring-4 focus-within:ring-primary/20">
          {idPhoto ? "College ID replaced" : "Replace college ID (optional)"}
          <input
            type="file"
            accept="image/*,application/pdf"
            aria-label="Replace your college ID photo (optional)"
            className="sr-only"
            onChange={(e) => setIdPhoto(e.target.files?.[0] ?? null)}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={resubmit}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full bg-foreground px-7 py-3 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? "Resubmitting…" : "Resubmit application"}
        </button>
      </div>
      <SignOutButton />
    </StatusShell>
  );
}
