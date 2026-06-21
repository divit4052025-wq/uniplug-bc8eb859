// Student-signup v2 — Act 5: authenticated, post-confirmation finalize at
// /student-signup/finalize. Reproduces the cinematic continuity across the email
// round-trip: "You're almost home." interstitial → finish (3 uploads) → "You're
// in." payoff. The data path is unchanged from v1 — writeRichProfile (now
// carrying uni tiers) → photo → finalize_student_profile() — PLUS the two new
// document uploads (resume / personal statement) into the existing
// student_documents table at visibility 'restricted'.
//   - Stash present (same device): the rich selections were saved at signup;
//     just collect the uploads.
//   - Stash absent (different device): collect the rich fields fresh (same
//     real ref-data components), then the uploads.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { Mascot } from "@/components/mascots/Mascot";
import { MASCOTS } from "@/components/mascots/mascot-data";
import { Logo } from "@/components/site/Logo";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { log } from "@/lib/log";
import { withRetry } from "@/lib/retry";
import { ACCEPTED_IMAGE_INPUT, UNSUPPORTED_IMAGE_MESSAGE, isAcceptedImage } from "@/lib/images";
import { ProjectsField } from "./fields/ProjectsField";
import { RefMultiSelect } from "@/components/signup/RefMultiSelect";
import { clearProfileDraft, draftHasData, loadProfileDraft } from "./draft";
import { stampProfileComplete, uploadStudentDocument, writeRichProfile } from "./profileWrite";
import { FINALIZE_SKIP_KEY } from "./gate";
import type { ProfileDraft, ProjectDraft, RefItem, UniPick } from "./types";
import { SignupCursor } from "./v2/SignupCursor";
import { FounderCompanion } from "./v2/FounderCompanion";
import { ActInterstitial, type InterstitialWord } from "./v2/ActInterstitial";
import { YoureInBeat } from "./v2/beats";
import { UniversityTierField } from "./v2/UniversityTierField";
import { MotionConfig } from "motion/react";

type Phase = "loading" | "interstitial" | "finish" | "saving" | "done";

const PAPER = "var(--brand-paper)";
const ALMOST_HOME: InterstitialWord[] = [
  { text: "You’re", color: PAPER },
  { text: "almost", color: PAPER },
  { text: "home.", color: "var(--brand-rose)" },
];

// One-time flag so the "You're almost home." interstitial plays only on the
// post-confirmation landing and never replays (incl. from the dashboard).
const FINALIZE_INTRO_KEY = "uniplug:finalize-intro-shown";

const labelCls = "mb-1.5 block text-[13px] font-semibold text-brand-ink-soft";

export function FinalizeProfile() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("loading");
  const [userId, setUserId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Uploads (all optional / skippable).
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [statementFiles, setStatementFiles] = useState<File[]>([]);
  const photoInput = useRef<HTMLInputElement>(null);
  const resumeInput = useRef<HTMLInputElement>(null);
  const statementInput = useRef<HTMLInputElement>(null);

  // Fresh-collection fields (only used when there's no stash).
  const [subjects, setSubjects] = useState<RefItem[]>([]);
  const [targetUniversities, setTargetUniversities] = useState<UniPick[]>([]);
  const [courses, setCourses] = useState<RefItem[]>([]);
  const [sports, setSports] = useState<RefItem[]>([]);
  const [cocurriculars, setCocurriculars] = useState<RefItem[]>([]);
  const [projects, setProjects] = useState<ProjectDraft[]>([]);
  const [bio, setBio] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error: sessErr } = await withRetry(() => supabase.auth.getSession());
      const session = data?.session;
      if (cancelled) return;
      if (sessErr || !session) {
        navigate({ to: "/student-signup" });
        return;
      }
      const uid = session.user.id;
      const { data: row } = await supabase
        .from("students")
        .select("profile_completed_at, full_name")
        .eq("id", uid)
        .maybeSingle();
      if (cancelled) return;
      if (row?.profile_completed_at) {
        navigate({ to: "/dashboard" });
        return;
      }
      setUserId(uid);
      setFirstName((row?.full_name ?? "").trim().split(" ")[0] ?? "");
      setDraft(loadProfileDraft());
      // Play "You're almost home." ONCE — only on the post-confirmation landing
      // (?welcome=1 from the email link / auto-confirm), gated by a one-time flag
      // so it never replays (e.g. when reached from the dashboard).
      const welcome = new URLSearchParams(window.location.search).get("welcome") === "1";
      const introShown = window.localStorage.getItem(FINALIZE_INTRO_KEY) === "1";
      if (welcome && !introShown) {
        window.localStorage.setItem(FINALIZE_INTRO_KEY, "1");
        setPhase("interstitial");
      } else {
        setPhase("finish");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const hasStash = draftHasData(draft);

  const onPhoto = (file: File | undefined) => {
    if (!file) return;
    if (!isAcceptedImage(file)) {
      toast.error(UNSUPPORTED_IMAGE_MESSAGE);
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  async function uploadPhoto(uid: string): Promise<void> {
    if (!photoFile) return;
    const ext = photoFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${uid}/${Date.now()}.${ext}`; // owner-prefix RLS on student-photos
    const { error: upErr } = await supabase.storage
      .from("student-photos")
      .upload(path, photoFile, { contentType: photoFile.type, upsert: true });
    if (upErr) throw upErr;
    const { error: dbErr } = await supabase
      .from("students")
      .update({ photo_url: path })
      .eq("id", uid);
    if (dbErr) throw dbErr;
  }

  async function finish() {
    if (!userId) return;
    setError(null);
    setPhase("saving");
    try {
      const toWrite: ProfileDraft = hasStash
        ? (draft as ProfileDraft)
        : { subjects, targetUniversities, courses, sports, cocurriculars, projects, savedAt: "" };
      await writeRichProfile(userId, toWrite);
      if (!hasStash && bio.trim()) {
        await supabase.from("students").update({ bio: bio.trim() }).eq("id", userId);
      }
      await uploadPhoto(userId);
      if (resumeFile) await uploadStudentDocument(userId, resumeFile, "resume");
      for (const f of statementFiles) await uploadStudentDocument(userId, f, "statement");
      await stampProfileComplete();
      clearProfileDraft();
      if (typeof window !== "undefined") window.sessionStorage.removeItem(FINALIZE_SKIP_KEY);
      setPhase("done");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Something went wrong";
      log.error({
        surface: "web",
        event: "profile_finalize_failed",
        kind: "student_finalize",
        error: raw,
      });
      setError("We couldn’t save everything. Please try again.");
      setPhase("finish");
    }
  }

  function skipForNow() {
    if (typeof window !== "undefined") window.sessionStorage.setItem(FINALIZE_SKIP_KEY, "1");
    navigate({ to: "/dashboard" });
  }

  const goDashboard = () => navigate({ to: "/dashboard" });

  // ── Cinematic overlays ──
  if (phase === "loading") {
    return (
      <div className="signup-wizard flex min-h-screen items-center justify-center bg-brand-paper">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }
  if (phase === "interstitial") {
    return (
      <div className="signup-wizard relative h-dvh overflow-hidden overscroll-none bg-brand-paper">
        <SignupCursor />
        <ActInterstitial words={ALMOST_HOME} onDone={() => setPhase("finish")} />
      </div>
    );
  }
  if (phase === "done") {
    return (
      <div className="signup-wizard relative h-dvh overflow-hidden overscroll-none bg-brand-paper text-foreground">
        <SignupCursor />
        <MotionConfig reducedMotion="user">
          <YoureInBeat firstName={firstName} onPrimary={goDashboard} onReplay={goDashboard} />
        </MotionConfig>
      </div>
    );
  }

  const saving = phase === "saving";
  const cardBase =
    "flex cursor-none flex-col justify-center rounded-md border border-dashed bg-background p-5 transition";

  return (
    <div className="signup-wizard relative h-dvh overflow-hidden overscroll-none bg-brand-paper text-foreground">
      <SignupCursor />
      <div className="absolute left-10 top-8 z-[5]">
        {/* ink glyph for the light/paper finalize surface (suffix = target bg) */}
        <Logo variant="wordmark-offwhite" size={34} />
      </div>

      {/* hidden file inputs */}
      <input
        ref={photoInput}
        type="file"
        accept={ACCEPTED_IMAGE_INPUT}
        className="sr-only"
        onChange={(e) => onPhoto(e.target.files?.[0])}
      />
      <input
        ref={resumeInput}
        type="file"
        accept=".pdf,.doc,.docx"
        className="sr-only"
        onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
      />
      <input
        ref={statementInput}
        type="file"
        accept=".pdf,.doc,.docx,.txt"
        multiple
        className="sr-only"
        onChange={(e) => setStatementFiles((s) => [...s, ...Array.from(e.target.files ?? [])])}
      />

      <div className="absolute inset-0 flex items-center justify-center px-8 py-16 sm:px-16">
        <div className="flex max-h-full w-full max-w-[920px] items-center gap-10 lg:gap-14">
          <FounderCompanion
            expression="happy"
            size={168}
            className="hidden shrink-0 self-center md:block"
          />
          <div className="hide-scrollbar max-h-full w-full max-w-[600px] flex-1 overflow-y-auto">
            <div className="mb-7">
              <div className="mb-2.5 text-[13px] font-semibold uppercase tracking-[0.16em] text-brand-ink-faint">
                Almost there
              </div>
              <h1 className="m-0 font-display text-[clamp(30px,4.5vw,42px)] font-extrabold leading-tight tracking-[-0.022em]">
                Finish your profile.
              </h1>
            </div>

            {!hasStash && (
              <div className="mb-6 flex flex-col gap-[18px]">
                <p className="text-[13px] text-brand-ink-soft">
                  Add a few details so mentors get to know you. Everything here is optional.
                </p>
                <div>
                  <span className={labelCls}>Subjects you take</span>
                  <RefMultiSelect
                    kind="subject"
                    value={subjects}
                    onChange={setSubjects}
                    ariaLabel="Subjects you take"
                    placeholder="Physics, Economics…"
                  />
                </div>
                <div>
                  <span className={labelCls}>Target universities</span>
                  <UniversityTierField
                    value={targetUniversities}
                    onChange={setTargetUniversities}
                  />
                </div>
                <div>
                  <span className={labelCls}>Courses or majors</span>
                  <RefMultiSelect
                    kind="course"
                    value={courses}
                    onChange={setCourses}
                    ariaLabel="Courses or majors"
                    placeholder="Computer Science, Law…"
                  />
                </div>
                <div>
                  <span className={labelCls}>Sports you play</span>
                  <RefMultiSelect
                    kind="sport"
                    value={sports}
                    onChange={setSports}
                    ariaLabel="Sports you play"
                    placeholder="Football, Tennis…"
                  />
                </div>
                <div>
                  <span className={labelCls}>Co-curriculars &amp; clubs</span>
                  <RefMultiSelect
                    kind="cocurricular"
                    value={cocurriculars}
                    onChange={setCocurriculars}
                    ariaLabel="Co-curriculars and clubs"
                    placeholder="Debate, MUN, Music…"
                  />
                </div>
                <div>
                  <span className={labelCls}>Academic / science projects</span>
                  <ProjectsField value={projects} onChange={setProjects} />
                </div>
                <div>
                  <span className={labelCls}>A short bio</span>
                  <textarea
                    className="min-h-[120px] w-full resize-y rounded-md border border-border bg-background px-4 py-3.5 text-[16px] font-medium leading-relaxed text-foreground outline-none placeholder:text-brand-ink-faint focus:border-primary"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell mentors a little about yourself."
                  />
                </div>
              </div>
            )}

            {/* uploads */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <button
                type="button"
                data-mag
                data-hov
                onClick={() => photoInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  onPhoto(e.dataTransfer.files?.[0]);
                }}
                className={`${cardBase} sm:col-span-2 flex-row items-center gap-[18px]`}
                style={{ borderColor: photoFile ? "#9AD6C6" : "rgba(26,26,26,.22)" }}
              >
                <span
                  className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-foreground/10 bg-brand-blush text-[26px] text-primary"
                  style={
                    photoPreview
                      ? {
                          backgroundImage: `url(${photoPreview})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }
                      : undefined
                  }
                >
                  {photoPreview ? "" : "+"}
                </span>
                <span className="text-left">
                  <span className="block font-display text-[17px] font-extrabold">
                    Profile photo
                  </span>
                  <span className="mt-0.5 block text-[13px] text-brand-ink-soft">
                    {photoFile ? photoFile.name : "Drop an image or click to upload"}
                  </span>
                </span>
              </button>

              <button
                type="button"
                data-mag
                data-hov
                onClick={() => resumeInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  setResumeFile(e.dataTransfer.files?.[0] ?? null);
                }}
                className={`${cardBase} min-h-[128px] items-start text-left`}
                style={{ borderColor: resumeFile ? "#9AD6C6" : "rgba(26,26,26,.22)" }}
              >
                <Mascot
                  shape="quill"
                  color={MASCOTS.quill.color}
                  expression="happy"
                  size={40}
                  decorative
                />
                <span className="mt-2 block font-display text-[17px] font-extrabold">
                  Resume / CV
                </span>
                <span className="mt-0.5 block text-[13px] text-brand-ink-soft">
                  {resumeFile ? resumeFile.name : "PDF or Word · drop or click"}
                </span>
              </button>

              <button
                type="button"
                data-mag
                data-hov
                onClick={() => statementInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  setStatementFiles((s) => [...s, ...Array.from(e.dataTransfer.files ?? [])]);
                }}
                className={`${cardBase} min-h-[128px] items-start text-left`}
                style={{ borderColor: statementFiles.length ? "#9AD6C6" : "rgba(26,26,26,.22)" }}
              >
                <Mascot
                  shape="lens"
                  color={MASCOTS.lens.color}
                  expression="thinking"
                  size={40}
                  decorative
                />
                <span className="mt-2 block font-display text-[17px] font-extrabold">
                  Personal statement
                </span>
                <span className="mt-0.5 block text-[13px] text-brand-ink-soft">
                  {statementFiles.length
                    ? `${statementFiles.length} file(s) added`
                    : "Drafts welcome · drop or click"}
                </span>
              </button>
            </div>

            {error && (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="mt-7 flex items-center gap-[18px]">
              <button
                type="button"
                data-mag
                data-hov
                onClick={finish}
                disabled={saving}
                className="inline-flex cursor-none items-center gap-2.5 rounded-md bg-foreground px-8 py-4 text-[16px] font-bold text-brand-paper transition disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? "Saving…" : "Complete profile"}
                {!saving && <span className="text-[18px]">→</span>}
              </button>
              <button
                type="button"
                data-hov
                onClick={skipForNow}
                disabled={saving}
                className="cursor-none text-[14px] font-semibold text-brand-ink-faint disabled:opacity-60"
              >
                Skip for now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
