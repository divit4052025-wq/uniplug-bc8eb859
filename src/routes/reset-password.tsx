import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { MascotExpression } from "@/components/mascots/Mascot";
import {
  AuthScreen,
  authErrCls,
  authInputCls,
  authLabelCls,
  authPrimaryBtnCls,
} from "@/components/site/AuthScreen";

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

// Mirror login's treatment: map known auth errors to friendly copy, never leak a
// raw Supabase message. Falls back to the original generic.
function mapUpdateError(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  if (/different from the old password|should be different/i.test(msg))
    return "Your new password must be different from your old one.";
  if (/at least|weak|password.*short|short.*password/i.test(msg))
    return "Please choose a stronger password.";
  return "Couldn't update your password. Please try again.";
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<LinkStatus>("resolving");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [founderExpr, setFounderExpr] = useState<MascotExpression>("happy");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Shift focus to the new headline on each state transition (resolving → ready
  // / invalid / success), mirroring the signup wizard, so AT users aren't
  // dropped on <body> when the screen is replaced.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [status]);

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
      setFounderExpr("confused");
      return;
    }
    setErrors({});
    setSubmitting(true);
    setFounderExpr("focused");
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
      setServerError(mapUpdateError(err));
      setFounderExpr("confused");
      setSubmitting(false);
    }
  };

  if (status === "resolving") {
    return (
      <AuthScreen
        founderExpr="thinking"
        title="Set a new password"
        subtitle="Verifying your reset link…"
        headingRef={headingRef}
      >
        <div className="flex min-h-[64px] items-center justify-center" role="status">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
          <span className="sr-only">Verifying your reset link…</span>
        </div>
      </AuthScreen>
    );
  }

  if (status === "invalid") {
    return (
      <AuthScreen
        founderExpr="confused"
        title="This link has expired"
        subtitle="Password reset links can only be used once and expire after a short time. Request a fresh link to continue."
        headingRef={headingRef}
      >
        <div className="flex flex-col items-center gap-4">
          <Link to="/forgot-password" data-mag data-hov className={authPrimaryBtnCls}>
            Request a new link
          </Link>
          <Link
            to="/login"
            data-mag
            className="border-b-[1.5px] border-primary text-[13px] font-semibold leading-none text-primary"
          >
            Back to log in
          </Link>
        </div>
      </AuthScreen>
    );
  }

  if (status === "success") {
    return (
      <AuthScreen
        founderExpr="celebrating"
        title="Password updated"
        subtitle="Your password has been changed. Log in with your new password to continue."
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

  // status === "ready" — the new-password form
  return (
    <AuthScreen
      founderExpr={founderExpr}
      title="Set a new password"
      subtitle="Choose a new password for your UniPlug account."
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
        {/* off-screen live region — announces the server error the moment it appears */}
        <p aria-live="assertive" className="sr-only">
          {serverError ?? ""}
        </p>
        <div>
          <label htmlFor="reset-password" className={authLabelCls}>
            New password
          </label>
          <input
            id="reset-password"
            name="password"
            type="password"
            autoComplete="new-password"
            data-mag
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "reset-password-error" : undefined}
            className={authInputCls}
            placeholder="At least 8 characters"
          />
          {errors.password && (
            <span id="reset-password-error" className={authErrCls}>
              {errors.password}
            </span>
          )}
        </div>
        <div>
          <label htmlFor="reset-confirm" className={authLabelCls}>
            Confirm new password
          </label>
          <input
            id="reset-confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            data-mag
            aria-invalid={!!errors.confirm}
            aria-describedby={errors.confirm ? "reset-confirm-error" : undefined}
            className={authInputCls}
            placeholder="Re-enter your new password"
          />
          {errors.confirm && (
            <span id="reset-confirm-error" className={authErrCls}>
              {errors.confirm}
            </span>
          )}
        </div>

        {serverError && <p className="text-[13px] font-semibold text-destructive">{serverError}</p>}

        <button type="submit" disabled={submitting} data-mag data-hov className={authPrimaryBtnCls}>
          {submitting ? "Updating…" : "Update password"}
        </button>
      </form>
    </AuthScreen>
  );
}
