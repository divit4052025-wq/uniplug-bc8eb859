import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Loader2, Plus, ShieldAlert, UploadCloud, X, Lock } from "lucide-react";
import { toast } from "sonner";

import { HqCard, HqPageShell } from "@/components/mentor-hq/HqPageShell";
import { VerifiedBadge } from "@/components/site/VerifiedBadge";
import { useMentorDashboard } from "@/components/mentor-dashboard/MentorDashboardContext";
import { supabase } from "@/integrations/supabase/client";
import { useOptimisticMutation } from "@/lib/hooks/useOptimisticMutation";
import {
  loadMentorProfile,
  saveMentorProfile,
  type MentorScalarProfile,
} from "@/components/mentor-dashboard/mentorProfileEdit";
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
    "w-full rounded-xl border border-[rgba(250,245,239,0.14)] bg-[rgba(250,245,239,0.04)] px-4 py-2.5 text-[14px] text-[color:var(--brand-paper)] placeholder:text-[color:var(--brand-ink-faint)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-rose)]";

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
            <p
              className="mt-4 flex items-center gap-1.5 text-[12px]"
              style={{ color: "var(--brand-ink-faint)" }}
            >
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
              <div
                className="flex items-center gap-2 text-sm"
                style={{ color: "var(--brand-ink-faint)" }}
              >
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading your profile…
              </div>
            </HqCard>
          ) : (
            <div className="space-y-5">
              {/* Photo */}
              <HqCard>
                <p className="text-sm font-semibold">Profile photo</p>
                <p className="mt-0.5 text-[12px]" style={{ color: "var(--brand-ink-faint)" }}>
                  JPEG, PNG or WebP · max 5 MB
                </p>
                <div className="mt-4 flex items-center gap-5">
                  <div className="relative h-20 w-20 shrink-0">
                    {photoUrl ? (
                      <img
                        src={photoUrl}
                        alt="Profile"
                        className="h-20 w-20 rounded-full object-cover ring-2 ring-[rgba(250,245,239,0.14)]"
                      />
                    ) : (
                      <div className="grid h-20 w-20 place-content-center rounded-full bg-[rgba(250,245,239,0.06)] font-display text-[22px] font-bold">
                        —
                      </div>
                    )}
                    {photoUploading ? (
                      <div className="absolute inset-0 flex items-center justify-center rounded-full bg-[rgba(8,7,6,0.6)]">
                        <Loader2
                          className="h-5 w-5 animate-spin"
                          style={{ color: "var(--brand-rose)" }}
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
                    <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(250,245,239,0.16)] px-4 py-2 text-[13px] font-semibold transition hover:border-[rgba(250,245,239,0.34)]">
                      <UploadCloud className="h-4 w-4" aria-hidden="true" />
                      {photoUrl ? "Change photo" : "Upload photo"}
                    </span>
                  </label>
                  {photoUrl ? (
                    <button
                      type="button"
                      onClick={() => setPhotoUrl(null)}
                      className="text-[12px] underline underline-offset-2"
                      style={{ color: "var(--brand-ink-faint)" }}
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
                <p className="mt-0.5 text-[12px]" style={{ color: "var(--brand-ink-faint)" }}>
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
                  style={{ color: bio.length >= BIO_MAX ? "#F4B5AA" : "var(--brand-ink-faint)" }}
                >
                  {bio.length}/{BIO_MAX}
                </p>
              </HqCard>

              {/* Topics */}
              <HqCard>
                <p className="text-sm font-semibold">I can help with</p>
                <p className="mt-0.5 text-[12px]" style={{ color: "var(--brand-ink-faint)" }}>
                  Tags shown in the “I can help you with” section of your profile.
                </p>
                {topics.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {topics.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(250,245,239,0.16)] bg-[rgba(250,245,239,0.06)] px-3 py-1 text-[12px] font-semibold"
                      >
                        {t}
                        <button
                          type="button"
                          onClick={() => setTopics((prev) => prev.filter((x) => x !== t))}
                          aria-label={`Remove ${t}`}
                          className="rounded-full p-0.5 hover:bg-[rgba(250,245,239,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-rose)]"
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
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[color:var(--brand-night)] transition hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-rose)]"
                    style={{ background: "var(--brand-rose)" }}
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
                <p className="mt-0.5 text-[12px]" style={{ color: "var(--brand-ink-faint)" }}>
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
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full px-8 text-[14px] font-semibold text-[color:var(--brand-night)] transition hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-rose)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--brand-night)]"
                style={{ background: "var(--brand-rose)" }}
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
      <p
        className="text-[11px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: "var(--brand-ink-faint)" }}
      >
        {label}
      </p>
      <p className="mt-1 text-sm font-medium">{value && value.trim() ? value : "—"}</p>
    </div>
  );
}

function VerificationPanel() {
  const { status, verifiedAt, verificationNotes } = useMentorDashboard();

  if (verifiedAt) {
    return (
      <HqCard className="border-[rgba(244,181,170,0.28)] bg-[rgba(244,181,170,0.07)]">
        <div className="flex items-start gap-3">
          <BadgeCheck
            className="mt-0.5 h-5 w-5 shrink-0"
            style={{ color: "var(--brand-rose)" }}
            aria-hidden="true"
          />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-display text-base font-semibold">You're a Verified Plug</p>
              <VerifiedBadge />
            </div>
            <p className="mt-1 text-[13px]" style={{ color: "var(--brand-ink-faint)" }}>
              Your college ID has been verified. Students see the verified badge on your profile.
            </p>
          </div>
        </div>
      </HqCard>
    );
  }

  if (status === "rejected") {
    return (
      <HqCard className="border-[rgba(216,67,42,0.3)] bg-[rgba(216,67,42,0.08)]">
        <div className="flex items-start gap-3">
          <ShieldAlert
            className="mt-0.5 h-5 w-5 shrink-0"
            style={{ color: "#F4B5AA" }}
            aria-hidden="true"
          />
          <div>
            <p className="font-display text-base font-semibold">Verification needs changes</p>
            <div
              className="mt-2 rounded-lg border-l-2 px-3 py-2 text-[13px]"
              style={{
                borderColor: "#D8432A",
                background: "rgba(216,67,42,0.1)",
                color: "var(--brand-paper)",
              }}
            >
              {verificationNotes && verificationNotes.trim()
                ? verificationNotes
                : "Re-check that your college ID is current, clear, and matches your enrolment details."}
            </div>
            <p className="mt-2 text-[13px]" style={{ color: "var(--brand-ink-faint)" }}>
              Update your details and re-upload your college ID to be re-reviewed. Reach out to
              support if you need a hand.
            </p>
          </div>
        </div>
      </HqCard>
    );
  }

  // pending / under review
  return (
    <HqCard className="border-[rgba(244,181,170,0.28)] bg-[rgba(244,181,170,0.06)]">
      <div className="flex items-start gap-3">
        <Loader2
          className="mt-0.5 h-5 w-5 shrink-0 animate-spin"
          style={{ color: "var(--brand-rose)" }}
          aria-hidden="true"
        />
        <div>
          <p className="font-display text-base font-semibold">Verification in review</p>
          <p className="mt-1 text-[13px]" style={{ color: "var(--brand-ink-faint)" }}>
            We're checking your college ID to confirm you're a current student (India model — a
            student ID, not a .edu email or references). You'll be notified once you're approved.
          </p>
        </div>
      </div>
    </HqCard>
  );
}
