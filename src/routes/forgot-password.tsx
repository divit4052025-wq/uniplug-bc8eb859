import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { AuthShell, Confirmation, Field, inputClass } from "@/components/site/AuthShell";
import { supabase } from "@/integrations/supabase/client";

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

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = schema.safeParse({ email: String(fd.get("email") || "") });
    if (!res.success) {
      setError(res.error.issues[0]?.message ?? "Enter a valid email");
      return;
    }
    const email = res.data.email;
    setSubmitting(true);
    try {
      // Supabase does not reveal whether the address has an account, so a
      // successful call is shown identically regardless — preventing email
      // enumeration. Only transport/rate-limit errors surface as an error.
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) throw resetError;
      setSentTo(email);
    } catch {
      setError("We couldn't send the reset email right now. Please try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sentTo) {
    return (
      <Confirmation
        heading="Check your email"
        body={`If an account exists for ${sentTo}, we've sent a link to reset your password. Click it to choose a new one.`}
      >
        <Link to="/login" className="text-sm font-semibold text-primary hover:underline">
          Back to log in
        </Link>
      </Confirmation>
    );
  }

  return (
    <AuthShell
      eyebrow="Forgot your password?"
      title="Reset password"
      subtitle="Enter the email you signed up with and we'll send you a link to set a new password."
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Field label="Email">
          <input
            name="email"
            type="email"
            autoComplete="email"
            className={inputClass}
            placeholder="you@school.com"
          />
        </Field>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary px-6 text-[13px] font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? "Sending…" : "Send reset link"}
        </button>

        <p className="pt-2 text-center text-[13px] text-muted-foreground">
          Remembered it?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to log in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
