// P9 — in-dashboard student profile editor. Rendered inside the dashboard
// Settings branch (mirrors the mentor SettingsSection shape). Edits only the
// consent_column_lock-allowlisted students columns + the owner-RLS interest
// join-tables (row-level INSERT/DELETE). See profileEdit.ts for the column/RLS
// contract this UI is bound to.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { inputClass } from "@/components/site/AuthShell";
import { Caption } from "@/components/signup/Labeled";
import { RefMultiSelect } from "@/components/signup/RefMultiSelect";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/state-views";
import { useOptimisticMutation } from "@/lib/hooks/useOptimisticMutation";
import { BOARDS, COUNTRIES } from "@/components/student-signup/constants";
import { ACCEPTED_IMAGE_INPUT, UNSUPPORTED_IMAGE_MESSAGE, isAcceptedImage } from "@/lib/images";
import { formatBookingDate } from "@/lib/time";
import type { RefItem, RefKind } from "@/components/signup/types";
import {
  type AxisConfig,
  type AxisItem,
  type ProjectItem,
  type ScalarEdits,
  type StudentScalarProfile,
  SIMPLE_AXES,
  TARGET_UNI_AXIS,
  fileRefAddRequest,
  insertProject,
  loadProjects,
  loadScalarProfile,
  removeProject,
  replaceProfilePhoto,
  saveScalarProfile,
  signedPhotoUrl,
} from "@/components/dashboard/profileEdit";

const scalarKey = (userId: string) => ["student-profile-edit", userId] as const;
const photoUrlKey = (userId: string, path: string | null) =>
  ["student-photo-url", userId, path] as const;
const mySchoolsKey = (userId: string) => ["my-schools", userId] as const;

export function ProfileSection({ studentId }: { studentId: string }) {
  return (
    <div className="space-y-10">
      <BasicDetailsCard studentId={studentId} />
      <div className="space-y-6">
        <h3 className="font-display text-[18px] font-semibold text-brand-dark">
          Interests &amp; targets
        </h3>
        <p className="-mt-4 text-[13px] font-light text-brand-dark/60">
          These power your mentor matches. Add or remove anytime — changes save instantly.
        </p>
        {SIMPLE_AXES.map((axis) => (
          <RefAxisEditor key={axis.kind} studentId={studentId} axis={axis} />
        ))}
        <RefAxisEditor
          studentId={studentId}
          axis={TARGET_UNI_AXIS}
          alsoInvalidate={[mySchoolsKey(studentId)]}
        />
        <ProjectsEditor studentId={studentId} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Basic details (scalar students columns + photo) — single Save
// ─────────────────────────────────────────────────────────────────────────────

function BasicDetailsCard({ studentId }: { studentId: string }) {
  const qc = useQueryClient();
  const key = scalarKey(studentId);

  const {
    data: profile,
    isLoading,
    isError,
    refetch,
  } = useQuery<StudentScalarProfile>({
    queryKey: key,
    queryFn: () => loadScalarProfile(studentId),
  });

  const [form, setForm] = useState<ScalarEdits | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Seed the editable form from server truth. Re-seeds only when the cached
  // profile reference changes (initial load + post-save refetch), which carries
  // the values the user just saved — so it never clobbers an in-progress edit.
  useEffect(() => {
    if (!profile) return;
    setForm({
      full_name: profile.full_name,
      phone: profile.phone,
      school: profile.school,
      countries: profile.countries,
      board: profile.board,
      bio: profile.bio,
    });
  }, [profile]);

  const { data: existingPhotoUrl } = useQuery({
    queryKey: photoUrlKey(studentId, profile?.photo_url ?? null),
    enabled: !!profile?.photo_url,
    queryFn: () => signedPhotoUrl(profile?.photo_url as string),
  });

  const save = useOptimisticMutation<StudentScalarProfile, ScalarEdits, void>({
    mutationFn: async (edits) => {
      await saveScalarProfile(studentId, edits);
      if (photoFile) await replaceProfilePhoto(studentId, photoFile, profile?.photo_url ?? null);
    },
    queryKeys: [key],
    optimisticUpdate: (old, edits) => (old ? { ...old, ...edits } : old),
    successMessage: "Profile updated.",
    errorMessage: (err) => (err instanceof Error ? err.message : "Couldn't save your profile."),
    mutationOptions: {
      onSuccess: () => {
        setPhotoFile(null);
        setPhotoPreview(null);
        // The dashboard topbar greeting + finalize gate read this key.
        void qc.invalidateQueries({ queryKey: ["student-profile", studentId] });
        if (profile?.photo_url) {
          void qc.invalidateQueries({ queryKey: photoUrlKey(studentId, profile.photo_url) });
        }
      },
    },
  });

  if (isLoading || !form) {
    return (
      <div className="py-2">
        <LoadingSkeleton rows={4} ariaLabel="Loading your profile" />
      </div>
    );
  }
  if (isError) {
    return <ErrorBanner message="Couldn't load your profile." onRetry={() => void refetch()} />;
  }

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Guard BEFORE preview + staging-for-upload: reject non-renderable formats
    // (e.g. HEIC) so they never become a broken preview or a stored-but-unshowable
    // object.
    if (!isAcceptedImage(file)) {
      toast.error(UNSUPPORTED_IMAGE_MESSAGE);
      e.target.value = "";
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const toggleCountry = (c: string) => {
    setForm((f) =>
      f
        ? {
            ...f,
            countries: f.countries.includes(c)
              ? f.countries.filter((x) => x !== c)
              : [...f.countries, c],
          }
        : f,
    );
  };

  const dirty =
    !!photoFile ||
    form.full_name !== profile?.full_name ||
    form.phone !== profile?.phone ||
    form.school !== profile?.school ||
    (form.board ?? "") !== (profile?.board ?? "") ||
    (form.bio ?? "") !== (profile?.bio ?? "") ||
    form.countries.join("|") !== (profile?.countries ?? []).join("|");

  const nameValid = form.full_name.trim().length > 0;

  return (
    <section aria-label="Basic details" className="space-y-5">
      <h3 className="font-display text-[18px] font-semibold text-brand-dark">Your profile</h3>

      <div className="flex items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-blush">
          {photoPreview || existingPhotoUrl ? (
            <img
              src={photoPreview ?? (existingPhotoUrl as string)}
              alt="Your profile photo"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-[11px] font-light text-brand-dark/50">No photo</span>
          )}
        </div>
        <label className="cursor-pointer rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:border-primary/50 focus-within:ring-4 focus-within:ring-primary/15">
          {photoFile || existingPhotoUrl ? "Change photo" : "Upload photo"}
          <input type="file" accept={ACCEPTED_IMAGE_INPUT} className="sr-only" onChange={onPhoto} />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <LabeledInput
          label="Full name"
          value={form.full_name}
          onChange={(v) => setForm((f) => (f ? { ...f, full_name: v } : f))}
          invalid={!nameValid}
          error={!nameValid ? "Your name can't be empty." : undefined}
        />
        <LabeledInput
          label="Phone"
          type="tel"
          value={form.phone}
          onChange={(v) => setForm((f) => (f ? { ...f, phone: v } : f))}
        />
      </div>

      <Caption label="School">
        <input
          aria-label="School"
          className={inputClass}
          value={form.school}
          onChange={(e) => setForm((f) => (f ? { ...f, school: e.target.value } : f))}
          placeholder="Your school"
        />
      </Caption>

      <Caption label="Board">
        <select
          aria-label="Board"
          className={inputClass}
          value={form.board ?? ""}
          onChange={(e) => setForm((f) => (f ? { ...f, board: e.target.value || null } : f))}
        >
          <option value="">Select a board</option>
          {BOARDS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </Caption>

      <Caption label="Target countries">
        <ul className="flex flex-wrap gap-2">
          {COUNTRIES.map((c) => {
            const on = form.countries.includes(c);
            return (
              <li key={c}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleCountry(c)}
                  className={
                    on
                      ? "inline-flex h-9 items-center rounded-full bg-primary px-3.5 text-[12px] font-medium text-primary-foreground"
                      : "inline-flex h-9 items-center rounded-full border border-border px-3.5 text-[12px] font-medium text-foreground transition hover:border-primary"
                  }
                >
                  {c}
                </button>
              </li>
            );
          })}
        </ul>
      </Caption>

      <Caption label="Short bio">
        <textarea
          aria-label="Short bio"
          className={`${inputClass} min-h-[100px] resize-y`}
          value={form.bio ?? ""}
          onChange={(e) => setForm((f) => (f ? { ...f, bio: e.target.value || null } : f))}
          placeholder="Tell mentors a little about yourself."
        />
      </Caption>

      {/* Date of birth is read-only here: the students_dob_immutable trigger
          rejects changes once a DOB is set. To correct it, students contact
          support (admin-mediated). */}
      <Caption label="Date of birth">
        <p className="rounded-xl border border-border bg-secondary/30 px-4 py-3 text-sm font-light text-foreground/70">
          {profile?.date_of_birth ? formatBookingDate(profile.date_of_birth) : "Not set"}
          <span className="ml-2 text-[11px] text-muted-foreground">
            (contact support to change)
          </span>
        </p>
      </Caption>

      <div className="flex justify-end pt-1">
        <button
          type="button"
          disabled={!dirty || !nameValid || save.isPending}
          onClick={() => form && save.mutate(form)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-[14px] font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {save.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </section>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
  invalid,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  invalid?: boolean;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-foreground/70">
        {label}
      </span>
      <input
        type={type}
        className={inputClass}
        value={value}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && (
        <span role="alert" className="mt-1 block text-xs text-destructive">
          {error}
        </span>
      )}
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic interest-axis editor (4 simple axes + target universities)
// ─────────────────────────────────────────────────────────────────────────────

function RefAxisEditor({
  studentId,
  axis,
  alsoInvalidate = [],
}: {
  studentId: string;
  axis: AxisConfig;
  alsoInvalidate?: readonly (readonly unknown[])[];
}) {
  const qc = useQueryClient();
  const queryKey = ["profile-axis", axis.kind, studentId] as const;

  const {
    data: items = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<AxisItem[]>({ queryKey, queryFn: () => axis.load(studentId) });

  const invalidateExtras = () => {
    for (const k of alsoInvalidate) void qc.invalidateQueries({ queryKey: k as unknown[] });
  };

  const add = useOptimisticMutation<AxisItem[], { refId: string; name: string }, AxisItem>({
    mutationFn: (v) => axis.insert(studentId, v.refId, v.name),
    queryKeys: [queryKey],
    optimisticUpdate: (old, v) => [
      ...(old ?? []),
      { rowId: `tmp-${v.refId}`, refId: v.refId, name: v.name },
    ],
    errorMessage: "Couldn't add that. Please try again.",
    mutationOptions: { onSuccess: invalidateExtras },
  });

  const removeItem = useOptimisticMutation<AxisItem[], string, void>({
    mutationFn: (rowId) => axis.remove(rowId),
    queryKeys: [queryKey],
    optimisticUpdate: (old, rowId) => (old ?? []).filter((i) => i.rowId !== rowId),
    errorMessage: "Couldn't remove that. Please try again.",
    mutationOptions: { onSuccess: invalidateExtras },
  });

  // RefMultiSelect is used purely as a picker (value held empty); each pick
  // either inserts a row (canonical id) or files a request-to-add (id === null).
  const onPick = (picked: RefItem[]) => {
    for (const p of picked) {
      const dedupeId = p.id ?? `name:${p.name}`;
      if (items.some((i) => i.refId === dedupeId)) continue;
      if (axis.kind === "university") {
        // student_schools stores the name directly; an unresolved uni is still
        // saved by name (no canonical link).
        add.mutate({ refId: dedupeId, name: p.name });
        continue;
      }
      if (p.id === null) {
        void fileRefAddRequest(axis.kind, p.name).then(() =>
          toast.success(`Thanks — we'll review “${p.name}”.`),
        );
        continue;
      }
      add.mutate({ refId: p.id, name: p.name });
    }
  };

  return (
    <Caption label={axis.label}>
      {isError ? (
        <ErrorBanner
          message={`Couldn't load ${axis.label.toLowerCase()}.`}
          onRetry={() => void refetch()}
        />
      ) : (
        <>
          {isLoading ? (
            <p className="mb-2 text-[12px] font-light text-foreground/40">Loading…</p>
          ) : items.length > 0 ? (
            <ul className="mb-2 flex flex-wrap gap-1.5" aria-label={`Selected ${axis.label}`}>
              {items.map((item) => (
                <li key={item.rowId}>
                  <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
                    {item.name}
                    <button
                      type="button"
                      aria-label={`Remove ${item.name}`}
                      disabled={item.rowId.startsWith("tmp-")}
                      onClick={() => removeItem.mutate(item.rowId)}
                      className="inline-flex items-center justify-center rounded-full p-0.5 transition hover:bg-foreground/10 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background disabled:opacity-40"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-2 text-[12px] font-light text-foreground/40">None added yet.</p>
          )}
          <RefMultiSelect
            kind={axis.kind as RefKind}
            value={[]}
            onChange={onPick}
            ariaLabel={`Add ${axis.label}`}
            placeholder={`Add ${axis.label.toLowerCase()}…`}
          />
        </>
      )}
    </Caption>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Projects editor — student_project_categories(project_category_id, detail)
// ─────────────────────────────────────────────────────────────────────────────

function ProjectsEditor({ studentId }: { studentId: string }) {
  const queryKey = ["profile-projects", studentId] as const;
  const {
    data: items = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<ProjectItem[]>({ queryKey, queryFn: () => loadProjects(studentId) });

  const [category, setCategory] = useState<RefItem[]>([]);
  const [detail, setDetail] = useState("");

  const add = useOptimisticMutation<
    ProjectItem[],
    { categoryId: string; categoryName: string; detail: string },
    void
  >({
    mutationFn: (v) => insertProject(studentId, v.categoryId, v.detail),
    queryKeys: [queryKey],
    optimisticUpdate: (old, v) => [
      ...(old ?? []),
      {
        rowId: `tmp-${v.categoryId}-${v.detail}`,
        categoryId: v.categoryId,
        categoryName: v.categoryName,
        detail: v.detail,
      },
    ],
    errorMessage: "Couldn't add that project. Please try again.",
  });

  const removeItem = useOptimisticMutation<ProjectItem[], string, void>({
    mutationFn: (rowId) => removeProject(rowId),
    queryKeys: [queryKey],
    optimisticUpdate: (old, rowId) => (old ?? []).filter((i) => i.rowId !== rowId),
    errorMessage: "Couldn't remove that project. Please try again.",
  });

  const picked = category[0] ?? null;

  const onAdd = () => {
    if (!picked) return;
    if (picked.id === null) {
      void fileRefAddRequest("project_category", picked.name).then(() =>
        toast.success(`Thanks — we'll review “${picked.name}”.`),
      );
      setCategory([]);
      setDetail("");
      return;
    }
    add.mutate({ categoryId: picked.id, categoryName: picked.name, detail: detail.trim() });
    setCategory([]);
    setDetail("");
  };

  const canAdd = useMemo(() => !!picked?.id, [picked]);

  return (
    <Caption label="Academic / science projects">
      {isError ? (
        <ErrorBanner message="Couldn't load your projects." onRetry={() => void refetch()} />
      ) : (
        <div className="space-y-3">
          {isLoading ? (
            <p className="text-[12px] font-light text-foreground/40">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-[12px] font-light text-foreground/40">No projects added yet.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((p) => (
                <li
                  key={p.rowId}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-foreground">{p.categoryName}</p>
                    {p.detail && (
                      <p className="mt-0.5 text-[12px] font-light text-foreground/70">{p.detail}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${p.categoryName} project`}
                    disabled={p.rowId.startsWith("tmp-")}
                    onClick={() => removeItem.mutate(p.rowId)}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-foreground/40 transition hover:bg-secondary hover:text-foreground disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-xl border border-dashed border-border p-3">
            <RefMultiSelect
              kind="project_category"
              value={category}
              onChange={setCategory}
              max={1}
              closeOnSelect
              ariaLabel="Project category"
              placeholder="Pick a project category…"
            />
            <input
              aria-label="Project detail"
              className={`${inputClass} mt-2`}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Title — short description (optional)"
            />
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                disabled={!canAdd || add.isPending}
                onClick={onAdd}
                className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-[12px] font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                Add project
              </button>
            </div>
          </div>
        </div>
      )}
    </Caption>
  );
}
