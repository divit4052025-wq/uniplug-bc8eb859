import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { AuthShell, Confirmation, Field, inputClass } from "@/components/site/AuthShell";
import { MultiSelect } from "@/components/site/MultiSelect";
import { supabase } from "@/integrations/supabase/client";
import { log, looksLikeEmailSendFailure } from "@/lib/log";

export const Route = createFileRoute("/mentor-signup")({
  head: () => ({
    meta: [
      { title: "Become a Plug — Mentor with UniPlug" },
      {
        name: "description",
        content:
          "Apply to mentor Indian high school students on college admissions. Get paid for one-on-one sessions sharing your real journey.",
      },
      { property: "og:title", content: "Become a Plug — Mentor with UniPlug" },
      {
        property: "og:description",
        content: "Share your story. Open doors. Get paid for one-on-one mentorship sessions.",
      },
    ],
  }),
  component: MentorSignup,
});

const years = ["1st Year", "2nd Year", "3rd Year", "4th Year", "Final Year", "Postgraduate"];
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

const schema = z.object({
  fullName: z.string().trim().min(1, "Required").max(100),
  email: z.string().trim().email("Invalid email").max(255),
  university: z.string().trim().min(1, "Required").max(150),
  course: z.string().trim().min(1, "Required").max(150),
  year: z.string().min(1, "Required"),
  countries: z.array(z.string()).min(1, "Pick at least one"),
  password: z.string().min(8, "At least 8 characters").max(100),
});

function MentorSignup() {
  const navigate = useNavigate();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  const onResend = async () => {
    if (!pendingEmail || resendState !== "idle") return;
    setResendState("sending");
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: pendingEmail,
      options: { emailRedirectTo: `${window.location.origin}/mentor-dashboard` },
    });
    if (resendError) {
      log.error({
        surface: "web",
        event: "auth_email_send_failed",
        alert: looksLikeEmailSendFailure(resendError.message),
        kind: "signup_confirmation_resend",
        error: resendError.message,
      });
      // Don't claim success on a failed send — return to idle so the user can retry.
      setResendState("idle");
      return;
    }
    setResendState("sent");
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError(null);
    // Required agreement gate — also enforced by the disabled submit button.
    if (!agreed) return;
    const fd = new FormData(e.currentTarget);
    const data = {
      fullName: String(fd.get("fullName") || ""),
      email: String(fd.get("email") || ""),
      university: String(fd.get("university") || ""),
      course: String(fd.get("course") || ""),
      year: String(fd.get("year") || ""),
      countries: picked,
      password: String(fd.get("password") || ""),
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
    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/mentor-dashboard`,
          data: {
            role: "mentor",
            full_name: data.fullName,
            university: data.university,
            course: data.course,
            year: data.year,
            countries: data.countries,
          },
        },
      });
      if (signUpError) throw signUpError;

      // Email confirmation is required: signUp returns the user but no session.
      // Show a "check your email" state instead of redirecting to a route the
      // unconfirmed account can't reach (it would bounce back to signup).
      if (signUpData.session) {
        navigate({ to: "/mentor-dashboard" });
      } else {
        setPendingEmail(data.email);
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
      // Supabase wraps trigger-raised exceptions; show a friendly fallback in that case.
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
        body={`We sent a confirmation link to ${pendingEmail}. Click the link to activate your account and finish your mentor application.`}
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
      eyebrow="For mentors"
      title="Become a Plug"
      subtitle="Be the senior you wish you'd had. Share your story, open doors, get paid for it."
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Field label="Full name">
          <input name="fullName" className={inputClass} placeholder="Rohan Iyer" />
          {errors.fullName && <p className="mt-1 text-xs text-destructive">{errors.fullName}</p>}
        </Field>
        <Field label="University email address">
          <input
            name="email"
            type="email"
            className={inputClass}
            placeholder="you@university.edu"
          />
          {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="University name">
            <input name="university" className={inputClass} placeholder="University of Oxford" />
            {errors.university && (
              <p className="mt-1 text-xs text-destructive">{errors.university}</p>
            )}
          </Field>
          <Field label="Course of study">
            <input name="course" className={inputClass} placeholder="Computer Science" />
            {errors.course && <p className="mt-1 text-xs text-destructive">{errors.course}</p>}
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Current year of study">
            <select name="year" className={inputClass} defaultValue="">
              <option value="" disabled>
                Select year
              </option>
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
            {errors.year && <p className="mt-1 text-xs text-destructive">{errors.year}</p>}
          </Field>
          <Field label="Countries you can advise on">
            <MultiSelect
              options={countries}
              value={picked}
              onChange={setPicked}
              placeholder="Pick countries"
            />
            {errors.countries && (
              <p className="mt-1 text-xs text-destructive">{errors.countries}</p>
            )}
          </Field>
        </div>
        <Field label="Password">
          <input
            name="password"
            type="password"
            className={inputClass}
            placeholder="At least 8 characters"
          />
          {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password}</p>}
        </Field>
        <label htmlFor="agree-terms" className="flex items-start gap-2.5">
          <input
            id="agree-terms"
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            aria-required="true"
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
        <button
          type="submit"
          disabled={submitting || !agreed}
          className="mt-2 w-full rounded-full bg-primary py-4 text-sm font-semibold text-primary-foreground shadow-card transition hover:-translate-y-0.5 hover:opacity-95 disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Apply Now"}
        </button>
        {serverError && <p className="text-center text-xs text-destructive">{serverError}</p>}
      </form>
    </AuthShell>
  );
}
