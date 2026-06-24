// P8 — authenticated post-verification mentor finalize ("Upload documents &
// submit"), re-skinned to the dark cinematic mentor aesthetic. Uploads the
// college-ID photo (→ id_document_path, REQUIRED) and, per admit, an optional
// acceptance proof; replays the stashed admits into mentor_admits; persists the
// stashed "extra skills" into mentors.topics (best-effort); then
// submit_mentor_application(). This is where "Submit application" lives — never
// in the wizard (the wizard only creates the account).
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { log } from "@/lib/log";
import { withRetry } from "@/lib/retry";
import { RefMultiSelect } from "@/components/signup/RefMultiSelect";
import { markSkippedThisSession } from "@/components/signup/gate";
import type { RefItem } from "@/components/signup/types";
import { SignupCursor } from "@/components/student-signup/v2/SignupCursor";
import { FounderCompanion } from "@/components/student-signup/v2/FounderCompanion";
import { Logo } from "@/components/site/Logo";
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

const labelCls = "mb-1.5 block text-[13px] font-semibold text-[rgba(255,252,251,0.72)]";
const slotCls =
  "flex cursor-none items-center gap-4 rounded-lg border border-dashed p-4 transition";

export function FinalizeMentor() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("loading");
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [idPhoto, setIdPhoto] = useState<File | null>(null);
  const [idPreview, setIdPreview] = useState<string | null>(null);
  const [tier, setTier] = useState<"standard" | "enhanced" | null>(null);
  const [enrollPhoto, setEnrollPhoto] = useState<File | null>(null);
  const [enrollName, setEnrollName] = useState<string | null>(null);
  const [admits, setAdmits] = useState<RefItem[]>([]);
  const [proofs, setProofs] = useState<Record<string, File | null>>({});
  const [skills, setSkills] = useState<string[]>([]);

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
      if (draft?.skills?.length) setSkills(draft.skills);
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
    setIdPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
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
      setError("Please upload a photo of your college ID — it’s required to submit.");
      return;
    }
    if (tier === "enhanced" && !enrollPhoto) {
      setError(
        "Enhanced review: upload a proof of enrollment (admission letter, fee receipt, or a dated college ID). It’s required to submit.",
      );
      return;
    }
    if (admits.length === 0) {
      setError("Add at least one university you were admitted to.");
      return;
    }
    setPhase("saving");
    try {
      const idPath = await uploadMentorDocument(userId, idPhoto, "college-id");
      await setMentorIdDocument(userId, idPath);

      if (tier === "enhanced" && enrollPhoto) {
        const enrollPath = await uploadMentorDocument(userId, enrollPhoto, "enrollment-proof");
        await setMentorEnrollmentDocument(userId, enrollPath);
      }

      const toWrite: AdmitWrite[] = [];
      for (const a of admits) {
        const file = proofs[admitKey(a)];
        let proofPath: string | null = null;
        if (file) proofPath = await uploadMentorDocument(userId, file, `admit-${a.name}`);
        toWrite.push({ item: a, proofPath });
      }
      await writeMentorAdmits(userId, toWrite);

      await submitMentorApplication();

      // Best-effort: persist the stashed "extra skills" into mentors.topics
      // (mentor-self-editable column; not a blocker if it fails post-submit).
      if (skills.length > 0) {
        const { error: topicsErr } = await supabase
          .from("mentors")
          .update({ topics: skills })
          .eq("id", userId);
        if (topicsErr) {
          log.error({
            surface: "web",
            event: "mentor_topics_write_failed",
            kind: "mentor_finalize",
            error: topicsErr.message,
          });
        }
      }

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
      setError("We couldn’t submit your application. Please try again.");
      setPhase("ready");
    }
  }

  function skipForNow() {
    markSkippedThisSession(MENTOR_FINALIZE_SKIP_KEY);
    navigate({ to: "/mentor-dashboard" });
  }

  if (phase === "loading") {
    return (
      <div className="signup-wizard flex min-h-screen items-center justify-center bg-brand-night">
        <span className="text-[rgba(255,252,251,0.5)]">Loading…</span>
      </div>
    );
  }

  return (
    <div
      data-dark
      className="signup-wizard relative min-h-screen overflow-hidden bg-brand-night text-brand-paper"
    >
      <SignupCursor />
      <div className="absolute left-10 top-8 z-[5]">
        <Logo variant="wordmark-dark" size={34} />
      </div>

      <div className="flex min-h-screen items-center justify-center px-8 py-16 sm:px-16">
        <div className="flex w-full max-w-[940px] items-center gap-10 lg:gap-14">
          <FounderCompanion
            expression="guiding"
            size={172}
            color="#F4B5AA"
            className="hidden shrink-0 self-center md:block"
          />

          <div className="w-full max-w-[620px] flex-1">
            <div className="mb-7">
              <div className="mb-2.5 text-[13px] font-semibold uppercase tracking-[0.16em] text-[rgba(255,252,251,0.5)]">
                The last step
              </div>
              <h1 className="m-0 font-display text-[clamp(30px,4.5vw,42px)] font-extrabold leading-tight tracking-[-0.022em] text-brand-paper">
                Upload your documents.
              </h1>
              <p className="mt-2 text-[15px] text-[rgba(255,252,251,0.6)]">
                A real person verifies every UniPlug mentor. Add your college ID and proof of your
                admits, then submit for review.
              </p>
            </div>

            <div className="flex flex-col gap-5">
              {/* College-ID photo (required) */}
              <div>
                <span className={labelCls}>Photo of your physical college ID</span>
                <label
                  className={slotCls}
                  style={{
                    borderColor: idPhoto ? "#9AD6C6" : "rgba(255,252,251,0.24)",
                    background: "rgba(255,252,251,0.04)",
                  }}
                >
                  <span
                    className="flex h-[54px] w-[54px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[rgba(255,252,251,0.16)] bg-[#2A2622] text-[22px] text-brand-rose"
                    style={
                      idPreview
                        ? { backgroundImage: `url(${idPreview})`, backgroundSize: "cover" }
                        : undefined
                    }
                  >
                    {idPreview ? "" : "+"}
                  </span>
                  <span>
                    <span className="block font-display text-[16px] font-extrabold text-brand-paper">
                      {idPhoto ? "College ID added" : "Photo of your college ID"}
                    </span>
                    <span className="mt-0.5 block text-[13px] text-[rgba(255,252,251,0.55)]">
                      {idPhoto?.name ?? "Click to upload · JPG / PNG / PDF"}
                    </span>
                  </span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    aria-label="Upload a photo of your physical college ID (required)"
                    className="sr-only"
                    onChange={onIdPhoto}
                  />
                </label>
              </div>

              {/* ENHANCED track: required proof of enrollment */}
              {tier === "enhanced" && (
                <div className="rounded-lg border-l-[3px] border-brand-rose bg-[rgba(255,252,251,0.04)] px-5 py-4">
                  <p className="text-[13px] font-semibold text-brand-paper">
                    Enhanced review — one extra step
                  </p>
                  <p className="mt-1 text-[13px] text-[rgba(255,252,251,0.6)]">
                    Your email isn’t a recognized college domain, so we ask for a quick proof of
                    enrollment — an admission letter, fee receipt, or a dated college ID. Required
                    to submit.
                  </p>
                  <label className="mt-3 inline-flex cursor-none items-center gap-2 rounded-md border border-[rgba(255,252,251,0.18)] bg-[rgba(255,252,251,0.05)] px-4 py-2 text-[13px] font-semibold text-brand-paper">
                    {enrollName ? `✓ ${enrollName}` : "Upload enrollment proof"}
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      aria-label="Upload your proof of enrollment"
                      className="sr-only"
                      onChange={onEnrollPhoto}
                    />
                  </label>
                </div>
              )}

              {/* Admits + per-admit proof (optional) */}
              <div>
                <span className={labelCls}>Universities you were admitted to</span>
                <RefMultiSelect
                  kind="university"
                  value={admits}
                  onChange={setAdmits}
                  ariaLabel="Universities you were admitted to"
                  placeholder="Add admits…"
                />
                {admits.length > 0 && (
                  <div className="mt-3 flex flex-col gap-2.5">
                    {admits.map((a) => {
                      const key = admitKey(a);
                      const file = proofs[key];
                      return (
                        <div
                          key={key}
                          className="flex items-center gap-3 rounded-md border border-[rgba(255,252,251,0.12)] bg-[rgba(255,252,251,0.04)] px-3 py-2.5"
                        >
                          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-brand-paper">
                            {a.name}
                          </span>
                          <label
                            className="shrink-0 cursor-none rounded-md border px-3 py-1.5 text-[12px] font-bold transition"
                            style={
                              file
                                ? {
                                    background: "rgba(154,214,198,0.16)",
                                    color: "#9AD6C6",
                                    borderColor: "rgba(154,214,198,0.4)",
                                  }
                                : {
                                    background: "rgba(255,252,251,0.06)",
                                    color: "rgba(255,252,251,0.7)",
                                    borderColor: "rgba(255,252,251,0.18)",
                                  }
                            }
                          >
                            {file ? "✓ Proof added" : "Upload proof"}
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              aria-label={`Upload acceptance proof for ${a.name}`}
                              className="sr-only"
                              onChange={(e) => onProof(key, e.target.files?.[0] ?? null)}
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                )}
                <span className="mt-2 block text-[12px] text-[rgba(255,252,251,0.45)]">
                  A proof per admit (acceptance letter, screenshot) speeds up review. Optional, but
                  encouraged.
                </span>
              </div>

              {error && (
                <p role="alert" className="text-[13px] text-[#E5765B]">
                  {error}
                </p>
              )}

              <div className="mt-2 flex items-center gap-[18px]">
                <button
                  type="button"
                  data-mag
                  data-hov
                  onClick={finish}
                  disabled={phase === "saving"}
                  className="inline-flex cursor-none items-center gap-2.5 rounded-md bg-brand-paper px-[30px] py-4 text-[16px] font-bold text-[#1A1A1A] transition disabled:opacity-60"
                >
                  {phase === "saving" ? "Submitting…" : "Submit application"}{" "}
                  <span className="text-[18px]">→</span>
                </button>
                <button
                  type="button"
                  data-hov
                  onClick={skipForNow}
                  disabled={phase === "saving"}
                  className="cursor-none px-1.5 py-3.5 text-[14px] font-semibold text-[rgba(255,252,251,0.45)] disabled:opacity-60"
                >
                  Finish later
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
