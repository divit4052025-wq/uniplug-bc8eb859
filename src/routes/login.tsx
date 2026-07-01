import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SignupCursor } from "@/components/student-signup/v2/SignupCursor";
import { FounderCompanion } from "@/components/student-signup/v2/FounderCompanion";
import { Logo } from "@/components/site/Logo";
import type { MascotExpression } from "@/components/mascots/Mascot";
import { markSession } from "@/lib/ephemeral-session";
import { resolveUserRole, dashboardPathForRole } from "@/lib/auth/role";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — UniPlug" },
      {
        name: "description",
        content: "Log in to your UniPlug account to access mentors, sessions and your dashboard.",
      },
      { property: "og:title", content: "Log in — UniPlug" },
      { property: "og:description", content: "Log in to your UniPlug account." },
    ],
  }),
  component: LoginPage,
});

// Reused from the signup v2 light scenes so the auth surface stays consistent.
const inputCls =
  "w-full rounded-md border border-border bg-background px-4 py-3.5 text-[16px] font-medium text-foreground outline-none transition placeholder:text-brand-ink-faint focus:border-primary";
const labelCls = "block text-[13px] font-semibold text-brand-ink-soft";
const errCls = "mt-1.5 block text-[12px] font-semibold text-destructive";

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

// Map real Supabase auth errors to the design's error styling. Falls back to a
// friendly generic rather than leaking a raw message.
function mapAuthError(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  if (/invalid login credentials/i.test(msg))
    return "That email or password doesn't match. Please try again.";
  if (/email not confirmed/i.test(msg))
    return "Please confirm your email first — check your inbox for the link.";
  if (/too many requests|rate limit/i.test(msg))
    return "Too many attempts. Please wait a moment and try again.";
  return "Could not log in. Please try again.";
}

type Status = "idle" | "submitting" | "success";

function LoginPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false); // default UNCHECKED — safer on shared/minor devices
  const [founderExpr, setFounderExpr] = useState<MascotExpression>("happy");

  const busy = status !== "idle";

  // Founder reacts to focus like the signup flow, but never while submitting/done.
  const onFocusCapture = () => {
    if (status === "idle") setFounderExpr("thinking");
  };
  const onBlurCapture = () => {
    if (status === "idle") setFounderExpr("happy");
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");

    const fe: { email?: string; password?: string } = {};
    if (!isEmail(email)) fe.email = "Enter a valid email";
    if (!password) fe.password = "Enter your password";
    if (fe.email || fe.password) {
      setFieldErrors(fe);
      setFounderExpr("confused");
      return;
    }
    setFieldErrors({});
    setStatus("submitting");
    setFounderExpr("focused");

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;
      const userId = data.user?.id;
      if (!userId) throw new Error("Login failed.");

      // Wire "Keep me logged in" to session persistence (per-login, generated client untouched).
      markSession(remember);

      // Real success affordance shown while the role lookup + redirect resolve.
      setStatus("success");
      setFounderExpr("celebrating");

      // Resolve role centrally (admin is data-driven via the role system; no
      // email literal, no divergent inline re-implementation). Admin → /admin,
      // mentor → /mentor-dashboard, student/unknown → /dashboard.
      const meta = (data.user?.user_metadata ?? {}) as { role?: string };
      const role = await resolveUserRole(userId, data.user?.email, meta);
      navigate({ to: dashboardPathForRole(role) });
    } catch (err) {
      setStatus("idle");
      setFounderExpr("confused");
      setError(mapAuthError(err));
    }
  };

  const ctaBg =
    status === "success"
      ? "bg-[#5C8A5A]" // design success green; the only colour without a brand token
      : "bg-foreground";
  const ctaLabel =
    status === "submitting" ? "Signing in…" : status === "success" ? "Welcome back" : "Log in";
  const ctaArrow = status === "submitting" ? "" : status === "success" ? "✓" : "→";

  return (
    <div className="signup-wizard relative h-dvh overflow-hidden overscroll-none bg-brand-paper text-foreground">
      <SignupCursor />

      {/* persistent wordmark — `-offwhite` = the ink glyph FOR off-white/light bg.
          Wrapped in a positioned div so the Logo's own `relative` wrapper can't win. */}
      <div className="absolute left-10 top-8 z-[5]">
        <Logo variant="wordmark-offwhite" size={34} />
      </div>

      <div className="absolute inset-0 flex items-center justify-center px-6 py-16 sm:px-8">
        <div
          className="hide-scrollbar max-h-full w-full max-w-[392px] overflow-y-auto"
          onFocusCapture={onFocusCapture}
          onBlurCapture={onBlurCapture}
        >
          {/* off-screen live region — announces the form-level auth error to AT.
              Field-level errors are announced via each input's aria-describedby. */}
          <p aria-live="assertive" className="sr-only">
            {error ?? ""}
          </p>

          {/* header */}
          <div className="mb-7 text-center">
            <FounderCompanion
              expression={founderExpr}
              size={96}
              className="mb-3 flex justify-center"
            />
            <h1 className="m-0 font-display text-[38px] font-extrabold leading-none tracking-[-0.022em]">
              Welcome back.
            </h1>
            <p className="mt-2.5 text-[15px] text-brand-ink-soft">
              Pick up from where you left off.
            </p>
          </div>

          {/* form — noValidate so our custom inline validation (not the native
              browser bubbles) drives the design's #C0392B field errors. */}
          <form
            onSubmit={onSubmit}
            noValidate
            aria-busy={busy}
            className="flex flex-col gap-[15px]"
          >
            {/* Email */}
            <div>
              <label htmlFor="login-email" className={cn(labelCls, "mb-[7px]")}>
                Email
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                data-mag
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
                onChange={() =>
                  fieldErrors.email && setFieldErrors((p) => ({ ...p, email: undefined }))
                }
                className={cn(
                  inputCls,
                  fieldErrors.email && "border-destructive focus:border-destructive",
                )}
                placeholder="you@email.com"
              />
              {fieldErrors.email && (
                <span id="login-email-error" className={errCls}>
                  {fieldErrors.email}
                </span>
              )}
            </div>

            {/* Password */}
            <div>
              <div className="mb-[7px] flex items-center justify-between">
                <label htmlFor="login-password" className={labelCls}>
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  data-mag
                  className="border-b-[1.5px] border-primary text-[12.5px] font-semibold leading-none text-primary"
                >
                  Forgot?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  data-mag
                  aria-invalid={!!fieldErrors.password}
                  aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
                  onChange={() =>
                    fieldErrors.password && setFieldErrors((p) => ({ ...p, password: undefined }))
                  }
                  className={cn(
                    inputCls,
                    "pr-16",
                    fieldErrors.password && "border-destructive focus:border-destructive",
                  )}
                  placeholder="Your password"
                />
                <button
                  type="button"
                  data-mag
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 inline-flex min-h-[44px] -translate-y-1/2 cursor-none items-center px-1.5 text-[12.5px] font-semibold text-brand-ink-faint"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {fieldErrors.password && (
                <span id="login-password-error" className={errCls}>
                  {fieldErrors.password}
                </span>
              )}
            </div>

            {/* Keep me logged in */}
            <div className="mt-0.5">
              <label className="inline-flex cursor-none select-none items-center gap-2.5">
                <span
                  className={cn(
                    "relative inline-flex h-5 w-5 items-center justify-center rounded-[5px] border-[1.5px] text-[13px] leading-none text-brand-paper transition",
                    remember ? "border-foreground bg-foreground" : "border-foreground/30",
                  )}
                >
                  <input
                    type="checkbox"
                    name="remember"
                    checked={remember}
                    data-mag
                    onChange={(e) => setRemember(e.target.checked)}
                    className="absolute inset-0 cursor-none opacity-0"
                  />
                  {remember && <span aria-hidden="true">✓</span>}
                </span>
                <span className="text-[13.5px] text-brand-ink-soft">Keep me logged in</span>
              </label>
              {!remember && (
                <p className="mt-1.5 text-[12px] text-brand-ink-faint">
                  You'll be signed out when you close your browser.
                </p>
              )}
            </div>

            {error && <p className="text-[13px] font-semibold text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              data-mag
              data-hov
              className={cn(
                "mt-2 inline-flex w-full cursor-none items-center justify-center gap-2.5 rounded-md px-[30px] py-4 text-[16px] font-bold text-brand-paper transition disabled:opacity-90",
                ctaBg,
              )}
            >
              {ctaLabel}
              {ctaArrow && (
                <span aria-hidden="true" className="text-[18px] leading-none">
                  {ctaArrow}
                </span>
              )}
            </button>
          </form>

          {/* New here? */}
          <div className="my-[26px] flex items-center gap-3.5">
            <span className="h-px flex-1 bg-foreground/[0.12]" />
            <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-brand-ink-faint">
              New here?
            </span>
            <span className="h-px flex-1 bg-foreground/[0.12]" />
          </div>

          <div className="flex flex-col gap-2.5">
            <Link
              to="/student-signup"
              data-mag
              data-hov
              className="flex cursor-none items-center justify-center gap-2 rounded-md py-3.5 text-[15px] font-bold text-foreground ring-[1.5px] ring-inset ring-foreground/[0.16] transition hover:ring-foreground/[0.32]"
            >
              Join as a student
            </Link>
            <Link
              to="/mentor-signup"
              data-mag
              data-hov
              className="flex cursor-none items-center justify-center gap-2 rounded-md py-3.5 text-[15px] font-bold text-foreground ring-[1.5px] ring-inset ring-foreground/[0.16] transition hover:ring-foreground/[0.32]"
            >
              Become a mentor
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
