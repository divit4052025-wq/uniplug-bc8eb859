import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { AuthShell, Confirmation, Field, inputClass } from "@/components/site/AuthShell";
import { MultiSelect } from "@/components/site/MultiSelect";
import { supabase } from "@/integrations/supabase/client";
import { log, looksLikeEmailSendFailure } from "@/lib/log";

export const Route = createFileRoute("/student-signup")({
  head: () => ({
    meta: [
      { title: "Find Your Plug — UniPlug for Students" },
      {
        name: "description",
        content:
          "Sign up to get matched with verified university student mentors for one-on-one college admissions guidance.",
      },
      { property: "og:title", content: "Find Your Plug — UniPlug for Students" },
      {
        property: "og:description",
        content:
          "Real advice, real stories, real results — from students already living your dream.",
      },
    ],
  }),
  component: StudentSignup,
});

const grades = ["Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];
// Grades that require parental consent regardless of computed age (mirrors the
// DB rule in requires_consent_base / migration 20260530000002).
const GATED_GRADES = ["Grade 9", "Grade 10", "Grade 11"];
const countries = [
  "United Kingdom",
  "United States",
  "India",
  "Singapore",
  "Canada",
  "Australia",
  "Germany",
  "Netherlands",
  "Hong Kong",
];

/** True if the ISO date (YYYY-MM-DD) is a valid past date making the person under 18. */
function isUnder18(dobISO: string): boolean {
  if (!dobISO) return false;
  const dob = new Date(`${dobISO}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age < 18;
}

/** The consent trigger — mirrors the DB rule. */
function consentRequired(dobISO: string, grade: string): boolean {
  return isUnder18(dobISO) || GATED_GRADES.includes(grade);
}

const dobSchema = z
  .string()
  .min(1, "Required")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00`);
    return !Number.isNaN(d.getTime()) && d <= new Date() && d.getFullYear() >= 1900;
  }, "Enter a valid date of birth");

const schema = z
  .object({
    fullName: z.string().trim().min(1, "Required").max(100),
    email: z.string().trim().email("Invalid email").max(255),
    phone: z.string().trim().min(6, "Invalid phone").max(20),
    school: z.string().trim().min(1, "Required").max(150),
    grade: z.string().min(1, "Required"),
    dob: dobSchema,
    countries: z.array(z.string()).min(1, "Pick at least one"),
    password: z.string().min(8, "At least 8 characters").max(100),
    parentEmail: z.string().trim().max(255).optional().or(z.literal("")),
    parentPhone: z.string().trim().max(20).optional().or(z.literal("")),
  })
  .superRefine((val, ctx) => {
    // Parent contact is required when consent is required (under-18 OR gated grade).
    if (consentRequired(val.dob, val.grade)) {
      if (
        !z
          .string()
          .email()
          .safeParse((val.parentEmail ?? "").trim()).success
      ) {
        ctx.addIssue({
          path: ["parentEmail"],
          code: z.ZodIssueCode.custom,
          message: "Parent's email is required",
        });
      }
      if (!val.parentPhone || val.parentPhone.trim().length < 6) {
        ctx.addIssue({
          path: ["parentPhone"],
          code: z.ZodIssueCode.custom,
          message: "Parent's phone is required",
        });
      }
    }
  });

function StudentSignup() {
  const navigate = useNavigate();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [consentSent, setConsentSent] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  // Controlled so the parent-contact fields reveal reactively.
  const [dob, setDob] = useState("");
  const [grade, setGrade] = useState("");
  const showParentFields = consentRequired(dob, grade);

  const onResend = async () => {
    if (!pendingEmail || resendState !== "idle") return;
    setResendState("sending");
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: pendingEmail,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    if (resendError) {
      // Auth-email (confirmation) send failure surfaced to monitoring — non-fatal.
      log.error({
        surface: "web",
        event: "auth_email_send_failed",
        alert: looksLikeEmailSendFailure(resendError.message),
        kind: "signup_confirmation_resend",
        error: resendError.message,
      });
    }
    setResendState("sent");
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError(null);
    const fd = new FormData(e.currentTarget);
    const data = {
      fullName: String(fd.get("fullName") || ""),
      email: String(fd.get("email") || ""),
      phone: String(fd.get("phone") || ""),
      school: String(fd.get("school") || ""),
      grade: String(fd.get("grade") || ""),
      dob: String(fd.get("dob") || ""),
      countries: picked,
      password: String(fd.get("password") || ""),
      parentEmail: String(fd.get("parentEmail") || ""),
      parentPhone: String(fd.get("parentPhone") || ""),
    };
    const res = schema.safeParse(data);
    if (!res.success) {
      const errs: Record<string, string> = {};
      res.error.issues.forEach((i) => (errs[i.path[0] as string] = i.message));
      setErrors(errs);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const needsConsent = consentRequired(data.dob, data.grade);
    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          // Matches the Stage-2 metadata contract (handle_new_user reads these).
          data: {
            role: "student",
            full_name: data.fullName,
            phone: data.phone,
            school: data.school,
            grade: data.grade,
            countries: data.countries,
            date_of_birth: data.dob,
            parent_email: needsConsent ? data.parentEmail.trim() : "",
            parent_phone: needsConsent ? data.parentPhone.trim() : "",
          },
        },
      });
      if (signUpError) throw signUpError;

      if (signUpData.session) {
        navigate({ to: "/dashboard" });
      } else {
        setConsentSent(needsConsent);
        setPendingEmail(data.email);
        setSubmitting(false);
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Something went wrong";
      // Surface auth failures to monitoring — non-fatal (the calm UX below is
      // unchanged). alert:true only when it looks like an email-SEND failure
      // (the class that strands a user with no confirmation email — the May-27 P0).
      log.error({
        surface: "web",
        event: "auth_signup_failed",
        alert: looksLikeEmailSendFailure(raw),
        kind: "student_signup",
        error: raw,
      });
      const friendly = /database error saving new user/i.test(raw)
        ? "We couldn't create your account. Please check your details and try again."
        : raw;
      setServerError(friendly);
      setSubmitting(false);
    }
  };

  if (pendingEmail) {
    return (
      <Confirmation
        heading="Check your email to confirm your account"
        body={
          consentSent
            ? `We sent a confirmation link to ${pendingEmail}. Because you're under 18, we've also emailed your parent a request to give consent — you'll be able to book sessions once they confirm.`
            : `We sent a confirmation link to ${pendingEmail}. Click the link to activate your account and start finding mentors.`
        }
      >
        <button
          type="button"
          onClick={onResend}
          disabled={resendState !== "idle"}
          className="text-sm font-semibold text-primary underline-offset-4 transition hover:underline disabled:opacity-60"
        >
          {resendState === "sent"
            ? "Confirmation email resent"
            : resendState === "sending"
              ? "Resending…"
              : "Didn't receive it? Resend confirmation email"}
        </button>
      </Confirmation>
    );
  }

  return (
    <AuthShell
      eyebrow="For students"
      title="Find Your Plug"
      subtitle="Tell us about you and we'll match you with university students who've walked the path you're starting."
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Field label="Full name">
          <input name="fullName" className={inputClass} placeholder="Aanya Sharma" />
          {errors.fullName && <p className="mt-1 text-xs text-destructive">{errors.fullName}</p>}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Email address">
            <input name="email" type="email" className={inputClass} placeholder="you@school.edu" />
            {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
          </Field>
          <Field label="Phone number">
            <input name="phone" className={inputClass} placeholder="+91 98765 43210" />
            {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone}</p>}
          </Field>
        </div>
        <Field label="School name">
          <input name="school" className={inputClass} placeholder="Delhi Public School" />
          {errors.school && <p className="mt-1 text-xs text-destructive">{errors.school}</p>}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Date of birth">
            <input
              name="dob"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className={inputClass}
              aria-describedby="dob-hint"
            />
            <p id="dob-hint" className="mt-1 text-[11px] font-light text-muted-foreground">
              Used to check whether parental consent is required.
            </p>
            {errors.dob && <p className="mt-1 text-xs text-destructive">{errors.dob}</p>}
          </Field>
          <Field label="Current grade">
            <select
              name="grade"
              className={inputClass}
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
            >
              <option value="" disabled>
                Select grade
              </option>
              {grades.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
            {errors.grade && <p className="mt-1 text-xs text-destructive">{errors.grade}</p>}
          </Field>
        </div>
        <Field label="Target countries">
          <MultiSelect
            options={countries}
            value={picked}
            onChange={setPicked}
            placeholder="Pick countries"
          />
          {errors.countries && <p className="mt-1 text-xs text-destructive">{errors.countries}</p>}
        </Field>

        {showParentFields && (
          <div className="rounded-2xl border border-dashed border-border bg-brand-cream/40 p-4">
            <p className="text-[13px] font-medium text-foreground">Parent or guardian details</p>
            <p className="mt-1 text-[12px] font-light text-muted-foreground">
              Because you&apos;re under 18, we&apos;ll email your parent to give consent before you
              can book sessions.
            </p>
            <div className="mt-3 grid gap-5 sm:grid-cols-2">
              <Field label="Parent's email">
                <input
                  name="parentEmail"
                  type="email"
                  className={inputClass}
                  placeholder="parent@example.com"
                />
                {errors.parentEmail && (
                  <p className="mt-1 text-xs text-destructive">{errors.parentEmail}</p>
                )}
              </Field>
              <Field label="Parent's phone">
                <input name="parentPhone" className={inputClass} placeholder="+91 98765 43210" />
                {errors.parentPhone && (
                  <p className="mt-1 text-xs text-destructive">{errors.parentPhone}</p>
                )}
              </Field>
            </div>
          </div>
        )}

        <Field label="Password">
          <input
            name="password"
            type="password"
            className={inputClass}
            placeholder="At least 8 characters"
          />
          {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password}</p>}
        </Field>
        <button
          type="submit"
          disabled={submitting}
          className="mt-2 w-full rounded-full bg-primary py-4 text-sm font-semibold text-primary-foreground shadow-card transition hover:-translate-y-0.5 hover:opacity-95 disabled:opacity-60"
        >
          {submitting ? "Creating account…" : "Get Started"}
        </button>
        {serverError && <p className="text-center text-xs text-destructive">{serverError}</p>}
      </form>
    </AuthShell>
  );
}
