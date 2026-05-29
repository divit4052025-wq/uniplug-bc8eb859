import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { AuthShell, Confirmation, Field, inputClass } from "@/components/site/AuthShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [{ title: "Set a new password — UniPlug" }],
  }),
  component: ResetPasswordPage,
});

// Match the signup forms' password rule exactly (min 8, max 100), with a
// confirm field so the user can't fat-finger their new password.
const schema = z
  .object({
    password: z.string().min(8, "At least 8 characters").max(100),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords don't match",
    path: ["confirm"],
  });

type LinkStatus = "resolving" | "ready" | "invalid" | "success";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<LinkStatus>("resolving");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Establish the recovery session from the URL. The Supabase client has
  // detectSessionInUrl on by default, so it parses the recovery tokens from
  // the hash on load and emits a PASSWORD_RECOVERY event. We also check
  // getSession() (in case it resolved before this effect ran) and the hash
  // for an explicit error (expired/used links come back as #error=...).
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash.includes("error")) {
      setStatus("invalid");
      return;
    }

    let settled = false;
    const markReady = () => {
      settled = true;
      setStatus((s) => (s === "resolving" ? "ready" : s));
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) markReady();
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) markReady();
    });

    // If no recovery session materialises, the link is invalid or expired.
    const timeout = window.setTimeout(() => {
      if (!settled) setStatus((s) => (s === "resolving" ? "invalid" : s));
    }, 3000);

    return () => {
      window.clearTimeout(timeout);
      sub.subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError(null);
    const fd = new FormData(e.currentTarget);
    const res = schema.safeParse({
      password: String(fd.get("password") || ""),
      confirm: String(fd.get("confirm") || ""),
    });
    if (!res.success) {
      const errs: Record<string, string> = {};
      res.error.issues.forEach((i) => (errs[i.path[0] as string] = i.message));
      setErrors(errs);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: res.data.password,
      });
      if (updateError) throw updateError;
      // The user is currently in a recovery session. Sign out so they can't
      // sit on a half-authenticated state, then send them to log in fresh
      // with the new password (never route a recovery session to a dashboard).
      setStatus("success");
      window.setTimeout(() => {
        void supabase.auth.signOut().finally(() => {
          navigate({ to: "/login" });
        });
      }, 1800);
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : "Couldn't update your password. Please try again.",
      );
      setSubmitting(false);
    }
  };

  if (status === "resolving") {
    return (
      <AuthShell
        eyebrow="Almost there"
        title="Set a new password"
        subtitle="Verifying your reset link…"
      >
        <div className="flex min-h-[120px] items-center justify-center" role="status">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
          <span className="sr-only">Verifying your reset link…</span>
        </div>
      </AuthShell>
    );
  }

  if (status === "invalid") {
    return (
      <Confirmation
        heading="This link has expired"
        body="Password reset links can only be used once and expire after a short time. Request a fresh link to continue."
      >
        <Link
          to="/forgot-password"
          className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-[13px] font-medium text-primary-foreground transition hover:opacity-90"
        >
          Request a new link
        </Link>
      </Confirmation>
    );
  }

  if (status === "success") {
    return (
      <Confirmation
        heading="Password updated"
        body="Your password has been changed. Log in with your new password to continue."
      />
    );
  }

  return (
    <AuthShell
      eyebrow="Almost there"
      title="Set a new password"
      subtitle="Choose a new password for your UniPlug account."
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Field label="New password">
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            className={inputClass}
            placeholder="At least 8 characters"
          />
          {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password}</p>}
        </Field>
        <Field label="Confirm new password">
          <input
            name="confirm"
            type="password"
            autoComplete="new-password"
            className={inputClass}
            placeholder="Re-enter your new password"
          />
          {errors.confirm && <p className="mt-1 text-xs text-destructive">{errors.confirm}</p>}
        </Field>

        {serverError && <p className="text-sm text-destructive">{serverError}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary px-6 text-[13px] font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? "Updating…" : "Update password"}
        </button>
      </form>
    </AuthShell>
  );
}
