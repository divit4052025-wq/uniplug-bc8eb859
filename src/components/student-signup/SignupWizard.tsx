// P7 — the 10-step pre-account student signup wizard. PRE-AUTH: scalars ride in
// the auth.signUp metadata that handle_new_user reads; the rich join-table
// selections are stashed on the device and replayed in the authenticated
// finalize step. Built on the existing design system (AuthShell primitives,
// the wrapped ref-data typeahead, the mascot engine) with brand fonts scoped via
// WizardShell's .signup-wizard wrapper.
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Confirmation, Field, inputClass } from "@/components/site/AuthShell";
import { MultiSelect } from "@/components/site/MultiSelect";
import { Mascot } from "@/components/mascots/Mascot";
import { MASCOTS } from "@/components/mascots/mascot-data";
import { supabase } from "@/integrations/supabase/client";
import { log, looksLikeEmailSendFailure } from "@/lib/log";
import { WizardShell, type WizardStepMeta } from "./WizardShell";
import { MascotGradePicker } from "./fields/MascotGradePicker";
import { ProjectsField } from "./fields/ProjectsField";
import { RefMultiSelect } from "./fields/RefMultiSelect";
import { SchoolTypeahead } from "./fields/SchoolTypeahead";
import { Caption, FieldError } from "./fields/Labeled";
import { saveProfileDraft } from "./draft";
import { BOARDS, COUNTRIES, consentRequired, isUnder18, LEGAL_VERSION } from "./constants";
import type { ProjectDraft, RefItem } from "./types";

const ALL_STEPS: (WizardStepMeta & { title: string; hint?: string })[] = [
  {
    key: "basics",
    label: "Basics",
    title: "Let's start with you",
    hint: "The essentials to set up your account.",
  },
  {
    key: "school",
    label: "School",
    title: "Where do you study?",
    hint: "Your school, board and the subjects you take.",
  },
  {
    key: "grade",
    label: "Grade",
    title: "What grade are you in?",
    hint: "Pick the mascot that matches your year.",
  },
  {
    key: "universities",
    label: "Targets",
    title: "Dream universities",
    hint: "Add the universities you're aiming for — this powers your mentor matches.",
  },
  {
    key: "courses",
    label: "Courses",
    title: "What might you study?",
    hint: "Courses or fields you're considering. Optional.",
  },
  {
    key: "sports",
    label: "Sports",
    title: "Sports you play",
    hint: "Add any sports you're involved in. Optional.",
  },
  {
    key: "beyond",
    label: "Beyond",
    title: "Beyond academics",
    hint: "Co-curriculars and any academic or science projects. Optional.",
  },
  {
    key: "about",
    label: "About",
    title: "A little about you",
    hint: "A short bio in your own words. Optional.",
  },
  {
    key: "consent",
    label: "Consent",
    title: "Parental consent",
    hint: "A quick step because you're under 18.",
  },
  {
    key: "account",
    label: "Account",
    title: "Create your account",
    hint: "Set a password and you're in.",
  },
];

export function SignupWizard() {
  const navigate = useNavigate();

  // Scalars → auth.signUp metadata.
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [grade, setGrade] = useState("");
  const [school, setSchool] = useState("");
  const [board, setBoard] = useState("");
  const [bio, setBio] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [countries, setCountries] = useState<string[]>([]);

  // Rich selections → stashed, replayed at finalize.
  const [subjects, setSubjects] = useState<RefItem[]>([]);
  const [targetUniversities, setTargetUniversities] = useState<RefItem[]>([]);
  const [courses, setCourses] = useState<RefItem[]>([]);
  const [sports, setSports] = useState<RefItem[]>([]);
  const [cocurriculars, setCocurriculars] = useState<RefItem[]>([]);
  const [projects, setProjects] = useState<ProjectDraft[]>([]);

  // Account.
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agreed, setAgreed] = useState(false);

  // Flow.
  const [current, setCurrent] = useState<string>("basics");
  const [visited, setVisited] = useState<Set<string>>(() => new Set(["basics"]));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  const minor = consentRequired(dob, grade);
  const under18 = isUnder18(dob);

  // The consent step only exists for a consent-requiring student.
  const steps = useMemo(() => ALL_STEPS.filter((s) => s.key !== "consent" || minor), [minor]);
  const idx = Math.max(
    0,
    steps.findIndex((s) => s.key === current),
  );
  const step = steps[idx] ?? steps[0];
  const maxReached = Math.max(
    0,
    ...[...visited].map((k) => steps.findIndex((s) => s.key === k)).filter((i) => i >= 0),
  );

  // aria-describedby helper for native inputs that have an error.
  const describe = (key: string) => (errors[key] ? `${key}-error` : undefined);

  function validate(key: string): Record<string, string> {
    const e: Record<string, string> = {};
    const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
    if (key === "basics") {
      if (!fullName.trim()) e.fullName = "Required";
      if (!isEmail(email)) e.email = "Enter a valid email";
      if (phone.trim().length < 6) e.phone = "Enter a valid phone number";
      const d = new Date(`${dob}T00:00:00`);
      if (!dob || Number.isNaN(d.getTime()) || d > new Date() || d.getFullYear() < 1900)
        e.dob = "Enter a valid date of birth";
      if (under18) {
        if (!isEmail(parentEmail)) e.parentEmail = "Parent's email is required";
        if (parentPhone.trim().length < 6) e.parentPhone = "Parent's phone is required";
      }
    } else if (key === "school") {
      if (!school.trim()) e.school = "Required";
    } else if (key === "grade") {
      if (!grade) e.grade = "Pick your grade";
    } else if (key === "consent") {
      // Parent contact not yet collected (the gated-grade-but-18+ case).
      if (!under18) {
        if (!isEmail(parentEmail)) e.parentEmail = "Parent's email is required";
        if (parentPhone.trim().length < 6) e.parentPhone = "Parent's phone is required";
      }
    } else if (key === "account") {
      if (password.length < 8) e.password = "At least 8 characters";
      if (confirm !== password) e.confirm = "Passwords don't match";
      if (!agreed) e.agreed = "Please accept the Terms & Privacy Policy";
    }
    return e;
  }

  const goTo = (key: string) => {
    setErrors({});
    setCurrent(key);
    setVisited((v) => new Set(v).add(key));
  };

  const onBack = idx > 0 ? () => goTo(steps[idx - 1].key) : undefined;

  const onNext = () => {
    const e = validate(step.key);
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    if (step.key === "account") {
      void submit();
      return;
    }
    const next = steps[idx + 1];
    if (next) goTo(next.key);
  };

  async function submit() {
    setServerError(null);
    setSubmitting(true);
    // Stash the rich selections for the authenticated finalize replay.
    saveProfileDraft({ subjects, targetUniversities, courses, sports, cocurriculars, projects });
    const needsConsent = consentRequired(dob, grade);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: {
            role: "student",
            full_name: fullName.trim(),
            phone: phone.trim(),
            school: school.trim(),
            grade,
            countries,
            date_of_birth: dob,
            parent_email: needsConsent ? parentEmail.trim() : "",
            parent_phone: needsConsent ? parentPhone.trim() : "",
            board: board || "",
            bio: bio.trim(),
            terms_version: LEGAL_VERSION,
            privacy_version: LEGAL_VERSION,
          },
        },
      });
      if (error) throw error;
      if (data.session) {
        // Auto-confirmed → go straight to finalize (replays the stash).
        navigate({ to: "/student-signup/finalize" });
      } else {
        setPendingEmail(email.trim());
        setSubmitting(false);
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Something went wrong";
      log.error({
        surface: "web",
        event: "auth_signup_failed",
        alert: looksLikeEmailSendFailure(raw),
        kind: "student_signup",
        error: raw,
      });
      setServerError(
        /database error saving new user/i.test(raw)
          ? "We couldn't create your account. Please check your details and try again."
          : raw,
      );
      setSubmitting(false);
    }
  }

  const onResend = async () => {
    if (!pendingEmail || resendState !== "idle") return;
    setResendState("sending");
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: pendingEmail,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) {
      log.error({
        surface: "web",
        event: "auth_email_send_failed",
        alert: looksLikeEmailSendFailure(error.message),
        kind: "signup_confirmation_resend",
        error: error.message,
      });
      setResendState("idle");
      return;
    }
    setResendState("sent");
  };

  if (pendingEmail) {
    return (
      <div className="signup-wizard">
        <Confirmation
          heading="Check your email to confirm your account"
          body={
            minor
              ? `We sent a confirmation link to ${pendingEmail}. Because you're under 18, we've also emailed your parent a consent request — you'll be able to book sessions once they approve. After you confirm, we'll help you finish your profile.`
              : `We sent a confirmation link to ${pendingEmail}. Click the link to activate your account, then finish setting up your profile.`
          }
        >
          <button
            type="button"
            onClick={onResend}
            disabled={resendState !== "idle"}
            className="text-sm font-semibold text-primary underline-offset-4 transition hover:underline disabled:opacity-60"
          >
            {resendState === "sending"
              ? "Resending…"
              : "Didn't receive it? Resend confirmation email"}
          </button>
          <span role="status" aria-live="polite" className="sr-only">
            {resendState === "sent" ? "Confirmation email resent" : ""}
          </span>
        </Confirmation>
      </div>
    );
  }

  return (
    <WizardShell
      steps={steps}
      stepIndex={idx}
      maxReached={maxReached}
      onJump={(i) => {
        const k = steps[i]?.key;
        if (k && visited.has(k)) goTo(k);
      }}
      title={step.title}
      hint={step.hint}
      onBack={onBack}
      onNext={onNext}
      nextLabel={step.key === "account" ? "Create account" : "Continue"}
      nextLoading={submitting}
    >
      {step.key === "basics" && (
        <div className="space-y-5">
          <Field label="Full name">
            <input
              className={inputClass}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Aanya Sharma"
              aria-invalid={!!errors.fullName}
              aria-describedby={describe("fullName")}
            />
            <FieldError id="fullName-error">{errors.fullName}</FieldError>
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Email address">
              <input
                className={inputClass}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                aria-invalid={!!errors.email}
                aria-describedby={describe("email")}
              />
              <FieldError id="email-error">{errors.email}</FieldError>
            </Field>
            <Field label="Phone number">
              <input
                className={inputClass}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                aria-invalid={!!errors.phone}
                aria-describedby={describe("phone")}
              />
              <FieldError id="phone-error">{errors.phone}</FieldError>
            </Field>
          </div>
          <Field label="Date of birth">
            <input
              className={inputClass}
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              aria-invalid={!!errors.dob}
              aria-describedby={errors.dob ? "dob-error dob-hint" : "dob-hint"}
            />
            <p id="dob-hint" className="mt-1 text-[11px] font-light text-muted-foreground">
              Used to check whether parental consent is required.
            </p>
            <FieldError id="dob-error">{errors.dob}</FieldError>
          </Field>
          {under18 && (
            <div className="rounded-2xl border border-dashed border-border bg-brand-cream/40 p-4">
              <p className="text-[13px] font-medium text-foreground">Parent or guardian details</p>
              <p className="mt-1 text-[12px] font-light text-muted-foreground">
                Because you&apos;re under 18, we&apos;ll email your parent to give consent before
                you can book sessions.
              </p>
              <div className="mt-3 grid gap-5 sm:grid-cols-2">
                <Field label="Parent's email">
                  <input
                    className={inputClass}
                    type="email"
                    value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                    placeholder="parent@example.com"
                    aria-invalid={!!errors.parentEmail}
                    aria-describedby={describe("parentEmail")}
                  />
                  <FieldError id="parentEmail-error">{errors.parentEmail}</FieldError>
                </Field>
                <Field label="Parent's phone">
                  <input
                    className={inputClass}
                    value={parentPhone}
                    onChange={(e) => setParentPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    aria-invalid={!!errors.parentPhone}
                    aria-describedby={describe("parentPhone")}
                  />
                  <FieldError id="parentPhone-error">{errors.parentPhone}</FieldError>
                </Field>
              </div>
            </div>
          )}
        </div>
      )}

      {step.key === "school" && (
        <div className="space-y-5">
          <Field label="School name">
            <SchoolTypeahead
              value={school}
              onChange={setSchool}
              aria-invalid={!!errors.school}
              aria-describedby={describe("school")}
            />
            <FieldError id="school-error">{errors.school}</FieldError>
          </Field>
          <Field label="Examination board">
            <select className={inputClass} value={board} onChange={(e) => setBoard(e.target.value)}>
              <option value="">Select board (optional)</option>
              {BOARDS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>
          <Caption label="Subjects you take">
            <RefMultiSelect
              kind="subject"
              value={subjects}
              onChange={setSubjects}
              ariaLabel="Subjects you take"
              placeholder="Add subjects…"
            />
          </Caption>
        </div>
      )}

      {step.key === "grade" && (
        <div>
          <MascotGradePicker
            value={grade}
            onChange={setGrade}
            describedById={errors.grade ? "grade-error" : undefined}
          />
          <FieldError id="grade-error">{errors.grade}</FieldError>
        </div>
      )}

      {step.key === "universities" && (
        <div className="space-y-5">
          <Caption label="Target universities">
            <RefMultiSelect
              kind="university"
              value={targetUniversities}
              onChange={setTargetUniversities}
              ariaLabel="Target universities"
              placeholder="Add universities…"
            />
          </Caption>
          <Field label="Target countries (optional)">
            <MultiSelect
              options={COUNTRIES}
              value={countries}
              onChange={setCountries}
              placeholder="Pick countries"
            />
          </Field>
        </div>
      )}

      {step.key === "courses" && (
        <Caption label="Courses / fields of study">
          <RefMultiSelect
            kind="course"
            value={courses}
            onChange={setCourses}
            ariaLabel="Courses or fields of study"
            placeholder="Add courses…"
          />
        </Caption>
      )}

      {step.key === "sports" && (
        <div className="space-y-5">
          <div className="flex justify-center">
            <Mascot
              shape="sports"
              color={MASCOTS.sports.color}
              expression={MASCOTS.sports.expression}
              size={120}
              decorative
            />
          </div>
          <Caption label="Sports you play">
            <RefMultiSelect
              kind="sport"
              value={sports}
              onChange={setSports}
              ariaLabel="Sports you play"
              placeholder="Add sports…"
            />
          </Caption>
        </div>
      )}

      {step.key === "beyond" && (
        <div className="space-y-6">
          <div className="flex justify-center gap-4">
            <Mascot
              shape="cocurricular"
              color={MASCOTS.cocurricular.color}
              expression={MASCOTS.cocurricular.expression}
              size={96}
              decorative
            />
            <Mascot
              shape="lens"
              color={MASCOTS.lens.color}
              expression={MASCOTS.lens.expression}
              size={96}
              decorative
            />
          </div>
          <Caption label="Co-curriculars">
            <RefMultiSelect
              kind="cocurricular"
              value={cocurriculars}
              onChange={setCocurriculars}
              ariaLabel="Co-curriculars"
              placeholder="Debate, music, MUN…"
            />
          </Caption>
          <Caption label="Academic / science projects">
            <ProjectsField value={projects} onChange={setProjects} />
          </Caption>
        </div>
      )}

      {step.key === "about" && (
        <Field label="Short bio">
          <textarea
            className={`${inputClass} min-h-[120px] resize-y`}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell mentors a little about yourself — what you're excited about, what you're working towards."
          />
        </Field>
      )}

      {step.key === "consent" && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-secondary/20 p-5">
            <p className="text-sm font-medium text-foreground">We'll ask a parent to approve</p>
            <p className="mt-2 text-sm font-light text-muted-foreground">
              As soon as you create your account, we'll email your parent or guardian a secure
              consent link. You can explore mentors right away, and you'll be able to book your
              first session once they approve. We never share your contact details publicly.
            </p>
          </div>
          {under18 ? (
            <p className="text-sm font-light text-muted-foreground">
              We'll send the request to{" "}
              <span className="font-medium text-foreground">
                {parentEmail || "your parent's email"}
              </span>{" "}
              (from the first step).
            </p>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Parent's email">
                <input
                  className={inputClass}
                  type="email"
                  value={parentEmail}
                  onChange={(e) => setParentEmail(e.target.value)}
                  placeholder="parent@example.com"
                  aria-invalid={!!errors.parentEmail}
                  aria-describedby={describe("parentEmail")}
                />
                <FieldError id="parentEmail-error">{errors.parentEmail}</FieldError>
              </Field>
              <Field label="Parent's phone">
                <input
                  className={inputClass}
                  value={parentPhone}
                  onChange={(e) => setParentPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  aria-invalid={!!errors.parentPhone}
                  aria-describedby={describe("parentPhone")}
                />
                <FieldError id="parentPhone-error">{errors.parentPhone}</FieldError>
              </Field>
            </div>
          )}
        </div>
      )}

      {step.key === "account" && (
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Password">
              <input
                className={inputClass}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                aria-invalid={!!errors.password}
                aria-describedby={describe("password")}
              />
              <FieldError id="password-error">{errors.password}</FieldError>
            </Field>
            <Field label="Confirm password">
              <input
                className={inputClass}
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter password"
                autoComplete="new-password"
                aria-invalid={!!errors.confirm}
                aria-describedby={describe("confirm")}
              />
              <FieldError id="confirm-error">{errors.confirm}</FieldError>
            </Field>
          </div>
          <label htmlFor="agree-terms" className="flex items-start gap-2.5">
            <input
              id="agree-terms"
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              aria-required="true"
              aria-invalid={!!errors.agreed}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-2 focus:ring-primary"
            />
            <span className="text-[13px] font-light text-muted-foreground">
              I agree to the{" "}
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline underline-offset-2"
              >
                Terms
              </a>{" "}
              and{" "}
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline underline-offset-2"
              >
                Privacy Policy
              </a>
              .
            </span>
          </label>
          <FieldError>{errors.agreed}</FieldError>
          {/* Social sign-in (Google / Apple) can slot in here later — the layout
              leaves room for an "or continue with" divider above this block. */}
          {serverError && (
            <p role="alert" className="text-center text-xs text-destructive">
              {serverError}
            </p>
          )}
        </div>
      )}
    </WizardShell>
  );
}
