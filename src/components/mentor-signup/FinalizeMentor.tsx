// P8 — authenticated post-verification mentor finalize ("Upload documents &
// submit"). Uploads the college-ID photo (→ id_document_path) and, per admit, an
// optional acceptance-letter/proof; replays the stashed admits into mentor_admits
// (or re-collects them fresh if the stash is absent); then submit_mentor_application().
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, Loader2 } from "lucide-react";

import { AuthShell, Field } from "@/components/site/AuthShell";
import { supabase } from "@/integrations/supabase/client";
import { log } from "@/lib/log";
import { withRetry } from "@/lib/retry";
import { Caption } from "@/components/signup/Labeled";
import { RefMultiSelect } from "@/components/signup/RefMultiSelect";
import { markSkippedThisSession } from "@/components/signup/gate";
import type { RefItem } from "@/components/signup/types";
import {
  type AdmitWrite,
  setMentorEnrollmentDocument,
  setMentorIdDocument,
  submitMentorApplication,
  uploadMentorDocument,
  writeMentorAdmits,
} from "./mentorWrite";
import { clearMentorDraft, loadMentorDraft } from "./draft";
import { MENTOR_FINALIZE_SKIP_KEY } from "./gate";

type Phase = "loading" | "ready" | "saving";

const admitKey = (a: RefItem) => a.id ?? `new:${a.name}`;

export function FinalizeMentor() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("loading");
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [idPhoto, setIdPhoto] = useState<File | null>(null);
  const [idPreview, setIdPreview] = useState<string | null>(null);
  // ENHANCED-track mentors (email not a recognized college domain) must also
  // upload a proof of enrollment — the DB submit_mentor_application() enforces it.
  const [tier, setTier] = useState<"standard" | "enhanced" | null>(null);
  const [enrollPhoto, setEnrollPhoto] = useState<File | null>(null);
  const [enrollName, setEnrollName] = useState<string | null>(null);
  const [admits, setAdmits] = useState<RefItem[]>([]);
  const [proofs, setProofs] = useState<Record<string, File | null>>({});

  // Resolve the mentor + short-circuit if already submitted; else load the stash.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error: sessErr } = await withRetry(() => supabase.auth.getSession());
      const session = data?.session;
      if (cancelled) return;
      if (sessErr || !session) {
        navigate({ to: "/mentor-signup" });
        return;
      }
      const uid = session.user.id;
      const { data: row } = await supabase
        .from("mentors")
        .select("application_submitted_at, tier")
        .eq("id", uid)
        .maybeSingle();
      if (cancelled) return;
      if (row?.application_submitted_at) {
        navigate({ to: "/mentor-dashboard" });
        return;
      }
      setUserId(uid);
      // Fail-closed in the UI too: unknown tier is treated as enhanced.
      setTier((row?.tier as "standard" | "enhanced") ?? "enhanced");
      const draft = loadMentorDraft();
      if (draft?.admits?.length) setAdmits(draft.admits);
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const onIdPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIdPhoto(file);
    setIdPreview(URL.createObjectURL(file));
  };

  const onProof = (key: string, file: File | null) => setProofs((p) => ({ ...p, [key]: file }));

  const onEnrollPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEnrollPhoto(file);
    setEnrollName(file.name);
  };

  async function finish() {
    if (!userId) return;
    setError(null);
    if (!idPhoto) {
      setError("Please upload a photo of your college ID — it's required to submit.");
      return;
    }
    if (tier === "enhanced" && !enrollPhoto) {
      setError(
        "Enhanced review: upload a proof of enrollment (admission letter, fee receipt, or a dated college ID). It's required to submit.",
      );
      return;
    }
    if (admits.length === 0) {
      setError("Add at least one university you were admitted to.");
      return;
    }
    setPhase("saving");
    try {
      // College-ID photo first (the DB submit requires id_document_path).
      const idPath = await uploadMentorDocument(userId, idPhoto, "college-id");
      await setMentorIdDocument(userId, idPath);

      // ENHANCED track: the enrollment proof (DB submit() enforces it server-side).
      if (tier === "enhanced" && enrollPhoto) {
        const enrollPath = await uploadMentorDocument(userId, enrollPhoto, "enrollment-proof");
        await setMentorEnrollmentDocument(userId, enrollPath);
      }

      // Per-admit proofs (optional) → admit rows.
      const toWrite: AdmitWrite[] = [];
      for (const a of admits) {
        const file = proofs[admitKey(a)];
        let proofPath: string | null = null;
        if (file) proofPath = await uploadMentorDocument(userId, file, `admit-${a.name}`);
        toWrite.push({ item: a, proofPath });
      }
      await writeMentorAdmits(userId, toWrite);

      await submitMentorApplication();
      clearMentorDraft();
      if (typeof window !== "undefined") window.sessionStorage.removeItem(MENTOR_FINALIZE_SKIP_KEY);
      navigate({ to: "/mentor-dashboard" });
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Something went wrong";
      log.error({
        surface: "web",
        event: "mentor_finalize_failed",
        kind: "mentor_finalize",
        error: raw,
      });
      setError("We couldn't submit your application. Please try again.");
      setPhase("ready");
    }
  }

  function skipForNow() {
    markSkippedThisSession(MENTOR_FINALIZE_SKIP_KEY);
    navigate({ to: "/mentor-dashboard" });
  }

  if (phase === "loading") {
    return (
      <div className="signup-wizard flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="signup-wizard">
      <AuthShell
        eyebrow="Almost there"
        title="Upload documents & submit"
        subtitle="We manually review every mentor. Add your college ID and proof of your admits, then submit for review."
      >
        <div className="space-y-6">
          {/* College-ID photo */}
          <Caption label="Photo of your physical college ID (required)">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-secondary/30">
                {idPreview ? (
                  <img
                    src={idPreview}
                    alt="Your selected college ID"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="px-2 text-center text-[11px] text-muted-foreground">
                    No file
                  </span>
                )}
              </div>
              <label className="cursor-pointer rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:border-primary/50 focus-within:ring-4 focus-within:ring-primary/15">
                {idPhoto ? "Change ID photo" : "Upload ID photo"}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  aria-label="Upload a photo of your physical college ID (required)"
                  className="sr-only"
                  onChange={onIdPhoto}
                />
              </label>
            </div>
          </Caption>

          {/* ENHANCED track: required proof of enrollment */}
          {tier === "enhanced" && (
            <div className="rounded-2xl border-l-4 border-primary bg-secondary/40 px-5 py-4">
              <p className="text-[13px] font-semibold text-foreground">
                Enhanced review — one extra step
              </p>
              <p className="mt-1 text-[13px] font-light text-muted-foreground">
                Your email isn&apos;t a recognized college domain, so we ask for a quick proof of
                enrollment — an admission letter, fee receipt, or a dated college ID. Required to
                submit.
              </p>
              <label className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:border-primary/50 focus-within:ring-4 focus-within:ring-primary/15">
                {enrollName ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-primary" /> {enrollName}
                  </>
                ) : (
                  "Upload enrollment proof"
                )}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  aria-label="Upload your proof of enrollment (admission letter, fee receipt, or dated college ID)"
                  className="sr-only"
                  onChange={onEnrollPhoto}
                />
              </label>
            </div>
          )}

          {/* Admits + per-admit proof */}
          <div>
            <Caption label="Universities you were admitted to">
              <RefMultiSelect
                kind="university"
                value={admits}
                onChange={setAdmits}
                ariaLabel="Universities you were admitted to"
                placeholder="Add admits…"
              />
            </Caption>
            {admits.length > 0 && (
              <ul className="mt-3 space-y-2">
                {admits.map((a) => {
                  const key = admitKey(a);
                  const file = proofs[key];
                  return (
                    <li
                      key={key}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3"
                    >
                      <span className="min-w-0 truncate text-sm font-medium text-foreground">
                        {a.name}
                      </span>
                      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/50 focus-within:ring-4 focus-within:ring-primary/15">
                        {file ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-primary" /> Proof added
                          </>
                        ) : (
                          "Upload proof"
                        )}
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          aria-label={`Upload acceptance proof for ${a.name}`}
                          className="sr-only"
                          onChange={(e) => onProof(key, e.target.files?.[0] ?? null)}
                        />
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-2 text-[12px] font-light text-muted-foreground">
              A proof per admit (acceptance letter, screenshot) speeds up review. Optional, but
              encouraged.
            </p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={skipForNow}
              disabled={phase === "saving"}
              className="text-sm font-medium text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline disabled:opacity-60"
            >
              Finish later
            </button>
            <button
              type="button"
              onClick={finish}
              disabled={phase === "saving"}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground shadow-card transition hover:-translate-y-0.5 hover:opacity-95 disabled:translate-y-0 disabled:opacity-60"
            >
              {phase === "saving" && <Loader2 className="h-4 w-4 animate-spin" />}
              {phase === "saving" ? "Submitting…" : "Submit application"}
            </button>
          </div>
        </div>
      </AuthShell>
    </div>
  );
}
