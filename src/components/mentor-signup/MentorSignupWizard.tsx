// P8 — the 6-step pre-auth mentor signup wizard. PRE-AUTH: scalars ride in the
// auth.signUp metadata that handle_new_user reads (role/full_name/university+
// university_id/course+course_id/year/phone/college_email/bio/date_of_birth/
// specialty key + legal versions); the admit-university selections are stashed
// on-device and replayed into mentor_admits in the authenticated finalize step.
// Built on the shared signup scaffolding (WizardShell, RefMultiSelect, Caption/
// FieldError) + the mascot engine. Brand fonts are scoped by WizardShell.
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Confirmation, Field, inputClass } from "@/components/site/AuthShell";
import { supabase } from "@/integrations/supabase/client";
import { log, looksLikeEmailSendFailure } from "@/lib/log";
import { WizardShell, type WizardStepMeta } from "@/components/signup/WizardShell";
import { RefMultiSelect } from "@/components/signup/RefMultiSelect";
import { Caption, FieldError } from "@/components/signup/Labeled";
import { isUnder18, LEGAL_VERSION } from "@/components/signup/constants";
import type { RefItem } from "@/components/signup/types";
import type { SpecialtyKey } from "@/components/mascots/specialty";
import { MascotSpecialtyPicker } from "./MascotSpecialtyPicker";
import { saveMentorDraft } from "./draft";

const YEARS = ["1st Year", "2nd Year", "3rd Year", "4th Year"];

const STEPS: (WizardStepMeta & { title: string; hint?: string })[] = [
  {
    key: "identity",
    label: "Identity",
    title: "Who you are",
    hint: "Your name and a college email we can verify.",
  },
  {
    key: "study",
    label: "Study",
    title: "Where you study",
    hint: "Your university, year and course.",
  },
  {
    key: "admits",
    label: "Admits",
    title: "Where you got in",
    hint: "The universities you were admitted to — your matching anchor.",
  },
  {
    key: "specialty",
    label: "Specialty",
    title: "Your specialty",
    hint: "Pick the one you mentor best. This drives your mascot.",
  },
  { key: "bio", label: "Bio", title: "A little about you", hint: "Your story, in your own words." },
  {
    key: "account",
    label: "Account",
    title: "Create your account",
    hint: "Set a password and accept the agreements to submit.",
  },
];

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export function MentorSignupWizard() {
  const navigate = useNavigate();

  // M1
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [collegeEmail, setCollegeEmail] = useState("");
  const [phone, setPhone] = useState("");
  // M2
  const [university, setUniversity] = useState<RefItem[]>([]);
  const [year, setYear] = useState("");
  const [course, setCourse] = useState<RefItem[]>([]);
  // M3
  const [admits, setAdmits] = useState<RefItem[]>([]);
  // M4
  const [specialty, setSpecialty] = useState<SpecialtyKey>("general");
  // M5
  const [bio, setBio] = useState("");
  // M6
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeMentor, setAgreeMentor] = useState(false);

  // Flow
  const [idx, setIdx] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  const step = STEPS[idx];
  const describe = (k: string) => (errors[k] ? `${k}-error` : undefined);

  const steps = useMemo(() => STEPS, []);

  function validate(key: string): Record<string, string> {
    const e: Record<string, string> = {};
    if (key === "identity") {
      if (!fullName.trim()) e.fullName = "Required";
      const d = new Date(`${dob}T00:00:00`);
      if (!dob || Number.isNaN(d.getTime()) || d > new Date() || d.getFullYear() < 1900)
        e.dob = "Enter a valid date of birth";
      else if (isUnder18(dob)) e.dob = "Mentors must be 18 or older";
      if (!isEmail(collegeEmail)) e.collegeEmail = "Enter a valid college email";
      if (phone.trim().length < 6) e.phone = "Enter a valid phone number";
    } else if (key === "study") {
      if (university.length === 0) e.university = "Pick your university";
      if (!year) e.year = "Select your year";
      if (course.length === 0) e.course = "Pick your course";
    } else if (key === "admits") {
      if (admits.length === 0) e.admits = "Add at least one university you were admitted to";
    } else if (key === "account") {
      if (password.length < 8) e.password = "At least 8 characters";
      if (confirm !== password) e.confirm = "Passwords don't match";
      if (!agreeTerms || !agreePrivacy || !agreeMentor)
        e.agree = "Please accept all three agreements";
    }
    return e;
  }

  const goTo = (i: number) => {
    setErrors({});
    setIdx(i);
    setMaxReached((m) => Math.max(m, i));
  };

  const onBack = idx > 0 ? () => goTo(idx - 1) : undefined;

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
    goTo(idx + 1);
  };

  async function submit() {
    setServerError(null);
    setSubmitting(true);
    // Stash the admits (+ specialty) for the authenticated finalize replay.
    saveMentorDraft({ admits, specialty });
    try {
      const { data, error } = await supabase.auth.signUp({
        email: collegeEmail.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/mentor-dashboard`,
          data: {
            role: "mentor",
            full_name: fullName.trim(),
            university: university[0]?.name ?? "",
            university_id: university[0]?.id ?? "",
            course: course[0]?.name ?? "",
            course_id: course[0]?.id ?? "",
            year,
            phone: phone.trim(),
            college_email: collegeEmail.trim(),
            bio: bio.trim(),
            date_of_birth: dob,
            specialty,
            terms_version: LEGAL_VERSION,
            privacy_version: LEGAL_VERSION,
            mentor_agreement_version: LEGAL_VERSION,
          },
        },
      });
      if (error) throw error;
      if (data.session) {
        navigate({ to: "/mentor-signup/finalize" });
      } else {
        setPendingEmail(collegeEmail.trim());
        setSubmitting(false);
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Something went wrong";
      log.error({
        surface: "web",
        event: "auth_signup_failed",
        alert: looksLikeEmailSendFailure(raw),
        kind: "mentor_signup",
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
      options: { emailRedirectTo: `${window.location.origin}/mentor-dashboard` },
    });
    if (error) {
      log.error({
        surface: "web",
        event: "auth_email_send_failed",
        alert: looksLikeEmailSendFailure(error.message),
        kind: "mentor_signup_confirmation_resend",
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
          body={`We sent a confirmation link to ${pendingEmail}. Click it to activate your account, then upload your documents to submit your application for review.`}
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
        if (i <= maxReached) goTo(i);
      }}
      title={step.title}
      hint={step.hint}
      onBack={onBack}
      onNext={onNext}
      nextLabel={step.key === "account" ? "Submit application" : "Continue"}
      nextLoading={submitting}
      eyebrow="Become the Plug you needed"
    >
      {step.key === "identity" && (
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
            <Field label="Date of birth">
              <input
                className={inputClass}
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                aria-invalid={!!errors.dob}
                aria-describedby={describe("dob")}
              />
              <FieldError id="dob-error">{errors.dob}</FieldError>
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
          <Field label="College email">
            <input
              className={inputClass}
              type="email"
              value={collegeEmail}
              onChange={(e) => setCollegeEmail(e.target.value)}
              placeholder="you@college.edu"
              aria-invalid={!!errors.collegeEmail}
              aria-describedby={
                errors.collegeEmail ? "collegeEmail-error college-email-hint" : "college-email-hint"
              }
            />
            <p
              id="college-email-hint"
              className="mt-1 text-[11px] font-light text-muted-foreground"
            >
              Only a verified college email is approved — we manually review your college-ID photo
              and this email. You can switch to a personal email after approval.
            </p>
            <FieldError id="collegeEmail-error">{errors.collegeEmail}</FieldError>
          </Field>
          <p className="text-[12px] font-light text-muted-foreground">
            You'll upload a photo of your physical college ID after confirming your email.
          </p>
        </div>
      )}

      {step.key === "study" && (
        <div className="space-y-5">
          <Caption label="University">
            <RefMultiSelect
              kind="university"
              value={university}
              onChange={setUniversity}
              max={1}
              closeOnSelect
              ariaLabel="University"
              aria-describedby={describe("university")}
              placeholder="Search your university…"
            />
          </Caption>
          <FieldError id="university-error">{errors.university}</FieldError>
          <Field label="Year of study">
            <select
              className={inputClass}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              aria-invalid={!!errors.year}
              aria-describedby={describe("year")}
            >
              <option value="">Select year</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <FieldError id="year-error">{errors.year}</FieldError>
          </Field>
          <Caption label="Course">
            <RefMultiSelect
              kind="course"
              value={course}
              onChange={setCourse}
              max={1}
              closeOnSelect
              ariaLabel="Course"
              aria-describedby={describe("course")}
              placeholder="Search your course…"
            />
          </Caption>
          <FieldError id="course-error">{errors.course}</FieldError>
        </div>
      )}

      {step.key === "admits" && (
        <div className="space-y-3">
          <p className="text-sm font-light text-muted-foreground">
            Add every university you were admitted to. This is the matching anchor — students see
            you when their target universities overlap your admits.
          </p>
          <Caption label="Universities you were admitted to">
            <RefMultiSelect
              kind="university"
              value={admits}
              onChange={setAdmits}
              ariaLabel="Universities you were admitted to"
              placeholder="Add admits…"
            />
          </Caption>
          <FieldError>{errors.admits}</FieldError>
          <p className="text-[12px] font-light text-muted-foreground">
            You'll upload an acceptance letter / proof for each admit after confirming your email.
          </p>
        </div>
      )}

      {step.key === "specialty" && (
        <div>
          <MascotSpecialtyPicker value={specialty} onChange={setSpecialty} />
          <p className="mt-4 text-[13px] font-light text-muted-foreground">
            Pick the one you mentor best — it drives your mascot. Other skills go in your bio.
          </p>
        </div>
      )}

      {step.key === "bio" && (
        <Field label="Your bio">
          <textarea
            className={`${inputClass} min-h-[140px] resize-y`}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Share your journey, what you mentor on, and why students should plug in with you."
          />
        </Field>
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
          <div className="space-y-2.5 rounded-2xl border border-dashed border-border bg-brand-cream/40 p-4">
            <AgreeRow
              checked={agreeTerms}
              onChange={setAgreeTerms}
              id="agree-terms"
              href="/terms"
              label="Terms of Service"
            />
            <AgreeRow
              checked={agreePrivacy}
              onChange={setAgreePrivacy}
              id="agree-privacy"
              href="/privacy"
              label="Privacy Policy"
            />
            <AgreeRow
              checked={agreeMentor}
              onChange={setAgreeMentor}
              id="agree-mentor"
              href="/mentor-terms"
              label="Mentor / Contractor Agreement"
            />
          </div>
          <FieldError>{errors.agree}</FieldError>
          {/* Social sign-in (Google / Apple) can slot in here later. */}
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

function AgreeRow({
  checked,
  onChange,
  id,
  href,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
  href: string;
  label: string;
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-required="true"
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-2 focus:ring-primary"
      />
      <span className="text-[13px] font-light text-muted-foreground">
        I agree to the{" "}
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline underline-offset-2"
        >
          {label}
        </a>
        .
      </span>
    </label>
  );
}
