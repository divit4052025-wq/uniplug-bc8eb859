// P7 — authenticated post-verification finalize step.
//   - Stash present (just signed up on this device): show a summary of the saved
//     selections + a photo upload; write the rich join-table rows silently on
//     finish, then stamp completion.
//   - Stash absent (different device / legacy "backfill" signup): collect the
//     rich fields fresh (reusing the same typeahead/mascot components) + photo.
// Either way: write rows → upload photo → finalize_student_profile() → dashboard.
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, Loader2 } from "lucide-react";

import { AuthShell, Field, inputClass } from "@/components/site/AuthShell";
import { supabase } from "@/integrations/supabase/client";
import { log } from "@/lib/log";
import { withRetry } from "@/lib/retry";
import { ProjectsField } from "./fields/ProjectsField";
import { RefMultiSelect } from "@/components/signup/RefMultiSelect";
import { Caption } from "@/components/signup/Labeled";
import { clearProfileDraft, draftHasData, loadProfileDraft } from "./draft";
import { stampProfileComplete, writeRichProfile } from "./profileWrite";
import { FINALIZE_SKIP_KEY } from "./gate";
import type { ProfileDraft, ProjectDraft, RefItem } from "./types";

type Phase = "loading" | "ready" | "saving";

export function FinalizeProfile() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("loading");
  const [userId, setUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Photo (optional).
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Fresh-collection fields (only used when there's no stash).
  const [subjects, setSubjects] = useState<RefItem[]>([]);
  const [targetUniversities, setTargetUniversities] = useState<RefItem[]>([]);
  const [courses, setCourses] = useState<RefItem[]>([]);
  const [sports, setSports] = useState<RefItem[]>([]);
  const [cocurriculars, setCocurriculars] = useState<RefItem[]>([]);
  const [projects, setProjects] = useState<ProjectDraft[]>([]);
  const [bio, setBio] = useState("");

  // Resolve the authenticated user + short-circuit if already finalized.
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
        .select("profile_completed_at")
        .eq("id", uid)
        .maybeSingle();
      if (cancelled) return;
      if (row?.profile_completed_at) {
        navigate({ to: "/dashboard" });
        return;
      }
      setUserId(uid);
      setDraft(loadProfileDraft());
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const hasStash = draftHasData(draft);

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
    // student-photos is private — store the PATH (P1 photo_url is a bucket key).
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
        : {
            subjects,
            targetUniversities,
            courses,
            sports,
            cocurriculars,
            projects,
            savedAt: "",
          };
      await writeRichProfile(userId, toWrite);
      if (!hasStash && bio.trim()) {
        await supabase.from("students").update({ bio: bio.trim() }).eq("id", userId);
      }
      await uploadPhoto(userId);
      await stampProfileComplete();
      clearProfileDraft();
      if (typeof window !== "undefined") window.sessionStorage.removeItem(FINALIZE_SKIP_KEY);
      navigate({ to: "/dashboard" });
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Something went wrong";
      log.error({
        surface: "web",
        event: "profile_finalize_failed",
        kind: "student_finalize",
        error: raw,
      });
      setError("We couldn't save everything. Please try again.");
      setPhase("ready");
    }
  }

  function skipForNow() {
    if (typeof window !== "undefined") window.sessionStorage.setItem(FINALIZE_SKIP_KEY, "1");
    navigate({ to: "/dashboard" });
  }

  if (phase === "loading") {
    return (
      <div className="signup-wizard flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }

  const photoBlock = (
    <Caption label="Profile photo (optional)">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary/40">
          {photoPreview ? (
            <img
              src={photoPreview}
              alt="Your selected profile"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-xs text-muted-foreground">No photo</span>
          )}
        </div>
        <label className="cursor-pointer rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:border-primary/50 focus-within:ring-4 focus-within:ring-primary/15">
          {photoFile ? "Change photo" : "Upload photo"}
          <input type="file" accept="image/*" className="sr-only" onChange={onPhoto} />
        </label>
      </div>
    </Caption>
  );

  return (
    <div className="signup-wizard">
      <AuthShell
        eyebrow="Almost there"
        title="Finish your profile"
        subtitle="A couple of finishing touches so we can match you with the right mentors."
      >
        <div className="space-y-6">
          {hasStash ? (
            <div className="rounded-2xl border border-primary/30 bg-secondary/20 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Check className="h-4 w-4 text-primary" /> We saved your earlier choices
              </p>
              <p className="mt-1 text-[13px] font-light text-muted-foreground">
                Your subjects, target universities and interests are ready to go. Just add a photo
                to finish — or skip it for now.
              </p>
            </div>
          ) : (
            <>
              <p className="text-[13px] font-light text-muted-foreground">
                Add a few details so mentors get to know you. Everything here is optional.
              </p>
              <Caption label="Subjects you take">
                <RefMultiSelect
                  kind="subject"
                  value={subjects}
                  onChange={setSubjects}
                  ariaLabel="Subjects you take"
                  placeholder="Add subjects…"
                />
              </Caption>
              <Caption label="Target universities">
                <RefMultiSelect
                  kind="university"
                  value={targetUniversities}
                  onChange={setTargetUniversities}
                  ariaLabel="Target universities"
                  placeholder="Add universities…"
                />
              </Caption>
              <Caption label="Courses / fields of study">
                <RefMultiSelect
                  kind="course"
                  value={courses}
                  onChange={setCourses}
                  ariaLabel="Courses or fields of study"
                  placeholder="Add courses…"
                />
              </Caption>
              <Caption label="Sports">
                <RefMultiSelect
                  kind="sport"
                  value={sports}
                  onChange={setSports}
                  ariaLabel="Sports"
                  placeholder="Add sports…"
                />
              </Caption>
              <Caption label="Co-curriculars">
                <RefMultiSelect
                  kind="cocurricular"
                  value={cocurriculars}
                  onChange={setCocurriculars}
                  ariaLabel="Co-curriculars"
                  placeholder="Add co-curriculars…"
                />
              </Caption>
              <Caption label="Academic / science projects">
                <ProjectsField value={projects} onChange={setProjects} />
              </Caption>
              <Field label="Short bio">
                <textarea
                  className={`${inputClass} min-h-[100px] resize-y`}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell mentors a little about yourself."
                />
              </Field>
            </>
          )}

          {photoBlock}

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
              Skip for now
            </button>
            <button
              type="button"
              onClick={finish}
              disabled={phase === "saving"}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground shadow-card transition hover:-translate-y-0.5 hover:opacity-95 disabled:translate-y-0 disabled:opacity-60"
            >
              {phase === "saving" && <Loader2 className="h-4 w-4 animate-spin" />}
              {phase === "saving" ? "Saving…" : "Finish"}
            </button>
          </div>
        </div>
      </AuthShell>
    </div>
  );
}
