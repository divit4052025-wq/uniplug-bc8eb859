import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { AuthShell, Confirmation } from "@/components/site/AuthShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/parental-consent/$token")({
  head: () => ({
    meta: [{ title: "Parental consent — UniPlug" }],
  }),
  component: ParentalConsentPage,
});

// The scope the parent is agreeing to. Mirrors consent_scope recorded by
// record_parental_consent (migration 20260530000001).
const CONSENT_SCOPE: { label: string; detail: string }[] = [
  { label: "Data processing", detail: "Storing and processing your child's account information." },
  {
    label: "Mentorship sessions",
    detail: "One-on-one video sessions with verified university-student mentors.",
  },
  { label: "Messaging", detail: "In-platform messaging related to their sessions." },
  { label: "Session recording", detail: "Sessions may be recorded for safety and quality." },
];

type Status = "form" | "submitting" | "success" | "invalid";

function ParentalConsentPage() {
  const { token } = Route.useParams();
  const [status, setStatus] = useState<Status>(token ? "form" : "invalid");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onConfirm = async () => {
    if (!agreed || status === "submitting") return;
    setError(null);
    setStatus("submitting");
    try {
      // The token IS the auth — record_parental_consent is anon-granted and
      // dispatches purely by token. Returns the student id, or NULL on an
      // unknown/expired/revoked token.
      const { data, error: rpcError } = await supabase.rpc("record_parental_consent", {
        _token: token,
      });
      if (rpcError) throw rpcError;
      if (!data) {
        setStatus("invalid");
        return;
      }
      setStatus("success");
    } catch {
      // Network / unexpected — let them retry rather than dead-ending.
      setError("Something went wrong. Please try again in a moment.");
      setStatus("form");
    }
  };

  if (status === "success") {
    return (
      <Confirmation
        heading="Consent recorded"
        body="Thank you. Your consent has been recorded and your child can now use UniPlug to book mentorship sessions."
      >
        <Link to="/" className="text-sm font-semibold text-primary hover:underline">
          Go to UniPlug
        </Link>
      </Confirmation>
    );
  }

  if (status === "invalid") {
    return (
      <Confirmation
        heading="This link is invalid or has expired"
        body="This consent link can't be used. It may have already been used, been reset, or been mistyped. Ask your child to resend the consent request from their UniPlug account."
      >
        <Link to="/" className="text-sm font-semibold text-primary hover:underline">
          Go to UniPlug
        </Link>
      </Confirmation>
    );
  }

  return (
    <AuthShell
      eyebrow="For parents & guardians"
      title="Give your consent"
      subtitle="Your child has signed up for UniPlug. Because they're under 18, your consent is required before they can book mentorship sessions."
    >
      <div className="space-y-6">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-wider text-foreground/70">
            What you're consenting to
          </p>
          <ul className="mt-3 space-y-3">
            {CONSENT_SCOPE.map((s) => (
              <li key={s.label} className="flex gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                />
                <span className="text-[14px] text-foreground">
                  <span className="font-medium">{s.label}.</span>{" "}
                  <span className="font-light text-muted-foreground">{s.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* TODO-LEGAL: replace with counsel-approved consent + terms wording (a
            minor's contract is void in India, so the binding agreement is the
            guardian's). Do not ship placeholder text as final legal copy. */}
        <div className="rounded-2xl border border-border bg-card p-4 text-[13px] font-light leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">Consent &amp; terms (placeholder)</p>
          <p className="mt-1">
            By confirming, you agree, as the parent or guardian, to the above on your child's
            behalf. The full consent and terms text is being finalised and will be linked here
            before launch.
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-5 w-5 rounded border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          />
          <span className="text-[14px] text-foreground">
            I am the parent or legal guardian and I give my consent.
          </span>
        </label>

        {error && (
          <p role="alert" aria-live="polite" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onConfirm}
          disabled={!agreed || status === "submitting"}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-[13px] font-medium text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:opacity-60"
        >
          {status === "submitting" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Recording consent…
            </>
          ) : (
            "Confirm consent"
          )}
        </button>
      </div>
    </AuthShell>
  );
}
