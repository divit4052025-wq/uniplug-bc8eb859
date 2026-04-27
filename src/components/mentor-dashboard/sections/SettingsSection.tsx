import { useEffect, useRef, useState } from "react";
import { Plus, X, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const BIO_MAX = 500;
const ACCEPTED_IMAGE = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MB

export function SettingsSection({ mentorId }: { mentorId: string }) {
  const [bio, setBio] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [topicInput, setTopicInput] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);

  // ── Load current values ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("mentors")
      .select("bio, topics, photo_url")
      .eq("id", mentorId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setBio(data?.bio ?? "");
        setTopics(Array.isArray(data?.topics) ? (data.topics as string[]) : []);
        setPhotoUrl(data?.photo_url ?? null);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [mentorId]);

  // ── Topics helpers ───────────────────────────────────────────────────────
  const addTopic = () => {
    const trimmed = topicInput.trim();
    if (!trimmed) return;
    if (topics.includes(trimmed)) { setTopicInput(""); return; }
    setTopics((prev) => [...prev, trimmed]);
    setTopicInput("");
  };

  const removeTopic = (t: string) => setTopics((prev) => prev.filter((x) => x !== t));

  const onTopicKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); addTopic(); }
  };

  // ── Photo upload ─────────────────────────────────────────────────────────
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
      const { data: urlData } = supabase.storage
        .from("mentor-photos")
        .getPublicUrl(path);
      setPhotoUrl(urlData.publicUrl);
      toast.success("Photo uploaded — click Save Changes to keep it.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Photo upload failed.");
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  // ── Save ─────────────────────────────────────────────────────────────────
  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("mentors")
      .update({ bio: bio.trim() || null, topics, photo_url: photoUrl })
      .eq("id", mentorId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Profile saved.");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#C4907F]" />
      </div>
    );
  }

  const initials = ""; // photo fallback handled below

  return (
    <div className="mx-auto max-w-[680px] space-y-10 pb-20 pt-2">
      <div>
        <h2 className="font-display text-[24px] font-semibold text-[#1A1A1A]">Profile Settings</h2>
        <p className="mt-1 text-[13px] text-[#1A1A1A]/60">
          This information appears on your public mentor profile.
        </p>
      </div>

      {/* ── Photo ── */}
      <section className="rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-6">
        <h3 className="text-[14px] font-semibold text-[#1A1A1A]">Profile Photo</h3>
        <p className="mt-0.5 text-[12px] text-[#1A1A1A]/60">JPEG, PNG or WebP · max 5 MB</p>
        <div className="mt-4 flex items-center gap-5">
          {/* Preview */}
          <div className="relative h-20 w-20 shrink-0">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt="Profile"
                className="h-20 w-20 rounded-full object-cover ring-2 ring-[#EDE0DB]"
              />
            ) : (
              <div className="grid h-20 w-20 place-content-center rounded-full bg-[#EDE0DB] font-display text-[22px] font-semibold text-[#1A1A1A]">
                —
              </div>
            )}
            {photoUploading && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-white/70">
                <Loader2 className="h-5 w-5 animate-spin text-[#C4907F]" />
              </div>
            )}
          </div>
          {/* Upload button */}
          <label className="cursor-pointer">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => handlePhoto(e.target.files)}
              disabled={photoUploading}
            />
            <span className="inline-flex items-center gap-2 rounded-full border border-[#1A1A1A]/20 bg-[#FFFCFB] px-4 py-2 text-[13px] font-medium text-[#1A1A1A] transition hover:border-[#C4907F] hover:text-[#C4907F]">
              <UploadCloud className="h-4 w-4" />
              {photoUrl ? "Change photo" : "Upload photo"}
            </span>
          </label>
          {photoUrl && (
            <button
              type="button"
              onClick={() => setPhotoUrl(null)}
              className="text-[12px] text-[#1A1A1A]/50 hover:text-destructive"
            >
              Remove
            </button>
          )}
        </div>
      </section>

      {/* ── Bio ── */}
      <section className="rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-6">
        <h3 className="text-[14px] font-semibold text-[#1A1A1A]">About Me</h3>
        <p className="mt-0.5 text-[12px] text-[#1A1A1A]/60">
          Shown as the "About Me" section on your public profile.
        </p>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
          placeholder="Tell students about your journey, what you study, and what kind of guidance you offer…"
          rows={5}
          className="mt-3 w-full resize-none rounded-xl border border-[#EDE0DB] bg-[#FFFCFB] px-4 py-3 text-[14px] leading-relaxed text-[#1A1A1A] placeholder:text-[#1A1A1A]/40 focus:border-[#C4907F] focus:outline-none focus:ring-2 focus:ring-[#C4907F]/20"
        />
        <p className={`mt-1 text-right text-[11px] ${bio.length >= BIO_MAX ? "text-destructive" : "text-[#1A1A1A]/40"}`}>
          {bio.length}/{BIO_MAX}
        </p>
      </section>

      {/* ── Topics ── */}
      <section className="rounded-2xl border border-[#EDE0DB] bg-[#FFFCFB] p-6">
        <h3 className="text-[14px] font-semibold text-[#1A1A1A]">I Can Help With</h3>
        <p className="mt-0.5 text-[12px] text-[#1A1A1A]/60">
          Tags shown in the "I Can Help You With" section on your profile.
        </p>

        {/* Existing tags */}
        {topics.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {topics.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#1A1A1A] px-3 py-1 text-[12px] font-medium text-[#FFFCFB]"
              >
                {t}
                <button
                  type="button"
                  onClick={() => removeTopic(t)}
                  aria-label={`Remove ${t}`}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-white/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Add topic input */}
        <div className="mt-3 flex gap-2">
          <input
            value={topicInput}
            onChange={(e) => setTopicInput(e.target.value)}
            onKeyDown={onTopicKeyDown}
            placeholder="e.g. Personal Statement"
            maxLength={60}
            className="min-w-0 flex-1 rounded-xl border border-[#EDE0DB] bg-[#FFFCFB] px-3 py-2.5 text-[13px] text-[#1A1A1A] placeholder:text-[#1A1A1A]/40 focus:border-[#C4907F] focus:outline-none focus:ring-2 focus:ring-[#C4907F]/20"
          />
          <button
            type="button"
            onClick={addTopic}
            disabled={!topicInput.trim()}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#C4907F] text-white transition hover:opacity-90 disabled:opacity-40"
            aria-label="Add topic"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-[11px] text-[#1A1A1A]/50">
          Press Enter or click + to add a topic.
        </p>
      </section>

      {/* ── Save ── */}
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#C4907F] px-6 text-[14px] font-medium text-white transition hover:opacity-90 disabled:opacity-60 sm:w-auto sm:px-10"
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving…
          </>
        ) : (
          "Save Changes"
        )}
      </button>
    </div>
  );
}
