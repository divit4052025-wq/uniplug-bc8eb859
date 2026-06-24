import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { log, looksLikeEmailSendFailure } from "@/lib/log";
import type { MascotExpression } from "@/components/mascots/Mascot";
import {
  AuthScreen,
  authErrCls,
  authInputCls,
  authLabelCls,
  authPrimaryBtnCls,
} from "@/components/site/AuthScreen";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your password — UniPlug" },
      {
        name: "description",
        content: "Request a password reset link for your UniPlug account.",
      },
    ],
  }),
  component: ForgotPasswordPage,
});

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
});

function ForgotPasswordPage() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [founderExpr, setFounderExpr] = useState<MascotExpression>("happy");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Shift focus to the new headline when the screen changes (form → "check your
  // email"), mirroring the signup wizard, so AT users aren't dropped on <body>.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [sentTo]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = schema.safeParse({ email: String(fd.get("email") || "") });
    if (!res.success) {
      setError(res.error.issues[0]?.message ?? "Enter a valid email");
      setFounderExpr("confused");
      return;
    }
    const email = res.data.email;
    setSubmitting(true);
    setFounderExpr("focused");
    try {
      // Supabase does not reveal whether the address has an account, so a
      // successful call is shown identically regardless — preventing email
      // enumeration. Only transport/rate-limit errors surface as an error.
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) throw resetError;
      setSentTo(email);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "reset email send failed";
      // Auth password-reset email send failure surfaced to monitoring — non-fatal.
      log.error({
        surface: "web",
        event: "auth_email_send_failed",
        alert: looksLikeEmailSendFailure(raw),
        kind: "password_reset",
        error: raw,
      });
      setError("We couldn't send the reset email right now. Please try again in a moment.");
      setFounderExpr("confused");
    } finally {
      setSubmitting(false);
    }
  };

  if (sentTo) {
    return (
      <AuthScreen
        founderExpr="celebrating"
        title="Check your email"
        subtitle={`If an account exists for ${sentTo}, we've sent a link to reset your password. Click it to choose a new one.`}
        headingRef={headingRef}
      >
        <p className="text-center text-[13px] text-brand-ink-soft">
          <Link
            to="/login"
            data-mag
            className="border-b-[1.5px] border-primary font-semibold leading-none text-primary"
          >
            Back to log in
          </Link>
        </p>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      founderExpr={founderExpr}
      title="Reset password"
      subtitle="Enter the email you signed up with and we'll send you a link to set a new password."
      headingRef={headingRef}
      onFocusCapture={() => {
        if (!submitting) setFounderExpr("thinking");
      }}
      onBlurCapture={() => {
        if (!submitting) setFounderExpr("happy");
      }}
    >
      <form
        onSubmit={onSubmit}
        noValidate
        aria-busy={submitting}
        className="flex flex-col gap-[15px]"
      >
        {/* off-screen live region — announces the error the moment it appears */}
        <p aria-live="assertive" className="sr-only">
          {error ?? ""}
        </p>
        <div>
          <label htmlFor="forgot-email" className={authLabelCls}>
            Email
          </label>
          <input
            id="forgot-email"
            name="email"
            type="email"
            autoComplete="email"
            data-mag
            aria-invalid={!!error}
            aria-describedby={error ? "forgot-email-error" : undefined}
            className={authInputCls}
            placeholder="you@school.com"
          />
          {error && (
            <span id="forgot-email-error" className={authErrCls}>
              {error}
            </span>
          )}
        </div>

        <button type="submit" disabled={submitting} data-mag data-hov className={authPrimaryBtnCls}>
          {submitting ? "Sending…" : "Send reset link"}
        </button>

        <p className="text-center text-[13px] text-brand-ink-soft">
          Remembered it?{" "}
          <Link to="/login" data-mag className="font-semibold text-primary">
            Back to log in
          </Link>
        </p>
      </form>
    </AuthScreen>
  );
}
