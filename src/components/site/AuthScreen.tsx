import type { FocusEventHandler, ReactNode } from "react";
import { SignupCursor } from "@/components/student-signup/v2/SignupCursor";
import { FounderCompanion } from "@/components/student-signup/v2/FounderCompanion";
import { Logo } from "@/components/site/Logo";
import type { MascotExpression } from "@/components/mascots/Mascot";

// Shared field vocabulary — identical to the merged /login page so the whole auth
// surface (login + forgot/reset password) reads as one continuous design. Tokens
// only; the success green is the single colour login left as a one-off literal.
export const authInputCls =
  "w-full rounded-md border border-border bg-background px-4 py-3.5 text-[16px] font-medium text-foreground outline-none transition placeholder:text-brand-ink-faint focus:border-primary";
export const authLabelCls = "mb-[7px] block text-[13px] font-semibold text-brand-ink-soft";
export const authErrCls = "mt-1.5 block text-[12px] font-semibold text-destructive";
// Primary CTA (filled ink) — mirrors the login "Log in" button.
export const authPrimaryBtnCls =
  "inline-flex w-full cursor-none items-center justify-center gap-2.5 rounded-md bg-foreground px-[30px] py-4 text-[16px] font-bold text-brand-paper transition disabled:opacity-90";

/**
 * The light auth shell shared by the password-reset pages, mirroring the merged
 * /login page so the auth journey is one continuous surface: a locked
 * signup-wizard viewport (no rubber-band / white strip), the magnetic
 * SignupCursor, the ink wordmark on paper, a reactive Founder mascot, and an
 * internally-scrolling centered column. These are LIGHT pages — never any
 * data-dark. SSR-safe: SignupCursor guards window/document internally and the
 * mascot is pure SVG.
 */
export function AuthScreen({
  founderExpr = "happy",
  title,
  subtitle,
  onFocusCapture,
  onBlurCapture,
  children,
}: {
  founderExpr?: MascotExpression;
  title: string;
  subtitle?: ReactNode;
  onFocusCapture?: FocusEventHandler<HTMLDivElement>;
  onBlurCapture?: FocusEventHandler<HTMLDivElement>;
  children?: ReactNode;
}) {
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
          {/* header — reactive Founder + headline + subline, mirroring login */}
          <div className="mb-7 text-center">
            <FounderCompanion
              expression={founderExpr}
              size={96}
              className="mb-3 flex justify-center"
            />
            <h1 className="m-0 text-balance font-display text-[38px] font-extrabold leading-[1.05] tracking-[-0.022em]">
              {title}
            </h1>
            {subtitle && <p className="mt-2.5 text-[15px] text-brand-ink-soft">{subtitle}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
