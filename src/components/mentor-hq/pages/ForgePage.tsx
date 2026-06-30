import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Loader2, Plus, ShieldAlert, UploadCloud, X, Lock } from "lucide-react";
import { toast } from "sonner";

import { HqCard, HqPageShell } from "@/components/mentor-hq/HqPageShell";
import { VerifiedBadge } from "@/components/site/VerifiedBadge";
import { useMentorDashboard } from "@/components/mentor-dashboard/MentorDashboardContext";
import { supabase } from "@/integrations/supabase/client";
import { log } from "@/lib/log";
import { useOptimisticMutation } from "@/lib/hooks/useOptimisticMutation";
import {
  loadMentorProfile,
  saveMentorProfile,
  type MentorScalarProfile,
} from "@/components/mentor-dashboard/mentorProfileEdit";
import {
  resubmitMentorApplication,
  setMentorEnrollmentDocument,
  setMentorIdDocument,
  uploadMentorDocument,
} from "@/components/mentor-signup/mentorWrite";
import { HqSectionTitle } from "./shared";

const BIO_MAX = 500;
const ACCEPTED_IMAGE = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

type IdentityRow = {
  university: string;
  course: string;
  year: string;
  specialty: string | null;
};

export function ForgePage() {
  const { mentorId } = useMentorDashboard();
  const profileKey = ["mentor-profile", mentorId] as const;

  const [bio, setBio] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [topicInput, setTopicInput] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const { data: profile, isLoading } = useQuery<MentorScalarProfile>({
    queryKey: profileKey,
    queryFn: () => loadMentorProfile(mentorId),
  });

  // Read-only verified identity (NOT in the editable allowlist).
  const { data: identity } = useQuery<IdentityRow>({
    queryKey: ["mentor-identity", mentorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mentors")
        .select("university, course, year, ref_specialties(label)")
        .eq("id", mentorId)
        .maybeSingle();
      if (error) throw error;
      const spec = (data as { ref_specialties?: { label?: string } | null } | null)
        ?.ref_specialties;
      return {
        university: data?.university ?? "",
        course: data?.course ?? "",
        year: data?.year ?? "",
        specialty: spec?.label ?? null,
      };
    },
  });

  useEffect(() => {
    if (!initialized && profile) {
      setBio(profile.bio);
      setTopics(profile.topics);
      setPhotoUrl(profile.photo_url);
      setPhone(profile.phone ?? "");
      setInitialized(true);
    }
  }, [profile, initialized]);

  const addTopic = () => {
    const trimmed = topicInput.trim();
    if (!trimmed) return;
    if (topics.includes(trimmed)) {
      setTopicInput("");
      return;
    }
    setTopics((prev) => [...prev, trimmed]);
    setTopicInput("");
  };

  const handlePhoto = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!ACCEPTED_IMAGE.includes(file.type)) {
      toast.error("Only JPEG, PNG, WebP or GIF images are allowed.");
      return;
    }
    if (file.size > MAX_PHOTO_SIZE) {
      toast.error("Photo must be under 5 MB.");
      return;
    }
    setPhotoUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${mentorId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("mentor-photos")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("mentor-photos").getPublicUrl(path);
      setPhotoUrl(urlData.publicUrl);
      toast.success("Photo uploaded — Save changes to keep it.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Photo upload failed.");
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const saveMutation = useOptimisticMutation<MentorScalarProfile, void, void>({
    mutationFn: () =>
      saveMentorProfile(mentorId, {
        bio: bio.trim() || null,
        topics,
        photo_url: photoUrl,
        phone: phone.trim() || null,
      }),
    queryKeys: [profileKey],
    optimisticUpdate: (old) =>
      old
        ? { ...old, bio: bio.trim(), topics, photo_url: photoUrl, phone: phone.trim() || null }
        : old,
    successMessage: "Profile saved.",
    errorMessage: (err) => (err instanceof Error ? err.message : "Couldn't save profile."),
  });

  const inputClass =
    "w-full rounded-xl border border-[#EDE0DB] bg-[#FFFCFB] px-4 py-3 text-[14px] text-[#1A1A1A] placeholder:text-[#1A1A1A]/40 focus:border-[#C4907F] focus:outline-none focus:ring-2 focus:ring-[#C4907F]/20";

  return (
    <HqPageShell
      kind="Profile"
      title="The Forge"
      intro="Shape how students see you, and track your verification. Your identity is locked once verified — your presentation is always yours to edit."
    >
      <div className="space-y-8">
        <VerificationPanel />

        {/* Read-only verified identity */}
        <section>
          <HqSectionTitle sub="Verified at signup against your college ID — not editable here.">
            Your verified identity
          </HqSectionTitle>
          <HqCard>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ReadOnlyField label="University" value={identity?.university} />
              <ReadOnlyField label="Course" value={identity?.course} />
              <ReadOnlyField label="Year" value={identity?.year} />
              <ReadOnlyField label="Specialty" value={identity?.specialty} />
            </div>
            <p className="mt-4 flex items-center gap-1.5 text-[12px] text-[#1A1A1A]/55">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              Verified — not editable. Changing these needs re-verification.
            </p>
          </HqCard>
        </section>

        {/* Editable presentation */}
        <section>
          <HqSectionTitle sub="This is what students see on your public profile.">
            Your public profile
          </HqSectionTitle>

          {isLoading || !initialized ? (
            <HqCard>
              <div className="flex items-center gap-2 text-sm text-[#1A1A1A]/60">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading your profile…
              </div>
            </HqCard>
          ) : (
            <div className="space-y-5">
              {/* Photo */}
              <HqCard>
                <p className="text-sm font-semibold">Profile photo</p>
                <p className="mt-0.5 text-[12px] text-[#1A1A1A]/55">JPEG, PNG or WebP · max 5 MB</p>
                <div className="mt-4 flex items-center gap-5">
                  <div className="relative h-20 w-20 shrink-0">
                    {photoUrl ? (
                      <img
                        src={photoUrl}
                        alt="Profile"
                        className="h-20 w-20 rounded-full object-cover ring-2 ring-[#EDE0DB]"
                      />
                    ) : (
                      <div className="grid h-20 w-20 place-content-center rounded-full bg-[#EDE0DB] font-display text-[22px] font-bold">
                        —
                      </div>
                    )}
                    {photoUploading ? (
                      <div className="absolute inset-0 flex items-center justify-center rounded-full bg-[#FFFCFB]/70">
                        <Loader2
                          className="h-5 w-5 animate-spin"
                          style={{ color: "#C4907F" }}
                          aria-hidden="true"
                        />
                      </div>
                    ) : null}
                  </div>
                  <label className="cursor-pointer">
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => handlePhoto(e.target.files)}
                      disabled={photoUploading}
                    />
                    <span className="inline-flex items-center gap-2 rounded-md border border-[#1A1A1A]/15 px-4 py-2 text-[13px] font-semibold text-[#1A1A1A] transition hover:border-[#1A1A1A]/30">
                      <UploadCloud className="h-4 w-4" aria-hidden="true" />
                      {photoUrl ? "Change photo" : "Upload photo"}
                    </span>
                  </label>
                  {photoUrl ? (
                    <button
                      type="button"
                      onClick={() => setPhotoUrl(null)}
                      className="text-[12px] text-[#1A1A1A]/55 underline underline-offset-2"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </HqCard>

              {/* Bio */}
              <HqCard>
                <label htmlFor="forge-bio" className="text-sm font-semibold">
                  About me
                </label>
                <p className="mt-0.5 text-[12px] text-[#1A1A1A]/55">
                  Shown as the “About me” section on your public profile.
                </p>
                <textarea
                  id="forge-bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
                  rows={5}
                  placeholder="Tell students about your journey, what you study, and the guidance you offer…"
                  className={`mt-3 resize-none ${inputClass}`}
                />
                <p
                  className="mt-1 text-right text-[11px]"
                  style={{ color: bio.length >= BIO_MAX ? "#C0392B" : "rgba(26,26,26,0.55)" }}
                >
                  {bio.length}/{BIO_MAX}
                </p>
              </HqCard>

              {/* Topics */}
              <HqCard>
                <p className="text-sm font-semibold">I can help with</p>
                <p className="mt-0.5 text-[12px] text-[#1A1A1A]/55">
                  Tags shown in the “I can help you with” section of your profile.
                </p>
                {topics.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {topics.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#EDE0DB] bg-[#FFFCFB] px-3 py-1 text-[12px] font-semibold"
                      >
                        {t}
                        <button
                          type="button"
                          onClick={() => setTopics((prev) => prev.filter((x) => x !== t))}
                          aria-label={`Remove ${t}`}
                          className="rounded-full p-0.5 hover:bg-[#EDE0DB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4907F]/30"
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <input
                    aria-label="Add a topic"
                    value={topicInput}
                    onChange={(e) => setTopicInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTopic();
                      }
                    }}
                    placeholder="e.g. Personal statement"
                    maxLength={60}
                    className={`min-w-0 flex-1 ${inputClass}`}
                  />
                  <button
                    type="button"
                    onClick={addTopic}
                    disabled={!topicInput.trim()}
                    aria-label="Add topic"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-[#1A1A1A] text-[#FAF5EF] transition hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4907F]/30"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </HqCard>

              {/* Phone */}
              <HqCard>
                <label htmlFor="forge-phone" className="text-sm font-semibold">
                  Contact phone
                </label>
                <p className="mt-0.5 text-[12px] text-[#1A1A1A]/55">
                  Private — used by UniPlug to reach you about sessions. Never shown to students.
                </p>
                <input
                  id="forge-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.slice(0, 20))}
                  type="tel"
                  inputMode="tel"
                  placeholder="e.g. +91 98765 43210"
                  className={`mt-3 ${inputClass}`}
                />
              </HqCard>

              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#1A1A1A] px-6 text-[14px] font-bold text-[#FAF5EF] transition hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4907F]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFFCFB]"
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Saving…
                  </>
                ) : (
                  "Save changes"
                )}
              </button>
            </div>
          )}
        </section>
      </div>
    </HqPageShell>
  );
}

function ReadOnlyField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1A1A1A]/55">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium">{value && value.trim() ? value : "—"}</p>
    </div>
  );
}

function VerificationPanel() {
  const { status, verifiedAt } = useMentorDashboard();

  if (verifiedAt) {
    return (
      <HqCard className="border-[#C4907F]/40 bg-[#F3E3DC]/50">
        <div className="flex items-start gap-3">
          <BadgeCheck
            className="mt-0.5 h-5 w-5 shrink-0"
            style={{ color: "#C4907F" }}
            aria-hidden="true"
          />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-display text-base font-semibold">You're a Verified Plug</p>
              <VerifiedBadge />
            </div>
            <p className="mt-1 text-[13px] text-[#1A1A1A]/70">
              Your college ID has been verified. Students see the verified badge on your profile.
            </p>
          </div>
        </div>
      </HqCard>
    );
  }

  if (status === "rejected") {
    return <ResubmitPanel />;
  }

  // pending / under review
  return (
    <HqCard className="border-[#C4907F]/40 bg-[#F3E3DC]/50">
      <div className="flex items-start gap-3">
        <Loader2
          className="mt-0.5 h-5 w-5 shrink-0 animate-spin"
          style={{ color: "#C4907F" }}
          aria-hidden="true"
        />
        <div>
          <p className="font-display text-base font-semibold">Verification in review</p>
          <p className="mt-1 text-[13px] text-[#1A1A1A]/70">
            We're checking your college ID to confirm you're a current student (India model — a
            student ID, not a .edu email or references). You'll be notified once you're approved.
          </p>
        </div>
      </div>
    </HqCard>
  );
}

// Rejected verification → the resubmit surface. Shows the admin's real reason,
// lets the mentor replace their college ID (and, on the enhanced track, their
// enrollment proof), then calls resubmit_mentor_application(). On success the
// layout's mentor row is invalidated so status flips rejected → pending and this
// panel re-renders as "in review" — no fabricated success.
function ResubmitPanel() {
  const { mentorId, verificationNotes } = useMentorDashboard();
  const queryClient = useQueryClient();

  const [idPhoto, setIdPhoto] = useState<File | null>(null);
  const [enrollPhoto, setEnrollPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The enrollment-proof re-upload is only offered on the enhanced track. Read
  // the tier straight from the row (not in context); fail-closed to "enhanced"
  // so the heavier-proof option is shown if the tier can't be read (mirrors
  // FinalizeMentor). The DB RPC is the real gate either way.
  const { data: tier } = useQuery<"standard" | "enhanced">({
    queryKey: ["mentor-tier", mentorId],
    queryFn: async () => {
      const { data, error: tierErr } = await supabase
        .from("mentors")
        .select("tier")
        .eq("id", mentorId)
        .maybeSingle();
      if (tierErr) throw tierErr;
      return (data?.tier as "standard" | "enhanced" | undefined) ?? "enhanced";
    },
  });

  async function resubmit() {
    setError(null);
    setBusy(true);
    try {
      if (idPhoto) {
        const path = await uploadMentorDocument(mentorId, idPhoto, "college-id");
        await setMentorIdDocument(mentorId, path);
      }
      if (tier === "enhanced" && enrollPhoto) {
        const enrollPath = await uploadMentorDocument(mentorId, enrollPhoto, "enrollment-proof");
        await setMentorEnrollmentDocument(mentorId, enrollPath);
      }
      await resubmitMentorApplication();
      // Refetch the layout's mentor row → status moves rejected → pending and
      // the whole HQ world-state flips with it.
      await queryClient.invalidateQueries({ queryKey: ["mentor-profile-header", mentorId] });
      toast.success("Application resubmitted — we'll review it again shortly.");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "We couldn't resubmit your application.";
      log.error({
        surface: "web",
        event: "mentor_resubmit_failed",
        kind: "mentor_resubmit",
        error: raw,
      });
      setError("We couldn't resubmit your application. Please check your uploads and try again.");
      setBusy(false);
    }
  }

  return (
    <HqCard className="border-[#D8432A]/40 bg-[#D8432A]/[0.06]">
      <div className="flex items-start gap-3">
        <ShieldAlert
          className="mt-0.5 h-5 w-5 shrink-0"
          style={{ color: "#C0392B" }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-semibold">Verification needs changes</p>
          <div className="mt-2 rounded-lg border-l-2 border-[#D8432A] bg-[#D8432A]/[0.07] px-3 py-2 text-[13px] text-[#1A1A1A]">
            {verificationNotes && verificationNotes.trim()
              ? verificationNotes
              : "Re-check that your college ID is current, clear, and matches your enrolment details."}
          </div>
          <p className="mt-2 text-[13px] text-[#1A1A1A]/70">
            Replace any documents that need updating, then resubmit to be re-reviewed. Reach out to
            support if you need a hand.
          </p>

          <div className="mt-4 flex flex-col gap-3">
            <ReuploadControl
              label={idPhoto ? "College ID replaced" : "Replace college ID"}
              fileName={idPhoto?.name ?? null}
              ariaLabel="Replace your college ID (optional)"
              disabled={busy}
              onSelect={setIdPhoto}
            />
            {tier === "enhanced" ? (
              <ReuploadControl
                label={enrollPhoto ? "Enrollment proof replaced" : "Replace enrollment proof"}
                fileName={enrollPhoto?.name ?? null}
                ariaLabel="Replace your proof of enrollment (optional)"
                disabled={busy}
                onSelect={setEnrollPhoto}
              />
            ) : null}

            {error ? (
              <p role="alert" className="text-[13px] font-medium text-[#C0392B]">
                {error}
              </p>
            ) : null}

            <button
              type="button"
              onClick={resubmit}
              disabled={busy}
              className="inline-flex h-11 w-fit items-center justify-center gap-2 rounded-md bg-[#1A1A1A] px-6 text-[14px] font-bold text-[#FAF5EF] transition hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4907F]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFFCFB]"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Resubmitting…
                </>
              ) : (
                "Resubmit application"
              )}
            </button>
          </div>
        </div>
      </div>
    </HqCard>
  );
}

function ReuploadControl({
  label,
  fileName,
  ariaLabel,
  disabled,
  onSelect,
}: {
  label: string;
  fileName: string | null;
  ariaLabel: string;
  disabled: boolean;
  onSelect: (file: File | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className={disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}>
        <input
          type="file"
          accept="image/*,application/pdf"
          aria-label={ariaLabel}
          className="hidden"
          disabled={disabled}
          onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
        />
        <span className="inline-flex items-center gap-2 rounded-md border border-[#1A1A1A]/15 bg-[#FFFCFB] px-4 py-2 text-[13px] font-semibold text-[#1A1A1A] transition hover:border-[#1A1A1A]/30">
          <UploadCloud className="h-4 w-4" aria-hidden="true" />
          {label}
        </span>
      </label>
      {fileName ? (
        <span className="min-w-0 truncate text-[12px] text-[#1A1A1A]/55">{fileName}</span>
      ) : null}
    </div>
  );
}
